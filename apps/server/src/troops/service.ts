/**
 * Troops and training (P3.T01, units.md).
 *
 * Base stats and costs are units.md's table verbatim, because those are Hawk's numbers rather than
 * mine. The one thing scaled is training TIME: this build runs on a compressed clock — a Longhouse
 * level costs ninety seconds, not two hours — and fifteen real seconds a man would make the troop
 * loop feel slower than everything around it rather than faster. The divisor is in one place.
 *
 * Troops that are away are not counted here: they travel inside the march's composition and are
 * added back when it comes home. That makes "what is standing in my hall" a single row, and makes
 * it impossible to send the same man on two marches.
 */

import type { PoolClient } from "pg";
import { pool, withTx } from "../db/pool.js";
import { insertTimer, scheduleTimer, registerHandler, type TimerRow } from "../timers/engine.js";
import { settleLocked } from "../economy/service.js";

export type TroopType = "shieldwall" | "berserker" | "archer" | "longship";

export interface UnitStats {
  attack: number; defence: number; health: number; speed: number; carry: number;
  trainSeconds: number;
  cost: { grain: number; timber: number; stone: number; iron: number };
}

/** units.md "Starting base stats (T1)", unchanged. */
export const UNITS: Record<TroopType, UnitStats> = {
  shieldwall: { attack: 8, defence: 12, health: 20, speed: 10, carry: 20, trainSeconds: 15, cost: { grain: 40, timber: 30, stone: 10, iron: 10 } },
  berserker:  { attack: 12, defence: 8, health: 18, speed: 14, carry: 15, trainSeconds: 20, cost: { grain: 50, timber: 20, stone: 0, iron: 30 } },
  archer:     { attack: 11, defence: 7, health: 16, speed: 12, carry: 15, trainSeconds: 18, cost: { grain: 30, timber: 50, stone: 0, iron: 20 } },
  longship:   { attack: 6, defence: 10, health: 40, speed: 8, carry: 200, trainSeconds: 90, cost: { grain: 20, timber: 150, stone: 20, iron: 40 } },
};

/** units.md tier multipliers. */
const TIER_STATS = [1.0, 1.6, 2.5];
const TIER_COST = [1.0, 2.0, 4.0];
const TIER_TIME = [1.0, 1.8, 3.0];

/** Which building trains what (units.md rule 7). Only the Barracks exists at MVP. */
export const TRAINS: Record<string, TroopType> = {
  barracks: "shieldwall",
  archery_range: "archer",
  shield_hall: "berserker",
  shipyard: "longship",
};

/** The compressed clock, as everywhere else in this build. balance-v1.csv replaces all of it. */
const TRAIN_TIME_DIVISOR = 5;

export function trainSeconds(type: TroopType, tier: number, count: number): number {
  const per = UNITS[type].trainSeconds * TIER_TIME[tier - 1];
  return Math.max(3, Math.round((per * count) / TRAIN_TIME_DIVISOR));
}

export function trainCost(type: TroopType, tier: number, count: number) {
  const m = TIER_COST[tier - 1], c = UNITS[type].cost;
  return {
    grain: Math.round(c.grain * m * count),
    timber: Math.round(c.timber * m * count),
    stone: Math.round(c.stone * m * count),
    iron: Math.round(c.iron * m * count),
  };
}

export function carryOf(type: TroopType, tier: number): number {
  return Math.round(UNITS[type].carry * TIER_STATS[tier - 1]);
}

/** Troop capacity of the hall (units.md rule 8: a Barracks-level table). Placeholder curve. */
export function troopCapacity(barracksLevel: number): number {
  if (barracksLevel <= 0) return 0;
  return Math.round(200 * Math.pow(1.35, barracksLevel - 1));
}

/** Stacks standing in the hall right now. Troops on a march are not here — they are on the march. */
export async function stacksAt(hallId: string) {
  const { rows } = await pool.query(
    "select type, tier, count from troops where hall_id=$1 and count > 0 order by type, tier", [hallId]);
  return rows.map((r: { type: string; tier: number; count: string }) => ({
    type: r.type as TroopType, tier: r.tier, count: Number(r.count), carry: carryOf(r.type as TroopType, r.tier),
  }));
}

/** Everything that counts against capacity: at home, in training, and away on a march. */
export async function troopsCommitted(c: { query: PoolClient["query"] }, hallId: string): Promise<number> {
  const home = Number((await c.query("select coalesce(sum(count), 0) as n from troops where hall_id=$1", [hallId])).rows[0].n);
  const training = (await c.query(
    "select payload from timers where hall_id=$1 and kind='train' and state='pending'", [hallId])).rows
    .reduce((sum: number, r: { payload: { count?: number } }) => sum + Number(r.payload?.count ?? 0), 0);
  const away = (await c.query(
    "select composition from marches where hall_id=$1 and state in ('travelling','gathering','returning')", [hallId])).rows
    .reduce((sum: number, r: { composition: Record<string, number> }) =>
      sum + Object.values(r.composition ?? {}).reduce((a, b) => a + Number(b), 0), 0);
  return home + training + away;
}

/**
 * Add or remove troops from a hall's stack. Negative removes.
 *
 * Update first, insert only if there was nothing to update. An upsert cannot do this: Postgres
 * evaluates CHECK constraints against the proposed insertion row *before* it detects the conflict,
 * so `insert ... on conflict do update set count = count - 20` fails `count >= 0` on the candidate
 * row even when the existing row holds plenty. Taking troops out of a stack that does not exist is
 * a bug in the caller, not a state to tolerate, so it throws rather than silently creating one.
 */
export async function adjustStack(c: PoolClient, hallId: string, kingdomId: string, type: string, tier: number, delta: number) {
  if (delta === 0) return;
  const updated = await c.query(
    "update troops set count = count + $4 where hall_id=$1 and type=$2 and tier=$3 returning count",
    [hallId, type, tier, delta],
  );
  if (updated.rowCount && updated.rowCount > 0) return;
  if (delta < 0) throw Object.assign(new Error("NO_SUCH_STACK"), { statusCode: 409, details: { type, tier } });
  await c.query(
    "insert into troops (hall_id, kingdom_id, type, tier, count) values ($1,$2,$3,$4,$5)",
    [hallId, kingdomId, type, tier, delta],
  );
}

/**
 * Start training. One queue per building (units.md rule 7), so a Barracks already working refuses
 * a second batch — same rule the builders follow, and the same reason: a queue you cannot see the
 * end of is worse than a refusal you can.
 */
export async function startTraining(hallId: string, buildingId: string, count: number, tier = 1) {
  const t = await withTx(async (c) => {
    await c.query("select id from halls where id=$1 for update", [hallId]);
    const hall = await settleLocked(c, hallId);

    const building = (await c.query("select * from buildings where id=$1 and hall_id=$2", [buildingId, hallId])).rows[0];
    if (!building) throw Object.assign(new Error("NO_BUILDING"), { statusCode: 404 });
    const type = TRAINS[building.kind];
    if (!type) throw Object.assign(new Error("NOT_A_TRAINER"), { statusCode: 422 });
    if (!Number.isInteger(count) || count < 1) throw Object.assign(new Error("BAD_COUNT"), { statusCode: 400 });

    const busy = (await c.query(
      "select 1 from timers where hall_id=$1 and kind='train' and ref_id=$2 and state='pending'", [hallId, buildingId])).rows[0];
    if (busy) throw Object.assign(new Error("ALREADY_TRAINING"), { statusCode: 409 });

    const barracks = Number((await c.query(
      "select level from buildings where hall_id=$1 and kind='barracks'", [hallId])).rows[0]?.level ?? 0);
    const capacity = troopCapacity(barracks);
    const committed = await troopsCommitted(c, hallId);
    if (committed + count > capacity)
      throw Object.assign(new Error("OVER_CAPACITY"), { statusCode: 422, details: { capacity, committed } });

    const cost = trainCost(type, tier, count);
    if (hall.grain < cost.grain || hall.timber < cost.timber || hall.stone < cost.stone || hall.iron < cost.iron)
      throw Object.assign(new Error("INSUFFICIENT"), { statusCode: 422, details: cost });
    await c.query(
      "update halls set grain=grain-$2, timber=timber-$3, stone=stone-$4, iron=iron-$5 where id=$1",
      [hallId, cost.grain, cost.timber, cost.stone, cost.iron]);

    return insertTimer(c, {
      kingdomId: hall.kingdom_id, hallId, kind: "train",
      refType: "building", refId: buildingId,
      baseSeconds: trainSeconds(type, tier, count),
      payload: { type, tier, count, kind: building.kind },
    });
  });
  return scheduleTimer(t);
}

/** They are trained: they join the stack. */
async function onTrainComplete(c: PoolClient, t: TimerRow) {
  const p = t.payload as { type?: string; tier?: number; count?: number };
  if (!t.hall_id || !p.type || !p.count) return;
  await adjustStack(c, t.hall_id, t.kingdom_id, p.type, p.tier ?? 1, p.count);
}

registerHandler("train", onTrainComplete);
