import Fastify from "fastify";

export function buildApp() {
  const app = Fastify({ logger: true });
  app.get("/health", async () => ({ ok: true, service: "viking-4x-server" }));
  return app;
}
