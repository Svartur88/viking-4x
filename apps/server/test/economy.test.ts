/** Home production (P3.E01, economy.md rules 2 and 3): lazy accrual, storage cap, settle-before-spend. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
const hasInfra = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;
const d = hasInfra ? describe : describe.skip;
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { pool } from "../src/db/pool.js";
import { createKingdom } from "../src/kingdom/service.js";
import { startWorker, shutdownTimers, completeTimer, reduceTimer } from "../src/timers/engine.js";
import { ratePerHour, storageCap, ratesFor, settle, PRODUCERS } from "../src/economy/service.js";
import "../src/buildings/service.js";

describe("production arithmetic", () => {
  it("only producers produce, and each level produces more than the last", () => {
    expect(ratePerHour("longhouse", 5)).toBe(0);
    expect(ratePerHour("farm", 1)).toBeGreaterThan(0);
    for (let level = 1; level < 20; level++)
      expect(ratePerHour("farm", level + 1)).toBeGreaterThan(ratePerHour("farm", level));
  });

  it("every producer feeds exactly one resource, and the four are covered", () => {
    expect(new Set(Object.values(PRODUCERS))).toEqual(new Set(["grain", "timber", "stone", "iron"]));
  });

  it("a hall with no storehouse still stores something, and the storehouse raises it", () => {
    expect(storageCap(0)).toBeGreaterThan(0);
    expect(storageCap(5)).toBeGreaterThan(storageCap(0));
  });

  it("rates add up across buildings and read the storehouse for the cap", () => {
    const r = ratesFor([
      { kind: "farm", level: 1 },
      { kind: "farm", level: 3 },
      { kind: "longhouse", level: 9 },
      { kind: "storehouse", level: 2 },
    ]);
    expect(r.perHour.grain).toBe(ratePerHour("farm", 1) + ratePerHour("farm", 3));
    expect(r.perHour.iron).toBe(0);
    expect(r.cap).toBe(storageCap(2));
  });
});

let app: Awaited<ReturnType<typeof buildApp>>; let stop: () => Promise<void>; let kingdomId: string;

beforeAll(async () => {
  if (!hasInfra) return;
  process.env.NODE_ENV = "test";
  await migrate();
  await pool.query("update kingdoms set state='full'");
  kingdomId = (await createKingdom({ size: 128, seed: 7 })).id;
  app = await buildApp(); stop = startWorker(2);
});
afterAll(async () => {
  if (!hasInfra) return;
  await app.close(); await stop();
  for (const t of ["marches", "nodes", "timers", "buildings", "occupants", "halls", "players"])
    await pool.query(`delete from ${t} where kingdom_id=$1`, [kingdomId]);
  await pool.query("delete from kingdoms where id=$1", [kingdomId]);
  await shutdownTimers(); await pool.end();
});

async function newJarl() {
  const g = await app.inject({ method: "POST", url: "/v1/auth/guest", payload: { device_id: randomUUID() } });
  const p = (await app.inject({
    method: "POST", url: "/v1/players",
    headers: { authorization: `Bearer ${g.json().jwt}` },
    payload: { name: `E${Math.floor(Math.random() * 100000)}` },
  })).json();
  return { auth: { authorization: `Bearer ${p.jwt}` } };
}

/** Wind a hall's production mark back, as if the player had been away. */
async function backdate(hallId: string, hours: number) {
  await pool.query("update halls set resources_at = now() - make_interval(secs => $2) where id=$1", [hallId, hours * 3600]);
}

d("production against the database", () => {
  it("credits an absence at the standing rate, and moves the mark forward", async () => {
    const { auth } = await newJarl();
    let body = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    const hallId = body.hall.id;
    const rate = body.production.per_hour.grain as number;
    expect(rate).toBeGreaterThan(0);
    const before = Number(body.hall.grain);

    await pool.query("update halls set grain=$2 where id=$1", [hallId, 0]);
    await backdate(hallId, 2);
    body = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    // Two hours away pays two hours, within a second's worth of rounding.
    expect(Number(body.hall.grain)).toBeGreaterThan(rate * 2 - rate / 3600 - 2);
    expect(Number(body.hall.grain)).toBeLessThanOrEqual(rate * 2 + 1);
    expect(before).toBeGreaterThanOrEqual(0);

    // Reading again immediately must not pay twice.
    const again = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    expect(Number(again.hall.grain) - Number(body.hall.grain)).toBeLessThan(rate / 60);
  });

  it("stops at the storage cap rather than overflowing", async () => {
    const { auth } = await newJarl();
    const body = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    const cap = body.production.cap as number;
    await pool.query("update halls set grain=0 where id=$1", [body.hall.id]);
    await backdate(body.hall.id, 10_000);   // long enough to blow past any cap
    const settled = await settle(body.hall.id);
    expect(Number(settled.grain)).toBe(cap);
  });

  it("never claws back a hall that is already over the cap", async () => {
    const { auth } = await newJarl();
    const body = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    const over = (body.production.cap as number) * 3;
    await pool.query("update halls set grain=$2 where id=$1", [body.hall.id, over]);
    await backdate(body.hall.id, 5);
    const settled = await settle(body.hall.id);
    expect(Number(settled.grain)).toBe(over);
  });

  it("an upgrade the player could not afford before their absence is affordable after it", async () => {
    const { auth } = await newJarl();
    const body = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    const lh = body.buildings.find((b: { kind: string }) => b.kind === "longhouse");
    await pool.query("update halls set grain=0, timber=0, stone=0, iron=0 where id=$1", [body.hall.id]);

    let r = await app.inject({ method: "POST", url: `/v1/buildings/${lh.id}/upgrade`, headers: auth });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe("INSUFFICIENT");

    await backdate(body.hall.id, 3);
    r = await app.inject({ method: "POST", url: `/v1/buildings/${lh.id}/upgrade`, headers: auth });
    expect(r.statusCode).toBe(200);
  });

  it("pays the hours before a producer finishes upgrading at the old rate, not the new one", async () => {
    const { auth } = await newJarl();
    let body = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    const hallId = body.hall.id;
    const lh = body.buildings.find((b: { kind: string }) => b.kind === "longhouse");
    const farm = body.buildings.find((b: { kind: string }) => b.kind === "farm");

    // Farm 1→2 needs Longhouse 2 first.
    let r = await app.inject({ method: "POST", url: `/v1/buildings/${lh.id}/upgrade`, headers: auth });
    await reduceTimer(r.json().timer.id, 10_000, { kind: "speedup_test" });
    await completeTimer(r.json().timer.id);

    r = await app.inject({ method: "POST", url: `/v1/buildings/${farm.id}/upgrade`, headers: auth });
    expect(r.statusCode).toBe(200);
    const timer = r.json().timer;

    const rateAtOne = ratePerHour("farm", 1);
    const rateAtTwo = ratePerHour("farm", 2);
    await pool.query("update halls set grain=0 where id=$1", [hallId]);
    await backdate(hallId, 4);
    await reduceTimer(timer.id, 10_000, { kind: "speedup_test" });
    await completeTimer(timer.id);

    body = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    expect(body.buildings.find((b: { kind: string }) => b.kind === "farm").level).toBe(2);
    // Four hours at the level-1 rate. Paying them at level 2 would be a visible windfall.
    const grain = Number(body.hall.grain);
    expect(grain).toBeGreaterThanOrEqual(rateAtOne * 4 - 2);
    expect(grain).toBeLessThan(rateAtTwo * 4 * 0.9);
  });
});
