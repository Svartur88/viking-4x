/**
 * Home production (P3.E01, economy.md rules 2 and 3).
 *
 * Production is lazy: nothing ticks. A hall carries `resources_at`, and whenever anyone reads or
 * spends its resources we settle the hours since that mark and move it forward. This costs one
 * update on read instead of a job per hall per minute, and it is exact — a hall nobody looked at
 * for a week earns the same as one refreshed every second.
 *
 * Production stops at the storage cap rather than overflowing (economy.md rule 3). A hall already
 * over its cap (a raid refund, a balance change) is never clamped downwards; it simply earns
 * nothing more until it spends.
 *
 * NUMBERS ARE PLACEHOLDERS. balance-v1.csv (P3.S01) sets the real ones, and it has to set them
 * together with the build timers: this build runs on a heavily compressed clock — a Longhouse
 * level 2 takes ninety seconds, not two hours — so the rates below are scaled to that same
 * compressed clock. Read them as "a minute of production is worth about this much of the next
 * upgrade", not as per-hour numbers a live game would use.
 */

import type { PoolClient } from "pg";
import { pool, withTx } from "../db/pool.js";

export type Resource = "grain" | "timber" | "stone" | "iron";

/** Which building feeds which resource. One of each at MVP; up to four later (buildings.md). */
export const PRODUCERS: Record<string, Resource> = {
  farm: "grain",
  timber_camp: "timber",
  quarry: "stone",
  iron_pit: "iron",
};

const BASE_PER_HOUR = 3600;   // level 1, i.e. one a second on the compressed clock
const PER_LEVEL = 1.25;       // each level is a quarter better again — upgrading has to show
const BASE_CAP = 50_000;      // with no Storehouse standing
const CAP_PER_LEVEL = 1.35;

/** What one producer yields per hour at a given level. */
export function ratePerHour(kind: string, level: number): number {
  if (!(kind in PRODUCERS)) return 0;
  return Math.round(BASE_PER_HOUR * Math.pow(PER_LEVEL, Math.max(0, level - 1)));
}

/** Storage cap per resource. The Storehouse raises it; every hall has one without the building. */
export function storageCap(storehouseLevel: number): number {
  return Math.round(BASE_CAP * Math.pow(CAP_PER_LEVEL, Math.max(0, storehouseLevel)));
}

export interface Rates {
  perHour: Record<Resource, number>;
  cap: number;
}

/** Read the hall's standing production without settling anything. */
export function ratesFor(buildings: { kind: string; level: number }[]): Rates {
  const perHour: Record<Resource, number> = { grain: 0, timber: 0, stone: 0, iron: 0 };
  let storehouse = 0;
  for (const b of buildings) {
    const res = PRODUCERS[b.kind];
    if (res) perHour[res] += ratePerHour(b.kind, b.level);
    if (b.kind === "storehouse") storehouse = b.level;
  }
  return { perHour, cap: storageCap(storehouse) };
}

/**
 * Bring a hall's resources up to now. Must run inside a transaction that has already locked the
 * hall row, because it both reads and writes the same four columns a spend is about to touch.
 * Returns the settled hall row.
 */
export async function settleLocked(c: PoolClient, hallId: string) {
  const hall = (await c.query("select * from halls where id=$1", [hallId])).rows[0];
  if (!hall) throw Object.assign(new Error("NO_HALL"), { statusCode: 404 });

  const buildings = (await c.query("select kind, level from buildings where hall_id=$1", [hallId])).rows;
  const { perHour, cap } = ratesFor(buildings);

  const hours = Math.max(0, (Date.now() - new Date(hall.resources_at).getTime()) / 3_600_000);
  if (hours <= 0) return hall;

  const next: Record<Resource, number> = { grain: 0, timber: 0, stone: 0, iron: 0 };
  for (const res of Object.keys(next) as Resource[]) {
    const have = Number(hall[res]);
    const earned = Math.floor(perHour[res] * hours);
    // Already at or over the cap: hold, never claw back.
    next[res] = have >= cap ? have : Math.min(cap, have + earned);
  }

  const row = (await c.query(
    "update halls set grain=$2, timber=$3, stone=$4, iron=$5, resources_at=now() where id=$1 returning *",
    [hallId, next.grain, next.timber, next.stone, next.iron],
  )).rows[0];
  return row;
}

/** Settle a hall on its own, taking the row lock first. */
export async function settle(hallId: string) {
  return withTx(async (c) => {
    await c.query("select id from halls where id=$1 for update", [hallId]);
    return settleLocked(c, hallId);
  });
}

/** Production summary for the client, so the header can count up between reads. */
export async function ratesForHall(hallId: string): Promise<Rates> {
  const buildings = (await pool.query("select kind, level from buildings where hall_id=$1", [hallId])).rows;
  return ratesFor(buildings);
}
