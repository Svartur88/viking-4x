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
  /**
   * Which of this kind. 0 for everything unique; 0-3 for the four production kinds.
   *
   * `buildings.md` rule 1 has always said four each of Farm, Timber camp, Quarry and Iron pit —
   * rule 10 exists only to let you demolish and re-balance them, and the Forge's prerequisite reads
   * "Iron pit x2 at 12". The catalogue quietly shipped one of each, which is what made the Longhouse
   * gate a handful of long waits instead of the many small ones the genre runs on. Restored
   * 2026-09-13. The buildings table already supported it: unique (hall_id, kind, slot).
   */
  slot: number;
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
  // Four quarries, spread down the scree rather than lined up — a row reads as manufactured, the
  // same reason the map's nodes are scattered within their zone rather than ringed round a hall.
  { kind: "quarry", slot: 0, name: "Quarry", purpose: "Cuts stone from the mountain",
    terrain: "mountain", at: { x: 0.8, y: 0.13 }, size: 0.075, unlock: 1, starter: true },
  { kind: "quarry", slot: 1, name: "Quarry", purpose: "Cuts stone from the mountain",
    terrain: "mountain", at: { x: 0.9, y: 0.085 }, size: 0.075, unlock: 4 },
  { kind: "quarry", slot: 2, name: "Quarry", purpose: "Cuts stone from the mountain",
    terrain: "mountain", at: { x: 0.71, y: 0.08 }, size: 0.075, unlock: 8 },
  { kind: "quarry", slot: 3, name: "Quarry", purpose: "Cuts stone from the mountain",
    terrain: "mountain", at: { x: 0.925, y: 0.18 }, size: 0.075, unlock: 12 },

  // ── The conifer forest, down the left side ────────────────────────────────
  // The painting puts a felled clearing full of stumps at the treeline — that is the timber camp,
  // and everything else in the woods sits deeper in, where the trees are still standing.
  { kind: "timber_camp", slot: 0, name: "Timber camp", purpose: "Fells timber",
    terrain: "forest", at: { x: 0.22, y: 0.2 }, size: 0.075, unlock: 1, starter: true },
  { kind: "timber_camp", slot: 1, name: "Timber camp", purpose: "Fells timber",
    terrain: "forest", at: { x: 0.13, y: 0.14 }, size: 0.075, unlock: 4 },
  { kind: "timber_camp", slot: 2, name: "Timber camp", purpose: "Fells timber",
    terrain: "forest", at: { x: 0.3, y: 0.1 }, size: 0.075, unlock: 8 },
  { kind: "timber_camp", slot: 3, name: "Timber camp", purpose: "Fells timber",
    terrain: "forest", at: { x: 0.1, y: 0.24 }, size: 0.075, unlock: 12 },
  { kind: "hof", slot: 0, name: "Hof", purpose: "The blót: a blessing asked of the gods",
    terrain: "forest", at: { x: 0.07, y: 0.11 }, size: 0.08, unlock: 9 },
  { kind: "shield_hall", slot: 0, name: "Wolf Lodge", purpose: "Trains Berserkers, kept apart from the hall",
    terrain: "forest", at: { x: 0.06, y: 0.33 }, size: 0.09, unlock: 9 },
  { kind: "forest_camp", slot: 0, name: "Forest camp", purpose: "Hides troops and goods before a raid lands",
    terrain: "forest", at: { x: 0.05, y: 0.5 }, size: 0.08, unlock: 12 },

  // ── The high ground, right: rock and rough grass above the yard ───────────
  { kind: "watchtower", slot: 0, name: "Beacon", purpose: "Sees further, and warns of what is coming",
    terrain: "hills", at: { x: 0.95, y: 0.2 }, size: 0.08, unlock: 10 },
  { kind: "wall", slot: 0, name: "Rampart", purpose: "Earth and timber. What a raid has to break first",
    terrain: "hills", at: { x: 0.9, y: 0.42 }, size: 0.1, unlock: 4 },

  // ── The yard: the cleared plots the painting already marks out ────────────
  // Sprites stand UP from their spot, so a tall building covers the ground behind it — which is why
  // nothing else shares the Longhouse's column.
  { kind: "longhouse", slot: 0, name: "Longhouse", purpose: "The heart of the hall. Nothing outgrows it",
    terrain: "yard", at: { x: 0.52, y: 0.31 }, size: 0.17, unlock: 1, starter: true },
  { kind: "rune_hall", slot: 0, name: "Rune hall", purpose: "Research. Where every lasting improvement is learned",
    terrain: "yard", at: { x: 0.4, y: 0.17 }, size: 0.1, unlock: 7 },
  { kind: "barracks", slot: 0, name: "Hird hall", purpose: "Your household men. Trains Shieldwall",
    terrain: "yard", at: { x: 0.3, y: 0.26 }, size: 0.11, unlock: 1, starter: true },
  { kind: "guest_hall", slot: 0, name: "Guest hall", purpose: "Where allies may garrison",
    terrain: "yard", at: { x: 0.15, y: 0.3 }, size: 0.08, unlock: 5 },
  { kind: "weaving_house", slot: 0, name: "Weaving house", purpose: "Cloth, and the sails a ship needs",
    terrain: "yard", at: { x: 0.68, y: 0.22 }, size: 0.09, unlock: 4 },
  { kind: "storehouse", slot: 0, name: "Storehouse", purpose: "How much you can hold",
    terrain: "yard", at: { x: 0.8, y: 0.25 }, size: 0.1, unlock: 2 },
  { kind: "forge", slot: 0, name: "Smithy", purpose: "Gear. Set apart, for the fire",
    terrain: "yard", at: { x: 0.85, y: 0.34 }, size: 0.09, unlock: 13 },
  { kind: "mead_hall", slot: 0, name: "Mead hall", purpose: "Heroes: hire them, raise them, seat them on the council",
    terrain: "yard", at: { x: 0.26, y: 0.37 }, size: 0.11, unlock: 6 },
  { kind: "family_hall", slot: 0, name: "Family hall", purpose: "Marriage, children, heirs",
    terrain: "yard", at: { x: 0.68, y: 0.4 }, size: 0.1, unlock: 12 },
  { kind: "vault", slot: 0, name: "The Hoard", purpose: "The share no raider can take",
    terrain: "yard", at: { x: 0.13, y: 0.42 }, size: 0.08, unlock: 11 },
  { kind: "healers_hut", slot: 0, name: "Healer's hut", purpose: "The wounded come back. Past its capacity, they do not",
    terrain: "yard", at: { x: 0.4, y: 0.43 }, size: 0.09, unlock: 8 },
  { kind: "hostage_house", slot: 0, name: "Hostage house", purpose: "Captured leaders are held here, and ransomed",
    terrain: "yard", at: { x: 0.58, y: 0.45 }, size: 0.09, unlock: 16, later: true },

  // ── The fields, walled and ploughed, across the lower middle ──────────────
  { kind: "farm", slot: 0, name: "Farm", purpose: "Grows grain",
    terrain: "plain", at: { x: 0.28, y: 0.57 }, size: 0.085, unlock: 1, starter: true },
  { kind: "farm", slot: 1, name: "Farm", purpose: "Grows grain",
    terrain: "plain", at: { x: 0.42, y: 0.545 }, size: 0.085, unlock: 4 },
  { kind: "farm", slot: 2, name: "Farm", purpose: "Grows grain",
    terrain: "plain", at: { x: 0.62, y: 0.53 }, size: 0.085, unlock: 8 },
  { kind: "farm", slot: 3, name: "Farm", purpose: "Grows grain",
    terrain: "plain", at: { x: 0.36, y: 0.65 }, size: 0.085, unlock: 12 },
  { kind: "market", slot: 0, name: "Marketplace", purpose: "Trades one resource for another, at a loss",
    terrain: "plain", at: { x: 0.78, y: 0.57 }, size: 0.1, unlock: 10 },
  { kind: "archery_range", slot: 0, name: "Bowyard", purpose: "Trains Archers, down a long field",
    terrain: "plain", at: { x: 0.55, y: 0.62 }, size: 0.11, unlock: 9 },
  { kind: "thing_stone", slot: 0, name: "Thing stone", purpose: "The law: read it, vote on it, propose it",
    terrain: "plain", at: { x: 0.16, y: 0.6 }, size: 0.07, unlock: 15 },
  { kind: "muster_field", slot: 0, name: "Muster field", purpose: "Where a rally gathers. How many may join one attack",
    terrain: "plain", at: { x: 0.88, y: 0.6 }, size: 0.1, unlock: 7 },

  // ── The marsh and the shore, nearest the water ────────────────────────────
  { kind: "iron_pit", slot: 0, name: "Bog-iron pit", purpose: "Iron, dug from the marsh as it really was",
    terrain: "marsh", at: { x: 0.12, y: 0.76 }, size: 0.065, unlock: 1, starter: true },
  { kind: "iron_pit", slot: 1, name: "Bog-iron pit", purpose: "Iron, dug from the marsh as it really was",
    terrain: "marsh", at: { x: 0.075, y: 0.695 }, size: 0.065, unlock: 4 },
  { kind: "iron_pit", slot: 2, name: "Bog-iron pit", purpose: "Iron, dug from the marsh as it really was",
    terrain: "marsh", at: { x: 0.215, y: 0.815 }, size: 0.065, unlock: 8 },
  { kind: "iron_pit", slot: 3, name: "Bog-iron pit", purpose: "Iron, dug from the marsh as it really was",
    terrain: "marsh", at: { x: 0.285, y: 0.775 }, size: 0.065, unlock: 12 },
  { kind: "shipyard", slot: 0, name: "Naust", purpose: "The boathouse: builds and shelters Longships",
    terrain: "shore", at: { x: 0.72, y: 0.755 }, size: 0.11, unlock: 11 },
  { kind: "harbour", slot: 0, name: "Harbour", purpose: "Ships may come and go. Coastal halls only",
    terrain: "shore", at: { x: 0.5, y: 0.775 }, size: 0.11, unlock: 11 },
];

/** A plot's identity is (kind, slot) — four farms are the same kind on different ground. */
export function slotId(kind: string, slot: number): string {
  return `${kind}:${slot}`;
}

const BY_SLOT = new Map(CATALOGUE.map((b) => [slotId(b.kind, b.slot), b]));

export function buildingKind(kind: string, slot = 0): BuildingKind | undefined {
  return BY_SLOT.get(slotId(kind, slot));
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
  built: Array<{ id: string; kind: string; slot: number; level: number }>,
  longhouseLevel: number,
  priceOfFounding?: (kind: string) => Record<string, number>,
) {
  const have = new Map(built.map((b) => [slotId(b.kind, b.slot), b]));
  return CATALOGUE
    .slice()
    .sort((a, b) => a.at.y - b.at.y)
    .map((slot) => {
      const row = have.get(slotId(slot.kind, slot.slot));
      return {
        kind: slot.kind,
        slot: slot.slot,
        /** Stable identity for an EMPTY plot; a built one also has an id. */
        slot_id: slotId(slot.kind, slot.slot),
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
