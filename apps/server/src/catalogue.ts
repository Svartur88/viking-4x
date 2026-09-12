/**
 * Every building in the game, where it stands, and what unlocks it.
 *
 * This is the frame the rest of the content lands in (DEC-015: material before numbers). One list,
 * on the server, read by the client — so adding the eighteenth building is a row here rather than a
 * layout job in GDScript.
 *
 * `at` is a fraction of the hall's ground plane: (0,0) is the far top-left, (1,1) the near
 * bottom-right. `size` is the building's width as a fraction of the plane. Placement is FIXED, as it
 * is in Lords Mobile, Whiteout Survival and Top War — every jarl's hall is recognisably the same
 * place, which is what lets the landscape be drawn properly instead of merely tiled.
 *
 * THE COORDINATES BELOW ARE READ OFF THE PAINTED PLATE (`art/hall/hall-ground.png`), not invented.
 * (0,0) is its top-left corner, (1,1) its bottom-right. Every building sits on something the painting
 * actually contains: the quarry in the scree, the timber camp in the stump clearing, the yard
 * buildings on the cleared foundation plots, the farm on a ploughed field, the bog-iron pit in the
 * reeds, the naust on the pebble beach. Change the plate and these change with it — in that order,
 * never the reverse. Hawk stopped this being hand-tuned against a stand-in twice, correctly: it was
 * exactly the work that would have had to be done again.
 *
 * A slot is visible from the first minute, empty, with the level that will unlock it. Anticipation
 * is free and the genre uses it constantly.
 *
 * NAMES ARE PROVISIONAL. `06-Design/buildings-and-the-hall.md` proposes Viking names — Hird Hall for
 * the Barracks, Hoard for the Vault, Naust for the Shipyard, Beacon for the Watchtower — and Hawk
 * has not signed them off. The internal `kind` never changes, so renaming is a display change here
 * and nowhere else.
 */

/** The bands of ground in the hall view, far to near. */
export type Terrain = "mountain" | "forest" | "hills" | "plain" | "yard" | "marsh" | "shore";

export interface BuildingKind {
  kind: string;
  /** What the player sees. Provisional; see the header. */
  name: string;
  /** One line saying what it is for, shown on an empty slot so the wait means something. */
  purpose: string;
  terrain: Terrain;
  /** Where it stands, as a fraction of the ground plane. */
  at: { x: number; y: number };
  /** How wide it stands, as a fraction of the plane's width. */
  size: number;
  /** The Longhouse level that unlocks it. 1 = from the first minute. */
  unlock: number;
  /** True for the buildings a new hall is founded with. */
  starter?: boolean;
  /** Not at MVP; drawn as a slot but never buildable yet. */
  later?: boolean;
}

export const CATALOGUE: BuildingKind[] = [
  // ── The scree, top right: bare rock coming down off the ridge ─────────────
  { kind: "quarry", name: "Quarry", purpose: "Cuts stone from the mountain",
    terrain: "mountain", at: { x: 0.8, y: 0.13 }, size: 0.11, unlock: 1, starter: true },

  // ── The conifer forest, down the left side ────────────────────────────────
  // The painting puts a felled clearing full of stumps at the treeline — that is the timber camp,
  // and everything else in the woods sits deeper in, where the trees are still standing.
  { kind: "timber_camp", name: "Timber camp", purpose: "Fells timber",
    terrain: "forest", at: { x: 0.22, y: 0.2 }, size: 0.11, unlock: 1, starter: true },
  { kind: "hof", name: "Hof", purpose: "The blót: a blessing asked of the gods",
    terrain: "forest", at: { x: 0.07, y: 0.11 }, size: 0.08, unlock: 9 },
  { kind: "shield_hall", name: "Wolf Lodge", purpose: "Trains Berserkers, kept apart from the hall",
    terrain: "forest", at: { x: 0.06, y: 0.33 }, size: 0.09, unlock: 9 },
  { kind: "forest_camp", name: "Forest camp", purpose: "Hides troops and goods before a raid lands",
    terrain: "forest", at: { x: 0.05, y: 0.5 }, size: 0.08, unlock: 12 },

  // ── The high ground, right: rock and rough grass above the yard ───────────
  { kind: "watchtower", name: "Beacon", purpose: "Sees further, and warns of what is coming",
    terrain: "hills", at: { x: 0.95, y: 0.2 }, size: 0.08, unlock: 10 },
  { kind: "wall", name: "Rampart", purpose: "Earth and timber. What a raid has to break first",
    terrain: "hills", at: { x: 0.9, y: 0.42 }, size: 0.1, unlock: 4 },

  // ── The yard: the cleared plots the painting already marks out ────────────
  // Sprites stand UP from their spot, so a tall building covers the ground behind it — which is why
  // nothing else shares the Longhouse's column.
  { kind: "longhouse", name: "Longhouse", purpose: "The heart of the hall. Nothing outgrows it",
    terrain: "yard", at: { x: 0.52, y: 0.31 }, size: 0.17, unlock: 1, starter: true },
  { kind: "rune_hall", name: "Rune hall", purpose: "Research. Where every lasting improvement is learned",
    terrain: "yard", at: { x: 0.4, y: 0.17 }, size: 0.1, unlock: 7 },
  { kind: "barracks", name: "Hird hall", purpose: "Your household men. Trains Shieldwall",
    terrain: "yard", at: { x: 0.3, y: 0.26 }, size: 0.11, unlock: 1, starter: true },
  { kind: "guest_hall", name: "Guest hall", purpose: "Where allies may garrison",
    terrain: "yard", at: { x: 0.15, y: 0.3 }, size: 0.08, unlock: 5 },
  { kind: "weaving_house", name: "Weaving house", purpose: "Cloth, and the sails a ship needs",
    terrain: "yard", at: { x: 0.68, y: 0.22 }, size: 0.09, unlock: 4 },
  { kind: "storehouse", name: "Storehouse", purpose: "How much you can hold",
    terrain: "yard", at: { x: 0.8, y: 0.25 }, size: 0.1, unlock: 2 },
  { kind: "forge", name: "Smithy", purpose: "Gear. Set apart, for the fire",
    terrain: "yard", at: { x: 0.85, y: 0.34 }, size: 0.09, unlock: 13 },
  { kind: "mead_hall", name: "Mead hall", purpose: "Heroes: hire them, raise them, seat them on the council",
    terrain: "yard", at: { x: 0.26, y: 0.37 }, size: 0.11, unlock: 6 },
  { kind: "family_hall", name: "Family hall", purpose: "Marriage, children, heirs",
    terrain: "yard", at: { x: 0.68, y: 0.4 }, size: 0.1, unlock: 12 },
  { kind: "vault", name: "The Hoard", purpose: "The share no raider can take",
    terrain: "yard", at: { x: 0.13, y: 0.42 }, size: 0.08, unlock: 11 },
  { kind: "healers_hut", name: "Healer's hut", purpose: "The wounded come back. Past its capacity, they do not",
    terrain: "yard", at: { x: 0.4, y: 0.43 }, size: 0.09, unlock: 8 },
  { kind: "hostage_house", name: "Hostage house", purpose: "Captured leaders are held here, and ransomed",
    terrain: "yard", at: { x: 0.58, y: 0.45 }, size: 0.09, unlock: 16, later: true },

  // ── The fields, walled and ploughed, across the lower middle ──────────────
  { kind: "farm", name: "Farm", purpose: "Grows grain",
    terrain: "plain", at: { x: 0.28, y: 0.57 }, size: 0.12, unlock: 1, starter: true },
  { kind: "market", name: "Marketplace", purpose: "Trades one resource for another, at a loss",
    terrain: "plain", at: { x: 0.78, y: 0.57 }, size: 0.1, unlock: 10 },
  { kind: "archery_range", name: "Bowyard", purpose: "Trains Archers, down a long field",
    terrain: "plain", at: { x: 0.55, y: 0.62 }, size: 0.11, unlock: 9 },
  { kind: "thing_stone", name: "Thing stone", purpose: "The law: read it, vote on it, propose it",
    terrain: "plain", at: { x: 0.16, y: 0.6 }, size: 0.07, unlock: 15 },
  { kind: "muster_field", name: "Muster field", purpose: "Where a rally gathers. How many may join one attack",
    terrain: "plain", at: { x: 0.88, y: 0.6 }, size: 0.1, unlock: 7 },

  // ── The marsh and the shore, nearest the water ────────────────────────────
  { kind: "iron_pit", name: "Bog-iron pit", purpose: "Iron, dug from the marsh as it really was",
    terrain: "marsh", at: { x: 0.12, y: 0.76 }, size: 0.09, unlock: 1, starter: true },
  { kind: "shipyard", name: "Naust", purpose: "The boathouse: builds and shelters Longships",
    terrain: "shore", at: { x: 0.72, y: 0.755 }, size: 0.11, unlock: 11 },
  { kind: "harbour", name: "Harbour", purpose: "Ships may come and go. Coastal halls only",
    terrain: "shore", at: { x: 0.5, y: 0.775 }, size: 0.11, unlock: 11 },
];

const BY_KIND = new Map(CATALOGUE.map((b) => [b.kind, b]));

export function buildingKind(kind: string): BuildingKind | undefined {
  return BY_KIND.get(kind);
}

/** The buildings a new hall is founded with. */
export function starterKinds(): BuildingKind[] {
  return CATALOGUE.filter((b) => b.starter);
}

/**
 * Every slot in the hall, built or not, in draw order (far to near) so the client can paint them
 * without sorting. `built` carries the row when it exists.
 */
export function plotsFor(
  built: Array<{ id: string; kind: string; level: number }>,
  longhouseLevel: number,
  priceOfFounding?: (kind: string) => Record<string, number>,
) {
  const have = new Map(built.map((b) => [b.kind, b]));
  return CATALOGUE
    .slice()
    .sort((a, b) => a.at.y - b.at.y)
    .map((slot) => {
      const row = have.get(slot.kind);
      return {
        kind: slot.kind,
        name: slot.name,
        purpose: slot.purpose,
        terrain: slot.terrain,
        at: slot.at,
        size: slot.size,
        unlock: slot.unlock,
        later: slot.later === true,
        built: row !== undefined,
        id: row?.id ?? null,
        level: row?.level ?? 0,
        /** Can it be founded right now? Later buildings never can, yet. */
        can_found: row === undefined && slot.later !== true && longhouseLevel >= slot.unlock,
        /** What it costs to found. Priced by the server so the slot cannot quote the wrong price. */
        found_cost: row === undefined && priceOfFounding ? priceOfFounding(slot.kind) : null,
      };
    });
}
