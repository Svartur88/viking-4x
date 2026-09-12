import { defineConfig } from "vitest/config";
import { randomUUID } from "node:crypto";

// Every test run gets its own BullMQ queue name, so a dev server (or another run) sharing this
// Redis cannot consume the jobs these tests are waiting on. Without it the timer tests fail with
// a bare "timeout" and nothing in the code is actually wrong.
process.env.QUEUE_PREFIX ??= `test-${randomUUID().slice(0, 8)}-`;

export default defineConfig({
  test: { fileParallelism: false, testTimeout: 20000, hookTimeout: 30000 },
});
