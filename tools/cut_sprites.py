#!/usr/bin/env python3
"""
Cut generated sprite sheets into individual PNGs with alpha (art-pipeline.md).

The generator gives us several sprites on one flat background. This finds them, removes the
background, trims each to its own bounds, and writes them out at a target height so a family
stays visually consistent. Run it again on a regenerated sheet and the outputs stay comparable.

    python3 tools/cut_sprites.py sheet.png out_dir --names farm_1 farm_2 farm_3 --rows 2

Background detection: the sheet's corner colour, with a tolerance. Anything within tolerance of
it that is reachable from the edge becomes transparent, so enclosed grey (a stone path, say)
survives. Deliberately simple; it is easier to reshoot a sheet than to tune a matting algorithm.
"""
from __future__ import annotations

import argparse
import sys
from collections import deque

import numpy as np
from PIL import Image


def flood_background(rgb: np.ndarray, bg: np.ndarray, tol: int) -> np.ndarray:
    """True where a pixel is background reachable from the image edge."""
    h, w, _ = rgb.shape
    close = (np.abs(rgb.astype(np.int16) - bg.astype(np.int16)).max(axis=2) <= tol)
    seen = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen


def split_at_minima(mask: np.ndarray, count: int) -> list[tuple[int, int]]:
    """Split a row band into `count` sprites at the emptiest columns.

    Painted sprites have soft shadows that bleed into each other, so a sheet often has no truly
    empty column between them. Cutting at the sparsest columns works where gap-hunting fails.
    """
    weight = mask.sum(axis=0).astype(float)
    w = weight.size
    kernel = max(3, w // 200)
    smooth = np.convolve(weight, np.ones(kernel) / kernel, mode="same")
    min_sep = w // (count * 3)
    cuts: list[int] = []
    for _ in range(count - 1):
        candidate, best = None, None
        for x in range(min_sep, w - min_sep):
            if any(abs(x - c) < min_sep for c in cuts):
                continue
            if best is None or smooth[x] < best:
                best, candidate = smooth[x], x
        if candidate is None:
            break
        cuts.append(candidate)
    bounds = [0, *sorted(cuts), w]
    return [(bounds[i], bounds[i + 1]) for i in range(len(bounds) - 1)]


def columns_of_grid(mask: np.ndarray, count: int) -> list[tuple[int, int]]:
    """Split a row band into `count` equal columns, ignoring the content entirely.

    The fallback for when detection fails, and it does fail: on 2026-09-13 the storehouse and
    watchtower sheets returned five sprites instead of six because a smoke plume drifted from one
    sprite across the gap into the next, so the flood fill read two sprites as one blob and
    `split_at_minima` put a cut inside a building rather than between two.

    It works because the generator lays six sprites out on an even grid, which is the one thing
    about these sheets that is reliable. Each cell is still trimmed to its own content afterwards,
    so a sprite narrower than its cell does not gain padding — only the SPLIT is fixed, not the
    bounds. The cost is that anything genuinely crossing a cell boundary gets clipped, which is
    why this is opt-in rather than the default.
    """
    w = mask.shape[1]
    edges = [round(i * w / count) for i in range(count + 1)]
    return [(edges[i], edges[i + 1]) for i in range(count)]


def columns_of_content(mask: np.ndarray, min_gap: int) -> list[tuple[int, int]]:
    """Split a row band into sprite columns by looking for empty vertical gaps."""
    cols = mask.any(axis=0)
    spans, start = [], None
    gap = 0
    for x, filled in enumerate(cols):
        if filled:
            if start is None:
                start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                spans.append((start, x - gap + 1))
                start = None
    if start is not None:
        spans.append((start, len(cols)))
    return spans


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("out_dir")
    ap.add_argument("--names", nargs="+", required=True, help="output names in reading order")
    ap.add_argument("--rows", type=int, default=1)
    ap.add_argument("--tol", type=int, default=26, help="background colour tolerance")
    ap.add_argument("--holes", action="store_true",
                    help="also clear background-coloured areas enclosed by the sprite (a gap under "
                         "a hoist, say). Use a tighter --tol with this so grey stone survives.")
    ap.add_argument("--height", type=int, default=512,
                    help="height in px of the TALLEST sprite on the sheet; the rest keep their "
                         "relative size, because a stage-1 hut must stay smaller than a stage-3 hall")
    ap.add_argument("--min-gap", type=int, default=12, help="empty columns that separate sprites")
    ap.add_argument("--per-row", type=int, default=0,
                    help="sprites per row; splits at density minima instead of empty gaps "
                         "(use for painted sheets whose shadows touch)")
    ap.add_argument("--trim-strays", action="store_true",
                    help="keep only the largest contiguous band of content in each cell. Use when a "
                         "cut comes back with a fragment of the NEXT ROW attached: rows are split at "
                         "a fixed height, so a tall sprite in row 2 can poke above the line and ride "
                         "along in row 1's cell. Harmless-looking, and it shifts the sprite's bounds "
                         "so it scales wrong.")
    ap.add_argument("--grid", action="store_true",
                    help="with --per-row: split each row into equal columns rather than detecting "
                         "where the sprites are. Use when a cut comes back short — smoke, steam or "
                         "a banner crossing the gap merges two sprites into one. Each cell is still "
                         "trimmed to its own content.")
    a = ap.parse_args()
    if a.grid and not a.per_row:
        ap.error("--grid needs --per-row to know how many columns to cut")

    img = Image.open(a.sheet).convert("RGB")
    rgb = np.asarray(img)
    h, w, _ = rgb.shape
    bg = rgb[2, 2]
    background = flood_background(rgb, bg, a.tol)
    if a.holes:
        background |= (np.abs(rgb.astype(np.int16) - bg.astype(np.int16)).max(axis=2) <= a.tol)
    content = ~background

    out: list[tuple[str, Image.Image]] = []
    band = h // a.rows
    idx = 0
    for r in range(a.rows):
        y0, y1 = r * band, (r + 1) * band
        row_mask = content[y0:y1]
        if a.grid:
            spans = columns_of_grid(row_mask, a.per_row)
        elif a.per_row:
            spans = split_at_minima(row_mask, a.per_row)
        else:
            spans = columns_of_content(row_mask, a.min_gap)
        for x0, x1 in spans:
            if idx >= len(a.names):
                print(f"warning: found more sprites than names ({idx + 1} > {len(a.names)})", file=sys.stderr)
                break
            sub = row_mask[:, x0:x1]
            ys = np.where(sub.any(axis=1))[0]
            if ys.size > 0 and a.trim_strays:
                # Keep the densest contiguous run of rows and drop anything detached from it.
                runs, start = [], ys[0]
                for i in range(1, ys.size):
                    if ys[i] != ys[i - 1] + 1:
                        runs.append((start, ys[i - 1]))
                        start = ys[i]
                runs.append((start, ys[-1]))
                if len(runs) > 1:
                    best = max(runs, key=lambda r: sub[r[0]:r[1] + 1].sum())
                    dropped = sum(1 for r in runs if r is not best)
                    print(f"  {a.names[idx]}: dropped {dropped} stray fragment(s)", file=sys.stderr)
                    ys = np.arange(best[0], best[1] + 1)
            if ys.size == 0:
                # An empty span means the split went wrong, not that a sprite is missing. Say which
                # name went unwritten and skip it — silently falling through here would slide every
                # later sprite one name to the left, which is worse than a short run.
                print(f"warning: no content in the span for '{a.names[idx]}'; skipping it",
                      file=sys.stderr)
                idx += 1
                continue
            top, bottom = y0 + ys[0], y0 + ys[-1] + 1
            rgba = np.dstack([rgb[top:bottom, x0:x1], (content[top:bottom, x0:x1] * 255).astype(np.uint8)])
            out.append((a.names[idx], Image.fromarray(rgba, "RGBA")))
            idx += 1

    # Count what was actually cut, not how far the name list was walked: a skipped empty span
    # advances idx so the names stay aligned, and must still fail the run.
    if len(out) < len(a.names):
        print(f"warning: found {len(out)} sprites, expected {len(a.names)}", file=sys.stderr)
        print("  a short count usually means two sprites merged — try --grid", file=sys.stderr)

    # One scale factor for the whole sheet, so relative sizes survive the cut.
    if out:
        tallest = max(sprite.height for _, sprite in out)
        scale = a.height / tallest
        out = [(name, sprite.resize((max(1, round(sprite.width * scale)),
                                     max(1, round(sprite.height * scale))), Image.LANCZOS))
               for name, sprite in out]

    import os
    os.makedirs(a.out_dir, exist_ok=True)
    for name, sprite in out:
        path = os.path.join(a.out_dir, f"{name}.png")
        sprite.save(path)
        print(f"{path}  {sprite.width}x{sprite.height}")
    return 0 if len(out) == len(a.names) else 1


if __name__ == "__main__":
    raise SystemExit(main())
