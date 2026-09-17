/**
 * Troops and training (P3.T01, units.md, DEC-030/031).
 *
 * The roster itself — types, ten tiers, every Icelandic name — lives in `catalogue.ts`. This file is
 * only the machinery: gate, cost, capacity, queue, timer, handler. A building may train SEVERAL
 * kinds now (the Shipyard has six hulls on its bench), so training takes a type as well as a tier.
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
import { COMPRESSED_CLOCK, TROOPS } from "../balance.js";
import {
  KINDS, TRAINS, TIER_STATS, TIER_COST, TIER_TIME, TIER_UNLOCK,
  troopKind, rungName, rungGloss, tiersOpen, type TroopType, type TroopKind,
} from "./catalogue.js";

export { KINDS, TRAINS, TIER_UNLOCK, troopKind, rungName, tiersOpen };
export type { TroopType, TroopKind };

const TRAIN_TIME_DIVISOR = COMPRESSED_CLOCK.trainTimeDivisor;

function kindOrThrow(type: string): TroopKind {
  const k = troopKind(type);
  if (!k) throw Object.assign(new Error("NO_SUCH_TROOP"), { statusCode: 404, details: { type } });
  return k;
}

export function trainSeconds(type: TroopType, tier: number, count: number): number {
  const per = kindOrThrow(type).base.trainSeconds * TIER_TIME[tier - 1];
  return Math.max(3, Math.round((per * count) / TRAIN_TIME_DIVISOR));
}

export function trainCost(type: TroopType, tier: number, count: number) {
  const m = TIER_COST[tier - 1], c = kindOrThrow(type).base.cost;
  return {
    grain: Math.round(c.grain * m * count),
    timber: Math.round(c.timber * m * count),
    stone: Math.round(c.stone * m * count),
    iron: Math.round(c.iron * m * count),
  };
}

export function carryOf(type: TroopType, tier: number): number {
  return Math.round(kindOrThrow(type).base.carry * TIER_STATS[tier - 1]);
}

/**
 * What a building can put on its bench right now: every kind it trains, each with the tiers this
 * building level has opened and what a single one costs. The client prints this and works nothing
 * out — a Shipyard trains six different hulls and a Barracks one kind of man, and only the server
 * knows which of them the jarl has reached.
 */
export function benchFor(buildingKind: string, buildingLevel: number) {
  return (TRAINS[buildingKind] ?? []).map((id) => {
    const k = kindOrThrow(id);
    const open = tiersOpen(k, buildingLevel);
    return {
      type: k.id, name: k.name, gloss: k.gloss, field: k.field, blurb: k.blurb,
      beats: k.beats, max_tiers: k.tiers, unlock: k.unlock,
      tiers_open: open,
      locked: open === 0 ? `Needs ${k.trainedAt.replace(/_/g, " ")} ${k.unlock}` : null,
      tiers: Array.from({ length: k.tiers }, (_, i) => {
        const tier = i + 1;
        return {
          tier,
          name: rungName(k, tier),
          gloss: rungGloss(k, tier),
          open: tier <= open,
          needs_level: TIER_UNLOCK[tier - 1],
          cost: trainCost(k.id, tier, 1),
          seconds: trainSeconds(k.id, tier, 1),
          carry: carryOf(k.id, tier),
        };
      }),
    };
  });
}

/** Troop capacity of the hall (units.md rule 8: a Barracks-level table). Curve in balance.ts. */
export function troopCapacity(barracksLevel: number): number {
  if (barracksLevel <= 0) return 0;
  return Math.round(TROOPS.capacityBase * Math.pow(TROOPS.capacityPerLevel, barracksLevel - 1));
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
export async function startTraining(hallId: string, buildingId: string, count: number, tier = 1, type?: string) {
  const t = await withTx(async (c) => {
    await c.query("select id from halls where id=$1 for update", [hallId]);
    const hall = await settleLocked(c, hallId);

    const building = (await c.query("select * from buildings where id=$1 and hall_id=$2", [buildingId, hallId])).rows[0];
    if (!building) throw Object.assign(new Error("NO_BUILDING"), { statusCode: 404 });
    // A Shipyard trains six different hulls, a Barracks one kind of man. Where a building trains
    // exactly one kind the client may leave the type out; where it trains several it must not.
    const trainable = TRAINS[building.kind] ?? [];
    if (!trainable.length) throw Object.assign(new Error("NOT_A_TRAINER"), { statusCode: 422 });
    const chosen = (type ?? (trainable.length === 1 ? trainable[0] : "")) as TroopType;
    if (!chosen || !trainable.includes(chosen))
      throw Object.assign(new Error("NOT_TRAINED_HERE"), { statusCode: 422, details: { building: building.kind, trains: trainable } });
    const kind = kindOrThrow(chosen);
    if (!Number.isInteger(count) || count < 1) throw Object.assign(new Error("BAD_COUNT"), { statusCode: 400 });

    // The tier gate is the TRAINING building's level, never the Longhouse's (DEC-024).
    const open = tiersOpen(kind, Number(building.level ?? 0));
    if (open === 0)
      throw Object.assign(new Error("KIND_LOCKED"), { statusCode: 422, details: { needs: kind.unlock, have: building.level } });
    if (!Number.isInteger(tier) || tier < 1 || tier > kind.tiers)
      throw Object.assign(new Error("BAD_TIER"), { statusCode: 400, details: { tiers: kind.tiers } });
    if (tier > open)
      throw Object.assign(new Error("TIER_LOCKED"), { statusCode: 422, details: { needs: TIER_UNLOCK[tier - 1], have: building.level } });

    const busy = (await c.query(
      "select 1 from timers where hall_id=$1 and kind='train' and ref_id=$2 and state='pending'", [hallId, buildingId])).rows[0];
    if (busy) throw Object.assign(new Error("ALREADY_TRAINING"), { statusCode: 409 });

    const barracks = Number((await c.query(
      "select level from buildings where hall_id=$1 and kind='barracks'", [hallId])).rows[0]?.level ?? 0);
    const capacity = troopCapacity(barracks);
    const committed = await troopsCommitted(c, hallId);
    if (committed + count > capacity)
      throw Object.assign(new Error("OVER_CAPACITY"), { statusCode: 422, details: { capacity, committed } });

    const cost = trainCost(chosen, tier, count);
    if (hall.grain < cost.grain || hall.timber < cost.timber || hall.stone < cost.stone || hall.iron < cost.iron)
      throw Object.assign(new Error("INSUFFICIENT"), { statusCode: 422, details: cost });
    await c.query(
      "update halls set grain=grain-$2, timber=timber-$3, stone=stone-$4, iron=iron-$5 where id=$1",
      [hallId, cost.grain, cost.timber, cost.stone, cost.iron]);

    return insertTimer(c, {
      kingdomId: hall.kingdom_id, hallId, kind: "train",
      refType: "building", refId: buildingId,
      baseSeconds: trainSeconds(chosen, tier, count),
      payload: { type: chosen, tier, count, kind: building.kind },
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
