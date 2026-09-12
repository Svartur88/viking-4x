/** Walking skeleton, server side (P2.S03 guest, P2.B02, P2.B04): guest → sign up → hall placed → upgrade → timer completes. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
const hasInfra = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;
const d = hasInfra ? describe : describe.skip;
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { pool } from "../src/db/pool.js";
import { createKingdom } from "../src/kingdom/service.js";
import { startWorker, shutdownTimers, completeTimer, reduceTimer } from "../src/timers/engine.js";
import "../src/buildings/service.js";

let app: Awaited<ReturnType<typeof buildApp>>; let stop: () => Promise<void>; let kingdomId: string;

beforeAll(async () => {
  if (!hasInfra) return;
  process.env.NODE_ENV = "test";
  await migrate();
  await pool.query("update kingdoms set state='full'"); // isolate: only our kingdom is open
  kingdomId = (await createKingdom({ size: 128, seed: 42 })).id;
  app = await buildApp(); stop = startWorker(2);
});
afterAll(async () => {
  if (!hasInfra) return;
  await app.close(); await stop();
  await pool.query("delete from troops where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from marches where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from nodes where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from timers where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from buildings where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from occupants where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from halls where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from players where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from kingdoms where id=$1", [kingdomId]);
  await shutdownTimers(); await pool.end();
});

async function guest() {
  const r = await app.inject({ method: "POST", url: "/v1/auth/guest", payload: { device_id: randomUUID() } });
  expect(r.statusCode).toBe(200);
  return r.json().jwt as string;
}

d("walking skeleton (server)", () => {
  it("guest → sign up places a hall on a free land tile with starter buildings", async () => {
    const jwt = await guest();
    const r = await app.inject({ method: "POST", url: "/v1/players", headers: { authorization: `Bearer ${jwt}` }, payload: { name: "Hawk" } });
    expect(r.statusCode).toBe(200);
    const { player, jwt: jwt2 } = r.json();
    expect(player.kingdomId).toBe(kingdomId);
    const h = await app.inject({ method: "GET", url: "/v1/hall", headers: { authorization: `Bearer ${jwt2}` } });
    expect(h.statusCode).toBe(200);
    const body = h.json();
    expect(body.buildings.map((b: { kind: string }) => b.kind).sort()).toEqual(["barracks", "farm", "iron_pit", "longhouse", "quarry", "timber_camp"]);
    expect(body.hall.x).toBeGreaterThan(8); // not in the sea ring
  });

  it("two sign-ups never share or touch a tile", async () => {
    const jwts = await Promise.all([guest(), guest()]);
    const res = await Promise.all(jwts.map((j, i) => app.inject({ method: "POST", url: "/v1/players", headers: { authorization: `Bearer ${j}` }, payload: { name: `J${i}${Date.now() % 1000}` } })));
    const [a, b] = res.map((r) => r.json().player);
    expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThan(1);
  });

  it("upgrade: longhouse gate, builders, cost, timer, completion", async () => {
    const jwt = await guest();
    const p = (await app.inject({ method: "POST", url: "/v1/players", headers: { authorization: `Bearer ${jwt}` }, payload: { name: `U${Date.now() % 10000}` } })).json();
    const auth = { authorization: `Bearer ${p.jwt}` };
    let hall = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    const farm = hall.buildings.find((b: { kind: string }) => b.kind === "farm");
    const lh = hall.buildings.find((b: { kind: string }) => b.kind === "longhouse");
    // farm 1→2 is gated by longhouse level 1
    let r = await app.inject({ method: "POST", url: `/v1/buildings/${farm.id}/upgrade`, headers: auth });
    expect(r.statusCode).toBe(422); expect(r.json().error.code).toBe("LONGHOUSE_GATE");
    // longhouse 1→2 starts a timer and debits resources
    r = await app.inject({ method: "POST", url: `/v1/buildings/${lh.id}/upgrade`, headers: auth });
    expect(r.statusCode).toBe(200);
    const timer = r.json().timer;
    hall = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    expect(hall.hall.grain).toBeLessThan(2000);
    expect(hall.timers.length).toBe(1);
    // second upgrade on the same building is refused (one pending per ref)
    r = await app.inject({ method: "POST", url: `/v1/buildings/${lh.id}/upgrade`, headers: auth });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    // speed it to completion → level 2, then the farm may upgrade
    await reduceTimer(timer.id, 10_000, { kind: "speedup_test" });
    await completeTimer(timer.id);
    hall = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    expect(hall.buildings.find((b: { kind: string }) => b.kind === "longhouse").level).toBe(2);
    r = await app.inject({ method: "POST", url: `/v1/buildings/${farm.id}/upgrade`, headers: auth });
    expect(r.statusCode).toBe(200);
  });

  it("rejects unauthenticated calls", async () => {
    const r = await app.inject({ method: "GET", url: "/v1/hall" });
    expect(r.statusCode).toBe(401);
  });
});
