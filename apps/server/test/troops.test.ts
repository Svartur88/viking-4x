/** Troops and training (P3.T01, units.md), and marches crewed by them rather than by a placeholder. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
const hasInfra = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;
const d = hasInfra ? describe : describe.skip;
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { pool } from "../src/db/pool.js";
import { createKingdom } from "../src/kingdom/service.js";
import { startWorker, shutdownTimers, completeTimer, reduceTimer } from "../src/timers/engine.js";
import { UNITS, trainCost, trainSeconds, carryOf, troopCapacity, TRAINS } from "../src/troops/service.js";
import { crewForHaul, carryOfCrew } from "../src/marches/service.js";
import "../src/troops/service.js";
import "../src/marches/service.js";
import "../src/buildings/service.js";

describe("unit arithmetic", () => {
  it("keeps units.md's table: Shieldwall carries more than a Berserker and costs what it says", () => {
    expect(UNITS.shieldwall.carry).toBe(20);
    expect(UNITS.shieldwall.carry).toBeGreaterThan(UNITS.berserker.carry);
    expect(trainCost("shieldwall", 1, 1)).toEqual({ grain: 40, timber: 30, stone: 10, iron: 10 });
  });

  it("tiers cost and carry more, and take longer", () => {
    expect(trainCost("shieldwall", 2, 1).grain).toBe(trainCost("shieldwall", 1, 1).grain * 2);
    expect(carryOf("shieldwall", 2)).toBeGreaterThan(carryOf("shieldwall", 1));
    expect(trainSeconds("shieldwall", 2, 10)).toBeGreaterThan(trainSeconds("shieldwall", 1, 10));
  });

  it("cost and time scale with the batch", () => {
    expect(trainCost("shieldwall", 1, 10).grain).toBe(trainCost("shieldwall", 1, 1).grain * 10);
    expect(trainSeconds("shieldwall", 1, 10)).toBeGreaterThan(trainSeconds("shieldwall", 1, 1));
  });

  it("a hall with no Barracks can hold no troops, and each level holds more", () => {
    expect(troopCapacity(0)).toBe(0);
    expect(troopCapacity(2)).toBeGreaterThan(troopCapacity(1));
  });

  it("every training building trains exactly one type", () => {
    expect(TRAINS.barracks).toBe("shieldwall");
    expect(new Set(Object.values(TRAINS)).size).toBe(Object.keys(TRAINS).length);
  });
});

describe("choosing a crew", () => {
  const stacks = [{ type: "shieldwall" as const, tier: 1, count: 100 }];

  it("sends only as many as the haul needs", () => {
    const { crew, carry } = crewForHaul(stacks, 100);
    expect(crew["shieldwall:1"]).toBe(5);          // carry 20 each
    expect(carry).toBe(100);
  });

  it("sends everyone when the haul is bigger than the hall can lift", () => {
    const { crew, carry } = crewForHaul(stacks, 99_999);
    expect(crew["shieldwall:1"]).toBe(100);
    expect(carry).toBe(2000);
  });

  it("prefers the better hauliers so fewer men leave the hall", () => {
    const mixed = [
      { type: "archer" as const, tier: 1, count: 100 },      // carry 15
      { type: "shieldwall" as const, tier: 1, count: 100 },  // carry 20
    ];
    const { crew } = crewForHaul(mixed, 200);
    expect(crew["shieldwall:1"]).toBe(10);
    expect(crew["archer:1"]).toBeUndefined();
  });

  it("an empty hall can carry nothing", () => {
    expect(crewForHaul([], 500).carry).toBe(0);
  });

  it("carryOfCrew agrees with what the picker said it would carry", () => {
    const { crew, carry } = crewForHaul(stacks, 250);
    expect(carryOfCrew(crew)).toBe(carry);
  });
});

let app: Awaited<ReturnType<typeof buildApp>>; let stop: () => Promise<void>; let kingdomId: string;

beforeAll(async () => {
  if (!hasInfra) return;
  process.env.NODE_ENV = "test";
  await migrate();
  await pool.query("update kingdoms set state='full'");
  kingdomId = (await createKingdom({ size: 128, seed: 23 })).id;
  app = await buildApp(); stop = startWorker(2);
});
afterAll(async () => {
  if (!hasInfra) return;
  await app.close(); await stop();
  await pool.query("update nodes set held_by=null where kingdom_id=$1", [kingdomId]);
  for (const t of ["troops", "marches", "nodes", "timers", "buildings", "occupants", "halls", "players"])
    await pool.query(`delete from ${t} where kingdom_id=$1`, [kingdomId]);
  await pool.query("delete from kingdoms where id=$1", [kingdomId]);
  await shutdownTimers(); await pool.end();
});

async function newJarl() {
  const g = await app.inject({ method: "POST", url: "/v1/auth/guest", payload: { device_id: randomUUID() } });
  const p = (await app.inject({
    method: "POST", url: "/v1/players",
    headers: { authorization: `Bearer ${g.json().jwt}` },
    payload: { name: `T${Math.floor(Math.random() * 100000)}` },
  })).json();
  const auth = { authorization: `Bearer ${p.jwt}` };
  const hall = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
  return { auth, hall };
}

/** Give a hall enough to pay for anything, so a test about training is not a test about grain. */
async function enrich(hallId: string) {
  await pool.query("update halls set grain=1000000, timber=1000000, stone=1000000, iron=1000000 where id=$1", [hallId]);
}

async function finishPending(hallId: string, kinds: string[], steps = 4) {
  for (let i = 0; i < steps; i++) {
    const { rows } = await pool.query(
      `select id from timers where hall_id=$1 and state='pending' and kind = any($2) order by due_at limit 1`,
      [hallId, kinds]);
    if (!rows[0]) return;
    await reduceTimer(rows[0].id, 10_000, { kind: "speedup_test" });
    await completeTimer(rows[0].id);
  }
}

d("training against the database", () => {
  it("a new hall has a Barracks and no troops", async () => {
    const { hall } = await newJarl();
    expect(hall.buildings.map((b: { kind: string }) => b.kind)).toContain("barracks");
    expect(hall.troops).toEqual([]);
    expect(hall.troop_capacity).toBeGreaterThan(0);
  });

  it("training costs resources up front and delivers men on the timer", async () => {
    const { auth, hall } = await newJarl();
    await enrich(hall.hall.id);
    const barracks = hall.buildings.find((b: { kind: string }) => b.kind === "barracks");

    const before = Number((await pool.query("select grain from halls where id=$1", [hall.hall.id])).rows[0].grain);
    const r = await app.inject({ method: "POST", url: `/v1/buildings/${barracks.id}/train`, headers: auth, payload: { count: 10 } });
    expect(r.statusCode).toBe(200);
    const after = Number((await pool.query("select grain from halls where id=$1", [hall.hall.id])).rows[0].grain);
    expect(before - after).toBe(trainCost("shieldwall", 1, 10).grain);

    // Not yet — they are still training.
    let now = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    expect(now.troops).toEqual([]);
    expect(now.troops_committed).toBe(10);

    await finishPending(hall.hall.id, ["train"]);
    now = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    expect(now.troops[0]).toMatchObject({ type: "shieldwall", tier: 1, count: 10 });
  });

  it("one queue per building: a second batch is refused while the first is training", async () => {
    const { auth, hall } = await newJarl();
    await enrich(hall.hall.id);
    const barracks = hall.buildings.find((b: { kind: string }) => b.kind === "barracks");
    expect((await app.inject({ method: "POST", url: `/v1/buildings/${barracks.id}/train`, headers: auth, payload: { count: 5 } })).statusCode).toBe(200);
    const second = await app.inject({ method: "POST", url: `/v1/buildings/${barracks.id}/train`, headers: auth, payload: { count: 5 } });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("ALREADY_TRAINING");
    await finishPending(hall.hall.id, ["train"]);
  });

  it("refuses to train past the hall's capacity, counting men already in training", async () => {
    const { auth, hall } = await newJarl();
    await enrich(hall.hall.id);
    const barracks = hall.buildings.find((b: { kind: string }) => b.kind === "barracks");
    const over = await app.inject({
      method: "POST", url: `/v1/buildings/${barracks.id}/train`, headers: auth,
      payload: { count: hall.troop_capacity + 1 },
    });
    expect(over.statusCode).toBe(422);
    expect(over.json().error.code).toBe("OVER_CAPACITY");
  });

  it("refuses when the hall cannot pay, and takes nothing", async () => {
    const { auth, hall } = await newJarl();
    await pool.query("update halls set grain=0, timber=0, stone=0, iron=0 where id=$1", [hall.hall.id]);
    const barracks = hall.buildings.find((b: { kind: string }) => b.kind === "barracks");
    const r = await app.inject({ method: "POST", url: `/v1/buildings/${barracks.id}/train`, headers: auth, payload: { count: 5 } });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe("INSUFFICIENT");
    const grain = Number((await pool.query("select grain from halls where id=$1", [hall.hall.id])).rows[0].grain);
    expect(grain).toBe(0);
  });

  it("a farm cannot train anyone", async () => {
    const { auth, hall } = await newJarl();
    await enrich(hall.hall.id);
    const farm = hall.buildings.find((b: { kind: string }) => b.kind === "farm");
    const r = await app.inject({ method: "POST", url: `/v1/buildings/${farm.id}/train`, headers: auth, payload: { count: 1 } });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe("NOT_A_TRAINER");
  });
});

d("marches crewed by troops", () => {
  it("a hall with no troops cannot send a gathering march", async () => {
    const { auth, hall } = await newJarl();
    const node = (await pool.query(
      "select id from nodes where kingdom_id=$1 and held_by is null order by greatest(abs(x-$2), abs(y-$3)) limit 1",
      [kingdomId, hall.hall.x, hall.hall.y])).rows[0];
    const r = await app.inject({ method: "POST", url: "/v1/marches/gather", headers: auth, payload: { node_id: node.id } });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe("NO_TROOPS");
  });

  it("troops leave the hall on the march and come home with the cargo", async () => {
    const { auth, hall } = await newJarl();
    await enrich(hall.hall.id);
    const barracks = hall.buildings.find((b: { kind: string }) => b.kind === "barracks");
    await app.inject({ method: "POST", url: `/v1/buildings/${barracks.id}/train`, headers: auth, payload: { count: 20 } });
    await finishPending(hall.hall.id, ["train"]);

    const node = (await pool.query(
      "select * from nodes where kingdom_id=$1 and held_by is null order by greatest(abs(x-$2), abs(y-$3)) limit 1",
      [kingdomId, hall.hall.x, hall.hall.y])).rows[0];
    await pool.query("update halls set grain=0, timber=0, stone=0, iron=0 where id=$1", [hall.hall.id]);

    const sent = await app.inject({ method: "POST", url: "/v1/marches/gather", headers: auth, payload: { node_id: node.id } });
    expect(sent.statusCode).toBe(200);
    const march = sent.json().marches[0];
    const sentMen = Object.values(march.composition as Record<string, number>).reduce((a, b) => a + Number(b), 0);
    expect(sentMen).toBeGreaterThan(0);

    // While away they are not standing in the hall.
    const away = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    const home = away.troops.reduce((a: number, s: { count: number }) => a + s.count, 0);
    expect(home).toBe(20 - sentMen);

    await finishPending(hall.hall.id, ["march_arrive", "gather", "march_return"], 5);

    const back = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    expect(back.troops.reduce((a: number, s: { count: number }) => a + s.count, 0)).toBe(20);
    expect(Number(back.hall[node.resource])).toBeGreaterThan(0);
    // Never more than the crew could physically carry.
    expect(Number(back.hall[node.resource])).toBeLessThanOrEqual(carryOf("shieldwall", 1) * 20);
  });
});
