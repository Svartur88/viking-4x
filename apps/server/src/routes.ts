import type { FastifyInstance } from "fastify";
import { authRoutes, requireAuth } from "./auth/routes.js";
import { signUp } from "./kingdom/service.js";
import { startUpgrade, upgradeCost, upgradeSeconds } from "./buildings/service.js";
import { pool } from "./db/pool.js";
import { signAccess } from "./auth/jwt.js";
import { terrainChunk, viewport, overviewPng, overviewMarkers } from "./map/service.js";
import { settle, ratesFor } from "./economy/service.js";
import { sendGather, recall, activeMarches, marchSlots } from "./marches/service.js";

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
    const buildings = rows.map((b: { kind: string; level: number }) => ({
      ...b,
      next_cost: b.level >= 20 ? null : upgradeCost(b.kind, b.level + 1),
      next_seconds: b.level >= 20 ? null : upgradeSeconds(b.kind, b.level + 1),
    }));
    const timers = (await pool.query("select id, kind, ref_type, ref_id, due_at, payload from timers where hall_id=$1 and state='pending' order by due_at", [hall.id])).rows;
    // The client counts up locally between reads; these are what it counts with.
    const { perHour, cap } = ratesFor(buildings);
    const longhouse = Number(buildings.find((b: { kind: string }) => b.kind === "longhouse")?.level ?? 1);
    return {
      hall, buildings, timers,
      production: { per_hour: perHour, cap },
      marches: await activeMarches(claims.playerId!),
      march_slots: marchSlots(longhouse),
      server_now: new Date().toISOString(),
    };
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
