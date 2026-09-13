# Hall landscape plate — 2026-09-12

The background the hall is drawn on (DEC-017). Generated BEFORE any building was placed, because
placing buildings against a stand-in means placing them twice — Hawk stopped exactly that, twice.

## Settings
- Model: `gpt-image-2-5-sunburst` (GPT Image 2.5 Sunburst), mode `text2image`
- Aspect 3:4, resolution tier 4k, quality high, PNG
- Output: 2016 × 2688
- historyId: `NDa9NzOHUCJenTI6qpPO`
- Aspect chosen to match the hall world, which is 1.55 × 2.1 screens (ratio ≈ 0.74, and 3:4 = 0.75).

## Prompt

A hand-painted top-down three-quarter view of an EMPTY Viking homestead valley, seen as a game map
background plate. No buildings, no structures, no people, no boats, no text — only the land itself,
with obvious flat cleared patches of bare earth where buildings will later be placed.

Composition, filling the whole tall frame: in the upper right, grey rocky mountains rising to a pale
snowline, with scree slopes coming down. Along the entire left side, a dense dark conifer forest
with a few small clearings cut into it. In the middle, a wide flat grassy clearing of trodden earth
and short turf — the homestead yard — ringed by a low earth bank, with several bare rectangular
patches of packed dirt scattered across it. Below the yard, open farmland: pale green and ochre
strips of pasture and tilled soil divided by low stone walls. Lower still on the left, a reedy brown
marsh with standing pools of dark water. Across the bottom, a pebble and sand shoreline curving into
a calm slate-blue fjord, with a shallow bay.

Style: soft painterly brushwork with visible canvas grain, cold north-Atlantic palette — mossy
greens, slate blues, weathered grey stone, ochre earth. Muted and overcast, not sunny, not
saturated. Soft diffuse light coming from the top left, consistent gentle shadows across the whole
image. Painted illustration, not photorealistic, not cel-shaded anime, not vector flat. No horned
helmets, no fantasy elements, no glowing runes, no lettering or labels anywhere.

## Why this shape of prompt
- **Empty of buildings on purpose.** Buildings are separate sprites drawn on top, so anything the
  plate paints in would be a permanent ghost under a real building.
- **Cleared patches asked for explicitly**, so the slots have somewhere that already looks like a
  building site rather than sitting on untouched grass.
- Regions named in the order Hawk described them: mountains up-right, forest left, yard centre,
  fields below, shore and sea at the bottom.

## Next
Hawk downloads it to `art/incoming/`, Claude stages it, and the building coordinates in
`apps/server/src/catalogue.ts` are then READ OFF THE PAINTING rather than guessed.

---

# Hall landscape plate, close view — same day

The first plate was painted as a whole valley seen from a distance. Hawk spotted that buildings
dropped onto it would read as models on a relief map, and asked whether we need closer views.

**The answer was not several zoomed views per region.** Panning has to be continuous: if the
background swaps or changes angle mid-drag, the ground shifts under the thumb and reads as broken.
The genre's answer — Lords Mobile, Whiteout Survival, Top War — is one continuous scene painted at
the scale the buildings live at, with fixed plots on it. So the plate was regenerated closer, with
the scale nailed down explicitly, rather than sliced up.

The far plate is NOT wasted. It becomes the pulled-back band for the hall, exactly as DEC-011 does
for the world map: each band is a different representation, not the same art resized. Kept as
`hall_plate_far_v1.png`.

## Settings
- Model: `gpt-image-2-5-sunburst`, mode `text2image`, aspect 3:4, 4k, quality high, PNG
- Output: 2016 × 2688
- historyId: `bKBvGp0TjvypN4WscqxC`

## What changed in the prompt, and why
- **A hard scale anchor**: "a 30-metre longhouse would fill roughly one sixth of the image width."
  Asking for "closer" alone gets a slightly closer valley; naming a real object at a real fraction
  of the frame is what actually moves the camera.
- **Named the camera**: low and near, tilted about 50 degrees down, "the way a city view in a
  base-building game is drawn", and the SAME angle and scale edge to edge with no vignette. A plate
  that changes perspective across the frame cannot have sprites placed on it.
- **Named what must be readable**: fence posts, cart ruts, footpaths, single boulders, clumps of
  grass, individual trees. That is the difference between ground and a texture of ground.
- **Cleared plots described concretely**: rectangles of packed earth, some with foundation stones or
  a line of stakes. An empty slot should look like a building site, not a bald patch.

## Prompt
See the generation record in OpenArt (`bKBvGp0TjvypN4WscqxC`); the text is the paragraph block above
this file's first entry, revised as described.

### The close plate's prompt, written out (reconstructed same day)

OpenArt's API returns the image and its settings but NOT the prompt text, and this file originally
pointed at the generation record instead of storing the words. That was a mistake — the record does
not contain them. Reconstructed here from the working text; treat it as accurate in substance and
close in wording, and re-record any future prompt verbatim at the time of generation.

> A hand-painted top-down three-quarter view of an EMPTY Viking homestead, seen close, as a game map
> background plate. No buildings, no structures, no people, no boats, no text — only the land itself,
> with obvious flat cleared plots of bare earth where buildings will later be placed.
>
> Scale: seen from close in, as if standing at the edge of the homestead — a 30-metre longhouse would
> fill roughly one sixth of the image width. The camera is low and near, tilted about 50 degrees down,
> the way a city view in a base-building game is drawn. The SAME angle and the SAME scale edge to edge,
> no vignette, no perspective change across the frame.
>
> Composition, filling the whole tall frame: upper left, a dense dark conifer forest coming down to a
> felled clearing full of cut stumps. Upper right, grey boulders and scree at the foot of rock. Across
> the middle, a wide cleared yard of trodden earth and short turf with several bare rectangular plots
> of packed dirt, some ringed with foundation stones, some marked out with a line of wooden stakes.
> Below the yard, farmland: strips of ploughed brown soil and pale ochre pasture divided by low stone
> walls and wattle fences. Lower left, a reedy brown marsh with standing pools of dark water and a
> plank walkway across it. Along the bottom, a pebble and sand shore with driftwood logs, running into
> a calm slate-blue fjord.
>
> Readable ground detail throughout: fence posts, cart ruts, footpaths, single boulders, clumps of
> grass, individual trees — not a texture of ground but ground.
>
> Style: soft painterly brushwork with visible canvas grain, cold north-Atlantic palette — mossy
> greens, slate blues, weathered grey stone, ochre earth. Muted and overcast, not sunny, not saturated.
> Soft diffuse light from the top left, consistent gentle shadows across the whole image. Painted
> illustration, not photorealistic, not cel-shaded anime, not vector flat. No horned helmets, no
> fantasy elements, no glowing runes, no lettering or labels anywhere.

### On painterly versus photographic — what was actually learned

DEC-010 says painted wins, and the terrain art came out photographic anyway. Three observations, all
from this model (`gpt-image-2-5-sunburst`), none of them tested against a different one:

- **Naming the medium negatively does more than naming it positively.** "Painted illustration" alone
  is weak; "not photorealistic, not cel-shaded anime, not vector flat" is what moves it. The model
  drifts to photographic whenever the description is dominated by real materials — stone, water, mud,
  grass — because those words carry photographic priors.
- **Asking for readable detail pulls it back towards photography.** The close plate asked for fence
  posts and cart ruts and got something noticeably more photographic than the far plate. Detail and
  painterliness pull in opposite directions in the prompt; if you want both, weight the style clause
  harder — ask for visible brush strokes and canvas grain by name, more than once.
- **It matters less than expected.** The painted building sprites were composited onto the
  photographic plate and did not clash: same palette, same light direction, comparable detail. The
  palette and light direction clauses are doing more work for coherence than the medium clause is.
  Before spending generations chasing painterliness, composite a real sprite onto the candidate and
  look at it — that test is cheap and it settled this question in one try.
