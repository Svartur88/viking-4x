import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "./pool.js";

/** Minimal forward-only SQL migrator: applies migrations/*.sql in name order once each. */
export async function migrate(dir = join(process.cwd(), "migrations")) {
  await pool.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await pool.query("select name from schema_migrations")).rows.map((r) => r.name));
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(f)) continue;
    const sql = readFileSync(join(dir, f), "utf8");
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query(sql);
      await c.query("insert into schema_migrations(name) values ($1)", [f]);
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
}

if (process.argv[1]?.endsWith("migrate.ts") || process.argv[1]?.endsWith("migrate.js")) {
  migrate().then(() => { console.log("migrated"); return pool.end(); });
}
