import type { FastifyInstance } from "fastify";
import { authRoutes, requireAuth } from "./auth/routes.js";
import { signUp } from "./kingdom/service.js";
import { startUpgrade } from "./buildings/service.js";
import { pool } from "./db/pool.js";
import { signAccess } from "./auth/jwt.js";
import { terrainChunk, viewport } from "./map/service.js";

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
    const hall = (await pool.query("select h.* from halls h join players p on p.id=h.player_id where p.id=$1", [claims.playerId])).rows[0];
    if (!hall) throw Object.assign(new Error("NO_HALL"), { statusCode: 404 });
    const buildings = (await pool.query("select id, kind, slot, level from buildings where hall_id=$1 order by kind, slot", [hall.id])).rows;
    const timers = (await pool.query("select id, kind, ref_type, ref_id, due_at, payload from timers where hall_id=$1 and state='pending' order by due_at", [hall.id])).rows;
    return { hall, buildings, timers, server_now: new Date().toISOString() };
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

  app.get<{ Querystring: { x0?: string; y0?: string; x1?: string; y1?: string } }>("/v1/map/viewport", async (req) => {
    const claims = await requireAuth(req);
    const q = req.query;
    return viewport(claims.kingdomId!, { x0: Number(q.x0), y0: Number(q.y0), x1: Number(q.x1), y1: Number(q.y1) });
  });

  app.setErrorHandler((err, _req, reply) => {
    const e = err as Error & { statusCode?: number; details?: unknown };
    const code = e.statusCode ?? 500;
    if (code >= 500) app.log.error(e);
    reply.code(code).send({ error: { code: e.message, message: e.message, details: e.details } });
  });
}
