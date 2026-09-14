/**
 * Research (research.md). The same shape as building: gate, cost, queue, timer, handler.
 *
 * Three things are deliberately different from upgrading a building:
 *
 *  - The queue is per HALL, not per node. `research.md` rule 2 allows one research at a time, so
 *    starting Sigð while Njósn is running is refused. The database enforces it (a partial unique
 *    index on timers) rather than trusting this code to check first — two requests arriving
 *    together would both pass a check and both insert.
 *  - Research does NOT compete with builders. A jarl researching is not a jarl who cannot build;
 *    they are separate queues and always were (`buildings.md`).
 *  - Nothing here applies an effect yet. Every node's `effect` is a string the client prints, and
 *    the levels are recorded faithfully, but no production rate or troop stat reads them. That is
 *    DEC-015 working as intended — the system goes on screen first, and the numbers arrive when
 *    every system exists. Said plainly here so nobody mistakes "researched" for "doing something".
 */
import type { PoolClient } from "pg";
import { withTx } from "../db/pool.js";
import { insertTimer, scheduleTimer, registerHandler, type TimerRow } from "../timers/engine.js";
import { settleLocked } from "../economy/service.js";
import { NODES, TIER_GATE, BRANCH_NAMES, researchNode, researchCost, researchSeconds, type Branch } from "./catalogue.js";

export interface ResearchView {
  id: string; name: string; gloss: string; branch: Branch; tier: 1 | 2 | 3;
  level: number; max_level: number; effect: string;
  needs: string[];
  /** Why the player cannot start it right now, or null when they can. */
  blocked: string | null;
  cost: { grain: number; timber: number; stone: number; iron: number } | null;
  seconds: number | null;
  later: boolean;
}

/** Levels a hall holds, node id → level. Absent means zero. */
export async function levelsFor(c: PoolClient, hallId: string): Promise<Record<string, number>> {
  const rows = (await c.query("select node_id, level from research where hall_id=$1", [hallId])).rows;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.node_id as string] = r.level as number;
  return out;
}

/**
 * The whole tree plus this hall's state, in one payload.
 *
 * The client is told WHY a node is unavailable rather than just that it is, because "Rune Hall 6"
 * is a thing a player can act on and a greyed-out box is not.
 */
export function treeFor(
  levels: Record<string, number>,
  runeHall: number,
  longhouse: number,
  busy: boolean,
): ResearchView[] {
  return NODES.map((n) => {
    const level = levels[n.id] ?? 0;
    const gate = TIER_GATE[n.tier];
    const toLevel = level + 1;
    const maxed = level >= n.maxLevel;

    let blocked: string | null = null;
    if (n.later) blocked = "Not in the game yet";
    else if (maxed) blocked = "Complete";
    else if (runeHall < gate.runeHall) blocked = `Needs Rune Hall ${gate.runeHall}`;
    else if (longhouse < gate.longhouse) blocked = `Needs Longhouse ${gate.longhouse}`;
    else {
      const missing = (n.needs ?? []).filter((d) => (levels[d] ?? 0) < 1);
      if (missing.length) {
        const names = missing.map((d) => researchNode(d)?.name ?? d).join(", ");
        blocked = `Needs ${names}`;
      } else if (busy) blocked = "Another research is running";
    }

    return {
      id: n.id, name: n.name, gloss: n.gloss, branch: n.branch, tier: n.tier,
      level, max_level: n.maxLevel, effect: n.effect, needs: n.needs ?? [],
      blocked,
      cost: maxed || n.later ? null : researchCost(n, toLevel),
      seconds: maxed || n.later ? null : researchSeconds(n, toLevel),
      later: n.later ?? false,
    };
  });
}

export const BRANCHES = BRANCH_NAMES;

export async function startResearch(hallId: string, nodeId: string) {
  const node = researchNode(nodeId);
  if (!node) throw Object.assign(new Error("NO_SUCH_NODE"), { statusCode: 404 });
  if (node.later) throw Object.assign(new Error("NOT_IN_GAME_YET"), { statusCode: 422 });

  const t = await withTx(async (c) => {
    // Settle first, as every other spend does: grain earned while away is spendable.
    await c.query("select id from halls where id=$1 for update", [hallId]);
    const hall = await settleLocked(c, hallId);

    const buildings = (await c.query(
      "select kind, level from buildings where hall_id=$1 and kind in ('longhouse','rune_hall')", [hallId],
    )).rows as { kind: string; level: number }[];
    const longhouse = buildings.find((b) => b.kind === "longhouse")?.level ?? 0;
    const runeHall = buildings.find((b) => b.kind === "rune_hall")?.level ?? 0;

    const gate = TIER_GATE[node.tier];
    if (runeHall < gate.runeHall)
      throw Object.assign(new Error("RUNE_HALL_GATE"), { statusCode: 422, details: { needs: gate.runeHall, have: runeHall } });
    if (longhouse < gate.longhouse)
      throw Object.assign(new Error("LONGHOUSE_GATE"), { statusCode: 422, details: { needs: gate.longhouse, have: longhouse } });

    const levels = await levelsFor(c, hallId);
    const level = levels[node.id] ?? 0;
    if (level >= node.maxLevel) throw Object.assign(new Error("MAX_LEVEL"), { statusCode: 422 });
    for (const d of node.needs ?? []) {
      if ((levels[d] ?? 0) < 1)
        throw Object.assign(new Error("PREREQUISITE"), { statusCode: 422, details: { needs: d } });
    }

    const toLevel = level + 1;
    const cost = researchCost(node, toLevel);
    if (hall.grain < cost.grain || hall.timber < cost.timber || hall.stone < cost.stone || hall.iron < cost.iron)
      throw Object.assign(new Error("INSUFFICIENT"), { statusCode: 422, details: cost });
    await c.query(
      "update halls set grain=grain-$2, timber=timber-$3, stone=stone-$4, iron=iron-$5 where id=$1",
      [hallId, cost.grain, cost.timber, cost.stone, cost.iron],
    );

    // One at a time: the partial unique index on timers raises a 23505 if another is pending. Let
    // it, and translate — checking first would race two simultaneous requests through.
    try {
      return await insertTimer(c, {
        kingdomId: hall.kingdom_id, hallId, kind: "research",
        refType: "research_node",
        baseSeconds: researchSeconds(node, toLevel),
        payload: { node: node.id, toLevel },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw Object.assign(new Error("ALREADY_RESEARCHING"), { statusCode: 409 });
      throw e;
    }
  });
  return scheduleTimer(t);
}

/** Completion: the level rises, inside the timer's transaction. Idempotent on a retried job. */
export async function onResearchComplete(c: PoolClient, t: TimerRow) {
  if (!t.hall_id) return;
  const p = t.payload as { node?: string; toLevel?: number };
  const nodeId = String(p?.node ?? "");
  const toLevel = Number(p?.toLevel ?? 0);
  if (!nodeId || !toLevel) return;
  const kingdom = (await c.query("select kingdom_id from halls where id=$1", [t.hall_id])).rows[0].kingdom_id;
  // `level = greatest(...)` rather than `level + 1`: a completion that runs twice must land on the
  // level the payload named, not one past it.
  await c.query(
    `insert into research (hall_id, kingdom_id, node_id, level) values ($1,$2,$3,$4)
     on conflict (hall_id, node_id) do update set level = greatest(research.level, excluded.level)`,
    [t.hall_id, kingdom, nodeId, toLevel],
  );
}
registerHandler("research", onResearchComplete);
