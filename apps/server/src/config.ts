/**
 * Boot-time configuration and its guards (P2.O03).
 *
 * A staging server is on the public internet. Most of the ways a small game server gets embarrassed
 * are configuration, not code: shipping with the development signing key, or pointing at a database
 * that isn't there and only finding out when the first player signs up. So the process refuses to
 * start rather than start wrong.
 */

export const DEV_JWT_SECRET = "dev-secret-change-me";

export interface Config {
  port: number;
  production: boolean;
  databaseUrl: string;
  redisUrl: string;
  jwtSecret: string;
  /** Open a kingdom on boot when none exists, so a fresh deploy is playable immediately. */
  autoOpenKingdom: boolean;
  kingdomSize: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const production = env.NODE_ENV === "production";
  const problems: string[] = [];

  const databaseUrl = env.DATABASE_URL ?? "";
  const redisUrl = env.REDIS_URL ?? "";
  const jwtSecret = env.JWT_SECRET ?? DEV_JWT_SECRET;

  if (!databaseUrl) problems.push("DATABASE_URL is not set");
  if (!redisUrl) problems.push("REDIS_URL is not set");
  if (production && (jwtSecret === DEV_JWT_SECRET || jwtSecret.length < 24))
    problems.push("JWT_SECRET must be set to a long random value in production — every session token is signed with it");

  if (problems.length) {
    throw new Error(`Refusing to start:\n  - ${problems.join("\n  - ")}`);
  }

  return {
    port: Number(env.PORT ?? 3000),
    production,
    databaseUrl,
    redisUrl,
    jwtSecret,
    autoOpenKingdom: (env.AUTO_OPEN_KINGDOM ?? "true") !== "false",
    kingdomSize: Number(env.KINGDOM_SIZE ?? 600),
  };
}
