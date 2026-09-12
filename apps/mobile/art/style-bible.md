# Style bible — Viking 4X

Direction A, signed 2026-09-12 (DEC-010): **2D top-down, painted.**
Every asset request quotes this file. If a generated asset argues with a line here, the line wins.

## The one sentence

A cold north-Atlantic coast painted by hand, seen from directly above, warm only where people are.

## Rules

1. **Camera — two views, two rules (DEC-012).** The **world map** is straight down: no perspective, no isometric skew, a hand-painted chart. The **hall view** is a separate screen at a three-quarter angle, where buildings have real depth, sit on their own turf base and cast a soft shadow. The two never share a sprite: a hall on the world map is a small top-down marker, not the hall-view building shrunk. (The earlier "slight 3/4 angle on the top-down map" wording conflated the two and was wrong.)
2. **Light.** Always from the top-left, soft. One shadow direction across the whole game. Firelight is the only warm light and it only comes from doorways, forges, and hearths — it marks where people are.
3. **Palette.** Only the tokens in `autoload/tokens.gd`. Cold greens, slate blues, weathered timber, bone. Warmth (`FIRE`, `GOLD`) is rationed: it means "yours", "active", or "reward", never decoration.
4. **Texture.** Soft painterly brushwork with visible grain. Not vector-flat, not photoreal, not cel-shaded anime.
5. **No horned helmets.** Ever. No skulls, no purple-and-gold fantasy armour, no rune magic glow.
6. **Silhouette first.** Every asset must be recognisable as a black shape at 32 px. Detail is a bonus on top of a readable outline.
7. **No text in art.** No labels, no numbers, no banners with words. All text is drawn by the UI so it can be translated and scaled.
8. **Colour is never the only signal** (accessibility, design-language.md). Shape or icon carries the meaning too.

## Per-family notes

| Family | Notes |
|---|---|
| Terrain | Three land tones, two sea tones, snow. Coast gets a pale foam edge — it is the most-seen art in the game, so it gets hand cleanup. |
| Buildings (hall view) | Three-quarter angle, own turf base, soft shadow. Three stages per building (levels 1–7, 8–14, 15–20), same footprint, growing height and ornament. Generate all three in one prompt so they stay siblings. |
| Map markers | Straight down, tiny, read at 24 px by silhouette alone. Only the hall (three stages), holds, camps and nodes need one. |
| Ships | Longships read by sail and prow shape at small size, not by hull detail. |
| Portraits | Photoreal inside a carved frame — paintings hanging in the hall, deliberately a different register from the painted world (DEC-012). Layered: base face, hair, eyes, beard, marks, clothing by rarity. Children are composed from their parents' layers (genealogy.md rule 9), so every layer must fit every base face. |
| Holds | Monastery, trade town, island hold must differ in silhouette alone. |

## How assets are made

Generated on OpenArt, then cleaned (background removed, palette snapped to tokens, shadow ellipse added programmatically), then packed into per-family atlases for Godot.

**Every generation is recorded in `prompts/` with its model, settings and date**, so any asset can be regenerated in the same style a year from now. That file is the difference between a consistent game and a garage sale.
