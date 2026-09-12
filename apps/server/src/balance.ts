/**
 * Every invented number in the game, in one place.
 *
 * DEC-015: material before numbers. None of this is tuned and none of it is meant to be — the
 * systems these numbers describe are not all built yet, so there is nothing coherent to tune
 * against. What matters until then is that the guesses are FINDABLE. When the real balance sheet
 * arrives, replacing it should be editing this file, not hunting through five services for comments
 * that say "placeholder".
 *
 * The rule: if a number is a design choice rather than a fact about how the code works, it lives
 * here. Row locks, retry counts and buffer sizes stay where they are used; costs, rates, curves,
 * capacities and durations come here.
 *
 * This build also runs on a deliberately compressed clock — a Longhouse level takes ninety seconds
 * rather than two hours — so several of these are scaled for watching rather than for playing.
 * `COMPRESSED_CLOCK` marks every place that is true of.
 */

/** Everything scaled for a build meant to be watched rather than lived in. Set to 1 for real time. */
export const COMPRESSED_CLOCK = {
  /** Training time is divided by this (units.md gives 15 s a man; that is a long wait here). */
  trainTimeDivisor: 5,
  /** Marches move this many tiles an hour. Fast enough to watch a trip end to end. */
  marchTilesPerHour: 900,
} as const;

/** Home production (economy.md rules 2 and 3). */
export const PRODUCTION = {
  /** A level-1 producer, per hour. One a second on the compressed clock. */
  basePerHour: 3600,
  /** Each level is this much better again. Upgrading has to visibly show. */
  perLevelMultiplier: 1.25,
  /** Storage cap with no Storehouse standing. */
  baseCap: 50_000,
  /** Each Storehouse level multiplies the cap by this. */
  capPerLevel: 1.35,
} as const;

/** Building upgrades (buildings.md). */
export const UPGRADES = {
  /** cost = base * kindMultiplier * toLevel^exponent, split across the four resources. */
  costBase: 50,
  costExponent: 1.8,
  /** The Longhouse costs and takes more, because it gates everything. */
  longhouseCostMultiplier: 2.0,
  longhouseTimeMultiplier: 3,
  /** Early levels stay under this many seconds, so a first session is not a waiting room. */
  earlyTimeCapSeconds: 600,
  earlyLevelsThrough: 8,
  timeBase: 10,
  timeExponentEarly: 1.6,
  timeBaseLate: 60,
  timeExponentLate: 2.2,
  /** PR-04: nothing takes longer than seven days, ever. */
  maxSeconds: 7 * 86_400,
  maxLevel: 20,
} as const;

/** Resource nodes on the map (map.md rule 6). DEC-016 replaces the flat curves with regions. */
export const NODES = {
  /** How much is in the ground at level N. */
  amountPerLevel: 4000,
  /** How fast it comes out at level N, per hour. */
  ratePerHourPerLevel: 3000,
  /** Seeded around each new hall. DEC-016 moves this to a whole-kingdom distribution. */
  perHall: 8,
  seedRadius: 26,
} as const;

/** Troops (units.md). Base stats are Hawk's table, not invented — only the clock is scaled. */
export const TROOPS = {
  /** Hall capacity with a Barracks at level N. */
  capacityBase: 200,
  capacityPerLevel: 1.35,
} as const;

/** March slots come from the Longhouse alone (progression.md rule 4). */
export const MARCH_SLOTS = { second: 9, third: 18 } as const;

/** Two free builders, never a paid third (PR-01). */
export const BUILDERS = 2;
