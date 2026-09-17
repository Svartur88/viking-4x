/**
 * The host — troop types, ten tiers each, and the names on every rung (units.md, DEC-030).
 *
 * Every type and every tier is a ROW here. The client draws what the server sends and knows none of
 * these names: renaming a tier is an edit to one string and touches nothing else, which matters
 * because the Skáld's names are judged in the game rather than on the page.
 *
 * Ids are ascii slugs and must never change — they are written into the `troops` table. The Icelandic
 * `name` is free to change at any time.
 *
 * THE RING (DEC-030): Reiðmaður beats Berserkur beats Bogamaður beats Reiðmaður. Horsemen ride down
 * unarmoured madmen; madmen get in among bowmen before they loose twice; bowmen bring down horses.
 * Three corners, no more — the count nine of the ten reference games keep, and the count we spent
 * four days failing to justify a fourth of.
 *
 * OUTSIDE THE RING: the Landkönnuður, who fights nobody and has no tiers, and the six ships.
 * There is no siege type, deliberately: Vikings did not besiege. They surprised, blockaded, burned
 * or negotiated, so a Wall costs an attacker rather than being broken by a machine.
 *
 * NUMBERS ARE PARKED (DEC-015). The stats for Berserkur and Bogamaður are Hawk's table from units.md
 * verbatim. Everything else here — the Reiðmaður, the scout, all six ships, and every tier
 * multiplier past T3 — is a placeholder shape chosen to be obviously provisional, and is marked.
 */

export type TroopType =
  | "reidmadur"
  | "berserkur"
  | "bogamadur"
  | "landkonnudur"
  | "eikja" | "karfi" | "knorr" | "snekkja" | "skeid" | "dreki";

export type Field = "land" | "sea";

export interface TroopKind {
  id: TroopType;
  /** The Icelandic name of the type. Safe to change; the id is not. */
  name: string;
  gloss: string;
  field: Field;
  /** Which building trains it. */
  trainedAt: string;
  /** What it beats, or null when it stands outside the ring. */
  beats: TroopType | null;
  /** How many tiers it has. The scout has one; everything else has ten. */
  tiers: number;
  /** Type-level gate: the training building must be at least this level for tier 1. */
  unlock: number;
  blurb: string;
  /** Per-tier display names, longest-lived part of this file. One entry per tier. */
  rungs: { name: string; gloss: string }[];
  base: {
    attack: number; defence: number; health: number; speed: number; carry: number;
    trainSeconds: number;
    cost: { grain: number; timber: number; stone: number; iron: number };
  };
  /** True where the base stats are Hawk's from units.md rather than a placeholder. */
  statsFromHawk: boolean;
}

/**
 * Tier unlock by TRAINING BUILDING level (DEC-024, units.md rule 3a). Hawk's table, unchanged:
 * a tier comes from the building that trains it, not from the Longhouse.
 */
export const TIER_UNLOCK = [1, 4, 6, 10, 14, 17, 20, 24, 27, 30] as const;

/**
 * Tier multipliers, T1..T10.
 *
 * PLACEHOLDER, and deliberately gentler than the genre. units.md's Open section warns that
 * continuing ×1.6 per tier compounds to roughly ×70 by T10 — "the genre's number, and may not be
 * ours". So this runs Hawk's measured 1.0 / 1.6 / 2.5 for the first three and then ×1.45 a rung,
 * landing near ×31 at T10 instead of ×70. Nobody has agreed that curve. It exists so the screen has
 * something to print, and the Tuner should throw it away.
 */
export const TIER_STATS: number[] = (() => {
  const out = [1.0, 1.6, 2.5];
  while (out.length < 10) out.push(Number((out[out.length - 1] * 1.45).toFixed(2)));
  return out;
})();
export const TIER_COST: number[] = TIER_STATS.map((m) => Number((m * 1.6).toFixed(2)));
export const TIER_TIME: number[] = TIER_STATS.map((m) => Number((m * 1.2).toFixed(2)));

const ringNote = (n: string) => `Ten tiers, and the name is the rung. ${n}`;

export const KINDS: TroopKind[] = [
  {
    id: "reidmadur", name: "Reiðmaður", gloss: "the rider", field: "land",
    trainedAt: "muster_field", beats: "berserkur", tiers: 10, unlock: 1,
    blurb: "Comes down on a shock troop before it reaches anything. Fast, carries well, and the only land type that chooses where a fight happens.",
    statsFromHawk: false,
    base: { attack: 10, defence: 7, health: 16, speed: 18, carry: 30, trainSeconds: 22, cost: { grain: 60, timber: 20, stone: 0, iron: 20 } },
    rungs: [
      { name: "Smali", gloss: "the shepherd boy" },
      { name: "Hestamaður", gloss: "the horseman" },
      { name: "Sendiboði", gloss: "the messenger" },
      { name: "Knapi", gloss: "the rider's lad" },
      { name: "Kappi", gloss: "the champion" },
      { name: "Fararskjóti", gloss: "the mount" },
      { name: "Léttfeti", gloss: "Light-foot" },
      { name: "Blakkur", gloss: "the dark one" },
      { name: "Gullfaxi", gloss: "Golden-mane" },
      { name: "Sleipnir", gloss: "the eight-legged" },
    ],
  },
  {
    id: "berserkur", name: "Berserkur", gloss: "the fury", field: "land",
    trainedAt: "barracks", beats: "bogamadur", tiers: 10, unlock: 1,
    blurb: "Terrible for an hour and useless after it. Gets in among the bowmen before they can loose twice.",
    statsFromHawk: true,
    base: { attack: 12, defence: 8, health: 18, speed: 14, carry: 15, trainSeconds: 20, cost: { grain: 50, timber: 20, stone: 0, iron: 30 } },
    rungs: [
      { name: "Ódæll", gloss: "the unruly" },
      { name: "Ólmur", gloss: "raging" },
      { name: "Bersi", gloss: "the bear" },
      { name: "Hamrammur", gloss: "shape-strong" },
      { name: "Berserkur", gloss: "the bear-shirt" },
      { name: "Úlfhéðinn", gloss: "the wolf-coat" },
      { name: "Grábeinn", gloss: "Grey-legs" },
      { name: "Vargur", gloss: "wolf, and outlaw" },
      { name: "Jötunn", gloss: "the giant" },
      { name: "Herjann", gloss: "the leader of hosts" },
    ],
  },
  {
    id: "bogamadur", name: "Bogamaður", gloss: "the bowman", field: "land",
    trainedAt: "archery_range", beats: "reidmadur", tiers: 10, unlock: 1,
    blurb: "Brings down a horse before it arrives. A winter's practice for one second of use.",
    statsFromHawk: true,
    base: { attack: 11, defence: 7, health: 16, speed: 12, carry: 15, trainSeconds: 18, cost: { grain: 30, timber: 50, stone: 0, iron: 20 } },
    rungs: [
      { name: "Veiðimaður", gloss: "the hunter" },
      { name: "Skytta", gloss: "the shooter" },
      { name: "Örvasmiður", gloss: "the arrow-smith" },
      { name: "Bogsveigir", gloss: "the bow-swayer" },
      { name: "Oddviti", gloss: "the point-leader" },
      { name: "Skotmaður", gloss: "the marksman" },
      { name: "Hagskytti", gloss: "the skilled shot" },
      { name: "Örvar-Oddur", gloss: "Arrow-Odd" },
      { name: "Hræsvelgur", gloss: "the corpse-swallower" },
      { name: "Ullur", gloss: "the bow-god" },
    ],
  },
  {
    id: "landkonnudur", name: "Landkönnuður", gloss: "the scout", field: "land",
    trainedAt: "watchtower", beats: null, tiers: 1, unlock: 1,
    blurb: "One unit, no tiers. Fights nobody. Goes and looks at what someone else has built, and comes back with what is there. What he can see is widened by the Watchtower and by research, not by a better scout.",
    statsFromHawk: false,
    base: { attack: 0, defence: 2, health: 8, speed: 22, carry: 0, trainSeconds: 10, cost: { grain: 20, timber: 10, stone: 0, iron: 0 } },
    rungs: [{ name: "Landkönnuður", gloss: "the scout" }],
  },
  // ---- the six ships. The TYPE is the name; a tier is the same ship built better (DEC-031). ----
  {
    id: "eikja", name: "Eikja", gloss: "the dugout", field: "sea",
    trainedAt: "shipyard", beats: null, tiers: 10, unlock: 1,
    blurb: "A hollowed log with a thwart across it. Fishing, rivers, crossing a fjord. Everyone's first boat.",
    statsFromHawk: false,
    base: { attack: 1, defence: 3, health: 14, speed: 9, carry: 40, trainSeconds: 30, cost: { grain: 10, timber: 40, stone: 0, iron: 2 } },
    rungs: [],
  },
  {
    id: "karfi", name: "Karfi", gloss: "the small coaster", field: "sea",
    trainedAt: "shipyard", beats: null, tiers: 10, unlock: 5,
    blurb: "Six to sixteen benches. A well-off farmer's boat: coast, a little cargo, a few men. What a chieftain used day to day.",
    statsFromHawk: false,
    base: { attack: 3, defence: 6, health: 24, speed: 11, carry: 90, trainSeconds: 45, cost: { grain: 15, timber: 80, stone: 5, iron: 10 } },
    rungs: [],
  },
  {
    id: "knorr", name: "Knörr", gloss: "the ocean-crosser", field: "sea",
    trainedAt: "shipyard", beats: null, tiers: 10, unlock: 10,
    blurb: "Broad, deep, slow. The ship that settled Iceland and Greenland. Nobody writes poems about it and nothing else could have done it.",
    statsFromHawk: false,
    base: { attack: 4, defence: 12, health: 48, speed: 8, carry: 320, trainSeconds: 100, cost: { grain: 25, timber: 180, stone: 20, iron: 35 } },
    rungs: [],
  },
  {
    id: "snekkja", name: "Snekkja", gloss: "the raider", field: "sea",
    trainedAt: "shipyard", beats: null, tiers: 10, unlock: 14,
    blurb: "The first true longship. Around twenty benches, forty-odd men. Most ships in any fleet were these.",
    statsFromHawk: false,
    base: { attack: 9, defence: 9, health: 40, speed: 17, carry: 150, trainSeconds: 90, cost: { grain: 20, timber: 150, stone: 10, iron: 45 } },
    rungs: [],
  },
  {
    id: "skeid", name: "Skeið", gloss: "the great warship", field: "sea",
    trainedAt: "shipyard", beats: null, tiers: 10, unlock: 20,
    blurb: "Thirty benches and up. Built to carry fighting men rather than goods, and fast enough to choose its fights.",
    statsFromHawk: false,
    base: { attack: 16, defence: 14, health: 70, speed: 16, carry: 220, trainSeconds: 150, cost: { grain: 40, timber: 260, stone: 20, iron: 90 } },
    rungs: [],
  },
  {
    id: "dreki", name: "Dreki", gloss: "the dragon ship", field: "sea",
    trainedAt: "shipyard", beats: null, tiers: 10, unlock: 27,
    blurb: "The largest hull anyone built, and a jarl's alone. The head came off before landfall at home, so as not to frighten the land-spirits.",
    statsFromHawk: false,
    base: { attack: 26, defence: 20, health: 110, speed: 15, carry: 300, trainSeconds: 240, cost: { grain: 70, timber: 420, stone: 40, iron: 160 } },
    rungs: [],
  },
];

export const BY_ID = new Map(KINDS.map((k) => [k.id, k]));
export function troopKind(id: string): TroopKind | undefined { return BY_ID.get(id as TroopType); }

/** Which building trains what. Derived, so the mapping cannot drift from the roster. */
export const TRAINS: Record<string, TroopType[]> = KINDS.reduce((acc, k) => {
  (acc[k.trainedAt] ??= []).push(k.id);
  return acc;
}, {} as Record<string, TroopType[]>);

/**
 * The name on a rung.
 *
 * A ship has no rung names — its TYPE is its name, and a Skeið at tier 7 is a Skeið, better built.
 * The Norse ship vocabulary is about seven words deep; naming sixty would mean inventing fifty
 * compounds, which is the one thing the Skáld is not for.
 */
export function rungName(k: TroopKind, tier: number): string {
  const r = k.rungs[tier - 1];
  return r ? r.name : `${k.name} ${"I".repeat(Math.min(tier, 3))}`.trim();
}
export function rungGloss(k: TroopKind, tier: number): string {
  return k.rungs[tier - 1]?.gloss ?? k.gloss;
}

/** Highest tier this building level allows for this kind, or 0 when the kind is not unlocked. */
export function tiersOpen(k: TroopKind, buildingLevel: number): number {
  if (buildingLevel < k.unlock) return 0;
  let open = 0;
  for (let t = 1; t <= k.tiers; t++) if (buildingLevel >= TIER_UNLOCK[t - 1]) open = t;
  return open;
}
