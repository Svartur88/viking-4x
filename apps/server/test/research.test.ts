/**
 * Research — the Rune Hall's three branches (research.md).
 *
 * These assert the SHAPE the client reads as much as the behaviour, for the reason `founding.test.ts`
 * gives: the hall screen once opened black because a field the client read had no source, and no
 * test noticed because every test called the service directly. Anything `rune_hall_screen.gd` reads
 * off a node is asserted here.
 *
 * The one-at-a-time rule is tested through the ENDPOINT rather than the service, because it is
 * enforced by a partial unique index and the service only translates the error. A test that called
 * the service twice in one transaction would prove nothing about what two requests do.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
const hasInfra = !!process.env.DATABASE_URL && !!process.env.REDIS_URL;
const d = hasInfra ? describe : describe.skip;
import { buildApp } from "../src/app.js";
import { migrate } from "../src/db/migrate.js";
import { pool } from "../src/db/pool.js";
import { createKingdom } from "../src/kingdom/service.js";
import { startWorker, shutdownTimers, completeTimer, reduceTimer } from "../src/timers/engine.js";
import { NODES, researchSeconds } from "../src/research/catalogue.js";
import "../src/research/service.js";

let app: Awaited<ReturnType<typeof buildApp>>; let stop: () => Promise<void>; let kingdomId: string;

let reopen: string[] = [];
async function closeOtherKingdoms() {
  const { rows } = await pool.query("select id from kingdoms where state='open'");
  reopen = rows.map((r: { id: string }) => r.id);
  if (reopen.length) await pool.query("update kingdoms set state='full' where id = any($1)", [reopen]);
}
async function reopenKingdoms() {
  if (reopen.length) await pool.query("update kingdoms set state='open' where id = any($1)", [reopen]);
}

beforeAll(async () => {
  if (!hasInfra) return;
  process.env.NODE_ENV = "test";
  await migrate();
  await closeOtherKingdoms();
  kingdomId = (await createKingdom({ size: 128, seed: 77 })).id;
  app = await buildApp(); stop = startWorker(2);
});
afterAll(async () => {
  if (!hasInfra) return;
  await app.close(); await stop();
  await pool.query("delete from research where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from troops where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from marches where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from nodes where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from timers where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from buildings where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from occupants where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from halls where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from players where kingdom_id=$1", [kingdomId]);
  await pool.query("delete from kingdoms where id=$1", [kingdomId]);
  await reopenKingdoms();
  await shutdownTimers(); await pool.end();
});

async function signUp() {
  const g = await app.inject({ method: "POST", url: "/v1/auth/guest", payload: { device_id: randomUUID() } });
  const jwt = g.json().jwt as string;
  const p = (await app.inject({
    method: "POST", url: "/v1/players",
    headers: { authorization: `Bearer ${jwt}` },
    payload: { name: `R${Math.floor(Math.random() * 100000)}` },
  })).json();
  const auth = { authorization: `Bearer ${p.jwt}` };
  const hall = (await pool.query("select id from halls where player_id=$1", [p.player.playerId])).rows[0];
  return { auth, hallId: hall.id as string };
}

/** Put the hall in a state where research is actually reachable, without playing for a week. */
async function equip(hallId: string, runeHall: number, longhouse: number) {
  await pool.query("update buildings set level=$2 where hall_id=$1 and kind='longhouse'", [hallId, longhouse]);
  await pool.query(
    `insert into buildings (id, kingdom_id, hall_id, kind, slot, level)
     select $1, kingdom_id, id, 'rune_hall', 0, $2 from halls where id=$3
     on conflict (hall_id, kind, slot) do update set level = excluded.level`,
    [randomUUID(), runeHall, hallId],
  );
  await pool.query("update halls set grain=9e8, timber=9e8, stone=9e8, iron=9e8 where id=$1", [hallId]);
}

d("the research tree", () => {
  it("is data, not code: unique ids, three branches, and every field the client reads", async () => {
    const { auth, hallId } = await signUp();
    await equip(hallId, 1, 7);
    const r = await app.inject({ method: "GET", url: "/v1/research", headers: auth });
    expect(r.statusCode).toBe(200);
    const body = r.json();

    expect(body.nodes.length).toBe(NODES.length);
    expect(new Set(body.nodes.map((n: { id: string }) => n.id)).size).toBe(NODES.length);
    expect(Object.keys(body.branches).sort()).toEqual(["berg", "bu", "her"]);

    for (const n of body.nodes) {
      expect(typeof n.id).toBe("string");
      expect(typeof n.name).toBe("string");          // the Skáld's name, shown in game
      expect(typeof n.gloss).toBe("string");         // what the word means
      expect(typeof n.effect).toBe("string");
      expect(["bu", "her", "berg"]).toContain(n.branch);
      expect([1, 2, 3]).toContain(n.tier);
      expect(typeof n.level).toBe("number");
      expect(typeof n.max_level).toBe("number");
      expect(Array.isArray(n.needs)).toBe(true);
      expect(typeof n.later).toBe("boolean");
      // blocked is a REASON or null — never a bare boolean. A greyed box a player cannot act on
      // is the thing this field exists to prevent.
      expect(n.blocked === null || typeof n.blocked === "string").toBe(true);
    }
  });

  it("names are display-only: every id is ascii, so renaming a node orphans nothing", () => {
    for (const n of NODES) {
      expect(n.id).toMatch(/^[a-z0-9_]+$/);
      expect(n.name.length).toBeGreaterThan(0);
    }
  });

  it("every prerequisite points at a node that exists, and never forward a tier", () => {
    const byId = new Map(NODES.map((n) => [n.id, n]));
    for (const n of NODES) {
      for (const dep of n.needs ?? []) {
        const target = byId.get(dep);
        expect(target, `${n.id} needs missing node ${dep}`).toBeTruthy();
        expect(target!.tier).toBeLessThanOrEqual(n.tier);
        expect(target!.branch).toBe(n.branch);
      }
    }
  });

  it("gates a tier-2 node on the Rune Hall, and says which level", async () => {
    const { auth, hallId } = await signUp();
    await equip(hallId, 1, 13);
    const body = (await app.inject({ method: "GET", url: "/v1/research", headers: auth })).json();
    const ardr = body.nodes.find((n: { id: string }) => n.id === "ardr");
    expect(ardr.blocked).toBe("Needs Rune Hall 6");

    const r = await app.inject({ method: "POST", url: "/v1/research/start", headers: auth, payload: { node: "ardr" } });
    expect(r.statusCode).toBe(422);
  });

  it("runs a node to completion and records the level", async () => {
    const { auth, hallId } = await signUp();
    await equip(hallId, 1, 7);

    const started = await app.inject({ method: "POST", url: "/v1/research/start", headers: auth, payload: { node: "sigd" } });
    expect(started.statusCode).toBe(200);
    const timer = started.json().timer;

    // completeTimer silently does nothing unless the timer is due — the trap `founding.test.ts`
    // fell into. Pull it forward first.
    await reduceTimer(timer.id, 10_000);
    await completeTimer(timer.id);

    const after = (await app.inject({ method: "GET", url: "/v1/research", headers: auth })).json();
    const sigd = after.nodes.find((n: { id: string }) => n.id === "sigd");
    expect(sigd.level).toBe(1);
    expect(after.running).toBeNull();
  });

  it("allows only one research at a time, enforced by the database", async () => {
    const { auth, hallId } = await signUp();
    await equip(hallId, 1, 7);

    const first = await app.inject({ method: "POST", url: "/v1/research/start", headers: auth, payload: { node: "oxi" } });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: "POST", url: "/v1/research/start", headers: auth, payload: { node: "meitill" } });
    expect(second.statusCode).toBe(409);

    // And the tree says so, in words, for every other node.
    const body = (await app.inject({ method: "GET", url: "/v1/research", headers: auth })).json();
    const meitill = body.nodes.find((n: { id: string }) => n.id === "meitill");
    expect(meitill.blocked).toBe("Another research is running");
    expect(body.running).not.toBeNull();
  });

  it("refuses a prerequisite that is not taken, naming it", async () => {
    const { auth, hallId } = await signUp();
    await equip(hallId, 6, 13);
    const body = (await app.inject({ method: "GET", url: "/v1/research", headers: auth })).json();
    const ardr = body.nodes.find((n: { id: string }) => n.id === "ardr");
    expect(ardr.blocked).toBe("Needs Sigð");   // the name, not the slug — a player reads this

    const r = await app.inject({ method: "POST", url: "/v1/research/start", headers: auth, payload: { node: "ardr" } });
    expect(r.statusCode).toBe(422);
  });

  it("marks the Berg branch as not in the game yet and refuses to start it (DEC-021)", async () => {
    const { auth, hallId } = await signUp();
    await equip(hallId, 20, 30);
    const body = (await app.inject({ method: "GET", url: "/v1/research", headers: auth })).json();
    const berg = body.nodes.filter((n: { branch: string }) => n.branch === "berg");
    expect(berg.length).toBeGreaterThan(0);
    for (const n of berg) {
      expect(n.later).toBe(true);
      expect(n.blocked).toBe("Not in the game yet");
    }
    const r = await app.inject({ method: "POST", url: "/v1/research/start", headers: auth, payload: { node: "malmleit" } });
    expect(r.statusCode).toBe(422);
  });

  it("never asks a jarl to wait longer than PR-04 allows", () => {
    // research.md rule 5. Checked across every node at its last level, which is where it would break.
    for (const n of NODES) {
      expect(researchSeconds(n, n.maxLevel)).toBeLessThanOrEqual(7 * 86_400);
    }
  });
});
