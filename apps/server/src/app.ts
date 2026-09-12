import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { registerRoutes } from "./routes.js";

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  // A public server needs a ceiling. Generous enough that normal play never notices — a busy
  // player taps a few times a second at most — and low enough that a script cannot mine the map.
  if (process.env.NODE_ENV !== "test") {
    await app.register(rateLimit, {
      max: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300),
      timeWindow: "1 minute",
      // Per player where we know one, per address otherwise: several jarls behind one household
      // connection should not throttle each other.
      keyGenerator: (req) => String(req.headers.authorization ?? req.ip),
    });
  }

  app.get("/health", async () => ({ ok: true, service: "viking-4x-server" }));
  await registerRoutes(app);
  return app;
}
