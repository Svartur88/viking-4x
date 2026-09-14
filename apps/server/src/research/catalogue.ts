/**
 * The Rune Hall's research tree (research.md, DEC-021, DEC-024).
 *
 * Every node is a ROW here, never a branch of code. `research.md` rule 7 is explicit about why:
 * a fourth branch, or a node moving between branches, must cost an entry in this array and nothing
 * else. The client draws whatever this returns and knows none of the names.
 *
 * Node ids are ascii slugs; the DISPLAY name is Icelandic and lives in `name`. That split matters —
 * the Skáld's names are still being judged (Hawk reviews them in the game, not on the page), so a
 * rename must be a one-word edit that touches no data. Renaming `sigd` would orphan every row in
 * the research table; renaming "Sigð" costs nothing.
 *
 * Numbers are deliberately crude. DEC-015 parks balance until every system is on screen, so costs
 * and times here are a shape — cheap and fast at tier 1, dear and slow at tier 3 — not a curve
 * anybody measured. `maxLevel` IS structure rather than balance: research.md rule 3 says a node is
 * either a 5/10-level buff or a one-level unlock, and that is what these say.
 */

export type Branch = "bu" | "her" | "berg";

export interface ResearchNode {
  id: string;
  /** The Skáld's name, shown in game. Safe to change; the id is not. */
  name: string;
  /** Plain-language gloss shown under the name, so a player learns what the word means. */
  gloss: string;
  branch: Branch;
  /** 1, 2 or 3 — which band of the tree. Gates come from the band, not the node. */
  tier: 1 | 2 | 3;
  maxLevel: number;
  /** What it improves, in words the client can print. Effects are not applied yet — see service. */
  effect: string;
  /** Node ids that must be at level 1 before this one may start. */
  needs?: string[];
  /** Designed but not in the game yet (DEC-021: the Berg branch ships after MVP). */
  later?: boolean;
}

/** Gates per tier: [Rune Hall level, Longhouse level] (buildings.md rule 8). */
export const TIER_GATE: Record<1 | 2 | 3, { runeHall: number; longhouse: number }> = {
  1: { runeHall: 1, longhouse: 7 },
  2: { runeHall: 6, longhouse: 13 },
  3: { runeHall: 13, longhouse: 17 },
};

export const NODES: ResearchNode[] = [
  // ---- Bú — the household -------------------------------------------------------------------
  { id: "sigd", name: "Sigð", gloss: "the sickle", branch: "bu", tier: 1, maxLevel: 5, effect: "Grain production" },
  { id: "oxi", name: "Öxi", gloss: "the axe", branch: "bu", tier: 1, maxLevel: 5, effect: "Timber production" },
  { id: "meitill", name: "Meitill", gloss: "the chisel", branch: "bu", tier: 1, maxLevel: 5, effect: "Stone production" },
  { id: "raudi", name: "Rauði", gloss: "bog ore", branch: "bu", tier: 1, maxLevel: 5, effect: "Iron production" },
  { id: "timbrsmid", name: "Timbrsmíð", gloss: "carpentry", branch: "bu", tier: 1, maxLevel: 5, effect: "Build speed" },
  { id: "fraedi", name: "Fræði", gloss: "lore, learning", branch: "bu", tier: 1, maxLevel: 5, effect: "Research speed" },
  { id: "klyfjar", name: "Klyfjar", gloss: "pack-loads", branch: "bu", tier: 1, maxLevel: 5, effect: "March carry capacity" },

  { id: "ardr", name: "Arðr", gloss: "the ard plough", branch: "bu", tier: 2, maxLevel: 10, effect: "Grain production, stronger", needs: ["sigd"] },
  { id: "breidox", name: "Breiðöx", gloss: "the broad axe", branch: "bu", tier: 2, maxLevel: 10, effect: "Timber production, stronger", needs: ["oxi"] },
  { id: "fleygur", name: "Fleygur", gloss: "the splitting wedge", branch: "bu", tier: 2, maxLevel: 10, effect: "Stone production, stronger", needs: ["meitill"] },
  { id: "raudablastur", name: "Rauðablástur", gloss: "bog-iron smelting", branch: "bu", tier: 2, maxLevel: 10, effect: "Iron production, stronger", needs: ["raudi"] },
  { id: "bur", name: "Búr", gloss: "the storehouse", branch: "bu", tier: 2, maxLevel: 10, effect: "Storage capacity" },
  { id: "hlada", name: "Hlaða", gloss: "the barn", branch: "bu", tier: 2, maxLevel: 10, effect: "The hidden share raids cannot take" },

  { id: "kvorn", name: "Kvörn", gloss: "the quern", branch: "bu", tier: 3, maxLevel: 10, effect: "Grain, strongest", needs: ["ardr"] },
  { id: "sog", name: "Sög", gloss: "the saw", branch: "bu", tier: 3, maxLevel: 10, effect: "Timber, strongest", needs: ["breidox"] },
  { id: "grjothledsla", name: "Grjóthleðsla", gloss: "dry-stone walling", branch: "bu", tier: 3, maxLevel: 10, effect: "Stone, strongest", needs: ["fleygur"] },
  { id: "smidja", name: "Smiðja", gloss: "the smithy", branch: "bu", tier: 3, maxLevel: 10, effect: "Iron, strongest", needs: ["raudablastur"] },
  { id: "vadmal", name: "Vaðmál", gloss: "woven cloth — Iceland's real currency", branch: "bu", tier: 3, maxLevel: 10, effect: "Trade rates at the Market" },

  // ---- Her — the war-band -------------------------------------------------------------------
  // Half of the genre's military trees is troop-tier unlocks. DEC-024 moved ours onto the training
  // buildings, so this branch carries formations, the sea and the hird instead. That substitution
  // is the Lead's proposal and the part of research.md most likely to change.
  { id: "skjaldborg", name: "Skjaldborg", gloss: "the shield-wall", branch: "her", tier: 1, maxLevel: 5, effect: "Shieldwall attack and defence" },
  { id: "hamremmi", name: "Hamremmi", gloss: "the berserk fury", branch: "her", tier: 1, maxLevel: 5, effect: "Berserker attack" },
  { id: "bogfimi", name: "Bogfimi", gloss: "bow-skill", branch: "her", tier: 1, maxLevel: 5, effect: "Archer attack" },
  { id: "brynja", name: "Brynja", gloss: "the mail shirt", branch: "her", tier: 1, maxLevel: 5, effect: "All-troop defence" },
  { id: "njosn", name: "Njósn", gloss: "scouting", branch: "her", tier: 1, maxLevel: 5, effect: "Scout range and report detail" },
  { id: "grasalaekning", name: "Grasalækning", gloss: "herb-healing", branch: "her", tier: 1, maxLevel: 5, effect: "Heal speed at the Healer's hut" },

  { id: "svinfylking", name: "Svínfylking", gloss: "the boar's snout", branch: "her", tier: 2, maxLevel: 1, effect: "Unlocks the wedge formation", needs: ["skjaldborg"] },
  { id: "leidangr", name: "Leiðangr", gloss: "the naval levy", branch: "her", tier: 2, maxLevel: 10, effect: "Rally capacity" },
  { id: "knorr", name: "Knörr", gloss: "the cargo ship", branch: "her", tier: 2, maxLevel: 10, effect: "Longship carry capacity" },
  { id: "skeid", name: "Skeið", gloss: "the warship", branch: "her", tier: 2, maxLevel: 10, effect: "Longship speed and fighting strength" },
  { id: "orvaroddr", name: "Örvaroddr", gloss: "the arrowhead", branch: "her", tier: 2, maxLevel: 10, effect: "Archer attack, stronger", needs: ["bogfimi"] },
  { id: "sverdsegg", name: "Sverðsegg", gloss: "the sword-edge", branch: "her", tier: 2, maxLevel: 10, effect: "Shieldwall and Berserker attack, stronger", needs: ["skjaldborg"] },

  { id: "vordr", name: "Vörðr", gloss: "the watch", branch: "her", tier: 3, maxLevel: 10, effect: "Hall defence and incoming warning", needs: ["njosn"] },
  { id: "hertogi", name: "Hertogi", gloss: "the war-leader", branch: "her", tier: 3, maxLevel: 10, effect: "March speed and capacity" },
  { id: "atgeir", name: "Atgeir", gloss: "the halberd", branch: "her", tier: 3, maxLevel: 10, effect: "All-troop attack, strongest", needs: ["sverdsegg"] },
  { id: "hlifskjoldur", name: "Hlífskjöldur", gloss: "the shield held over another", branch: "her", tier: 3, maxLevel: 10, effect: "All-troop defence, strongest", needs: ["brynja"] },
  { id: "sersveit", name: "Sérsveit", gloss: "the chosen band", branch: "her", tier: 3, maxLevel: 1, effect: "Unlocks T10 troops — the second gate (DEC-024)", needs: ["atgeir"] },

  // ---- Berg — the rock (DEC-021; designed, not at MVP) ---------------------------------------
  { id: "malmleit", name: "Málmleit", gloss: "prospecting", branch: "berg", tier: 1, maxLevel: 5, effect: "Chance to spot a vein when surveying", later: true },
  { id: "malmaed", name: "Málmæð", gloss: "the ore vein", branch: "berg", tier: 1, maxLevel: 5, effect: "Yield from a worked vein", later: true },
  { id: "gangur", name: "Gangur", gloss: "the adit", branch: "berg", tier: 1, maxLevel: 5, effect: "How deep the specialists can work", later: true },
  { id: "deigla", name: "Deigla", gloss: "the crucible", branch: "berg", tier: 2, maxLevel: 10, effect: "Grade of metal recoverable", needs: ["malmaed"], later: true },
  { id: "sindur", name: "Sindur", gloss: "slag", branch: "berg", tier: 2, maxLevel: 10, effect: "More metal per load", needs: ["malmaed"], later: true },
  { id: "nama", name: "Náma", gloss: "the mine", branch: "berg", tier: 2, maxLevel: 10, effect: "Specialists per expedition", needs: ["gangur"], later: true },
  { id: "eldsmidi", name: "Eldsmíði", gloss: "fire-forging", branch: "berg", tier: 3, maxLevel: 10, effect: "Hero equipment quality from mined metal", needs: ["deigla"], later: true },
  { id: "steypa", name: "Steypa", gloss: "casting", branch: "berg", tier: 3, maxLevel: 10, effect: "Rare-metal conversion", needs: ["deigla"], later: true },
  { id: "bergrisi", name: "Bergrisi", gloss: "the mountain-giant", branch: "berg", tier: 3, maxLevel: 5, effect: "The deepest workings", needs: ["nama"], later: true },
];

export const BY_ID = new Map(NODES.map((n) => [n.id, n]));
export function researchNode(id: string): ResearchNode | undefined { return BY_ID.get(id); }

export const BRANCH_NAMES: Record<Branch, { name: string; gloss: string }> = {
  bu: { name: "Bú", gloss: "the household" },
  her: { name: "Her", gloss: "the war-band" },
  berg: { name: "Berg", gloss: "the rock" },
};

/**
 * Cost and time for taking a node from `level` to `level + 1`.
 *
 * Crude on purpose (DEC-015). The only property worth defending is the shape: tier 3 costs about
 * eight times tier 1, and nothing exceeds PR-04's seven days — research.md rule 5 states that cap
 * explicitly because the reference games put their month-long walls in exactly this system, and it
 * is where they lose their players.
 */
export function researchCost(node: ResearchNode, toLevel: number) {
  const tierMul = [1, 3, 8][node.tier - 1];
  const base = Math.round(120 * tierMul * Math.pow(toLevel, 1.4));
  return { grain: base, timber: base, stone: Math.round(base * 0.6), iron: Math.round(base * 0.5) };
}

export const MAX_RESEARCH_SECONDS = 7 * 86_400; // PR-04, and research.md rule 5.

export function researchSeconds(node: ResearchNode, toLevel: number) {
  const tierMul = [1, 2.5, 6][node.tier - 1];
  return Math.min(MAX_RESEARCH_SECONDS, Math.round(20 * tierMul * Math.pow(toLevel, 1.3)));
}
