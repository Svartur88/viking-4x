/**
 * Map reads (P2.B03) — map-model.md.
 * Two separate things, because they change at different rates:
 *   - terrain: immutable per kingdom, served as 64×64 chunks the client caches forever;
 *   - occupants: small and always moving, served as a bounded rectangle.
 */
import { pool } from "../db/pool.js";

export const CHUNK = 64;
export const VIEWPORT_MAX = 64;

const terrainCache = new Map<string, { size: number; terrain: Buffer }>();

async function kingdom(kingdomId: string): Promise<{ size: number; terrain: Buffer }> {
  const hit = terrainCache.get(kingdomId);
  if (hit) return hit;
  const { rows } = await pool.query("select size, terrain from kingdoms where id=$1", [kingdomId]);
  if (!rows[0]) throw Object.assign(new Error("NO_KINGDOM"), { statusCode: 404 });
  const entry = { size: rows[0].size as number, terrain: rows[0].terrain as Buffer };
  terrainCache.set(kingdomId, entry);
  return entry;
}

/** Test seam: drop the in-process terrain cache. */
export function forgetTerrain(kingdomId?: string) {
  if (kingdomId) terrainCache.delete(kingdomId); else terrainCache.clear();
}

/** One 64×64 terrain chunk as base64. Immutable for the life of the kingdom, so the client caches it forever. */
export async function terrainChunk(kingdomId: string, cx: number, cy: number) {
  const { size, terrain } = await kingdom(kingdomId);
  const chunks = Math.ceil(size / CHUNK);
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || cx < 0 || cy < 0 || cx >= chunks || cy >= chunks)
    throw Object.assign(new Error("OUT_OF_BOUNDS"), { statusCode: 400, details: { chunks } });
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  const w = Math.min(CHUNK, size - x0), h = Math.min(CHUNK, size - y0);
  const out = Buffer.alloc(w * h);
  for (let row = 0; row < h; row++) terrain.copy(out, row * w, (y0 + row) * size + x0, (y0 + row) * size + x0 + w);
  return { cx, cy, x0, y0, w, h, tiles: out.toString("base64") };
}

export interface Viewport { x0: number; y0: number; x1: number; y1: number }

/** Occupants in a rectangle, capped at VIEWPORT_MAX per side. Nodes, camps and holds arrive in P3/P4; the shape is already here. */
export async function viewport(kingdomId: string, v: Viewport) {
  const { size } = await kingdom(kingdomId);
  const x0 = Math.max(0, Math.min(v.x0, v.x1)), y0 = Math.max(0, Math.min(v.y0, v.y1));
  const x1 = Math.min(size - 1, Math.max(v.x0, v.x1)), y1 = Math.min(size - 1, Math.max(v.y0, v.y1));
  if (![x0, y0, x1, y1].every(Number.isInteger)) throw Object.assign(new Error("BAD_VIEWPORT"), { statusCode: 400 });
  if (x1 - x0 >= VIEWPORT_MAX || y1 - y0 >= VIEWPORT_MAX)
    throw Object.assign(new Error("VIEWPORT_TOO_LARGE"), { statusCode: 400, details: { max: VIEWPORT_MAX } });

  const { rows } = await pool.query(
    // A hall's "level" is its Longhouse level (progression.md); halls carry no level column of their own.
    `select o.x, o.y, o.type, o.ref_id,
            p.name as player_name, p.id as player_id,
            coalesce(lh.level, 1) as hall_level,
            (p.starter_shield_until > now()) as shielded
       from occupants o
       left join halls h on o.type='hall' and h.id = o.ref_id
       left join players p on p.id = h.player_id
       left join buildings lh on lh.hall_id = h.id and lh.kind = 'longhouse'
      where o.kingdom_id=$1 and o.x between $2 and $3 and o.y between $4 and $5
      order by o.y, o.x`,
    [kingdomId, x0, x1, y0, y1]);

  const halls = rows.filter((r) => r.type === "hall").map((r) => ({
    x: r.x, y: r.y, hall_id: r.ref_id, player_id: r.player_id, name: r.player_name, level: r.hall_level, shielded: r.shielded === true,
  }));
  return {
    bounds: { x0, y0, x1, y1 },
    halls,
    nodes: [] as never[], camps: [] as never[], holds: [] as never[], banners: [] as never[], marches: [] as never[],
    server_now: new Date().toISOString(),
  };
}
