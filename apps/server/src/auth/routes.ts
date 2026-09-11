import type { FastifyInstance, FastifyRequest } from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { signAccess, verifyAccess, type Claims } from "./jwt.js";

/** Guest accounts (P2.S03 part 1). Apple/Google token verification is added in part 2 with real provider keys. */
export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { device_id: string } }>("/v1/auth/guest", async (req, reply) => {
    const deviceId = req.body?.device_id;
    if (!deviceId || deviceId.length < 8) return reply.code(400).send({ error: { code: "BAD_DEVICE_ID", message: "device_id required" } });
    const hash = createHash("sha256").update(deviceId).digest("hex");
    const { rows } = await pool.query(
      `insert into accounts (id, provider, provider_sub, device_id_hash) values ($1, 'guest', $2, $2)
       on conflict (provider, provider_sub) do update set device_id_hash = excluded.device_id_hash
       returning id`, [randomUUID(), hash]);
    const accountId = rows[0].id as string;
    const player = (await pool.query("select id, kingdom_id from players where account_id=$1 order by created_at desc limit 1", [accountId])).rows[0];
    const jwt = await signAccess({ accountId, playerId: player?.id, kingdomId: player?.kingdom_id });
    return { jwt, account: { id: accountId, guest: true }, player: player ?? null, server_now: new Date().toISOString() };
  });
}

/** Decorate requests with claims; use as a preHandler on protected routes. */
export async function requireAuth(req: FastifyRequest): Promise<Claims> {
  const h = req.headers.authorization ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw Object.assign(new Error("UNAUTHENTICATED"), { statusCode: 401 });
  try { return await verifyAccess(token); } catch { throw Object.assign(new Error("UNAUTHENTICATED"), { statusCode: 401 }); }
}
