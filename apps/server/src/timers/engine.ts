/**
 * Timer engine v0 — the one engine for every timed thing (timer-engine.md, PR-13).
 * Postgres is the truth; BullMQ (Redis) is the alarm clock. Completion is idempotent.
 */
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { pool, withTx } from "../db/pool.js";

export type TimerKind = "build" | "research" | "train" | "heal" | "march_arrive" | "march_return" | "gather" | "rally_launch" | "shield_expire" | "daily_reset" | "kingdom_age" | (string & {});

export interface TimerRow {
  id: string;
  kingdom_id: string;
  hall_id: string | null;
  kind: TimerKind;
  ref_type: string | null;
  ref_id: string | null;
  payload: Record<string, unknown>;
  started_at: Date;
  base_seconds: number;
  due_at: Date;
  job_id: string | null;
  state: "pending" | "done" | "cancelled";
  completed_at: Date | null;
  version: number;
}

/** A completion handler runs inside the completing transaction. */
export type Handler = (c: PoolClient, t: TimerRow) => Promise<void>;

const handlers = new Map<string, Handler>();
export function registerHandler(kind: TimerKind, h: Handler) { handlers.set(kind, h); }

const QUEUE = "timers";
let connection: Redis | null = null;
let queue: Queue | null = null;

function redis(): Redis {
  if (!connection) connection = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: null });
  return connection;
}
export function timerQueue(): Queue {
  if (!queue) queue = new Queue(QUEUE, { connection: redis() });
  return queue;
}

async function enqueue(timerId: string, dueAt: Date): Promise<string> {
  const delay = Math.max(0, dueAt.getTime() - Date.now());
  const jobId = `${timerId}-${dueAt.getTime()}`;
  await timerQueue().add("fire", { timerId }, { jobId, delay, removeOnComplete: true, removeOnFail: 1000, attempts: 5, backoff: { type: "exponential", delay: 1000 } });
  return jobId;
}

async function removeJob(jobId: string | null) {
  if (!jobId) return;
  const job = await timerQueue().getJob(jobId);
  if (job) { try { await job.remove(); } catch { /* already running or gone */ } }
}

export interface StartArgs {
  kingdomId: string; hallId?: string | null; kind: TimerKind; refType?: string; refId?: string;
  baseSeconds: number; multiplier?: number; payload?: Record<string, unknown>;
}

/** Start a timer inside an existing transaction. Enqueues after the caller commits (see startTimer). */
export async function insertTimer(c: PoolClient, a: StartArgs): Promise<TimerRow> {
  const id = randomUUID();
  const seconds = Math.max(0, Math.round(a.baseSeconds / (a.multiplier ?? 1)));
  const { rows } = await c.query<TimerRow>(
    `insert into timers (id, kingdom_id, hall_id, kind, ref_type, ref_id, payload, base_seconds, due_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, now() + make_interval(secs => $9)) returning *`,
    [id, a.kingdomId, a.hallId ?? null, a.kind, a.refType ?? null, a.refId ?? null, JSON.stringify({ ...(a.payload ?? {}), multiplier: a.multiplier ?? 1, reductions: [] }), a.baseSeconds, seconds],
  );
  return rows[0];
}

/** After commit: enqueue and record the job id. Safe to call twice (idempotent job id). */
export async function scheduleTimer(t: TimerRow): Promise<TimerRow> {
  const jobId = await enqueue(t.id, new Date(t.due_at));
  await pool.query("update timers set job_id=$2 where id=$1 and state='pending'", [t.id, jobId]);
  t.job_id = jobId;
  return t;
}

/** Convenience: start in its own transaction and schedule. */
export async function startTimer(a: StartArgs): Promise<TimerRow> {
  const t = await withTx((c) => insertTimer(c, a));
  return scheduleTimer(t);
}

/** Reduce a pending timer by `seconds` (speedup or help). Completes inline if it becomes due. */
export async function reduceTimer(timerId: string, seconds: number, reason: { kind: string; by?: string }): Promise<TimerRow> {
  const result = await withTx(async (c) => {
    const { rows } = await c.query<TimerRow>("select * from timers where id=$1 for update", [timerId]);
    const t = rows[0];
    if (!t) throw new Error("TIMER_NOT_FOUND");
    if (t.state !== "pending") throw new Error("TIMER_NOT_PENDING");
    const reductions = [...((t.payload.reductions as unknown[]) ?? []), { ...reason, seconds, at: new Date().toISOString() }];
    const { rows: upd } = await c.query<TimerRow>(
      `update timers set due_at = due_at - make_interval(secs => $2), payload = jsonb_set(payload, '{reductions}', $3::jsonb), version = version + 1
       where id=$1 returning *`,
      [timerId, seconds, JSON.stringify(reductions)],
    );
    return upd[0];
  });
  const oldJob = result.job_id;
  if (new Date(result.due_at).getTime() <= Date.now()) {
    await removeJob(oldJob);
    await completeTimer(result.id);
    return (await pool.query<TimerRow>("select * from timers where id=$1", [result.id])).rows[0];
  }
  await removeJob(oldJob);
  return scheduleTimer(result);
}

export async function cancelTimer(timerId: string): Promise<TimerRow> {
  const t = await withTx(async (c) => {
    const { rows } = await c.query<TimerRow>("select * from timers where id=$1 for update", [timerId]);
    const t = rows[0];
    if (!t) throw new Error("TIMER_NOT_FOUND");
    if (t.state !== "pending") throw new Error("TIMER_NOT_PENDING");
    const { rows: upd } = await c.query<TimerRow>("update timers set state='cancelled', version=version+1 where id=$1 returning *", [timerId]);
    return upd[0];
  });
  await removeJob(t.job_id);
  return t;
}

/** Idempotent completion: guarded by state and DB now(). Runs the kind's handler in the same transaction. */
export async function completeTimer(timerId: string): Promise<"done" | "skipped"> {
  return withTx(async (c) => {
    const { rows } = await c.query<TimerRow>("select * from timers where id=$1 for update", [timerId]);
    const t = rows[0];
    if (!t || t.state !== "pending") return "skipped";
    const { rows: due } = await c.query<{ ok: boolean }>("select due_at <= now() as ok from timers where id=$1", [timerId]);
    if (!due[0].ok) return "skipped";
    const h = handlers.get(t.kind);
    if (h) await h(c, t);
    await c.query("update timers set state='done', completed_at=now(), version=version+1 where id=$1", [timerId]);
    return "done";
  });
}

/** Reconciliation: re-enqueue any pending timer that is due (or overdue) without a live job. */
export async function reconcile(graceSeconds = 5): Promise<number> {
  const { rows } = await pool.query<TimerRow>(
    "select * from timers where state='pending' and due_at <= now() - make_interval(secs => $1) limit 500", [graceSeconds]);
  let n = 0;
  for (const t of rows) {
    const job = t.job_id ? await timerQueue().getJob(t.job_id) : null;
    if (!job) { await scheduleTimer(t); n++; }
  }
  return n;
}

/** Start the BullMQ worker. Returns a stop function. */
export function startWorker(concurrency = 10): () => Promise<void> {
  const w = new Worker(QUEUE, async (job: Job<{ timerId: string }>) => { await completeTimer(job.data.timerId); }, { connection: redis(), concurrency });
  return async () => { await w.close(); };
}

export async function shutdownTimers() {
  await queue?.close(); queue = null;
  await connection?.quit(); connection = null;
}
