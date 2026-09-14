# Building sprites — six tiers per building

Started 2026-09-13 (night), at Hawk's request: six images per building, each more impressive, with
the last two "pumped up".

## Read this before generating any more

**Two things in Hawk's ask conflict with what is written, and both are his to settle.**

1. **The game caps at level 20, not 30.** `balance.ts` has `maxLevel: 20`; `buildings.md` rule 5 says
   Longhouse 20 is the only building that reaches the 7-day timer cap; `progression.md` still has an
   open question about whether 20 is even the alpha cap or whether it is 15 with 16–20 opened by
   kingdom age. Thirty levels is a design change, not a detail.
2. **The client has three visual stages, not six.** `art.gd` `stage_for()` maps 1–7, 8–14, 15–20, and
   `style-bible.md` says the same in its Buildings row.

**Why the art is safe anyway.** These are six *visual tiers*. What level each tier begins at is one
function — `stage_for()` — and one line in the style bible. Six escalating tiers are useful whether
the cap ends at 20 or 30, so nothing generated here is wasted by that decision going either way.
When it is settled, change the mapping, not the art.

**The other limit, stated plainly:** Claude cannot see these images. The OpenArt CDN is blocked from
the container and the browser pane cannot reach it either. Every sheet has to be downloaded by Hawk
before anyone can judge it. That is why two were generated and not twenty-seven.

## Naming, and what is actually possible

Hawk asked whether OpenArt can name each image for what it is, rather than
`gpt-image-2.5-sunburst-N` every time. **It cannot.** The generate API has no filename or title
field — checked against the tool schema, not assumed — and the CDN filename is produced by the model.

What IS available, and now done: generations can target a **project**. All building sheets from here
go into **"Viking 4X — buildings"** (`xx7aUofqexMADODlKSlF`) instead of the default project, so they
stop mixing with Whiskerville art and with everything else. In `my-creations` they are their own set.

Two mitigations for telling sheets apart at download time:

- Thumbnails are distinctive — a longhouse sheet looks like longhouses. This matters more than the
  filename when there are 25 to pick through.
- The ugly name only lives between download and cut. `tools/cut_sprites.py` writes proper names
  (`longhouse_1.png` … `longhouse_6.png`) into `art/buildings/`, so nothing named "sunburst" ever
  reaches the game. `art/incoming/` is a staging folder, not a home.

The two sheets already generated (Longhouse, Storehouse) went to the DEFAULT project — they predate
this — so they are in `my-creations` with everything else. Everything after them is in the new one.

## Settings (unchanged from the batch that worked)

Model `gpt-image-2-5-sunburst`, mode `text2image`, `resolutionTier: 2k`, quality high, PNG. Six
sprites as two rows of three — the same layout `tools/cut_sprites.py` already cuts with
`--rows 2 --per-row 3 --height 384 --holes --tol 16`.

**Corrected 2026-09-13 (night).** This line said "aspect 3:2, output 2016 × 1344". It is wrong.
Measured from the OpenArt API for two of the sheets (`TrAE60lbdJnHSgUscBP4`, `CIDeGfwIgkbyVlDtrExs`):
every sheet came back **4:3, 1792 × 1344**. All 27 are the same shape, so the set is still siblings
and the cut is unaffected — each cell is 597 × 672 rather than 672 × 672, and the cutter scales to a
384px height either way. Recorded because the wrong figure would have sent the next person hunting
for a mismatch that is not there.

## The scaffolding every prompt keeps

Constant across all buildings, so the set stays siblings:

- two rows of three, read left to right along the top row then the bottom
- **the same building** at six stages, same ground footprint, growing in height and ornament rather
  than sprawling sideways
- three-quarter from above, camera tilted about 50 degrees down, the same angle for all six
- **no turf patch, no oval base, no ground plate** — cut-out sprites with a soft contact shadow only
  (the old batch asked for an oval turf base and that is what produced the patches that read wrong
  against the painted plate)
- painterly, named negatively as well as positively: *not photorealistic, not a 3D render, not
  cel-shaded anime, not vector flat* — naming the medium negatively does more than naming it
  positively, and the realistic-materials vocabulary drags it toward photography
- muted cold Nordic palette, light from the top left, warm firelight only at doors and braziers
- no horned helmets, no people, no fantasy creatures, no glowing runes, no text

Tiers 5 and 6 escalate hard, per Hawk: raised stone foundations, wings, colonnades, banners, gold,
lit braziers, a processional approach. Tier 6 should read as the most impressive thing anyone owns.

## Generated so far

### Longhouse — historyId `2ZZpyK536JmrwhQm6lD2`
> Six game asset sprites on a plain flat mid-grey background, arranged as two rows of three, hand-painted 2D game art. All six are THE SAME Viking longhouse at six stages of growth, read left to right along the top row then left to right along the bottom row. Each is seen from above at a three-quarter angle, the camera tilted about 50 degrees down, the way a city view in a base-building game is drawn — the SAME angle and the SAME ground footprint for all six, growing in height, length and ornament rather than sprawling. Each stands directly on the grey background with only a soft dark contact shadow beneath it. IMPORTANT: no turf patch, no oval base, no grass mound, no ground plate, no island of earth under any building.
>
> TOP ROW. First: a small plain longhouse, low turf roof, rough timber walls, one door, a smoke hole, nothing decorative. Second: the same hall longer and taller, carved door posts, two round painted shields by the door, a low stone footing along the wall. Third: longer still with a shingled porch, a carved gable end, a row of shields down one wall, a woodpile and a drying rack.
>
> BOTTOM ROW, and these must escalate hard. Fourth: a grand hall, tall carved gables with dragon-head finials, shields the full length of both walls, a covered porch on carved pillars, banners on poles, a paved threshold. Fifth: a jarl's seat — the hall raised on a dressed-stone foundation with a broad stepped approach, two side wings, deeply carved corner pillars, many banners, lit braziers flanking the door, a carved memorial stone. Sixth: the greatest hall of the kingdom — enormous, dragon-head gables front and back, a gilded weathervane at the ridge, carved and painted panels along the whole wall, a colonnade of carved posts, a processional way lined with standing stones, braziers burning, gold glinting at the doors. Unmistakably the most impressive building anyone has.
>
> Consistent style across all six: soft painterly brushwork with visible brush strokes and canvas grain, a painted illustration and emphatically not a photograph — not photorealistic, not a 3D render, not cel-shaded anime, not vector flat. Muted cold Nordic palette of weathered timber brown, turf green, slate stone grey and bone white, soft diffuse light from the top left, consistent gentle shadows, warm firelight only at doorways and braziers. Each sprite clearly separated from the others with plain grey background between them. No horned helmets, no people, no fantasy creatures, no glowing runes, no text, no labels, no numbers, no UI frames, no borders.

### Storehouse — historyId `pzpIcmeqNcyigFaV60QM`
> Six game asset sprites on a plain flat mid-grey background, arranged as two rows of three, hand-painted 2D game art. All six are THE SAME Viking storehouse at six stages of growth, read left to right along the top row then left to right along the bottom row. Each is seen from above at a three-quarter angle, the camera tilted about 50 degrees down, the way a city view in a base-building game is drawn — the SAME angle and the SAME ground footprint for all six, growing in height and capacity rather than sprawling. Each stands directly on the grey background with only a soft dark contact shadow beneath it. IMPORTANT: no turf patch, no oval base, no grass mound, no ground plate, no island of earth under any building.
>
> TOP ROW. First: a small raised timber granary on four staddle stones, turf roof, a short ladder, one sack leaning against it. Second: the same larger, plank walls, a small loading porch, stacked barrels and two sacks. Third: a proper storehouse with a stone footing, shuttered loading hatch, a hoist beam jutting from the gable, barrels and crates stacked outside.
>
> BOTTOM ROW, and these must escalate hard. Fourth: a tall warehouse on a dressed-stone base, double doors banded with iron, a working hoist with rope and pulley, a cart being loaded, stacked crates under a lean-to. Fifth: a walled storage yard — the main building flanked by two lesser stores, an iron-bound strongroom door, a covered arcade of barrels, sacks of grain piled high, a tally post. Sixth: the great hoard-house of a wealthy jarl — a massive stone-founded warehouse with carved beam ends, three loading bays with hoists, an enclosed yard stacked with barrels, crates, furs and salt, a heavy iron-barred door, lanterns lit at the bays. Unmistakably a building that holds a fortune.
>
> Consistent style across all six: soft painterly brushwork with visible brush strokes and canvas grain, a painted illustration and emphatically not a photograph — not photorealistic, not a 3D render, not cel-shaded anime, not vector flat. Muted cold Nordic palette of weathered timber brown, turf green, slate stone grey and bone white, soft diffuse light from the top left, consistent gentle shadows, warm firelight only at doorways and lanterns. Each sprite clearly separated from the others with plain grey background between them. No horned helmets, no people, no fantasy creatures, no glowing runes, no text, no labels, no numbers, no UI frames, no borders.

## Still to generate — 25 kinds *(done; kept for the reasoning, not the status)*

> **Superseded 2026-09-13 (night).** All 25 were generated, and the table further down is the
> record. The list below is left in place only because the budget note under it is still live.

Quarry · Timber camp · Farm · Bog-iron pit · Hird hall (barracks) · Rune hall · Mead hall ·
Healer's hut · Bowyard (archery range) · Wolf Lodge (shield hall) · Beacon (watchtower) ·
Marketplace · Harbour · Naust (shipyard) · The Hoard (vault) · Family hall · Smithy (forge) ·
Thing stone · Rampart (wall) · Hof · Guest hall · Weaving house · Forest camp · Muster field ·
Hostage house.

Note the four production kinds already have three-tier sprites in the repo; six-tier sets replace
them, and all four of a kind still share one set (DEC-022), so plots never multiply the art.

**Art budget, corrected:** 27 kinds × 6 tiers = 162 sprites, against the 81 that three tiers would
need. `art-pipeline.md` was already corrected today from 21 buildings to 27; if six tiers are
confirmed, that file needs correcting again — this would double the building art.

## What happens next

> **Steps 1–3 are done** (2026-09-13, night). Step 4 is the one still open, and it is gated on Hawk.

1. ~~Hawk downloads the two sheets from https://openart.ai/my-creations into
   `apps/mobile/art/incoming/`.~~ Done, and then all 27.
2. ~~Judge the six-on-one-sheet framing.~~ Hawk judged the first two good and said "the whole lot".
3. ~~If yes, the remaining 25 are generated in one run against this same scaffolding.~~ Done.
4. `stage_for()` in `art.gd` and the Buildings row of `style-bible.md` both change from three bands
   to six — after Hawk settles the level cap. **Still open.**

---

# All 27 sheets — generated 2026-09-13 (night)

**All 27 completed, none failed.** 25 are in the project **Viking 4X — buildings**; the Longhouse
and Storehouse predate it and sit in the default project.

## Which sheet is which

OpenArt cannot name a file (see above), so **this table is the naming**. In `my-creations` the
sheets are newest first, which is the REVERSE of the order below — the Hostage house is the newest,
the Quarry the oldest of the twenty-five. Save each one under the name in the first column and the
problem goes away.

| Save as | Building | historyId |
|---|---|---|
| `longhouse_sheet.png` | Longhouse — DEFAULT project (generated before the project existed) | `2ZZpyK536JmrwhQm6lD2` |
| `storehouse_sheet.png` | Storehouse — DEFAULT project (same) | `pzpIcmeqNcyigFaV60QM` |
| `quarry_sheet.png` | Quarry | `TrAE60lbdJnHSgUscBP4` |
| `timber_camp_sheet.png` | Timber camp | `CIDeGfwIgkbyVlDtrExs` |
| `farm_sheet.png` | Farm | `QtrTPPRrleINo8ClAAoa` |
| `iron_pit_sheet.png` | Bog-iron pit | `zc9gStIAu7hEzAOvUyS4` |
| `barracks_sheet.png` | Hird hall (barracks) | `uQFD7Nol7Z0TSOSd7Pa2` |
| `rune_hall_sheet.png` | Rune hall | `wYQOAlPIs0i9jllrJC5q` |
| `mead_hall_sheet.png` | Mead hall | `ZWcjQIHoS9ysVcAyCkbC` |
| `healers_hut_sheet.png` | Healer's hut | `rUB2OlCjbk7tyXZsXXep` |
| `archery_range_sheet.png` | Bowyard (archery range) | `ubYRDV55oKQ9UroErMm2` |
| `shield_hall_sheet.png` | Wolf Lodge (shield hall) | `IQCim6VVmv9T4biYgrtF` |
| `watchtower_sheet.png` | Beacon (watchtower) | `kzpIyZeZA0aCaMDNLmS8` |
| `market_sheet.png` | Marketplace | `JglvRWNIf20kpJG5k2mI` |
| `harbour_sheet.png` | Harbour | `KM92BCrmgnVLtHaZw4D8` |
| `shipyard_sheet.png` | Naust (shipyard) | `ws1tQOyEZnxWenSDgqOh` |
| `vault_sheet.png` | The Hoard (vault) | `SxSyep539aTmPX7FnW6Q` |
| `family_hall_sheet.png` | Family hall | `VY6GyHUe6RLeoxxg7ivL` |
| `forge_sheet.png` | Smithy (forge) | `H5xnwVyfZiZ7A2aW6PqE` |
| `thing_stone_sheet.png` | Thing stone | `P7aYKuH7BZiGkj9gVMbN` |
| `wall_sheet.png` | Rampart (wall) | `6kg5XqQxI0vm4Nq9SWLx` |
| `hof_sheet.png` | Hof | `8wGgpieIbN8HOxZWy1br` |
| `guest_hall_sheet.png` | Guest hall | `7RHQ1nYISaycRcvsGkIt` |
| `weaving_house_sheet.png` | Weaving house | `hdGigCyy63w5EX3oyHIh` |
| `forest_camp_sheet.png` | Forest camp | `7XhH5fcGpwUG23Kn6pcT` |
| `muster_field_sheet.png` | Muster field | `GzkiOkNlxkjUSyNSHRfF` |
| `hostage_house_sheet.png` | Hostage house | `atgE5kBovCbNXCVgja9k` |

## Cutting them

One command per sheet, once they are in `apps/mobile/art/incoming/`:

```bash
python3 tools/cut_sprites.py apps/mobile/art/incoming/<kind>_sheet.png apps/mobile/art/buildings \
  --names <kind>_1 <kind>_2 <kind>_3 <kind>_4 <kind>_5 <kind>_6 \
  --rows 2 --per-row 3 --height 384 --holes --tol 16
```

That is where the sunburst name dies: nothing called `gpt-image-2.5-sunburst-N` ever reaches the
game, because the cut writes `longhouse_1.png` … `longhouse_6.png` into `art/buildings/`.

## What was actually cut and installed — 2026-09-13 (night)

**Measured**, by listing `apps/mobile/art/buildings/` on Hawk's machine after writing:
**156 sprites, 26 kinds × 6**, 33.1 MB. The Quarry is the one kind missing.

How the count got there, because none of it was obvious:

- Hawk downloaded **31 files**. Deduped by md5, that is **26 distinct sheets**: `(25)` was a byte
  copy of `(24)`, `A` of `(4)`, `L` of `(5)`. The letters he appended to some filenames were his own
  disambiguation, not anything OpenArt did.
- The sheets carry no usable names, so they were identified **by sight**: two contact sheets were
  built from the 26 and read against the building list. This worked — and it is worth knowing it is
  possible, because it contradicts the "Claude cannot see these images" note below. **The CDN is
  still blocked; a file staged from Hawk's machine is not.** Download, then look.
- 24 of the 26 cut cleanly with the standard command. **`storehouse` and `watchtower` found 5
  sprites, not 6** — a smoke plume bridged two columns, so the flood-fill treated them as one blob.
  Both were re-cut on a fixed grid instead of by hole detection. Anything that emits smoke, steam or
  a banner across a gap will do this again: **check the sprite count after every cut.**

**The Quarry.** It is not lost and does not need regenerating: it completed like the rest and is
sitting in Hawk's `my-creations` as historyId `TrAE60lbdJnHSgUscBP4`. It is simply the one sheet that
was never downloaded — the oldest of the twenty-five, at the bottom of the list. Claude cannot fetch
it (CDN blocked, and there is no shell on Hawk's machine this session). One download, then the
standard cut, and the set is 27.

Note `quarry_1.png`, `_2` and `_3` are still in `art/buildings/` from the old three-band batch. They
are the previous style and should be overwritten, not kept alongside.

## Before any of this is used

Two things still have to happen, and neither is art.

1. **`art.gd` `stage_for()` maps three bands, not six** (1–7, 8–14, 15–20), and `style-bible.md` says
   the same. Until both change, the game will only ever ask for stages 1, 2 and 3 — sheets 4, 5 and
   6 of every building would sit unused on disk. This is a two-line change but it is gated on the
   next item.
2. **The level cap.** `balance.ts` says `maxLevel: 20`. Hawk's ask assumed 30. Six visual tiers work
   either way — that was the point of generating tiers rather than levels — but somebody has to say
   where each tier begins before `stage_for()` can be written.

## Honest note on what was NOT checked

Claude generated all 27 without seeing any of them. The OpenArt CDN is blocked from the container
and the browser pane cannot reach it either. (**Partly superseded the same night:** once Hawk
downloaded them, the staged files *could* be viewed — see the cut record above. What follows was
true at generation time and remains true for anything not yet downloaded.) Every judgement about
whether the six-tier framing holds up — whether tiers 5 and 6 are impressive enough, whether all six still read as the same
building, whether detail survives at sprite size — is **unmade**. Hawk was told this before the run
and chose to proceed, which is a reasonable call with credits to spare; it is recorded here so that
nobody later mistakes "generated" for "approved".
