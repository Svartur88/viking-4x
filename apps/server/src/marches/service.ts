/**
 * Marches (P3.M01). Gather branch only; the engine is the general one.
 *
 * Built to march-tick.md: there is no world tick. A march is a row plus a chain of timers —
 * `march_arrive`, then for a gather `gather`, then `march_return` — and the client interpolates the
 * dot between them from `departed_at` and `arrives_at`. Every state change happens inside a timer's
 * transaction, so a server that is asleep, restarted or redeployed mid-march still resolves it
 * correctly the moment it wakes: the reconciler re-enqueues anything overdue.
 *
 * Raiding is deliberately not a second engine. `kind` and the arrival handler are the only things
 * that differ: an attack re-checks shields, runs the resolver and moves loot where a gather occupies
 * a node and starts a work timer. Everything below — slots, travel time, recall, the return leg,
 * crediting cargo through the economy's storage cap — is shared.
 */

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTx } from "../db/pool.js";
import { insertTimer, scheduleTimer, registerHandler, type TimerRow } from "../timers/engine.js";
import { settleLocked, ratesFor } from "../economy/service.js";
import { nodeRatePerHour } from "../nodes/service.js";
import { carryOf, adjustStack, type TroopType } from "../troops/service.js";

/**
 * What a crew can haul: the sum of its troops' carry (units.md rule 6). Composition is keyed
 * "type:tier" so a stack of T2 Shieldwall is distinct from T1 without a second column.
 */
export function carryOfCrew(composition: Record<string, number>): number {
  let total = 0;
  for (const [key, n] of Object.entries(composition)) {
    const [type, tier] = key.split(":");
    total += carryOf(type as TroopType, Number(tier || 1)) * Number(n);
  }
  return total;
}

/**
 * Pick a crew for a gathering trip: enough troops to carry what is actually there, never more.
 * Sending a hundred men to fetch what twenty can carry wastes the hall's defence for no gain, and
 * making the player work that out with a slider before they understand carry at all is a poor
 * first lesson. When the send screen grows a composition picker (units.md rule 11) this becomes
 * the default rather than the only option.
 */
export function crewForHaul(stacks: { type: TroopType; tier: number; count: number }[], haul: number) {
  const crew: Record<string, number> = {};
  let carried = 0;
  // Best hauliers first, so the smallest number of men leaves the hall.
  const byCarry = [...stacks].sort((a, b) => carryOf(b.type, b.tier) - carryOf(a.type, a.tier));
  for (const s of byCarry) {
    if (carried >= haul) break;
    const per = carryOf(s.type, s.tier);
    if (per <= 0) continue;
    const need = Math.min(s.count, Math.ceil((haul - carried) / per));
    if (need <= 0) continue;
    crew[`${s.type}:${s.tier}`] = need;
    carried += need * per;
  }
  return { crew, carry: carried };
}

/** March slots by Longhouse level (progression.md rule 4: nothing unlocks off any other building). */
export function marchSlots(longhouseLevel: number): number {
  return longhouseLevel >= 18 ? 3 : longhouseLevel >= 9 ? 2 : 1;
}

/** Tiles per hour. Placeholder; balance-v1.csv. Deliberately fast enough to watch on this build. */
const SPEED_TILES_PER_HOUR = 900;

/** Column names are interpolated into SQL below, so they come from here and nowhere else. */
const ALLOWED_RESOURCES = new Set(["grain", "timber", "stone", "iron"]);

export function travelSeconds(ax: number, ay: number, bx: number, by: number): number {
  // Chebyshev: the map is a square grid and a diagonal step costs the same as a straight one.
  const tiles = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  return Math.max(5, Math.round((tiles / SPEED_TILES_PER_HOUR) * 3600));
}

export interface MarchRow {
  id: string; kingdom_id: string; player_id: string; hall_id: string;
  kind: string; state: string;
  origin_x: number; origin_y: number; target_x: number; target_y: number;
  target_id: string | null;
  composition: Record<string, number>; carry_capacity: string | number;
  cargo: Record<string, number>;
  departed_at: string; arrives_at: string | null; returns_at: string | null;
}

/** Marches this player has in the air, newest first. */
export async function activeMarches(playerId: string) {
  const { rows } = await pool.query<MarchRow>(
    "select * from marches where player_id=$1 and state in ('travelling','gathering','returning') order by departed_at desc",
    [playerId],
  );
  return rows;
}

/**
 * Send a gather march. Everything is checked and written in one transaction: slots, the node still
 * being there and free, and the timer. Two taps on the same node a millisecond apart cannot both
 * win, because claiming the node takes its row lock.
 */
export async function sendGather(playerId: string, nodeId: string) {
  const t = await withTx(async (c) => {
    const hall = (await c.query(
      "select h.* from halls h where h.player_id=$1 for update", [playerId],
    )).rows[0];
    if (!hall) throw Object.assign(new Error("NO_HALL"), { statusCode: 404 });

    const longhouse = Number((await c.query(
      "select level from buildings where hall_id=$1 and kind='longhouse'", [hall.id],
    )).rows[0]?.level ?? 1);

    const inFlight = Number((await c.query(
      "select count(*) from marches where player_id=$1 and state in ('travelling','gathering','returning')",
      [playerId],
    )).rows[0].count);
    if (inFlight >= marchSlots(longhouse))
      throw Object.assign(new Error("NO_MARCH_SLOT"), { statusCode: 409, details: { slots: marchSlots(longhouse) } });

    // Lock the node before reading held_by, or two simultaneous sends both see it free.
    const node = (await c.query("select * from nodes where id=$1 and kingdom_id=$2 for update", [nodeId, hall.kingdom_id])).rows[0];
    if (!node) throw Object.assign(new Error("NO_NODE"), { statusCode: 404 });
    if (node.held_by) throw Object.assign(new Error("NODE_OCCUPIED"), { statusCode: 409 });
    if (Number(node.remaining) <= 0) throw Object.assign(new Error("NODE_EMPTY"), { statusCode: 409 });

    // Crew it from the troops actually standing in the hall. No troops, no march: gathering is
    // something men do, and pretending otherwise is what the old placeholder did.
    const stacks = (await c.query(
      "select type, tier, count from troops where hall_id=$1 and count > 0 for update", [hall.id])).rows
      .map((r: { type: string; tier: number; count: string }) => ({ type: r.type as TroopType, tier: r.tier, count: Number(r.count) }));
    const { crew, carry } = crewForHaul(stacks, Number(node.remaining));
    if (carry <= 0)
      throw Object.assign(new Error("NO_TROOPS"), { statusCode: 422, details: { need: "troops to carry it" } });

    const id = randomUUID();
    const seconds = travelSeconds(hall.x, hall.y, node.x, node.y);
    const march = (await c.query<MarchRow>(
      `insert into marches (id, kingdom_id, player_id, hall_id, kind, state,
                            origin_x, origin_y, target_x, target_y, target_id,
                            composition, carry_capacity, arrives_at)
       values ($1,$2,$3,$4,'gather','travelling',$5,$6,$7,$8,$9,$10,$11, now() + make_interval(secs => $12))
       returning *`,
      [id, hall.kingdom_id, playerId, hall.id, hall.x, hall.y, node.x, node.y, nodeId,
        JSON.stringify(crew), carry, seconds],
    )).rows[0];

    // They leave the hall. Held in the march's composition until it returns, so they cannot be
    // sent twice, cannot defend while away, and cannot be trained over.
    for (const [key, n] of Object.entries(crew)) {
      const [type, tier] = key.split(":");
      await adjustStack(c, hall.id, hall.kingdom_id, type, Number(tier), -Number(n));
    }

    // Claim the node at send, not at arrival. map.md's "arrives and finds nothing" case is about
    // depletion; letting five jarls all march at one free node and four bounce is worse play than
    // seeing it greyed out before you commit a march slot to it.
    await c.query("update nodes set held_by=$2 where id=$1", [nodeId, id]);

    return insertTimer(c, {
      kingdomId: hall.kingdom_id, hallId: hall.id, kind: "march_arrive",
      refType: "march", refId: id, baseSeconds: seconds,
    });
  });
  await scheduleTimer(t);
  return t;
}

/** Arrival: occupy the node and start working it. */
async function onMarchArrive(c: PoolClient, t: TimerRow) {
  const march = (await c.query<MarchRow>("select * from marches where id=$1 for update", [t.ref_id])).rows[0];
  if (!march || march.state !== "travelling") return;

  if (march.kind !== "gather") return;   // scout/attack/garrison arrive here too, later

  const node = (await c.query("select * from nodes where id=$1 for update", [march.target_id])).rows[0];
  if (!node || Number(node.remaining) <= 0) {
    // map.md rule: the node was emptied while we walked. Turn around with nothing.
    await startReturn(c, march);
    return;
  }

  const capacity = Number(march.carry_capacity);
  const takeable = Math.min(capacity, Number(node.remaining));
  const seconds = Math.max(5, Math.round((takeable / nodeRatePerHour(node.level)) * 3600));

  await c.query("update marches set state='gathering' where id=$1", [march.id]);
  const timer = await insertTimer(c, {
    kingdomId: march.kingdom_id, hallId: march.hall_id, kind: "gather",
    refType: "march", refId: march.id, baseSeconds: seconds,
    payload: { resource: node.resource, amount: takeable },
  });
  await scheduleTimer(timer);
}

/** Work finished: load the cargo, free the node, walk home. */
async function onGatherComplete(c: PoolClient, t: TimerRow) {
  const march = (await c.query<MarchRow>("select * from marches where id=$1 for update", [t.ref_id])).rows[0];
  if (!march || march.state !== "gathering") return;

  const payload = t.payload as { resource?: string; amount?: number };
  const node = (await c.query("select * from nodes where id=$1 for update", [march.target_id])).rows[0];
  // Take what is actually left, not what we hoped for when we arrived.
  const amount = Math.max(0, Math.min(payload.amount ?? 0, node ? Number(node.remaining) : 0));
  const resource = payload.resource ?? "grain";

  if (node) {
    const left = Number(node.remaining) - amount;
    if (left <= 0) {
      // Depleted. It leaves the map; respawn elsewhere after four hours is Later (map.md rule 6).
      await c.query("delete from occupants where kingdom_id=$1 and x=$2 and y=$3 and type='node'", [node.kingdom_id, node.x, node.y]);
      await c.query("delete from nodes where id=$1", [node.id]);
    } else {
      await c.query("update nodes set remaining=$2, held_by=null where id=$1", [node.id, left]);
    }
  }
  await c.query("update marches set cargo=$2 where id=$1", [march.id, JSON.stringify({ [resource]: amount })]);
  await startReturn(c, { ...march, cargo: { [resource]: amount } });
}

/** Home: credit the cargo through the economy so the storage cap applies, then retire the march. */
async function onMarchReturn(c: PoolClient, t: TimerRow) {
  const march = (await c.query<MarchRow>("select * from marches where id=$1 for update", [t.ref_id])).rows[0];
  if (!march || march.state !== "returning") return;

  await c.query("select id from halls where id=$1 for update", [march.hall_id]);
  // Settle first so the hours the march was away are paid at the rate that applied, and so the cap
  // below is measured against an up-to-date total rather than a stale one.
  const hall = await settleLocked(c, march.hall_id);
  const buildings = (await c.query("select kind, level from buildings where hall_id=$1", [march.hall_id])).rows;
  const { cap } = ratesFor(buildings);
  const cargo = march.cargo ?? {};

  for (const [res, raw] of Object.entries(cargo)) {
    if (!ALLOWED_RESOURCES.has(res)) continue;   // res is interpolated below; never trust the column name
    const amount = Number(raw);
    if (!amount) continue;
    // economy.md rule 3: the store stops at the cap. A hall already over it (production settled
    // high, an earlier haul) keeps what it has — greatest() stops a big cargo shrinking the pile.
    await c.query(
      `update halls set ${res} = greatest(${res}, least($2::bigint, ${res} + $3::bigint)) where id=$1`,
      [march.hall_id, cap, amount],
    );
  }
  void hall;
  // The men come home too.
  for (const [key, n] of Object.entries(march.composition ?? {})) {
    const [type, tier] = key.split(":");
    await adjustStack(c, march.hall_id, march.kingdom_id, type, Number(tier), Number(n));
  }
  await c.query("update marches set state='done', completed_at=now() where id=$1", [march.id]);
}

async function startReturn(c: PoolClient, march: MarchRow) {
  const seconds = travelSeconds(march.target_x, march.target_y, march.origin_x, march.origin_y);
  await c.query(
    "update marches set state='returning', returns_at = now() + make_interval(secs => $2) where id=$1",
    [march.id, seconds],
  );
  await c.query("update nodes set held_by=null where held_by=$1", [march.id]);
  const timer = await insertTimer(c, {
    kingdomId: march.kingdom_id, hallId: march.hall_id, kind: "march_return",
    refType: "march", refId: march.id, baseSeconds: seconds,
  });
  await scheduleTimer(timer);
}

/**
 * Recall. march-tick.md: the march turns around from where it is, at the same speed, so a recall
 * one second after sending costs one second — never the full leg home.
 */
export async function recall(playerId: string, marchId: string) {
  return withTx(async (c) => {
    const march = (await c.query<MarchRow>(
      "select * from marches where id=$1 and player_id=$2 for update", [marchId, playerId],
    )).rows[0];
    if (!march) throw Object.assign(new Error("NO_MARCH"), { statusCode: 404 });
    if (march.state === "returning") return march;
    if (march.state !== "travelling" && march.state !== "gathering")
      throw Object.assign(new Error("MARCH_NOT_RECALLABLE"), { statusCode: 409 });

    // Kill whatever timer is holding it where it is, before starting the return leg: only one
    // pending timer may exist per ref, and the whole recall is one transaction, so there is no
    // window in which the march has no timer at all.
    await c.query(
      "update timers set state='cancelled', completed_at=now(), version=version+1 where ref_type='march' and ref_id=$1 and state='pending'",
      [marchId],
    );

    let seconds: number;
    if (march.state === "gathering") {
      seconds = travelSeconds(march.target_x, march.target_y, march.origin_x, march.origin_y);
    } else {
      // Travelling: home is however far we have already come.
      const total = travelSeconds(march.origin_x, march.origin_y, march.target_x, march.target_y);
      const left = march.arrives_at ? (new Date(march.arrives_at).getTime() - Date.now()) / 1000 : 0;
      seconds = Math.max(1, Math.round(total - Math.max(0, left)));
    }

    await c.query(
      "update marches set state='returning', returns_at = now() + make_interval(secs => $2) where id=$1",
      [marchId, seconds],
    );
    await c.query("update nodes set held_by=null where held_by=$1", [marchId]);
    const timer = await insertTimer(c, {
      kingdomId: march.kingdom_id, hallId: march.hall_id, kind: "march_return",
      refType: "march", refId: marchId, baseSeconds: seconds,
    });
    await scheduleTimer(timer);
    return (await c.query<MarchRow>("select * from marches where id=$1", [marchId])).rows[0];
  });
}

registerHandler("march_arrive", onMarchArrive);
registerHandler("gather", onGatherComplete);
registerHandler("march_return", onMarchReturn);
