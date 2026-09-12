#!/usr/bin/env python3
"""
Cut a generated material sheet (an even grid of square patches) into square textures.

    python3 tools/cut_grid.py sheet.png out_dir --cols 3 --rows 2 \
        --names sea shallow coast land upland mountain --size 256

Unlike cut_sprites.py there is no alpha here: these are ground materials that fill a tile.
Each cell is inset slightly before cropping, because the generator draws a dark gutter between
patches and a sliver of it repeated across a map reads as a grid of black seams.
"""
from __future__ import annotations

import argparse
import os

from PIL import Image


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("out_dir")
    ap.add_argument("--cols", type=int, required=True)
    ap.add_argument("--rows", type=int, required=True)
    ap.add_argument("--names", nargs="+", required=True, help="names in reading order")
    ap.add_argument("--size", type=int, default=256, help="output tile size in px")
    ap.add_argument("--inset", type=float, default=0.04,
                    help="fraction of each cell trimmed off every side, to lose the gutter")
    a = ap.parse_args()

    if len(a.names) != a.cols * a.rows:
        raise SystemExit(f"expected {a.cols * a.rows} names, got {len(a.names)}")

    img = Image.open(a.sheet).convert("RGB")
    cw, ch = img.width / a.cols, img.height / a.rows
    inset_x, inset_y = cw * a.inset, ch * a.inset

    os.makedirs(a.out_dir, exist_ok=True)
    for i, name in enumerate(a.names):
        r, c = divmod(i, a.cols)
        box = (round(c * cw + inset_x), round(r * ch + inset_y),
               round((c + 1) * cw - inset_x), round((r + 1) * ch - inset_y))
        cell = img.crop(box)
        # Square it off from the centre before scaling, so nothing is stretched.
        side = min(cell.width, cell.height)
        left, top = (cell.width - side) // 2, (cell.height - side) // 2
        cell = cell.crop((left, top, left + side, top + side)).resize((a.size, a.size), Image.LANCZOS)
        path = os.path.join(a.out_dir, f"{name}.png")
        cell.save(path)
        print(f"{path}  {a.size}x{a.size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
