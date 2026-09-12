import type { PoolClient } from "pg";
import { withTx } from "../db/pool.js";
import { insertTimer, scheduleTimer, registerHandler, type TimerRow } from "../timers/engine.js";
import { settleLocked } from "../economy/service.js";
import { UPGRADES, BUILDERS } from "../balance.js";

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
