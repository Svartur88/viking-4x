import type { FastifyInstance } from "fastify";
import { authRoutes, requireAuth } from "./auth/routes.js";
import { signUp } from "./kingdom/service.js";
import { startUpgrade, upgradeCost, upgradeSeconds, startFounding, foundCost } from "./buildings/service.js";
import { startResearch, treeFor, levelsFor, BRANCHES } from "./research/service.js";
import { plotsFor, CATALOGUE } from "./catalogue.js";
import { pool } from "./db/pool.js";
import { loadConfig } from "./config.js";
import { UPGRADES } from "./balance.js";
import { randomUUID } from "node:crypto";

const config = loadConfig();
import { signAccess } from "./auth/jwt.js";
import { terrainChunk, viewport, overviewPng, overviewMarkers } from "./map/service.js";
import { settle, ratesFor } from "./economy/service.js";
import { sendGather, recall, activeMarches, marchSlots } from "./marches/service.js";
import { startTraining, stacksAt, troopCapacity, troopsCommitted, UNITS, TRAINS } from "./troops/service.js";

export async function registerRoutes(app: FastifyInstance) {
  await authRoutes(app);

  app.post<{ Body: { name: string } }>("/v1/players", async (req, reply) => {
    const claims = await requireAuth(req);
    const name = (req.body?.name ?? "").trim();
    if (name.length < 2 || name.length > 20) return reply.code(400).send({ error: { code: "BAD_NAME", message: "2–20 characters" } });
    const p = await signUp(claims.accountId, name);
    const jwt = await signAccess({ accountId: claims.accountId, playerId: p.playerId, kingdomId: p.kingdomId });
    return { player: p, jwt, server_now: new Date().toISOString() };
  });

  app.get("/v1/hall", async (req) => {
    const claims = await requireAuth(req);
    const found = (await pool.query("select h.id from halls h join players p on p.id=h.player_id where p.id=$1", [claims.playerId])).rows[0];
    if (!found) throw Object.assign(new Error("NO_HALL"), { statusCode: 404 });
    // Bring production up to now before answering, so the client is never shown a stale total.
    const hall = await settle(found.id);
    const rows = (await pool.query("select id, kind, slot, level from buildings where hall_id=$1 order by kind, slot", [hall.id])).rows;
    // Price the next level here rather than letting the client mirror the formula: two copies of a
    // cost curve drift the moment balance-v1.csv lands, and the client's copy would be the wrong one.
    const buildings = rows.map((b: { id: string; kind: string; slot: number; level: number }) => ({
      ...b,
      next_cost: b.level >= 20 ? null : upgradeCost(b.kind, b.level + 1),
      next_seconds: b.level >= 20 ? null : upgradeSeconds(b.kind, b.level + 1),
    }));
    const timers = (await pool.query("select id, kind, ref_type, ref_id, due_at, payload from timers where hall_id=$1 and state='pending' order by due_at", [hall.id])).rows;
    // The client counts up locally between reads; these are what it counts with.
    const { perHour, cap } = ratesFor(buildings);
    const longhouse = Number(buildings.find((b: { kind: string }) => b.kind === "longhouse")?.level ?? 1);
    const barracks = Number(buildings.find((b: { kind: string }) => b.kind === "barracks")?.level ?? 0);
    return {
      hall, buildings, timers,
      // Every slot in the hall, built or not, priced here so the client never mirrors a cost curve.
      // This is what the hall screen draws; without it the screen has nothing to place (2026-09-13).
      plots: plotsFor(buildings, longhouse, foundCost),
      production: { per_hour: perHour, cap },
      marches: await activeMarches(claims.playerId!),
      march_slots: marchSlots(longhouse),
      troops: await stacksAt(hall.id),
      troop_capacity: troopCapacity(barracks),
      troops_committed: await troopsCommitted(pool, hall.id),
      unit_costs: UNITS,
      // Which building trains whom, sent rather than mirrored: the client had its own copy and two
      // copies of the same table disagree eventually.
      trains: TRAINS,
      server_now: new Date().toISOString(),
    };
  });

  // Raise a building that does not exist yet, on its fixed slot in the catalogue.
  app.post<{ Body: { kind?: string; slot?: number } }>("/v1/buildings/found", async (req) => {
    const claims = await requireAuth(req);
    const hall = (await pool.query("select id from halls where player_id=$1", [claims.playerId])).rows[0];
    if (!hall) throw Object.assign(new Error("NO_HALL"), { statusCode: 404 });
    const kind = String(req.body?.kind ?? "");
    if (!kind) throw Object.assign(new Error("NO_KIND"), { statusCode: 422 });
    const timer = await startFounding(hall.id, kind, Number(req.body?.slot ?? 0));
    return { timer, server_now: new Date().toISOString() };
  });

  /**
   * The whole research tree plus this hall's levels, in one call (research.md).
   *
   * The tree is sent every time rather than cached client-side on purpose: which nodes are blocked
   * and why changes with the Rune Hall's level, with what else is running, and with every
   * prerequisite taken. A client holding a stale tree shows a startable node that is not.
   */
  app.get("/v1/research", async (req) => {
    const claims = await requireAuth(req);
    const hall = (await pool.query("select id from halls where player_id=$1", [claims.playerId])).rows[0];
    if (!hall) throw Object.assign(new Error("NO_HALL"), { statusCode: 404 });
    const c = await pool.connect();
    try {
      const buildings = (await c.query(
        "select kind, level from buildings where hall_id=$1 and kind in ('longhouse','rune_hall')", [hall.id],
      )).rows as { kind: string; level: number }[];
      const longhouse = buildings.find((b) => b.kind === "longhouse")?.level ?? 0;
      const runeHall = buildings.find((b) => b.kind === "rune_hall")?.level ?? 0;
      const running = (await c.query(
        "select * from timers where hall_id=$1 and kind='research' and state='pending' limit 1", [hall.id],
      )).rows[0] ?? null;
      const levels = await levelsFor(c, hall.id);
      return {
        branches: BRANCHES,
        rune_hall: runeHall,
        longhouse,
        nodes: treeFor(levels, runeHall, longhouse, running != null),
        running,
        server_now: new Date().toISOString(),
      };
    } finally {
      c.release();
    }
  });

  /**
   * DEV ONLY — put this jarl where a system can actually be reached (P2 testing tool).
   *
   * Hawk is the only playtester, and every system now lands deep in the ladder: research needs
   * Longhouse 7 and a Rune Hall, the favour ladder opens around 13 (DEC-025), the Berg branch wants
   * 17. Climbing to each by hand before looking at it is ten minutes of clicking per look, every
   * time. This is the button that removes that.
   *
   * It is refused outright when NODE_ENV=production — not hidden, not gated on a role, refused.
   * A testing endpoint that raises your own hall to level 30 is a cheat in any live kingdom, and
   * the only safe place for it is a build that cannot be a live kingdom.
   */
  app.post<{ Body: { level?: number } }>("/v1/dev/jump", async (req, reply) => {
    if (config.production)
      return reply.code(404).send({ error: { code: "NOT_FOUND", message: "no such route" } });
    const claims = await requireAuth(req);
    const hall = (await pool.query("select id, kingdom_id from halls where player_id=$1", [claims.playerId])).rows[0];
    if (!hall) throw Object.assign(new Error("NO_HALL"), { statusCode: 404 });

    const level = Math.max(1, Math.min(Number(req.body?.level ?? 10), UPGRADES.maxLevel));
    const c = await pool.connect();
    try {
      await c.query("begin");
      // Everything already standing goes to the asked-for level, the Longhouse included.
      await c.query("update buildings set level=$2 where hall_id=$1", [hall.id, level]);
      // And everything the Longhouse has unlocked gets founded, so there is something to walk into.
      // `later` kinds stay unbuilt: they are drawn as slots on purpose and founding them would show
      // a screen that does not exist yet.
      for (const k of CATALOGUE) {
        if (k.later || k.unlock > level) continue;
        await c.query(
          `insert into buildings (id, kingdom_id, hall_id, kind, slot, level) values ($1,$2,$3,$4,$5,$6)
           on conflict (hall_id, kind, slot) do update set level = excluded.level`,
          [randomUUID(), hall.kingdom_id, hall.id, k.kind, k.slot, level],
        );
      }
      // Enough to afford anything without being so large the header reads as broken.
      await c.query("update halls set grain=5e7, timber=5e7, stone=5e7, iron=5e7 where id=$1", [hall.id]);
      // Timers left pending would complete later and raise levels past where they were put.
      await c.query("update timers set state='cancelled' where hall_id=$1 and state='pending'", [hall.id]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
    return { ok: true, level, server_now: new Date().toISOString() };
  });

  app.post<{ Body: { node?: string } }>("/v1/research/start", async (req) => {
    const claims = await requireAuth(req);
    const hall = (await pool.query("select id from halls where player_id=$1", [claims.playerId])).rows[0];
    if (!hall) throw Object.assign(new Error("NO_HALL"), { statusCode: 404 });
    const node = String(req.body?.node ?? "");
    if (!node) throw Object.assign(new Error("NO_NODE"), { statusCode: 422 });
    const timer = await startResearch(hall.id, node);
    return { timer, server_now: new Date().toISOString() };
  });

  app.post<{ Params: { id: string } }>("/v1/buildings/:id/upgrade", async (req) => {
    const claims = await requireAuth(req);
    const hall = (await pool.query("select id from halls where player_id=$1", [claims.playerId])).rows[0];
    if (!hall) throw Object.assign(new Error("NO_HALL"), { statusCode: 404 });
    const timer = await startUpgrade(hall.id, req.params.id);
    return { timer, server_now: new Date().toISOString() };
  });

  // Terrain is immutable per kingdom: cache it hard in the client and at the edge.
  app.get<{ Querystring: { cx?: string; cy?: string } }>("/v1/map/chunk", async (req, reply) => {
    const claims = await requireAuth(req);
    const chunk = await terrainChunk(claims.kingdomId!, Number(req.query.cx), Number(req.query.cy));
    reply.header("cache-control", "public, max-age=31536000, immutable");
    return chunk;
  });

  // Kingdom view (DEC-011): the picture never changes, so it is cached forever…
  app.get("/v1/map/overview.png", async (req, reply) => {
    const claims = await requireAuth(req);
    const png = await overviewPng(claims.kingdomId!);
    reply.header("content-type", "image/png");
    reply.header("cache-control", "public, max-age=31536000, immutable");
    return reply.send(png);
  });

  // …and the things that do change ride on top, fetched separately.
  app.get("/v1/map/overview", async (req) => {
    const claims = await requireAuth(req);
    return overviewMarkers(claims.kingdomId!, claims.playerId);
  });

  app.get<{ Querystring: { x0?: string; y0?: string; x1?: string; y1?: string } }>("/v1/map/viewport", async (req) => {
    const claims = await requireAuth(req);
    const q = req.query;
    return viewport(claims.kingdomId!, { x0: Number(q.x0), y0: Number(q.y0), x1: Number(q.x1), y1: Number(q.y1) }, claims.playerId);
  });

  // Training (P3.T01). One queue per training building, as the builders work.
  app.post<{ Params: { id: string }; Body: { count?: number; tier?: number } }>("/v1/buildings/:id/train", async (req) => {
    const claims = await requireAuth(req);
    const hall = (await pool.query("select id from halls where player_id=$1", [claims.playerId])).rows[0];
    if (!hall) throw Object.assign(new Error("NO_HALL"), { statusCode: 404 });
    const count = Math.floor(Number(req.body?.count ?? 0));
    const timer = await startTraining(hall.id, req.params.id, count, Math.floor(Number(req.body?.tier ?? 1)));
    return { timer, server_now: new Date().toISOString() };
  });

  // Marches (P3.M01). Gather only for now; scout and attack join here as new kinds, not new routes.
  app.post<{ Body: { node_id: string } }>("/v1/marches/gather", async (req, reply) => {
    const claims = await requireAuth(req);
    const nodeId = (req.body?.node_id ?? "").trim();
    if (!nodeId) return reply.code(400).send({ error: { code: "NO_NODE", message: "node_id required" } });
    const timer = await sendGather(claims.playerId!, nodeId);
    return { timer, marches: await activeMarches(claims.playerId!), server_now: new Date().toISOString() };
  });

  app.post<{ Params: { id: string } }>("/v1/marches/:id/recall", async (req) => {
    const claims = await requireAuth(req);
    const march = await recall(claims.playerId!, req.params.id);
    return { march, marches: await activeMarches(claims.playerId!), server_now: new Date().toISOString() };
  });

  app.get("/v1/marches", async (req) => {
    const claims = await requireAuth(req);
    return { marches: await activeMarches(claims.playerId!), server_now: new Date().toISOString() };
  });

  app.setErrorHandler((err, _req, reply) => {
    const e = err as Error & { statusCode?: number; details?: unknown };
    const code = e.statusCode ?? 500;
    if (code >= 500) app.log.error(e);
    reply.code(code).send({ error: { code: e.message, message: e.message, details: e.details } });
  });
}
