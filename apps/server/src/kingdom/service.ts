import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTx } from "../db/pool.js";

/**
 * Kingdom bootstrap and hall placement (P2.B02).
 * Terrain v0: a flat land map with a 1-tile clearance rule. The real generator (map-model.md: coast, sea,
 * islands, zones, harbour flags) replaces `generateTerrain` in P3.B07 / P4.B13 without changing callers.
 * Tile byte: 0 land, 1 coast, 2 sea, 3 mountain.
 */
export function generateTerrain(size: number, seed: number): Buffer {
  const buf = Buffer.alloc(size * size, 0);
  // v0: a simple sea ring 8 tiles wide so the map has an edge, land inside. Seed unused until the real generator.
  void seed;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
    if (edge < 8) buf[y * size + x] = 2; else if (edge === 8) buf[y * size + x] = 1;
  }
  return buf;
}

export async function createKingdom(opts: { size?: number; seed?: number; tzOffsetMinutes?: number } = {}) {
  const size = opts.size ?? 600, seed = opts.seed ?? Date.now(), id = randomUUID();
  const terrain = generateTerrain(size, seed);
  await pool.query("insert into kingdoms (id, seed, size, tz_offset_minutes, state, terrain) values ($1,$2,$3,$4,'open',$5)", [id, seed, size, opts.tzOffsetMinutes ?? 0, terrain]);
  return { id, size, seed };
}

export async function newestOpenKingdom(): Promise<{ id: string; size: number } | null> {
  const { rows } = await pool.query("select id, size from kingdoms where state='open' order by opened_at desc limit 1");
  return rows[0] ?? null;
}

/** Deterministic-ish pocket placement v0: spiral outward from a pocket centre chosen by sign-up count. */
async function findFreeSite(c: PoolClient, kingdomId: string, size: number, terrain: Buffer): Promise<{ x: number; y: number }> {
  const count = Number((await c.query("select count(*) from halls where kingdom_id=$1", [kingdomId])).rows[0].count);
  const pockets = 12, pocket = Math.floor(count / 35) % pockets;      // ~35 halls per pocket, then next pocket
  const angle = (pocket / pockets) * Math.PI * 2, r = size * 0.3;
  const cx = Math.round(size / 2 + Math.cos(angle) * r), cy = Math.round(size / 2 + Math.sin(angle) * r);
  const { rows } = await c.query("select x, y from occupants where kingdom_id=$1 and x between $2 and $3 and y between $4 and $5", [kingdomId, cx - 60, cx + 60, cy - 60, cy + 60]);
  const taken = new Set(rows.map((r) => `${r.x},${r.y}`));
  const isLand = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && terrain[y * size + x] === 0;
  const clear = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (taken.has(`${x + dx},${y + dy}`)) return false; return true; };
  for (let ring = 0; ring < 60; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const x = cx + dx, y = cy + dy;
      if (isLand(x, y) && clear(x, y)) return { x, y };
    }
  }
  throw Object.assign(new Error("KINGDOM_FULL"), { statusCode: 409 });
}

/**
 * All four producers from the first minute, not just grain and timber. Every upgrade costs stone
 * and iron too, so a hall without a Quarry and an Iron pit spends its starter stock and can then
 * never afford anything again — a dead end an hour into the game. buildings.md gives each hall one
 * of each anyway. The two new ones have no art yet and fall back to labelled boxes.
 */
const STARTER_BUILDINGS: Array<[string, number, number]> = [
  ["longhouse", 0, 1], ["farm", 0, 1], ["timber_camp", 0, 1], ["quarry", 0, 1], ["iron_pit", 0, 1],
];

/** Sign up: create the player and their hall on a free tile, with starter buildings. One transaction. */
export async function signUp(accountId: string, name: string, kingdomId?: string) {
  return withTx(async (c) => {
    const k = kingdomId
      ? (await c.query("select id, size, terrain from kingdoms where id=$1 and state='open'", [kingdomId])).rows[0]
      : (await c.query("select id, size, terrain from kingdoms where state='open' order by opened_at desc limit 1")).rows[0];
    if (!k) throw Object.assign(new Error("NO_OPEN_KINGDOM"), { statusCode: 503 });
    const existing = (await c.query("select id from players where account_id=$1 and kingdom_id=$2", [accountId, k.id])).rows[0];
    if (existing) throw Object.assign(new Error("ALREADY_IN_KINGDOM"), { statusCode: 409 });
    await c.query("select pg_advisory_xact_lock(hashtext($1))", [`placement:${k.id}`]);
    const site = await findFreeSite(c, k.id, k.size, k.terrain);
    const playerId = randomUUID(), hallId = randomUUID();
    await c.query(
      `insert into players (id, kingdom_id, account_id, name, starter_shield_until) values ($1,$2,$3,$4, now() + interval '72 hours')`,
      [playerId, k.id, accountId, name]);
    await c.query("insert into halls (id, kingdom_id, player_id, x, y, grain, timber, stone, iron) values ($1,$2,$3,$4,$5, 2000, 2000, 800, 400)", [hallId, k.id, playerId, site.x, site.y]);
    await c.query("insert into occupants (kingdom_id, x, y, type, ref_id) values ($1,$2,$3,'hall',$4)", [k.id, site.x, site.y, hallId]);
    for (const [kind, slot, level] of STARTER_BUILDINGS)
      await c.query("insert into buildings (id, kingdom_id, hall_id, kind, slot, level) values ($1,$2,$3,$4,$5,$6)", [randomUUID(), k.id, hallId, kind, slot, level]);
    return { playerId, hallId, kingdomId: k.id as string, x: site.x, y: site.y };
  });
}
