# Sample assets

The three direction-A proofs generated on 2026-09-12 live in Hawk's OpenArt account
(prompts, model and settings: `../prompts/samples-2026-09-12.md`).

They are **not** committed here yet: Claude's sandbox cannot reach the OpenArt CDN to
download them. To land them, download the three PNGs from OpenArt and save them here as:

- `terrain-coast.png` — the coastline chart tile
- `longhouse-stages.png` — Longhouse at stages 1, 2, 3
- `bloodline-portraits.png` — father, mother, daughter

Once they are in this folder they become the reference every later asset is matched against,
and the first real art in the game replaces the grey boxes in `scripts/city_screen.gd`
and `scripts/map_screen.gd`.
