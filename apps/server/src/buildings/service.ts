import type { PoolClient } from "pg";
import { withTx } from "../db/pool.js";
import { insertTimer, scheduleTimer, registerHandler, type TimerRow } from "../timers/engine.js";
import { settleLocked } from "../economy/service.js";
import { UPGRADES, BUILDERS } from "../balance.js";
import { buildingKind } from "../catalogue.js";
import { randomUUID, createHash } from "node:crypto";

/**
 * Buildings v0 (P2.B04): Longhouse-gated upgrade with a timer. The shape (gate, cost, builder,
 * timer, handler) is final; every number lives in balance.ts.
 */
export function upgradeCost(kind: string, toLevel: number) {
  const k = kind === "longhouse" ? UPGRADES.longhouseCostMultiplier : 1.0;
  const base = Math.round(UPGRADES.costBase * k * Math.pow(toLevel, UPGRADES.costExponent));
  return { grain: base, timber: base, stone: Math.round(base * 0.4), iron: Math.round(base * 0.2) };
}
export function upgradeSeconds(kind: string, toLevel: number) {
  const k = kind === "longhouse" ? UPGRADES.longhouseTimeMultiplier : 1;
  if (toLevel <= UPGRADES.earlyLevelsThrough)
    return Math.min(UPGRADES.earlyTimeCapSeconds,
      Math.round(UPGRADES.timeBase * k * Math.pow(toLevel, UPGRADES.timeExponentEarly)));
  return Math.min(UPGRADES.maxSeconds,
    Math.round(UPGRADES.timeBaseLate * k * Math.pow(toLevel, UPGRADES.timeExponentLate)));
}

export async function startUpgrade(hallId: string, buildingId: string) {
  const t = await withTx(async (c) => {
    // Settle production before checking affordability: the grain earned while the player was away
    // is theirs to spend, and reading a stale row would refuse an upgrade they can afford.
    await c.query("select id from halls where id=$1 for update", [hallId]);
    const hall = await settleLocked(c, hallId);
    const b = (await c.query("select * from buildings where id=$1 and hall_id=$2 for update", [buildingId, hallId])).rows[0];
    if (!b) throw Object.assign(new Error("NO_BUILDING"), { statusCode: 404 });
    const longhouse = (await c.query("select level from buildings where hall_id=$1 and kind='longhouse'", [hallId])).rows[0].level as number;
    const toLevel = b.level + 1;
    if (b.kind !== "longhouse" && toLevel > longhouse) throw Object.assign(new Error("LONGHOUSE_GATE"), { statusCode: 422 });
    if (toLevel > UPGRADES.maxLevel) throw Object.assign(new Error("MAX_LEVEL"), { statusCode: 422 });
    const busy = Number((await c.query("select count(*) from timers where hall_id=$1 and kind='build' and state='pending'", [hallId])).rows[0].count);
    if (busy >= BUILDERS) throw Object.assign(new Error("NO_BUILDER"), { statusCode: 409 });
    const cost = upgradeCost(b.kind, toLevel);
    if (hall.grain < cost.grain || hall.timber < cost.timber || hall.stone < cost.stone || hall.iron < cost.iron)
      throw Object.assign(new Error("INSUFFICIENT"), { statusCode: 422, details: cost });
    await c.query("update halls set grain=grain-$2, timber=timber-$3, stone=stone-$4, iron=iron-$5 where id=$1", [hallId, cost.grain, cost.timber, cost.stone, cost.iron]);
    return insertTimer(c, { kingdomId: hall.kingdom_id, hallId, kind: "build", refType: "building", refId: buildingId, baseSeconds: upgradeSeconds(b.kind, toLevel), payload: { toLevel, kind: b.kind } });
  });
  return scheduleTimer(t);
}

/** Completion handler: runs inside the timer's transaction. */
export async function onBuildComplete(c: PoolClient, t: TimerRow) {
  // Settle first, at the OLD rate. The hours between the last read and this moment were worked by
  // the smaller building; banking them after the level rises would quietly pay them at the new
  // rate, and a long overnight timer would make that a large free gift.
  // hall_id is nullable on the timer table (kingdom-wide timers have none); a build always has one.
  if (t.hall_id) {
    await c.query("select id from halls where id=$1 for update", [t.hall_id]);
    await settleLocked(c, t.hall_id);
  }
  await c.query("update buildings set level = level + 1 where id=$1", [t.ref_id]);
}
registerHandler("build", onBuildComplete);

/**
 * Founding an empty slot (the other half of P2.B04, missing until 2026-09-13).
 *
 * `catalogue.ts` and the hall screen were both written to show every slot from the first minute,
 * built or not, and to let a jarl raise the ones the Longhouse has unlocked. Nothing implemented
 * the raising, so the client's "Build it" had no endpoint and `Session.plots` had no source — the
 * hall screen threw and the game opened black.
 *
 * A founding is the same shape as an upgrade — gate, cost, builder, timer, handler — and
 * deliberately reuses it rather than inventing a second one. Its cost is level 1's upgrade cost:
 * that is not a new number, and DEC-015 defers real balance until the systems exist.
 *
 * The timer has no building to point at, because the building does not exist yet, and `ref_id` is a
 * uuid column — a kind string cannot go in it. So the ref is a uuid DERIVED from (hall, kind, slot).
 * That keeps `timers_one_pending_per_ref` doing something useful for free: one founding of a given
 * PLOT at a time, per hall — which matters now that four farms are four plots of one kind. The kind
 * and slot travel in the payload, which is what the client matches on.
 */
function foundingRef(hallId: string, kind: string, slot: number): string {
  const h = createHash("sha1").update(`found:${hallId}:${kind}:${slot}`).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;   // version 5
  b[8] = (b[8] & 0x3f) | 0x80;   // RFC 4122 variant
  const x = b.toString("hex");
  return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;
}
export function foundCost(kind: string) {
  return upgradeCost(kind, 1);
}
export function foundSeconds(kind: string) {
  return upgradeSeconds(kind, 1);
}

export async function startFounding(hallId: string, kind: string, slot = 0) {
  const plot = buildingKind(kind, slot);
  if (!plot) throw Object.assign(new Error("NO_SUCH_BUILDING"), { statusCode: 404 });
  if (plot.later) throw Object.assign(new Error("NOT_IN_GAME_YET"), { statusCode: 422 });

  const t = await withTx(async (c) => {
    // Settle first, for the same reason an upgrade does: grain earned while away is spendable.
    await c.query("select id from halls where id=$1 for update", [hallId]);
    const hall = await settleLocked(c, hallId);

    // Per PLOT, not per kind: a second farm is a legitimate build, a second farm on slot 1 is not.
    const existing = (await c.query("select id from buildings where hall_id=$1 and kind=$2 and slot=$3", [hallId, kind, slot])).rows[0];
    if (existing) throw Object.assign(new Error("ALREADY_BUILT"), { statusCode: 409 });

    const longhouse = (await c.query("select level from buildings where hall_id=$1 and kind='longhouse'", [hallId])).rows[0].level as number;
    if (longhouse < plot.unlock) throw Object.assign(new Error("LONGHOUSE_GATE"), { statusCode: 422, details: { needs: plot.unlock, have: longhouse } });

    // Founding competes for the same two builders as upgrading. One queue, not two.
    const busy = Number((await c.query("select count(*) from timers where hall_id=$1 and kind in ('build','found') and state='pending'", [hallId])).rows[0].count);
    if (busy >= BUILDERS) throw Object.assign(new Error("NO_BUILDER"), { statusCode: 409 });

    const cost = foundCost(kind);
    if (hall.grain < cost.grain || hall.timber < cost.timber || hall.stone < cost.stone || hall.iron < cost.iron)
      throw Object.assign(new Error("INSUFFICIENT"), { statusCode: 422, details: cost });
    await c.query("update halls set grain=grain-$2, timber=timber-$3, stone=stone-$4, iron=iron-$5 where id=$1",
      [hallId, cost.grain, cost.timber, cost.stone, cost.iron]);

    return insertTimer(c, {
      kingdomId: hall.kingdom_id, hallId, kind: "found",
      refType: "building_kind", refId: foundingRef(hallId, kind, slot),
      baseSeconds: foundSeconds(kind), payload: { kind, slot },
    });
  });
  return scheduleTimer(t);
}

/** Completion handler: the building appears, at level 1, inside the timer's transaction. */
export async function onFoundComplete(c: PoolClient, t: TimerRow) {
  if (!t.hall_id) return;
  await c.query("select id from halls where id=$1 for update", [t.hall_id]);
  // Settle at the OLD rate before the new building starts producing, exactly as an upgrade does.
  await settleLocked(c, t.hall_id);
  const kingdom = (await c.query("select kingdom_id from halls where id=$1", [t.hall_id])).rows[0].kingdom_id;
  // The kind lives in the payload, not the ref — see foundingRef above.
  const p = t.payload as { kind?: string; slot?: number };
  const kind = String(p?.kind ?? "");
  const slot = Number(p?.slot ?? 0);
  if (!kind) return;
  // Idempotent: a retried completion must not raise a second building of the same kind.
  await c.query(
    "insert into buildings (id, kingdom_id, hall_id, kind, slot, level) values ($1,$2,$3,$4,$5,1) on conflict (hall_id, kind, slot) do nothing",
    [randomUUID(), kingdom, t.hall_id, kind, slot],
  );
}
registerHandler("found", onFoundComplete);
