/**
 * Founding an empty slot (P2.B04, the half that was missing until 2026-09-13).
 *
 * The hall screen and `catalogue.ts` were both written against plots and a founding endpoint that
 * did not exist, so the client threw on `Session.plots` and the game opened black. These tests
 * exist so that cannot happen again silently: they assert the SHAPE the client reads, not just
 * that the server does not error.
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
import "../src/buildings/service.js";

let app: Awaited<ReturnType<typeof buildApp>>; let stop: () => Promise<void>; let kingdomId: string;

/** Remember which kingdoms were open, close them for the run, and reopen them afterwards. */
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
  // Isolation without collateral damage: close only the kingdoms this suite is about to ignore by
  // creating ours LAST and signing up into it explicitly. Closing every kingdom (what this used to
  // do) also closed the developer's, and sign-up then failed until someone restarted the server.
  await closeOtherKingdoms();
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
  await reopenKingdoms();
  await shutdownTimers(); await pool.end();
});

async function guest() {
  const r = await app.inject({ method: "POST", url: "/v1/auth/guest", payload: { device_id: randomUUID() } });
  expect(r.statusCode).toBe(200);
  return r.json().jwt as string;
}


d("founding a building", () => {
  it("/v1/hall returns a plot for every catalogue entry, shaped as the client reads it", async () => {
    const jwt = await guest();
    const p = (await app.inject({ method: "POST", url: "/v1/players", headers: { authorization: `Bearer ${jwt}` }, payload: { name: `F${Date.now() % 10000}` } })).json();
    const auth = { authorization: `Bearer ${p.jwt}` };
    const hall = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();

    // The client crashed because this key was absent. Assert it exists before anything else.
    expect(Array.isArray(hall.plots)).toBe(true);
    // 39 plots across 27 kinds: the four production kinds have four each (buildings.md rule 1).
    expect(hall.plots.length).toBe(39);
    const farms = hall.plots.filter((q: { kind: string }) => q.kind === "farm");
    expect(farms.length).toBe(4);
    expect(farms.filter((q: { built: boolean }) => q.built).length).toBe(1);   // one starter farm
    expect(new Set(hall.plots.map((q: { slot_id: string }) => q.slot_id)).size).toBe(39);

    // Every field city_screen.gd reads off a plot.
    for (const plot of hall.plots) {
      expect(typeof plot.kind).toBe("string");
      expect(typeof plot.name).toBe("string");
      expect(typeof plot.purpose).toBe("string");
      expect(typeof plot.at.x).toBe("number");
      expect(typeof plot.at.y).toBe("number");
      expect(typeof plot.size).toBe("number");
      expect(typeof plot.built).toBe("boolean");
      expect(typeof plot.can_found).toBe("boolean");
      expect(typeof plot.slot).toBe("number");
      expect(typeof plot.slot_id).toBe("string");
      expect(typeof plot.later).toBe("boolean");
    }

    // Draw order is far to near, so the client can paint without sorting.
    const ys = hall.plots.map((q: { at: { y: number } }) => q.at.y);
    expect([...ys].sort((a: number, b: number) => a - b)).toEqual(ys);

    // The six starters are built; the storehouse is not, and is gated behind Longhouse 2.
    const built = hall.plots.filter((q: { built: boolean }) => q.built).map((q: { kind: string }) => q.kind).sort();
    expect(built).toEqual(["barracks", "farm", "iron_pit", "longhouse", "quarry", "timber_camp"]);
    const store = hall.plots.find((q: { kind: string }) => q.kind === "storehouse");
    expect(store.built).toBe(false);
    expect(store.can_found).toBe(false);
    expect(store.found_cost).not.toBeNull();
  });

  it("founding: gate, already-built, cost, timer, and the building appears on completion", async () => {
    const jwt = await guest();
    const p = (await app.inject({ method: "POST", url: "/v1/players", headers: { authorization: `Bearer ${jwt}` }, payload: { name: `G${Date.now() % 10000}` } })).json();
    const auth = { authorization: `Bearer ${p.jwt}` };

    // Gated: the Storehouse needs Longhouse 2 and this hall is at 1.
    let r = await app.inject({ method: "POST", url: "/v1/buildings/found", headers: auth, payload: { kind: "storehouse" } });
    expect(r.statusCode).toBe(422); expect(r.json().error.code).toBe("LONGHOUSE_GATE");

    // Already standing.
    r = await app.inject({ method: "POST", url: "/v1/buildings/found", headers: auth, payload: { kind: "farm" } });
    expect(r.statusCode).toBe(409); expect(r.json().error.code).toBe("ALREADY_BUILT");

    // Not a building at all.
    r = await app.inject({ method: "POST", url: "/v1/buildings/found", headers: auth, payload: { kind: "dragon_pen" } });
    expect(r.statusCode).toBe(404);

    // Raise the Longhouse to 2 so the Storehouse unlocks, then found it.
    const hall0 = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    const lh = hall0.buildings.find((b: { kind: string }) => b.kind === "longhouse");
    await pool.query("update halls set grain=1e9, timber=1e9, stone=1e9, iron=1e9 where id=$1", [hall0.hall.id]);
    const up = (await app.inject({ method: "POST", url: `/v1/buildings/${lh.id}/upgrade`, headers: auth })).json();
    // completeTimer SKIPS silently unless the timer is already due — reduce it first.
    await reduceTimer(up.timer.id, 10_000, { kind: "speedup_test" });
    await completeTimer(up.timer.id);

    const before = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    expect(before.plots.find((q: { kind: string }) => q.kind === "storehouse").can_found).toBe(true);
    const grainBefore = Number(before.hall.grain);

    const f = await app.inject({ method: "POST", url: "/v1/buildings/found", headers: auth, payload: { kind: "storehouse" } });
    expect(f.statusCode).toBe(200);
    const timer = f.json().timer;
    expect(timer.kind).toBe("found");
    // The building does not exist yet, so the kind travels in the payload, not the ref.
    expect(timer.payload.kind).toBe("storehouse");

    // It was paid for.
    const during = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    expect(Number(during.hall.grain)).toBeLessThan(grainBefore);
    // And the client can see it being built, by kind.
    expect(during.timers.some((t: { kind: string; payload: { kind?: string } }) => t.kind === "found" && t.payload.kind === "storehouse")).toBe(true);
    // Still not built until the timer completes.
    expect(during.plots.find((q: { kind: string }) => q.kind === "storehouse").built).toBe(false);

    await reduceTimer(timer.id, 10_000, { kind: "speedup_test" });
    await completeTimer(timer.id);

    const after = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    const store = after.plots.find((q: { kind: string }) => q.kind === "storehouse");
    expect(store.built).toBe(true);
    expect(store.level).toBe(1);
    expect(after.buildings.some((b: { kind: string }) => b.kind === "storehouse")).toBe(true);
  });

  it("a second farm is a different PLOT of the same kind, not a duplicate", async () => {
    const jwt = await guest();
    const p = (await app.inject({ method: "POST", url: "/v1/players", headers: { authorization: `Bearer ${jwt}` }, payload: { name: `S${Date.now() % 10000}` } })).json();
    const auth = { authorization: `Bearer ${p.jwt}` };
    const hall0 = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    await pool.query("update halls set grain=1e9, timber=1e9, stone=1e9, iron=1e9 where id=$1", [hall0.hall.id]);

    // Slot 0 stands from the first minute; slot 1 needs a higher Longhouse.
    let r = await app.inject({ method: "POST", url: "/v1/buildings/found", headers: auth, payload: { kind: "farm", slot: 0 } });
    expect(r.statusCode).toBe(409); expect(r.json().error.code).toBe("ALREADY_BUILT");
    r = await app.inject({ method: "POST", url: "/v1/buildings/found", headers: auth, payload: { kind: "farm", slot: 1 } });
    expect(r.statusCode).toBe(422); expect(r.json().error.code).toBe("LONGHOUSE_GATE");

    // Raise the Longhouse until farm slot 1 unlocks, then found it.
    const lh = hall0.buildings.find((b: { kind: string }) => b.kind === "longhouse");
    const needs = hall0.plots.find((q: { slot_id: string }) => q.slot_id === "farm:1").unlock;
    for (let lvl = 1; lvl < needs; lvl++) {
      const up = (await app.inject({ method: "POST", url: `/v1/buildings/${lh.id}/upgrade`, headers: auth })).json();
      await reduceTimer(up.timer.id, 10_000, { kind: "speedup_test" });
      await completeTimer(up.timer.id);
    }
    const f = (await app.inject({ method: "POST", url: "/v1/buildings/found", headers: auth, payload: { kind: "farm", slot: 1 } })).json();
    expect(f.timer.payload.kind).toBe("farm");
    expect(f.timer.payload.slot).toBe(1);
    await reduceTimer(f.timer.id, 10_000, { kind: "speedup_test" });
    await completeTimer(f.timer.id);

    const after = (await app.inject({ method: "GET", url: "/v1/hall", headers: auth })).json();
    const farms = after.buildings.filter((b: { kind: string }) => b.kind === "farm");
    expect(farms.length).toBe(2);
    expect(farms.map((b: { slot: number }) => b.slot).sort()).toEqual([0, 1]);
    // And the two are distinct plots on the plate, not the same spot twice.
    const at = after.plots.filter((q: { kind: string }) => q.kind === "farm").map((q: { at: { x: number } }) => q.at.x);
    expect(new Set(at).size).toBe(4);
  });
});
