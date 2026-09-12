/**
 * Resource nodes (P3.M01, map.md rule 6).
 *
 * Nodes are seeded around a hall when a jarl signs up rather than scattered over the whole map at
 * kingdom creation. Two reasons: a 600×600 kingdom would want ~1,200 nodes standing at once and
 * almost all of them would be nowhere near anybody, and a new player must find something to gather
 * within sight of their own hall or the second loop never starts.
 *
 * Zone rules (map.md rule 6) say Zone 1 carries levels 1–3. Everything here is Zone 1 until zones
 * exist, so that is the band used. Respawn four hours after depletion is Later; at MVP a depleted
 * node is removed and the jarl's remaining nodes carry them.
 */

import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

export type Resource = "grain" | "timber" | "stone" | "iron";
const RESOURCES: Resource[] = ["grain", "timber", "stone", "iron"];

/** Two of each resource, so no jarl is stuck unable to gather the thing they are short of. */
const NODES_PER_HALL = 8;
const SEED_RADIUS = 26;

/** How much sits in the ground, and how fast it comes out. Placeholders; balance-v1.csv (P3.S01). */
export function nodeAmount(level: number): number {
  return 4000 * level;
}
export function nodeRatePerHour(level: number): number {
  return 3000 * level;
}

/**
 * Scatter this hall's nodes on free land within sight of it. Runs inside the sign-up transaction,
 * so a hall never exists without its nodes.
 */
export async function seedNodesAround(
  c: PoolClient,
  kingdomId: string,
  size: number,
  terrain: Buffer,
  cx: number,
  cy: number,
): Promise<number> {
  const { rows } = await c.query(
    "select x, y from occupants where kingdom_id=$1 and x between $2 and $3 and y between $4 and $5",
    [kingdomId, cx - SEED_RADIUS, cx + SEED_RADIUS, cy - SEED_RADIUS, cy + SEED_RADIUS],
  );
  const taken = new Set(rows.map((r: { x: number; y: number }) => `${r.x},${r.y}`));
  const isLand = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < size && y < size && terrain[y * size + x] === 0;

  let placed = 0;
  // Walk outward from the hall so the first nodes are the close ones — a first march should be
  // short enough to watch, not a twenty-minute commute.
  for (let ring = 4; ring <= SEED_RADIUS && placed < NODES_PER_HALL; ring++) {
    for (let dy = -ring; dy <= ring && placed < NODES_PER_HALL; dy++) {
      for (let dx = -ring; dx <= ring && placed < NODES_PER_HALL; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        // Thin them out, otherwise all eight land in one arc on the first ring that fits.
        if ((dx * 31 + dy * 17 + ring * 7) % 11 !== 0) continue;
        const x = cx + dx, y = cy + dy;
        if (!isLand(x, y) || taken.has(`${x},${y}`)) continue;
        const resource = RESOURCES[placed % RESOURCES.length];
        const level = 1 + (placed % 3);
        const id = randomUUID();
        await c.query(
          "insert into nodes (id, kingdom_id, x, y, resource, level, remaining) values ($1,$2,$3,$4,$5,$6,$7)",
          [id, kingdomId, x, y, resource, level, nodeAmount(level)],
        );
        await c.query(
          "insert into occupants (kingdom_id, x, y, type, ref_id) values ($1,$2,$3,'node',$4) on conflict do nothing",
          [kingdomId, x, y, id],
        );
        taken.add(`${x},${y}`);
        placed++;
      }
    }
  }
  return placed;
}

/** Nodes inside a viewport rectangle, with whether someone is already working them. */
export async function nodesIn(
  c: { query: PoolClient["query"] },
  kingdomId: string,
  x0: number, y0: number, x1: number, y1: number,
) {
  const { rows } = await c.query(
    `select id, x, y, resource, level, remaining, (held_by is not null) as held
       from nodes
      where kingdom_id=$1 and x between $2 and $3 and y between $4 and $5
      order by y, x`,
    [kingdomId, x0, x1, y0, y1],
  );
  return rows.map((r: { id: string; x: number; y: number; resource: string; level: number; remaining: string; held: boolean }) => ({
    node_id: r.id,
    x: r.x,
    y: r.y,
    resource: r.resource,
    level: r.level,
    remaining: Number(r.remaining),
    held: r.held,
    rate_per_hour: nodeRatePerHour(r.level),
  }));
}
