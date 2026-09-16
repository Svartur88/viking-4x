/**
 * The Rúnahöll's research: ten trees, 120 nodes (research.md, DEC-028, DEC-029).
 *
 * Every node is a ROW here, never a branch of code. research.md rule 4 is explicit about why: an
 * eleventh tree, or a node moving between trees, must cost an entry in this array and nothing else.
 * The client draws whatever this returns and computes no shape of its own.
 *
 * Node ids are ascii slugs; the DISPLAY name is Icelandic and lives in `name`. That split matters —
 * renaming `sigd` would orphan every row in the research table; renaming "Sigð" costs nothing.
 *
 * `gen` is the generation in the family tree, 1 at the roots. `needs` names the node's PARENTS, all
 * in the same tree and always in an earlier generation. A node opens when every parent has at least
 * one level and its generation's hall gate is met — so the gate is per generation, not per tree, and
 * all ten doors deepen together as the hall rises.
 *
 * Numbers are deliberately crude. DEC-015 parks balance until every system is on screen, so costs
 * and times here are a shape — cheap and fast at the roots, dear and slow at the bottom — not a
 * curve anybody measured. `maxLevel` IS structure rather than balance: research.md rule 3 says a
 * node is either a 5/10-level buff or a one-level unlock, and that is what these say.
 */

export type TreeId =
  | "bu"
  | "handverk"
  | "fraedi"
  | "kaup"
  | "berg"
  | "her"
  | "vorn"
  | "sigling"
  | "viking"
  | "hird";

export type Wing = "heim" | "vopn" | "vik";
export type Gen = 1 | 2 | 3 | 4 | 5;

export interface ResearchNode {
  id: string;
  /** The Skáld's name, shown in game. Safe to change; the id is not. */
  name: string;
  /** Plain-language gloss shown under the name, so a player learns what the word means. */
  gloss: string;
  /** One or two sentences for the node sheet. */
  blurb: string;
  tree: TreeId;
  gen: Gen;
  maxLevel: number;
  /** What it improves, in words the client can print. Effects are not applied yet — see service. */
  effect: string;
  /** Node ids that must be at level 1 before this one may start. Always in the same tree. */
  needs: string[];
  /**
   * The mark carved on the stone: a codepoint from the sixteen-rune Younger Futhark, the row
   * actually used in the Viking age and in Iceland. It is a PLACEHOLDER for the 120 icons nobody
   * has drawn, and the letter carries no meaning about the node — the client draws it as strokes
   * rather than text, so no font has to carry the Runic block.
   */
  rune: number;
  /** Designed but not in the game yet (DEC-021: the Berg tree ships after MVP). */
  later?: boolean;
}

export interface TreeMeta {
  id: TreeId;
  name: string;
  gloss: string;
  wing: Wing;
  /** Víking and Hirð are bought with Orðstír, which no farm produces (DEC-029). */
  renown: boolean;
  /** The door's hue, so ten doors read as ten places. Hex, applied by the client. */
  colour: string;
  blurb: string;
}

export const WINGS: Record<Wing, { name: string; why: string }> = {
  heim: { name: "The household side", why: "bought with grain, timber, stone and iron" },
  vopn: { name: "The war side", why: "still bought with resources — this is the standing army, not the raid" },
  vik: { name: "Won a-viking", why: "bought only with Orðstír, which no farm produces" },
};

/** Gate per GENERATION: [Rune Hall level, Longhouse level] (research.md rule 5). */
export const GEN_GATE: Record<Gen, { runeHall: number; longhouse: number }> = {
  1: { runeHall: 1, longhouse: 7 },
  2: { runeHall: 1, longhouse: 7 },
  3: { runeHall: 6, longhouse: 13 },
  4: { runeHall: 13, longhouse: 17 },
  5: { runeHall: 13, longhouse: 17 },
};

export const TREES: TreeMeta[] = [
  { id: "bu", name: "Bú", gloss: "the household", wing: "heim", renown: false, colour: "#c9a24a",
    blurb: "The four resources, each craft descending three times, then two lines that join at the bottom." },
  { id: "handverk", name: "Handverk", gloss: "the handcraft", wing: "heim", renown: false, colour: "#b98a4a",
    blurb: "Raising roofs and keeping what is under them. Turf, timber, tools and storage." },
  { id: "fraedi", name: "Fræði", gloss: "the lore", wing: "heim", renown: false, colour: "#8fb0c4",
    blurb: "Knowing how to be taught, and knowing where you are. Research speed, scouting, charts, the line." },
  { id: "kaup", name: "Kaup", gloss: "the trade", wing: "heim", renown: false, colour: "#9db06a",
    blurb: "What a load weighs, what it is worth, and what you can get for it." },
  { id: "berg", name: "Berg", gloss: "the rock", wing: "heim", renown: false, colour: "#5f9a92",
    blurb: "Finding the seam, opening it, and deciding what the metal becomes." },
  { id: "her", name: "Hernaður", gloss: "warfare", wing: "vopn", renown: false, colour: "#b14e3c",
    blurb: "Four troop lines and the mail that covers all of them. Tiers are trained, not researched." },
  { id: "vorn", name: "Vörn", gloss: "the defence", wing: "vopn", renown: false, colour: "#7f8fa6",
    blurb: "The ditch, the wall, the watch, the beacon and the healer. Everything that happens at home." },
  { id: "sigling", name: "Sigling", gloss: "the sailing", wing: "vopn", renown: false, colour: "#6fa3b8",
    blurb: "Keel, sail and oar, and everything that comes of having all three." },
  { id: "viking", name: "Víking", gloss: "the raiding voyage", wing: "vik", renown: true, colour: "#b98ec9",
    blurb: "Raising the levy, leading it out, and coming home heavier than you left. Bought with Orðstír." },
  { id: "hird", name: "Hirð", gloss: "the chosen band", wing: "vik", renown: true, colour: "#c9a2d6",
    blurb: "The sworn few, the offices of the household, and the gate on the top tier. Bought with Orðstír." },
];

export const NODES: ResearchNode[] = [
  // ---- Bú — the household -------------------------------------------
  { id: "sigd", name: "Sigð", gloss: "sickle", tree: "bu", gen: 1, maxLevel: 5, rune: 0x16A0,
    needs: [],
    effect: "Grain production",
    blurb: "The curved blade that takes the barley off the field. Every hall starts here, because every hall eats before it does anything else." },
  { id: "oxi", name: "Öxi", gloss: "axe", tree: "bu", gen: 1, maxLevel: 5, rune: 0x16A6,
    needs: [],
    effect: "Timber production",
    blurb: "One axe, well kept. Norse woodcraft was an axe craft — the saw came late and stayed rare." },
  { id: "meitill", name: "Meitill", gloss: "chisel", tree: "bu", gen: 1, maxLevel: 5, rune: 0x16AC,
    needs: [],
    effect: "Stone production",
    blurb: "Iron driven into a seam until the rock decides where to break." },
  { id: "raudi", name: "Rauði", gloss: "bog ore", tree: "bu", gen: 1, maxLevel: 5, rune: 0x16C1,
    needs: [],
    effect: "Iron production",
    blurb: "Bog iron, lifted in lumps from the mire. It is why a country with no mines had swords." },

  { id: "ardr", name: "Arðr", gloss: "the ard plough", tree: "bu", gen: 2, maxLevel: 10, rune: 0x16A0,
    needs: ["sigd"],
    effect: "Grain, stronger",
    blurb: "The scratch-plough that opens the soil instead of turning it. More field worked before the short summer closes." },
  { id: "breidox", name: "Breiðöx", gloss: "broad axe", tree: "bu", gen: 2, maxLevel: 10, rune: 0x16A6,
    needs: ["oxi"],
    effect: "Timber, stronger",
    blurb: "A wide edge for squaring a log into a beam — the step between felling wood and building with it." },
  { id: "fleygur", name: "Fleygur", gloss: "splitting wedge", tree: "bu", gen: 2, maxLevel: 10, rune: 0x16AC,
    needs: ["meitill"],
    effect: "Stone, stronger",
    blurb: "Wedges set along the grain and struck in order. The stone opens where you decided." },
  { id: "raudablastur", name: "Rauðablástur", gloss: "bog-iron smelting", tree: "bu", gen: 2, maxLevel: 10, rune: 0x16C1,
    needs: ["raudi"],
    effect: "Iron, stronger",
    blurb: "The turf-and-charcoal furnace that turns bog lumps into a bloom of workable iron." },

  { id: "kvorn", name: "Kvörn", gloss: "the quern", tree: "bu", gen: 3, maxLevel: 10, rune: 0x16A0,
    needs: ["ardr"],
    effect: "Grain, strongest",
    blurb: "Two stones and a handle, turned by whoever is nearest. Grain becomes flour without leaving the yard." },
  { id: "sog", name: "Sög", gloss: "the saw", tree: "bu", gen: 3, maxLevel: 10, rune: 0x16A6,
    needs: ["breidox"],
    effect: "Timber, strongest",
    blurb: "Boards cut to a line instead of split to the grain. Everything built after this is built straighter." },
  { id: "grjothledsla", name: "Grjóthleðsla", gloss: "dry-stone walling", tree: "bu", gen: 3, maxLevel: 10, rune: 0x16AC,
    needs: ["fleygur"],
    effect: "Stone, strongest",
    blurb: "Stone laid without mortar, each piece chosen for the gap it fills. It stands a thousand years or falls in a week." },
  { id: "smidja", name: "Smiðja", gloss: "the smithy", tree: "bu", gen: 3, maxLevel: 10, rune: 0x16C1,
    needs: ["raudablastur"],
    effect: "Iron, strongest",
    blurb: "The forge at the edge of the yard, where iron stops being a resource and starts being a thing." },

  { id: "busaeld", name: "Búsæld", gloss: "the farm's plenty", tree: "bu", gen: 4, maxLevel: 10, rune: 0x16BC,
    needs: ["kvorn", "sog"],
    effect: "All production, a share on top",
    blurb: "What a good farm looks like from the outside: full barns, sound roofs, nobody anxious. The word is a compliment paid to a household." },
  { id: "audlegd", name: "Auðlegð", gloss: "wealth", tree: "bu", gen: 4, maxLevel: 10, rune: 0x16BE,
    needs: ["grjothledsla", "smidja"],
    effect: "All production, a share on top",
    blurb: "Auður is wealth and also a woman's name and also the deep sea, depending on which one you meant. Here it is the first." },

  // ---- Handverk — the handcraft -------------------------------------
  { id: "torfrista", name: "Torfrista", gloss: "turf-cutting", tree: "handverk", gen: 1, maxLevel: 5, rune: 0x16A2,
    needs: [],
    effect: "Build cost",
    blurb: "Turf cut in long strips and stacked in a herringbone. The cheapest wall in the North and the reason anyone could build at all." },
  { id: "timbrsmid", name: "Timbrsmíð", gloss: "carpentry", tree: "handverk", gen: 1, maxLevel: 5, rune: 0x16CB,
    needs: [],
    effect: "Build speed",
    blurb: "Joints cut so they hold without nails. Faster raising of every roof in the hall." },
  { id: "verkfaeri", name: "Verkfæri", gloss: "tools", tree: "handverk", gen: 1, maxLevel: 5, rune: 0x16B4,
    needs: [],
    effect: "All building work",
    blurb: "Auger, adze, draw-knife, plane. Nothing else in this tree happens without them." },
  { id: "bur", name: "Búr", gloss: "the storehouse", tree: "handverk", gen: 1, maxLevel: 5, rune: 0x16BC,
    needs: [],
    effect: "Storage capacity",
    blurb: "The locked room off the hall. What you cannot store, you cannot keep through the winter." },

  { id: "torfhledsla", name: "Torfhleðsla", gloss: "turf-laying", tree: "handverk", gen: 2, maxLevel: 10, rune: 0x16A2,
    needs: ["torfrista", "verkfaeri"],
    effect: "Build cost, stronger",
    blurb: "Laying the cut turf so the wall sheds water and still breathes. Done badly it rots in a season." },
  { id: "raftur", name: "Raftur", gloss: "the rafter", tree: "handverk", gen: 2, maxLevel: 10, rune: 0x16CB,
    needs: ["timbrsmid", "verkfaeri"],
    effect: "Build speed, stronger",
    blurb: "The long timbers that carry the roof. Get these right and the rest of the building is quick." },
  { id: "skemma", name: "Skemma", gloss: "the outbuilding", tree: "handverk", gen: 2, maxLevel: 10, rune: 0x16BC,
    needs: ["bur"],
    effect: "Storage, stronger",
    blurb: "A second roof away from the hall, for what does not fit under the first." },

  { id: "hornstafur", name: "Hornstafur", gloss: "the corner-post", tree: "handverk", gen: 3, maxLevel: 10, rune: 0x16CB,
    needs: ["raftur"],
    effect: "Build speed, strongest",
    blurb: "The upright the whole frame is squared from. Stave-building, and the last word in raising anything fast." },
  { id: "fordabur", name: "Forðabúr", gloss: "the provision store", tree: "handverk", gen: 3, maxLevel: 10, rune: 0x16BC,
    needs: ["skemma"],
    effect: "Storage, strongest",
    blurb: "Provisions laid by for a year you cannot see yet. The deepest store a hall can hold." },
  { id: "hlada", name: "Hlaða", gloss: "the barn", tree: "handverk", gen: 3, maxLevel: 10, rune: 0x16BE,
    needs: ["skemma", "torfhledsla"],
    effect: "Vault — the share raids cannot take",
    blurb: "Not everything stands in the open. The hidden share a raider never finds, and the reason a bad night is not a ruinous one." },

  { id: "handlag", name: "Handlag", gloss: "the knack", tree: "handverk", gen: 4, maxLevel: 10, rune: 0x16DA,
    needs: ["hornstafur", "torfhledsla"],
    effect: "Build speed and cost together",
    blurb: "Having the hands for it. Untranslatable and immediately obvious the moment you watch two people do the same job." },
  { id: "skali", name: "Skáli", gloss: "the hall", tree: "handverk", gen: 4, maxLevel: 10, rune: 0x16C5,
    needs: ["hornstafur", "fordabur"],
    effect: "Hall capacity and every building at once",
    blurb: "The long building everything else is arranged around — where people ate, argued, slept and were born. The end of this tree is the room you started in." },

  // ---- Fræði — the lore ---------------------------------------------
  { id: "fraedi", name: "Fræði", gloss: "lore, learning", tree: "fraedi", gen: 1, maxLevel: 5, rune: 0x16CF,
    needs: [],
    effect: "Research speed",
    blurb: "Knowing how to be taught. The one node that shortens every node after it, this one included." },
  { id: "stafrof", name: "Stafróf", gloss: "the alphabet", tree: "fraedi", gen: 1, maxLevel: 5, rune: 0x16B1,
    needs: [],
    effect: "Research cost",
    blurb: "The runic row itself, in order. Futhark, not ABC — and the order is why we call it that." },
  { id: "njosn", name: "Njósn", gloss: "scouting", tree: "fraedi", gen: 1, maxLevel: 5, rune: 0x16C5,
    needs: [],
    effect: "Scout range and report detail",
    blurb: "Going to look before going to fight. The cheapest thing in the hall and the one that decides most battles." },

  { id: "runaristur", name: "Rúnaristur", gloss: "rune-carving", tree: "fraedi", gen: 2, maxLevel: 10, rune: 0x16CF,
    needs: ["fraedi", "stafrof"],
    effect: "Research speed, stronger",
    blurb: "Cutting it into stone so it outlives the man who knew it. Writing, in the only form the North had." },
  { id: "minni", name: "Minni", gloss: "memory", tree: "fraedi", gen: 2, maxLevel: 10, rune: 0x16BE,
    needs: ["fraedi"],
    effect: "Research kept when you switch",
    blurb: "What is held without being written. In a mostly unlettered culture this was a profession." },
  { id: "landabref", name: "Landabréf", gloss: "the chart", tree: "fraedi", gen: 2, maxLevel: 10, rune: 0x16D8,
    needs: ["njosn"],
    effect: "Map vision",
    blurb: "A drawn coast is worth a season of guessing. What you can see of the world before you sail into it." },

  { id: "spakmaeli", name: "Spakmæli", gloss: "wise sayings", tree: "fraedi", gen: 3, maxLevel: 10, rune: 0x16CF,
    needs: ["runaristur"],
    effect: "Research speed, strongest",
    blurb: "Hávamál is a poem of these. Knowledge boiled down until it fits in a line a tired man remembers." },
  { id: "talnalist", name: "Talnalist", gloss: "the art of numbers", tree: "fraedi", gen: 3, maxLevel: 10, rune: 0x16B1,
    needs: ["runaristur", "minni"],
    effect: "Research cost, strongest",
    blurb: "Reckoning. Less waste in everything counted, which by this point is everything." },
  { id: "ttvisi", name: "Ættvísi", gloss: "knowledge of the line", tree: "fraedi", gen: 3, maxLevel: 10, rune: 0x16BE,
    needs: ["minni"],
    effect: "Standing inherited through the line",
    blurb: "Who was whose, back nine generations. Icelanders kept this as a science, and it decided what a man was owed." },
  { id: "ratvisi", name: "Ratvísi", gloss: "the sense of the way", tree: "fraedi", gen: 3, maxLevel: 10, rune: 0x16D8,
    needs: ["landabref"],
    effect: "March and voyage accuracy",
    blurb: "Knowing which way is back without being told. Some people have it and nobody can teach it." },

  { id: "visdomur", name: "Vísdómur", gloss: "wisdom", tree: "fraedi", gen: 4, maxLevel: 10, rune: 0x16CF,
    needs: ["spakmaeli", "talnalist"],
    effect: "Everything the hall studies",
    blurb: "Not cleverness. Knowing what is worth doing, which is the rarer thing and the harder node." },
  { id: "sagnaritun", name: "Sagnaritun", gloss: "saga-writing", tree: "fraedi", gen: 4, maxLevel: 10, rune: 0x16BE,
    needs: ["ttvisi", "ratvisi"],
    effect: "Renown kept from past deeds",
    blurb: "Writing it down, at last. Everything anyone knows about this world survived because somebody in Iceland did this." },

  // ---- Kaup — the trade ---------------------------------------------
  { id: "reipi", name: "Reipi", gloss: "rope", tree: "kaup", gen: 1, maxLevel: 5, rune: 0x16D2,
    needs: [],
    effect: "Hauling and lashing",
    blurb: "Twisted from walrus hide, horsehair or bast. Nothing is carried, rigged or tied down without it." },
  { id: "klyfjar", name: "Klyfjar", gloss: "pack-loads", tree: "kaup", gen: 1, maxLevel: 5, rune: 0x16D8,
    needs: [],
    effect: "March carry capacity",
    blurb: "How much a party can shoulder and still walk home. Raiding pays by the load, not by the fight." },
  { id: "vog", name: "Vog", gloss: "the scales", tree: "kaup", gen: 1, maxLevel: 5, rune: 0x16B1,
    needs: [],
    effect: "Trade spread at the Market",
    blurb: "A balance and a set of weights. Being cheated less is the same as earning more." },

  { id: "sledi", name: "Sleði", gloss: "the sledge", tree: "kaup", gen: 2, maxLevel: 10, rune: 0x16D8,
    needs: ["klyfjar", "reipi"],
    effect: "Carry, stronger",
    blurb: "Hauling over snow and frozen ground, which is half the year. Nothing moves in the North without one." },
  { id: "alin", name: "Alin", gloss: "the ell", tree: "kaup", gen: 2, maxLevel: 10, rune: 0x16A2,
    needs: ["vog"],
    effect: "Trade accuracy",
    blurb: "The forearm's length, fixed by law and cut into the church wall so nobody could argue. The unit cloth was sold by." },
  { id: "vadmal", name: "Vaðmál", gloss: "homespun cloth", tree: "kaup", gen: 2, maxLevel: 10, rune: 0x16D2,
    needs: ["vog", "reipi"],
    effect: "Trade rates at the Market",
    blurb: "Wool woven and measured in ells. This was real money in Iceland — debts, fines and land were all reckoned in it — which is why it sits in the economy and not the wardrobe." },

  { id: "farmur", name: "Farmur", gloss: "cargo", tree: "kaup", gen: 3, maxLevel: 10, rune: 0x16D2,
    needs: ["sledi"],
    effect: "Carry, strongest",
    blurb: "A full hold, balanced and lashed. What a voyage is actually for." },
  { id: "mork", name: "Mörk", gloss: "the mark", tree: "kaup", gen: 3, maxLevel: 10, rune: 0x16C1,
    needs: ["alin", "vadmal"],
    effect: "Trade rates, strongest",
    blurb: "A weight of silver, and the unit everything else was priced against." },
  { id: "kaupstefna", name: "Kaupstefna", gloss: "the trade meet", tree: "kaup", gen: 3, maxLevel: 10, rune: 0x16C5,
    needs: ["vadmal"],
    effect: "Market options and refresh",
    blurb: "The gathering where prices are made. More to choose from, more often." },

  { id: "kaupmadur", name: "Kaupmaður", gloss: "the merchant", tree: "kaup", gen: 4, maxLevel: 10, rune: 0x16CF,
    needs: ["farmur", "mork"],
    effect: "Everything bought and sold",
    blurb: "A farmer who sails, mostly. The line between trading and raiding was a matter of what the other coast did first." },
  { id: "kaupangur", name: "Kaupangur", gloss: "the trading place", tree: "kaup", gen: 4, maxLevel: 10, rune: 0x16BC,
    needs: ["mork", "kaupstefna"],
    effect: "A standing market at the hall",
    blurb: "A permanent market town rather than a summer gathering. Birka, Hedeby, Kaupang — the last is just the word, used as a name." },

  // ---- Berg — the rock ----------------------------------------------
  { id: "malmleit", name: "Málmleit", gloss: "prospecting", tree: "berg", gen: 1, maxLevel: 5, rune: 0x16C1,
    needs: [], later: true,
    effect: "Chance to spot a vein when surveying",
    blurb: "Literally metal-searching. Walking ground and knowing what the colour of a broken rock means." },
  { id: "gangur", name: "Gangur", gloss: "the adit", tree: "berg", gen: 1, maxLevel: 5, rune: 0x16A2,
    needs: [], later: true,
    effect: "How deep the specialists can work",
    blurb: "The passage driven in at the hillside. Depth is the whole limit on what a mine is worth." },
  { id: "hamar", name: "Hamar", gloss: "hammer, and crag", tree: "berg", gen: 1, maxLevel: 5, rune: 0x16DA,
    needs: [], later: true,
    effect: "Breaking rate",
    blurb: "The word is both the tool and the cliff it is used on, which is either a coincidence or the oldest joke in the language." },

  { id: "malmaed", name: "Málmæð", gloss: "the ore vein", tree: "berg", gen: 2, maxLevel: 10, rune: 0x16B1,
    needs: ["malmleit"], later: true,
    effect: "Yield from a worked vein",
    blurb: "The seam itself, once found. How much of it actually comes out." },
  { id: "grjotnam", name: "Grjótnám", gloss: "quarrying", tree: "berg", gen: 2, maxLevel: 10, rune: 0x16AC,
    needs: ["hamar", "gangur"], later: true,
    effect: "Yield, stronger",
    blurb: "Taking the rock in worked courses rather than breaking at it. The organised version of the same job." },
  { id: "nama", name: "Náma", gloss: "the mine", tree: "berg", gen: 2, maxLevel: 10, rune: 0x16A6,
    needs: ["gangur"], later: true,
    effect: "Specialists per expedition",
    blurb: "How many can work the face at once without being in each other's way." },

  { id: "deigla", name: "Deigla", gloss: "the crucible", tree: "berg", gen: 3, maxLevel: 10, rune: 0x16CB,
    needs: ["malmaed"], later: true,
    effect: "Grade of metal recoverable",
    blurb: "The clay cup that holds metal while fire decides what it is. Better crucible, better metal." },
  { id: "sindur", name: "Sindur", gloss: "slag", tree: "berg", gen: 3, maxLevel: 10, rune: 0x16CF,
    needs: ["nama", "grjotnam"], later: true,
    effect: "Waste reduction",
    blurb: "The glassy waste at the bottom of the furnace. Less of it means more of everything else." },

  { id: "malmur", name: "Málmur", gloss: "metal", tree: "berg", gen: 4, maxLevel: 10, rune: 0x16C1,
    needs: ["deigla", "sindur"], later: true,
    effect: "Grade, strongest",
    blurb: "The finished stuff — not the ore, not the bloom. The top of what the ground will give." },
  { id: "eldsmidi", name: "Eldsmíði", gloss: "fire-forging", tree: "berg", gen: 4, maxLevel: 10, rune: 0x16B4,
    needs: ["deigla"], later: true,
    effect: "Hero equipment quality",
    blurb: "Working the metal hot. Where mined ore stops being a resource and becomes a jarl's gear." },
  { id: "steypa", name: "Steypa", gloss: "casting", tree: "berg", gen: 4, maxLevel: 10, rune: 0x16AC,
    needs: ["sindur"], later: true,
    effect: "Rare-metal conversion",
    blurb: "Pouring rather than hammering. Shapes an edge cannot make." },

  { id: "bergrisi", name: "Bergrisi", gloss: "the mountain-giant", tree: "berg", gen: 5, maxLevel: 5, rune: 0x16A0,
    needs: ["malmur", "eldsmidi", "steypa"], later: true,
    effect: "The deepest workings",
    blurb: "One of the four land-wights that guard Iceland, the one standing over the mountains. A flavour node, and honestly it may not earn its place." },

  // ---- Hernaður — warfare -------------------------------------------
  { id: "skjaldborg", name: "Skjaldborg", gloss: "the shield-wall", tree: "her", gen: 1, maxLevel: 5, rune: 0x16E6,
    needs: [],
    effect: "Shieldwall attack and defence",
    blurb: "Shields overlapped, the line holding because nobody in it moves first. The oldest answer to everything." },
  { id: "hamremmi", name: "Hamremmi", gloss: "the berserk fury", tree: "her", gen: 1, maxLevel: 5, rune: 0x16DA,
    needs: [],
    effect: "Berserker attack",
    blurb: "Shape-strength: the fury that comes over a man and leaves him spent. Terrible for an hour and useless after it." },
  { id: "bogfimi", name: "Bogfimi", gloss: "bow-skill", tree: "her", gen: 1, maxLevel: 5, rune: 0x16C5,
    needs: [],
    effect: "Archer attack",
    blurb: "Drawing to the ear and loosing without aiming. A winter's practice for one second of use." },
  { id: "reidmennska", name: "Reiðmennska", gloss: "horsemanship", tree: "her", gen: 1, maxLevel: 5, rune: 0x16D8,
    needs: [],
    effect: "Rider speed and carry",
    blurb: "Riding as a skill rather than a way to arrive. Riders carry and outrun; they do not win fights." },
  { id: "brynja", name: "Brynja", gloss: "the mail shirt", tree: "her", gen: 1, maxLevel: 5, rune: 0x16A6,
    needs: [],
    effect: "All-troop defence",
    blurb: "Riveted rings, worth a farm. Everyone lives slightly longer." },

  { id: "sverdsegg", name: "Sverðsegg", gloss: "the sword-edge", tree: "her", gen: 2, maxLevel: 10, rune: 0x16B4,
    needs: ["skjaldborg", "hamremmi"],
    effect: "Shieldwall and Berserker attack",
    blurb: "Hard steel welded onto a softer core, so the edge holds and the blade does not snap." },
  { id: "orvaroddr", name: "Örvaroddr", gloss: "the arrowhead", tree: "her", gen: 2, maxLevel: 10, rune: 0x16B1,
    needs: ["bogfimi"],
    effect: "Archer attack, stronger",
    blurb: "The head, not the shaft. What it is shaped to get through decides what it is for." },
  { id: "sodull", name: "Söðull", gloss: "the saddle", tree: "her", gen: 2, maxLevel: 10, rune: 0x16D8,
    needs: ["reidmennska"],
    effect: "Rider carry, stronger",
    blurb: "A tree, a girth and stirrups. The difference between sitting on a horse and working from one." },
  { id: "hringabrynja", name: "Hringabrynja", gloss: "ring-mail", tree: "her", gen: 2, maxLevel: 10, rune: 0x16A6,
    needs: ["brynja"],
    effect: "All-troop defence, stronger",
    blurb: "Mail made properly: every ring riveted, not butted. Four times the work, and it holds." },

  { id: "vopnfimi", name: "Vopnfimi", gloss: "weapon-skill", tree: "her", gen: 3, maxLevel: 10, rune: 0x16B4,
    needs: ["sverdsegg"],
    effect: "Attack for the two close types",
    blurb: "Being good with what is in your hand. Training, not fury — the thing Hamremmi is not." },
  { id: "almur", name: "Álmur", gloss: "elm, the bow-wood", tree: "her", gen: 3, maxLevel: 10, rune: 0x16C5,
    needs: ["orvaroddr"],
    effect: "Archer range and attack",
    blurb: "The tree the bow is cut from, and in poetry the man holding it. Norse bows were elm or yew, and the word stands in for both." },
  { id: "beisli", name: "Beisli", gloss: "the bridle", tree: "her", gen: 3, maxLevel: 10, rune: 0x16D8,
    needs: ["sodull"],
    effect: "Rider handling",
    blurb: "Bit, cheekpieces and reins. Control rather than power, which is what a Rider needs." },
  { id: "spangabrynja", name: "Spangabrynja", gloss: "splint armour", tree: "her", gen: 3, maxLevel: 10, rune: 0x16A6,
    needs: ["hringabrynja"],
    effect: "All-troop defence at the top",
    blurb: "Iron strips laid over a backing. Cheaper than mail, heavier, and better against the thing mail is worst at." },

  { id: "atgeir", name: "Atgeir", gloss: "the halberd", tree: "her", gen: 4, maxLevel: 10, rune: 0x16AC,
    needs: ["vopnfimi", "almur"],
    effect: "All-troop attack, strongest",
    blurb: "The long hafted blade Gunnar of Hlíðarendi carried, and the saga notes it sang before a killing." },
  { id: "hlifskjoldur", name: "Hlífskjöldur", gloss: "the shield over another", tree: "her", gen: 4, maxLevel: 10, rune: 0x16BE,
    needs: ["spangabrynja", "beisli"],
    effect: "All-troop defence, strongest",
    blurb: "Not your own shield — the one you hold over someone else. Still the ordinary Icelandic word for a protector." },

  // ---- Vörn — the defence -------------------------------------------
  { id: "vordr", name: "Vörðr", gloss: "the watch", tree: "vorn", gen: 1, maxLevel: 5, rune: 0x16BC,
    needs: [],
    effect: "Incoming warning",
    blurb: "Someone awake on the wall. How much warning you get is worth more than what you do with it." },
  { id: "diki", name: "Díki", gloss: "the ditch", tree: "vorn", gen: 1, maxLevel: 5, rune: 0x16A2,
    needs: [],
    effect: "Approach slowed",
    blurb: "Dug before anything is built above it. The oldest defence there is and still the cheapest." },
  { id: "grasalaekning", name: "Grasalækning", gloss: "herb-healing", tree: "vorn", gen: 1, maxLevel: 5, rune: 0x16CB,
    needs: [],
    effect: "Heal speed",
    blurb: "Wounds are not deaths here. How fast the wounded come back to the bench." },

  { id: "vardeldur", name: "Varðeldur", gloss: "the beacon fire", tree: "vorn", gen: 2, maxLevel: 10, rune: 0x16C1,
    needs: ["vordr"],
    effect: "Warning range",
    blurb: "Fire on a headland, answered by the next headland. News travels faster than the ships bringing it." },
  { id: "gardur", name: "Garður", gloss: "the enclosure", tree: "vorn", gen: 2, maxLevel: 10, rune: 0x16AC,
    needs: ["diki"],
    effect: "Wall durability",
    blurb: "The turf-and-stone dyke around what is yours. Half the word for a farm is this wall." },
  { id: "saralaekning", name: "Sáralækning", gloss: "wound-healing", tree: "vorn", gen: 2, maxLevel: 10, rune: 0x16CB,
    needs: ["grasalaekning"],
    effect: "Wounded capacity",
    blurb: "How many the Healer's hut holds at once. The number that decides whether a lost battle is survivable." },

  { id: "varda", name: "Varða", gloss: "the cairn", tree: "vorn", gen: 3, maxLevel: 10, rune: 0x16A0,
    needs: ["vardeldur"],
    effect: "Warning and the routes home",
    blurb: "Stones piled to mark a way across ground with no landmarks. Still standing on Icelandic moors, still working." },
  { id: "vigskord", name: "Vígskörð", gloss: "the battlements", tree: "vorn", gen: 3, maxLevel: 10, rune: 0x16AC,
    needs: ["gardur"],
    effect: "Defenders' attack from the wall",
    blurb: "The gaps you shoot through and the merlons you stand behind. Turning a wall from an obstacle into a weapon." },
  { id: "laeknishendur", name: "Læknishendur", gloss: "healing hands", tree: "vorn", gen: 3, maxLevel: 10, rune: 0x16CB,
    needs: ["saralaekning"],
    effect: "Heal speed, strongest",
    blurb: "The good healer everyone in the district knows about. Often a woman, often the only one for a day's ride." },

  { id: "virki", name: "Virki", gloss: "the stronghold", tree: "vorn", gen: 4, maxLevel: 10, rune: 0x16BC,
    needs: ["vigskord", "varda"],
    effect: "Hall defence, strongest",
    blurb: "Not a castle — a defended place. The last ring of what a hall can do for itself." },

  { id: "fridland", name: "Friðland", gloss: "the place of peace", tree: "vorn", gen: 5, maxLevel: 10, rune: 0x16A2,
    needs: ["virki", "laeknishendur"],
    effect: "Shield and recovery after a raid",
    blurb: "Ground where fighting is forbidden. The rules that keep a bad night from becoming the end of a household." },

  // ---- Sigling — the sailing ----------------------------------------
  { id: "kjolur", name: "Kjölur", gloss: "the keel", tree: "sigling", gen: 1, maxLevel: 5, rune: 0x16AC,
    needs: [],
    effect: "Ship durability",
    blurb: "One timber down the length of the hull. Everything else is hung off this." },
  { id: "segl", name: "Segl", gloss: "the sail", tree: "sigling", gen: 1, maxLevel: 5, rune: 0x16D2,
    needs: [],
    effect: "Sea speed",
    blurb: "A square of homespun on a yard. It arrived late in the North and changed what far meant." },
  { id: "ar", name: "Ár", gloss: "the oar", tree: "sigling", gen: 1, maxLevel: 5, rune: 0x16A2,
    needs: [],
    effect: "Speed in calm and in shallows",
    blurb: "Thirty pairs of them, and the reason a longship could go up a river and a knörr could not." },

  { id: "sud", name: "Súð", gloss: "the strakes", tree: "sigling", gen: 2, maxLevel: 10, rune: 0x16B1,
    needs: ["kjolur"],
    effect: "Hull strength",
    blurb: "Clinker planking — each plank overlapping the one below, riveted through. Light, flexible, and it moves with the sea." },
  { id: "knorr", name: "Knörr", gloss: "the cargo ship", tree: "sigling", gen: 2, maxLevel: 10, rune: 0x16C5,
    needs: ["kjolur", "segl"],
    effect: "Longship carry capacity",
    blurb: "Broad, deep and slow. The ship that settled Iceland and Greenland, and nobody writes poems about it." },
  { id: "skeid", name: "Skeið", gloss: "the warship", tree: "sigling", gen: 2, maxLevel: 10, rune: 0x16E6,
    needs: ["kjolur", "ar"],
    effect: "Longship speed and fighting strength",
    blurb: "Long, shallow and fast, built to carry men rather than goods. The one the poems are about." },
  { id: "reidi", name: "Reiði", gloss: "the rigging", tree: "sigling", gen: 2, maxLevel: 10, rune: 0x16D2,
    needs: ["segl"],
    effect: "Sail handling in weather",
    blurb: "Shrouds, stays, halyard and sheets. Everything holding the sail up and letting you change your mind about it." },

  { id: "naust", name: "Naust", gloss: "the boat shed", tree: "sigling", gen: 3, maxLevel: 10, rune: 0x16CB,
    needs: ["sud", "knorr"],
    effect: "Ships kept and repaired",
    blurb: "The roofed slip where a hull sits out the winter. Ships rot faster ashore than at sea if you do this badly." },
  { id: "styri", name: "Stýri", gloss: "the steering oar", tree: "sigling", gen: 3, maxLevel: 10, rune: 0x16CF,
    needs: ["ar", "reidi"],
    effect: "Handling and sea speed, strongest",
    blurb: "Hung on the right-hand side, which is why that side is starboard in every language that took the word." },

  { id: "solarsteinn", name: "Sólarsteinn", gloss: "the sunstone", tree: "sigling", gen: 4, maxLevel: 10, rune: 0x16A0,
    needs: ["styri"],
    effect: "Navigation without sight of the sun",
    blurb: "The crystal said to find the sun through cloud. Whether it worked is argued about; that they reached Greenland is not." },
  { id: "hafsigling", name: "Hafsigling", gloss: "the open crossing", tree: "sigling", gen: 4, maxLevel: 10, rune: 0x16D8,
    needs: ["styri", "naust"],
    effect: "Voyage range",
    blurb: "Leaving the coast behind on purpose and sailing west with nothing to steer by for days." },

  { id: "landnam", name: "Landnám", gloss: "the land-taking", tree: "sigling", gen: 5, maxLevel: 10, rune: 0x16BE,
    needs: ["solarsteinn", "hafsigling"],
    effect: "Founding and holding new ground",
    blurb: "The settlement of Iceland has a book named after it that lists who took which valley. The end of the sailing tree is the reason for the sailing." },

  // ---- Víking — the raiding voyage ----------------------------------
  { id: "leidangr", name: "Leiðangr", gloss: "the naval levy", tree: "viking", gen: 1, maxLevel: 5, rune: 0x16D2,
    needs: [],
    effect: "Rally capacity",
    blurb: "The standing obligation to turn out with men and a ship when called. How a coast raises a fleet without keeping one." },
  { id: "strandhogg", name: "Strandhögg", gloss: "the shore-raid", tree: "viking", gen: 1, maxLevel: 5, rune: 0x16E6,
    needs: [],
    effect: "Loot taken from a raid",
    blurb: "Literally shore-strike: putting in, taking what is on the beach, and leaving before anyone organises." },

  { id: "hertogi", name: "Hertogi", gloss: "the war-leader", tree: "viking", gen: 2, maxLevel: 10, rune: 0x16D8,
    needs: ["leidangr"],
    effect: "March speed and capacity",
    blurb: "The one who leads the levy out. Not a rank — a job, given for a season." },
  { id: "skipalid", name: "Skipalið", gloss: "the fleet", tree: "viking", gen: 2, maxLevel: 10, rune: 0x16D2,
    needs: ["leidangr"],
    effect: "Ships in one march",
    blurb: "More than one hull sailing as one force, which is a different problem from sailing one well." },
  { id: "herfang", name: "Herfang", gloss: "war-booty", tree: "viking", gen: 2, maxLevel: 10, rune: 0x16C1,
    needs: ["strandhogg"],
    effect: "Loot carried home",
    blurb: "What the raid actually brings back, after what was dropped in the rush to the boats." },

  { id: "svinfylking", name: "Svínfylking", gloss: "the boar's snout", tree: "viking", gen: 3, maxLevel: 1, rune: 0x16E6,
    needs: ["hertogi"],
    effect: "Formation unlock — the wedge",
    blurb: "The wedge that goes in at a point and opens the line behind it. Attributed to Óðinn himself, which tells you what the Norse thought of the man who invented it." },
  { id: "ransferd", name: "Ránsferð", gloss: "the plundering voyage", tree: "viking", gen: 3, maxLevel: 10, rune: 0x16DA,
    needs: ["herfang"],
    effect: "Raid range",
    blurb: "Going further for it. The difference between robbing a neighbour and being a problem for a kingdom." },
  { id: "vigfimi", name: "Vígfimi", gloss: "skill at arms", tree: "viking", gen: 3, maxLevel: 10, rune: 0x16B4,
    needs: ["herfang", "hertogi"],
    effect: "Attack while raiding",
    blurb: "Being good at the part everyone hopes will be short." },

  { id: "herskjoldur", name: "Herskjöldur", gloss: "the war-shield", tree: "viking", gen: 4, maxLevel: 10, rune: 0x16E6,
    needs: ["svinfylking", "ransferd"],
    effect: "Raid pressure on a defender",
    blurb: "Að fara herskildi — to go with the war-shield up — is the phrase for ravaging a country. A declaration, not a tactic." },
  { id: "undanhald", name: "Undanhald", gloss: "the withdrawal", tree: "viking", gen: 4, maxLevel: 10, rune: 0x16D8,
    needs: ["vigfimi", "skipalid"],
    effect: "Losses when retreating",
    blurb: "Leaving in order rather than leaving fast. The most undervalued skill in the game and in the sagas." },

  { id: "fraegdarfor", name: "Frægðarför", gloss: "the famous journey", tree: "viking", gen: 5, maxLevel: 10, rune: 0x16CF,
    needs: ["herskjoldur", "undanhald"],
    effect: "Orðstír earned per voyage",
    blurb: "The voyage people tell about afterwards. Which, in a culture with no coins worth the name, was the actual payment." },

  // ---- Hirð — the chosen band ---------------------------------------
  { id: "hirdmadur", name: "Hirðmaður", gloss: "the retainer", tree: "hird", gen: 1, maxLevel: 5, rune: 0x16E6,
    needs: [],
    effect: "Hird troop strength",
    blurb: "A man in the jarl's household, fed and armed by him, and sworn. Not a soldier — a member of the family that fights." },
  { id: "mali", name: "Máli", gloss: "the wage", tree: "hird", gen: 1, maxLevel: 5, rune: 0x16C1,
    needs: [],
    effect: "Upkeep of the sworn men",
    blurb: "Pay for service. Mercenary is too cold a word and household too warm; the arrangement sat in between." },

  { id: "eidr", name: "Eiðr", gloss: "the oath", tree: "hird", gen: 2, maxLevel: 10, rune: 0x16BE,
    needs: ["hirdmadur"],
    effect: "Reinforcement from allies",
    blurb: "Sworn on a ring, in front of witnesses. The whole legal system of the North rests on people meaning it." },
  { id: "handgenginn", name: "Handgenginn", gloss: "gone into the hand", tree: "hird", gen: 2, maxLevel: 10, rune: 0x16A2,
    needs: ["hirdmadur", "mali"],
    effect: "Hird capacity",
    blurb: "Having placed your hands between the lord's and become his man. The ceremony is where the phrase comes from." },

  { id: "gjafir", name: "Gjafir", gloss: "gifts", tree: "hird", gen: 3, maxLevel: 10, rune: 0x16C1,
    needs: ["eidr"],
    effect: "Loyalty and hero bond",
    blurb: "A lord who does not give is not a lord. Ring-giver is a kenning for king because the giving was the job." },
  { id: "merkismadur", name: "Merkismaður", gloss: "the standard-bearer", tree: "hird", gen: 3, maxLevel: 10, rune: 0x16D8,
    needs: ["eidr"],
    effect: "March-wide attack",
    blurb: "The one who carries the banner, and the one everyone in the line can see. Historically the shortest career available." },
  { id: "stallari", name: "Stallari", gloss: "the marshal", tree: "hird", gen: 3, maxLevel: 10, rune: 0x16CF,
    needs: ["handgenginn"],
    effect: "March slots and order",
    blurb: "A real office of the hirð — the man who spoke for the king and kept the household in order." },

  { id: "drengskapur", name: "Drengskapur", gloss: "honour, valour", tree: "hird", gen: 4, maxLevel: 10, rune: 0x16B4,
    needs: ["merkismadur", "stallari"],
    effect: "All-troop strength, top of the ladder",
    blurb: "The hardest word here to translate: decency, nerve and keeping your word, all at once. A drengur is a man who has it." },
  { id: "fylgd", name: "Fylgd", gloss: "the following", tree: "hird", gen: 4, maxLevel: 10, rune: 0x16BE,
    needs: ["gjafir", "stallari"],
    effect: "Reinforcement and garrison",
    blurb: "Those who go with you. It is also the word for an escort and, in older use, a fetch — the spirit that follows a man." },

  { id: "sersveit", name: "Sérsveit", gloss: "the chosen band", tree: "hird", gen: 5, maxLevel: 1, rune: 0x16E6,
    needs: ["drengskapur", "fylgd"],
    effect: "Unlock: T10 troops",
    blurb: "The picked few. The only unit unlock left anywhere in research after tiers moved to the training buildings, and the second gate on the top tier." },

];
export const BY_ID = new Map(NODES.map((n) => [n.id, n]));
export function researchNode(id: string): ResearchNode | undefined { return BY_ID.get(id); }

export const TREE_BY_ID = new Map(TREES.map((t) => [t.id, t]));
export function isRenownTree(id: TreeId): boolean { return TREE_BY_ID.get(id)?.renown ?? false; }

export interface ResearchPrice {
  grain: number; timber: number; stone: number; iron: number;
  /** Zero except in Víking and Hirð, which cost renown INSTEAD of resources (DEC-029). */
  ordstir: number;
}

/**
 * Cost for taking a node from `level` to `level + 1`.
 *
 * Crude on purpose (DEC-015). The only properties worth defending are the two shapes: generation 5
 * costs roughly eight times generation 1, and the two renown trees cost Orðstír and nothing else —
 * farm output must not buy war research, which is the whole point of DEC-029.
 */
export function researchCost(node: ResearchNode, toLevel: number): ResearchPrice {
  const genMul = [1, 1.8, 3, 5.5, 8][node.gen - 1];
  const base = Math.round(120 * genMul * Math.pow(toLevel, 1.4));
  if (isRenownTree(node.tree)) {
    return { grain: 0, timber: 0, stone: 0, iron: 0, ordstir: Math.max(1, Math.round(base / 40)) };
  }
  return { grain: base, timber: base, stone: Math.round(base * 0.6), iron: Math.round(base * 0.5), ordstir: 0 };
}

export const MAX_RESEARCH_SECONDS = 7 * 86_400; // PR-04, and research.md rule 8.

export function researchSeconds(node: ResearchNode, toLevel: number) {
  const genMul = [1, 1.7, 2.5, 4.2, 6][node.gen - 1];
  return Math.min(MAX_RESEARCH_SECONDS, Math.round(20 * genMul * Math.pow(toLevel, 1.3)));
}
