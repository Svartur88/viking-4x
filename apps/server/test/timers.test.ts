/**
 * Timer engine v0 tests (P2.S02). Need Postgres and Redis running (DATABASE_URL, REDIS_URL).
 * Proves: start → completes on schedule via the worker; speedup reschedules; speedup past due completes inline;
 * completion is idempotent; reconciliation re-enqueues a timer whose job was lost.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasInfra = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;
const d = hasInfra ? describe : describe.skip;
import { randomUUID } from "node:crypto";
import { pool } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { startTimer, reduceTimer, completeTimer, reconcile, registerHandler, startWorker, timerQueue, shutdownTimers, cancelTimer } from "../src/timers/engine.js";

const completed: string[] = [];
let kingdomId: string;
let stop: () => Promise<void>;

async function waitFor(pred: () => boolean, ms = 8000) {
  const t0 = Date.now();
  while (!pred()) { if (Date.now() - t0 > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 50)); }
}

beforeAll(async () => {
  if (!hasInfra) return;
  await migrate();
  await timerQueue().obliterate({ force: true });
  kingdomId = randomUUID();
  await pool.query("insert into kingdoms (id, seed, size) values ($1, 1, 64)", [kingdomId]);
  registerHandler("test", async (_c, t) => { completed.push(t.id); });
  stop = startWorker(4);
});

afterAll(async () => {
  if (!hasInfra) return;
  await stop();
  await pool.query("delete from timers where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from kingdoms where id=$1", [kingdomId]);
  await shutdownTimers();
  await pool.end();
});

d("timer engine v0 (needs DATABASE_URL + REDIS_URL)", () => {
  it("completes on schedule through the worker", async () => {
    const t = await startTimer({ kingdomId, kind: "test", baseSeconds: 1 });
    await waitFor(() => completed.includes(t.id));
    const row = (await pool.query("select state from timers where id=$1", [t.id])).rows[0];
    expect(row.state).toBe("done");
  });

  it("applies a multiplier at start", async () => {
    const t = await startTimer({ kingdomId, kind: "test", baseSeconds: 100, multiplier: 2 });
    const secs = (new Date(t.due_at).getTime() - new Date(t.started_at).getTime()) / 1000;
    expect(Math.round(secs)).toBe(50);
    await cancelTimer(t.id);
  });

  it("speedup reschedules, and a speedup past due completes inline", async () => {
    const t = await startTimer({ kingdomId, kind: "test", baseSeconds: 3600 });
    const r1 = await reduceTimer(t.id, 600, { kind: "speedup_10m" });
    expect(new Date(r1.due_at).getTime()).toBeLessThan(new Date(t.due_at).getTime());
    expect((r1.payload.reductions as unknown[]).length).toBe(1);
    const r2 = await reduceTimer(t.id, 100000, { kind: "speedup_big" });
    expect(r2.state).toBe("done");
    expect(completed).toContain(t.id);
  });

  it("completion is idempotent", async () => {
    const t = await startTimer({ kingdomId, kind: "test", baseSeconds: 0 });
    const a = await completeTimer(t.id);
    const b = await completeTimer(t.id);
    expect([a, b].filter((x) => x === "done").length).toBe(1);
    expect(completed.filter((id) => id === t.id).length).toBe(1);
  });

  it("refuses a speedup on a non-pending timer without consuming anything", async () => {
    const t = await startTimer({ kingdomId, kind: "test", baseSeconds: 0 });
    await completeTimer(t.id);
    await expect(reduceTimer(t.id, 10, { kind: "speedup" })).rejects.toThrow("TIMER_NOT_PENDING");
  });

  it("reconciliation re-enqueues a due timer whose job was lost", async () => {
    const t = await startTimer({ kingdomId, kind: "test", baseSeconds: 1 });
    const job = await timerQueue().getJob(t.job_id!);
    await job!.remove();                       // simulate a lost Redis job
    await new Promise((r) => setTimeout(r, 1200));
    const n = await reconcile(0);
    expect(n).toBeGreaterThanOrEqual(1);
    await waitFor(() => completed.includes(t.id));
  });

  it("allows only one pending timer per ref", async () => {
    const ref = randomUUID();
    await startTimer({ kingdomId, kind: "test", refType: "building", refId: ref, baseSeconds: 3600 });
    await expect(startTimer({ kingdomId, kind: "test", refType: "building", refId: ref, baseSeconds: 3600 })).rejects.toThrow();
  });
});
