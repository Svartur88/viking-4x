import { buildApp } from "./app.js";
import { migrate } from "./db/migrate.js";
import { startWorker, reconcile } from "./timers/engine.js";
import "./buildings/service.js"; // registers the build handler

const port = Number(process.env.PORT ?? 3000);
const app = await buildApp();
await migrate();
const stopWorker = startWorker(10);
const recon = setInterval(() => reconcile().catch((e) => app.log.error(e)), 60_000);
app.addHook("onClose", async () => { clearInterval(recon); await stopWorker(); });
app.listen({ port, host: "0.0.0.0" }).catch((err) => { app.log.error(err); process.exit(1); });
