import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { migrate } from "./db/migrate.js";
import { newestOpenKingdom, createKingdom } from "./kingdom/service.js";
import { startWorker, reconcile } from "./timers/engine.js";
import "./buildings/service.js"; // registers the build handler
import "./marches/service.js"; // registers march_arrive, gather and march_return
import "./troops/service.js";  // registers the train handler
import "./research/service.js"; // registers the research handler

const config = loadConfig();
const app = await buildApp();

await migrate();

// A deploy with no open kingdom refuses every sign-up with NO_OPEN_KINGDOM, which looks like a
// broken server rather than an empty one. Open one on first boot so a fresh environment is
// playable the moment it is up.
if (config.autoOpenKingdom && !(await newestOpenKingdom())) {
  const k = await createKingdom({ size: config.kingdomSize });
  app.log.info({ kingdomId: k.id, size: k.size }, "opened the first kingdom");
}

// A flag that lets any player raise their own hall must never be on quietly. Said once, loudly, at
// every boot, so it turns up in the deploy log rather than being discovered by a player.
if (config.devTools && config.production) {
  app.log.warn(
    "DEV_TOOLS=on in production: /v1/dev/* is live and any player can raise their own hall to the cap. " +
    "Fine for a single-player alpha. Remove the variable before a second player joins.",
  );
}

const stopWorker = startWorker(10);
const recon = setInterval(() => reconcile().catch((e) => app.log.error(e)), 60_000);
app.addHook("onClose", async () => { clearInterval(recon); await stopWorker(); });

app.listen({ port: config.port, host: "0.0.0.0" }).catch((err) => { app.log.error(err); process.exit(1); });
