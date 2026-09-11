import pg, { Pool, type PoolClient } from "pg";

// bigint (int8) and count() come back as strings by default; our values stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Run fn inside a transaction; rolls back on throw. */
export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
