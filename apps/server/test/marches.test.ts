/** Marches and gathering (P3.M01) — march-tick.md: send → arrive → gather → return, plus recall and contention. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
const hasInfra = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;
const d = hasInfra ? describe : describe.skip;
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { pool } from "../src/db/pool.js";
import { createKingdom } from "../src/kingdom/service.js";
import { startWorker, shutdownTimers, completeTimer, reduceTimer } from "../src/timers/engine.js";
import { travelSeconds, marchSlots, carryFor } from "../src/marches/service.js";
import { nodeAmount, nodeRatePerHour } from "../src/nodes/service.js";
import "../src/marches/service.js";
import "../src/buildings/service.js";

describe("march arithmetic", () => {
  it("travel time is symmetric, never zero, and grows with distance", () => {
    expect(travelSeconds(0, 0, 10, 0)).toBe(travelSeconds(10, 0, 0, 0));
    expect(travelSeconds(5, 5, 5, 5)).toBeGreaterThan(0);
    expect(travelSeconds(0, 0, 40, 0)).toBeGreaterThan(travelSeconds(0, 0, 10, 0));
  });

  it("diagonals cost the same as straight lines on a square grid", () => {
    expect(travelSeconds(0, 0, 10, 10)).toBe(travelSeconds(0, 0, 10, 0));
  });

  it("march slots come from the Longhouse alone and never decrease", () => {
    let last = 0;
    for (let level = 1; level <= 20; level++) {
      const slots = marchSlots(level);
      expect(slots).toBeGreaterThanOrEqual(last);
      last = slots;
    }
    expect(marchSlots(1)).toBe(1);
  });

  it("a bigger node holds more and yields faster", () => {
    expect(nodeAmount(3)).toBeGreaterThan(nodeAmount(1));
    expect(nodeRatePerHour(3)).toBeGreaterThan(nodeRatePerHour(1));
  });
});

let app: Awaited<ReturnType<typeof buildApp>>; let stop: () => Promise<void>; let kingdomId: string;

beforeAll(async () => {
  if (!hasInfra) return;
  process.env.NODE_ENV = "test";
  await migrate();
  await pool.query("update kingdoms set state='full'");
  kingdomId = (await createKingdom({ size: 128, seed: 11 })).id;
  app = await buildApp(); stop = startWorker(2);
});
afterAll(async () => {
  if (!hasInfra) return;
  await app.close(); await stop();
  await pool.query("update nodes set held_by=null where kingdom_id=$1", [kingdomId]);
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
    payload: { name: `M${Math.floor(Math.random() * 100000)}` },
  })).json();
  const auth = { authorization: `Bearer ${p.jwt}` };
  const hall = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
  return { auth, hall, playerId: p.player.playerId as string };
}

/** The nodes seeded around this hall, nearest first. */
async function nodesOf(hallX: number, hallY: number) {
  const { rows } = await pool.query(
    `select *, greatest(abs(x-$2), abs(y-$3)) as dist from nodes where kingdom_id=$1 order by dist`,
    [kingdomId, hallX, hallY]);
  return rows;
}

/** Run the whole timer chain for a march without waiting out the clock. */
async function fastForward(hallId: string, steps = 3) {
  for (let i = 0; i < steps; i++) {
    const { rows } = await pool.query(
      "select id from timers where hall_id=$1 and state='pending' and kind in ('march_arrive','gather','march_return') order by due_at limit 1",
      [hallId]);
    if (!rows[0]) return;
    await reduceTimer(rows[0].id, 10_000, { kind: "speedup_test" });
    await completeTimer(rows[0].id);
  }
}

d("marches against the database", () => {
  it("signing up puts gatherable nodes within sight of the new hall", async () => {
    const { hall } = await newJarl();
    const nodes = await nodesOf(hall.hall.x, hall.hall.y);
    expect(nodes.length).toBeGreaterThan(0);
    // All four resources, so nobody is stuck short of one of them.
    expect(new Set(nodes.map((n) => n.resource)).size).toBe(4);
    // Close enough that a first march is watchable rather than a commute.
    expect(Number(nodes[0].dist)).toBeLessThanOrEqual(26);
  });

  it("send → arrive → gather → home, and the resources actually land", async () => {
    const { auth, hall } = await newJarl();
    const node = (await nodesOf(hall.hall.x, hall.hall.y))[0];
    await pool.query("update halls set grain=0, timber=0, stone=0, iron=0 where id=$1", [hall.hall.id]);

    const sent = await app.inject({ method: "POST", url: "/v1/marches/gather", headers: auth, payload: { node_id: node.id } });
    expect(sent.statusCode).toBe(200);
    expect(sent.json().marches[0].state).toBe("travelling");

    await fastForward(hall.hall.id);

    const after = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    expect(after.marches.length).toBe(0);                       // it came home and retired
    const got = Number(after.hall[node.resource]);
    expect(got).toBeGreaterThan(0);
    // It brought back what it could carry, or what was in the ground, whichever is smaller.
    expect(got).toBeLessThanOrEqual(Math.min(carryFor(1), Number(node.remaining)) + 5);
  });

  it("one march per node: a second jarl is refused while it is held", async () => {
    const a = await newJarl();
    const b = await newJarl();
    const node = (await nodesOf(a.hall.hall.x, a.hall.hall.y))[0];

    const first = await app.inject({ method: "POST", url: "/v1/marches/gather", headers: a.auth, payload: { node_id: node.id } });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: "POST", url: "/v1/marches/gather", headers: b.auth, payload: { node_id: node.id } });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("NODE_OCCUPIED");

    await fastForward(a.hall.hall.id);
  });

  it("a jarl with one march slot cannot send two", async () => {
    const { auth, hall } = await newJarl();
    const nodes = await nodesOf(hall.hall.x, hall.hall.y);
    const first = await app.inject({ method: "POST", url: "/v1/marches/gather", headers: auth, payload: { node_id: nodes[0].id } });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: "POST", url: "/v1/marches/gather", headers: auth, payload: { node_id: nodes[1].id } });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("NO_MARCH_SLOT");
    await fastForward(hall.hall.id);
  });

  it("recall turns it round early and frees the node for someone else", async () => {
    const a = await newJarl();
    const b = await newJarl();
    const node = (await nodesOf(a.hall.hall.x, a.hall.hall.y))[0];

    const sent = await app.inject({ method: "POST", url: "/v1/marches/gather", headers: a.auth, payload: { node_id: node.id } });
    const marchId = sent.json().marches[0].id;

    const back = await app.inject({ method: "POST", url: `/v1/marches/${marchId}/recall`, headers: a.auth });
    expect(back.statusCode).toBe(200);
    expect(back.json().march.state).toBe("returning");

    // The node is free the moment the recall lands, not when the march gets home.
    const free = (await pool.query("select held_by from nodes where id=$1", [node.id])).rows[0];
    expect(free.held_by).toBeNull();
    const other = await app.inject({ method: "POST", url: "/v1/marches/gather", headers: b.auth, payload: { node_id: node.id } });
    expect(other.statusCode).toBe(200);

    await fastForward(a.hall.hall.id);
    await fastForward(b.hall.hall.id);
  });

  it("a recall seconds after sending is a short walk home, not a full leg", async () => {
    const { auth, hall } = await newJarl();
    const node = (await nodesOf(hall.hall.x, hall.hall.y))[2];
    const sent = await app.inject({ method: "POST", url: "/v1/marches/gather", headers: auth, payload: { node_id: node.id } });
    const marchId = sent.json().marches[0].id;
    const full = travelSeconds(hall.hall.x, hall.hall.y, node.x, node.y);

    const back = (await app.inject({ method: "POST", url: `/v1/marches/${marchId}/recall`, headers: auth })).json().march;
    const home = (new Date(back.returns_at).getTime() - Date.now()) / 1000;
    expect(home).toBeLessThan(full);
    expect(home).toBeGreaterThan(0);
    await fastForward(hall.hall.id);
  });

  it("emptying a node removes it from the map", async () => {
    const { auth, hall } = await newJarl();
    const node = (await nodesOf(hall.hall.x, hall.hall.y))[0];
    // Leave less in the ground than the march can carry, so one trip clears it.
    await pool.query("update nodes set remaining=50 where id=$1", [node.id]);

    await app.inject({ method: "POST", url: "/v1/marches/gather", headers: auth, payload: { node_id: node.id } });
    await fastForward(hall.hall.id);

    expect((await pool.query("select id from nodes where id=$1", [node.id])).rows.length).toBe(0);
    const occ = await pool.query("select 1 from occupants where kingdom_id=$1 and x=$2 and y=$3 and type='node'", [kingdomId, node.x, node.y]);
    expect(occ.rows.length).toBe(0);
  });

  it("the viewport carries nodes and marches, not just halls", async () => {
    const { auth, hall } = await newJarl();
    const node = (await nodesOf(hall.hall.x, hall.hall.y))[0];
    await app.inject({ method: "POST", url: "/v1/marches/gather", headers: auth, payload: { node_id: node.id } });

    const x = hall.hall.x, y = hall.hall.y;
    const v = (await app.inject({
      method: "GET",
      url: `/v1/map/viewport?x0=${x - 30}&y0=${y - 30}&x1=${x + 30}&y1=${y + 30}`,
      headers: auth,
    })).json();
    expect(v.nodes.length).toBeGreaterThan(0);
    expect(v.nodes[0]).toHaveProperty("resource");
    expect(v.marches.length).toBeGreaterThan(0);
    expect(v.marches[0]).toHaveProperty("origin_x");

    await fastForward(hall.hall.id);
  });
});
