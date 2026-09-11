/** Map viewport and terrain chunks (P2.B03). Needs DATABASE_URL + REDIS_URL. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
const hasInfra = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;
const d = hasInfra ? describe : describe.skip;
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { pool } from "../src/db/pool.js";
import { createKingdom } from "../src/kingdom/service.js";
import { forgetTerrain, CHUNK } from "../src/map/service.js";
import { shutdownTimers } from "../src/timers/engine.js";

let app: Awaited<ReturnType<typeof buildApp>>; let kingdomId: string;
const SIZE = 128;

beforeAll(async () => {
  if (!hasInfra) return;
  process.env.NODE_ENV = "test";
  await migrate();
  await pool.query("update kingdoms set state='full'");
  kingdomId = (await createKingdom({ size: SIZE, seed: 7 })).id;
  app = await buildApp();
});
afterAll(async () => {
  if (!hasInfra) return;
  await app.close();
  for (const t of ["timers", "buildings", "occupants", "halls", "players"])
    await pool.query(`delete from ${t} where kingdom_id=$1`, [kingdomId]);
  await pool.query("delete from kingdoms where id=$1", [kingdomId]);
  forgetTerrain();
  await shutdownTimers(); await pool.end();
});

async function player(name: string) {
  const g = await app.inject({ method: "POST", url: "/v1/auth/guest", payload: { device_id: randomUUID() } });
  const r = await app.inject({ method: "POST", url: "/v1/players", headers: { authorization: `Bearer ${g.json().jwt}` }, payload: { name } });
  expect(r.statusCode).toBe(200);
  return { auth: { authorization: `Bearer ${r.json().jwt}` }, player: r.json().player };
}

d("map reads", () => {
  it("serves a terrain chunk the client can decode, with sea at the rim and land inside", async () => {
    const { auth } = await player(`M${Date.now() % 10000}`);
    const r = await app.inject({ method: "GET", url: "/v1/map/chunk?cx=0&cy=0", headers: auth });
    expect(r.statusCode).toBe(200);
    const c = r.json();
    expect([c.w, c.h]).toEqual([CHUNK, CHUNK]);
    const tiles = Buffer.from(c.tiles, "base64");
    expect(tiles.length).toBe(CHUNK * CHUNK);
    expect(tiles[0]).toBe(2);                                   // corner is sea
    expect(tiles[8 * CHUNK + 8]).toBe(1);                       // the coast ring
    expect(tiles[20 * CHUNK + 20]).toBe(0);                     // land inside
    expect(r.headers["cache-control"]).toContain("immutable");
  });

  it("refuses a chunk outside the kingdom", async () => {
    const { auth } = await player(`X${Date.now() % 10000}`);
    const r = await app.inject({ method: "GET", url: "/v1/map/chunk?cx=99&cy=0", headers: auth });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("OUT_OF_BOUNDS");
  });

  it("returns the caller's own hall in a viewport around it", async () => {
    const { auth, player: p } = await player(`V${Date.now() % 10000}`);
    const url = `/v1/map/viewport?x0=${p.x - 5}&y0=${p.y - 5}&x1=${p.x + 5}&y1=${p.y + 5}`;
    const r = await app.inject({ method: "GET", url, headers: auth });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    const mine = body.halls.find((h: { hall_id: string }) => h.hall_id === p.hallId);
    expect(mine).toBeTruthy();
    expect(mine.level).toBe(1);
    expect(mine.shielded).toBe(true);          // starter shield, 72 h
    expect(body.nodes).toEqual([]);
    expect(typeof body.server_now).toBe("string");
  });

  it("caps the viewport and clamps it to the map", async () => {
    const { auth } = await player(`C${Date.now() % 10000}`);
    const big = await app.inject({ method: "GET", url: "/v1/map/viewport?x0=0&y0=0&x1=200&y1=10", headers: auth });
    expect(big.statusCode).toBe(400);
    expect(big.json().error.code).toBe("VIEWPORT_TOO_LARGE");
    const off = await app.inject({ method: "GET", url: `/v1/map/viewport?x0=-40&y0=-40&x1=10&y1=10`, headers: auth });
    expect(off.statusCode).toBe(200);
    expect(off.json().bounds).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 });
  });

  it("rejects unauthenticated map calls", async () => {
    expect((await app.inject({ method: "GET", url: "/v1/map/chunk?cx=0&cy=0" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/v1/map/viewport?x0=0&y0=0&x1=5&y1=5" })).statusCode).toBe(401);
  });
});
