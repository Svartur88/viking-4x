import Fastify from "fastify";
import { registerRoutes } from "./routes.js";

export async function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  app.get("/health", async () => ({ ok: true, service: "viking-4x-server" }));
  await registerRoutes(app);
  return app;
}
