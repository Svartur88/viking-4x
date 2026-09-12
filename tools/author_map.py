#!/usr/bin/env python3
"""
Author the kingdom map. PARKED 2026-09-12 — not wired into the game.

The research decision stands (DEC-013): the genre ships one authored layout for every kingdom
rather than generating terrain per server, so when the real map arrives it will be a file like the
one this writes, not a runtime generator. But the MVP does not need a beautiful coastline to prove
the game works, and tuning one was a detour. The server still uses the flat placeholder island from
`kingdom/service.ts`; swapping in a real map later is one file and one loader.

What this produces is valid — it passes the map.md checks — but it does not yet look good: mountain
ridges follow lines of equal distance from the coast, so they read as concentric rings rather than
ranges. If you pick this up again, that is the thing to fix first: grow ridges along a few chosen
spines instead of banding a distance field.

Two outputs, because the map is two artefacts:
  - `kingdom.terrain`  one byte per tile (0 land, 1 coast, 2 sea, 3 mountain) — the truth the
    server places halls and ships against.
  - `kingdom-guide.png` a flat colour-coded picture of the same thing, to drop into a painting
    tool as a background layer, and to eyeball.

It also checks the map against the rules in map.md and prints the numbers, because a pretty
coastline with 40 valid hall sites is a broken map.

    python3 tools/author_map.py --seed 7 --size 600 --out apps/server/assets
"""
from __future__ import annotations

import argparse
from collections import deque

import numpy as np
from PIL import Image

LAND, COAST, SEA, MOUNTAIN, LAKE = 0, 1, 2, 3, 4

# Matches the client's Tokens.TERRAIN so the guide image reads like the game.
GUIDE_COLOURS = {
    LAND: (0x3C, 0x4F, 0x33),
    COAST: (0xC8, 0xB8, 0x92),
    SEA: (0x1E, 0x2F, 0x3F),
    MOUNTAIN: (0xD9, 0xDE, 0xE2),
    LAKE: (0x2C, 0x4A, 0x5E),
}


def value_noise(size: int, rng: np.random.Generator, octaves: int = 6) -> np.ndarray:
    """Layered smooth noise in [0,1]. Cheap, and good enough for a coastline we then hand-tune."""
    field = np.zeros((size, size), dtype=np.float64)
    amplitude, total = 1.0, 0.0
    for octave in range(octaves):
        cells = 2 ** (octave + 2)
        grid = rng.random((cells + 1, cells + 1))
        # Bilinear upsample to full size.
        ys = np.linspace(0, cells, size)
        xs = np.linspace(0, cells, size)
        y0 = np.floor(ys).astype(int); x0 = np.floor(xs).astype(int)
        y1 = np.minimum(y0 + 1, cells); x1 = np.minimum(x0 + 1, cells)
        fy = (ys - y0)[:, None]; fx = (xs - x0)[None, :]
        # Smoothstep makes the interpolation look organic rather than diamond-shaped.
        fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
        top = grid[np.ix_(y0, x0)] * (1 - fx) + grid[np.ix_(y0, x1)] * fx
        bottom = grid[np.ix_(y1, x0)] * (1 - fx) + grid[np.ix_(y1, x1)] * fx
        field += amplitude * (top * (1 - fy) + bottom * fy)
        total += amplitude
        amplitude *= 0.5
    return field / total


def radial_falloff(size: int, rim: float = 0.14) -> np.ndarray:
    """Drown the edges so the kingdom is an island ringed by sea, never a cropped continent.

    `rim` is the fraction of the half-width that is forced under water at the border. Without a
    hard rim the landmass runs off the edge and the sea stops reading as a frontier.
    """
    ax = np.linspace(-1.0, 1.0, size)
    gx, gy = np.meshgrid(ax, ax)
    # Euclidean, not Chebyshev: a square distance makes a square island, which looks manufactured.
    d = np.clip(np.sqrt(gx ** 2 + gy ** 2), 0.0, 1.4142)
    inner, outer = 0.62, 1.0 - rim * 0.5
    t = np.clip((d - inner) / (outer - inner), 0.0, 1.0)
    return 0.5 - t * t * (3 - 2 * t) * 1.6          # mild in the middle, firmly drowned at the rim


def zone_rings(size: int, land: np.ndarray) -> np.ndarray:
    """Distance from the coast, normalised — the spine of the zone layout (map.md rule 4).

    Zone 1 is the lowland within reach of the sea, Zone 3 the heartland, Zone 2 between them.
    Returning the raw distance lets the caller put mountain ridges on the boundaries.
    """
    from collections import deque as _dq
    dist = np.full((size, size), -1, dtype=np.int32)
    q: _dq[tuple[int, int]] = _dq()
    for y in range(size):
        for x in range(size):
            if not land[y, x]:
                dist[y, x] = 0
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < size and 0 <= nx < size and dist[ny, nx] < 0:
                dist[ny, nx] = dist[y, x] + 1
                q.append((ny, nx))
    inland = dist[land]
    return dist / max(1, inland.max())


def largest_component(mask: np.ndarray) -> np.ndarray:
    """Keep only the biggest connected blob of True (4-connected)."""
    size = mask.shape[0]
    seen = np.zeros_like(mask, dtype=bool)
    best: list[tuple[int, int]] = []
    for sy in range(size):
        for sx in range(size):
            if not mask[sy, sx] or seen[sy, sx]:
                continue
            blob, q = [], deque([(sy, sx)])
            seen[sy, sx] = True
            while q:
                y, x = q.popleft()
                blob.append((y, x))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < size and 0 <= nx < size and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if len(blob) > len(best):
                best = blob
    out = np.zeros_like(mask)
    for y, x in best:
        out[y, x] = True
    return out


def add_islands(land: np.ndarray, rng: np.random.Generator, count: int, radius: int) -> None:
    """Drop a few offshore islands into open water — the sea needs somewhere worth sailing to.

    Islands are solid with a rough edge, not speckle: a scatter of loose pixels reads as noise on
    the map and cannot hold a hold or a harbour.
    """
    size = land.shape[0]
    placed = 0
    for _ in range(6000):
        if placed >= count:
            break
        cy, cx = rng.integers(radius * 3, size - radius * 3, 2)
        if land[cy - radius * 4:cy + radius * 4, cx - radius * 4:cx + radius * 4].any():
            continue                                   # keep clear of the mainland
        r = radius + int(rng.integers(-radius // 4, radius // 3 + 1))
        ys, xs = np.ogrid[-r:r + 1, -r:r + 1]
        angle = np.arctan2(ys, xs)
        # A radius that varies with angle: an island shape rather than a coin.
        lobes = 1.0 + 0.22 * np.sin(angle * 3 + rng.random() * 6.3) \
                    + 0.14 * np.sin(angle * 5 + rng.random() * 6.3)
        blob = (xs ** 2 + ys ** 2) <= (r * lobes) ** 2
        land[cy - r:cy + r + 1, cx - r:cx + r + 1] |= blob
        placed += 1


def build(size: int, seed: int, sea_fraction: float, mountain_fraction: float,
          passes: int = 8) -> np.ndarray:
    rng = np.random.default_rng(seed)
    # Noise leads and the falloff only trims the rim, so the coastline stays organic.
    height = value_noise(size, rng) * 1.0 + radial_falloff(size) * 0.55
    height = (height - height.min()) / (height.max() - height.min())

    sea_level = float(np.quantile(height, sea_fraction))
    land = height > sea_level
    land = largest_component(land)
    add_islands(land, rng, count=3, radius=max(8, size // 45))

    tiles = np.full((size, size), SEA, dtype=np.uint8)
    tiles[land] = LAND

    # Mountains are ridges on the zone boundaries, not blobs in the middle: they are the thing
    # that makes Zone 2 and Zone 3 feel earned, and the passes through them are the gates
    # (map.md rule 4, and the genre's standard structure).
    depth = zone_rings(size, land)
    ridge_noise = value_noise(size, np.random.default_rng(seed + 1000))
    # Warp the distance field before banding, or the ridges are just offset copies of the coastline
    # and the map looks like a contour diagram.
    warped = depth + (ridge_noise - 0.5) * 0.34
    for boundary in (0.34, 0.66):
        band = np.abs(warped - boundary) < (0.011 + 0.015 * ridge_noise)
        tiles[land & band] = MOUNTAIN

    # Cut gaps in the ridges — a wall with no door makes Zone 3 unreachable.
    ridge = tiles == MOUNTAIN
    ys, xs = np.nonzero(ridge)
    if ys.size:
        for _ in range(passes):
            i = int(rng.integers(0, ys.size))
            py, px = int(ys[i]), int(xs[i])
            r = max(3, size // 120)
            y0, y1 = max(0, py - r), min(size, py + r + 1)
            x0, x1 = max(0, px - r), min(size, px + r + 1)
            patch = tiles[y0:y1, x0:x1]
            patch[patch == MOUNTAIN] = LAND

    # Enclosed water is a lake, not ocean: pretty, but no longship should ever be sailing in it.
    ocean = largest_component(tiles == SEA)
    tiles[(tiles == SEA) & ~ocean] = LAKE

    # Coast: land touching the ocean (8-neighbour). Lakeshore is not coast — no harbours on a lake.
    touching = np.zeros_like(ocean)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            touching |= np.roll(np.roll(ocean, dy, axis=0), dx, axis=1)
    tiles[(tiles == LAND) & touching] = COAST
    return tiles


def hall_sites(tiles: np.ndarray) -> int:
    """Plain land with a one-tile clear ring — what sign-up placement needs (map.md rule 5)."""
    plain = tiles == LAND
    ok = plain.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            ok &= np.roll(np.roll(plain, dy, axis=0), dx, axis=1)
    return int(ok.sum())


def sea_is_connected(tiles: np.ndarray) -> bool:
    """The ocean must be one body, or a longship can be marooned. Lakes are excluded by design."""
    sea = tiles == SEA
    size = tiles.shape[0]
    start = (0, 0)
    if not sea[start]:
        return False
    seen = np.zeros_like(sea)
    seen[start] = True
    q = deque([start])
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < size and 0 <= nx < size and sea[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return int(seen.sum()) == int(sea.sum())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=600)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--sea", type=float, default=0.40, help="fraction of the map that is open sea")
    ap.add_argument("--mountain", type=float, default=0.05)
    ap.add_argument("--out", default="apps/server/assets")
    ap.add_argument("--guide-scale", type=int, default=1, help="pixels per tile in the guide image")
    a = ap.parse_args()

    tiles = build(a.size, a.seed, a.sea, a.mountain)

    counts = {name: int((tiles == v).sum()) for name, v in
              (("land", LAND), ("coast", COAST), ("sea", SEA), ("mountain", MOUNTAIN), ("lake", LAKE))}
    total = a.size * a.size
    sites = hall_sites(tiles)
    connected = sea_is_connected(tiles)

    print(f"seed {a.seed}, {a.size}x{a.size}")
    for name, n in counts.items():
        print(f"  {name:9s} {n:7d}  {100 * n / total:5.1f}%")
    print(f"  hall sites with a clear ring: {sites}   (need >= 300)")
    print(f"  sea fully connected: {connected}")
    if sites < 300 or not connected:
        print("  FAILS the map.md checks — try another seed")

    import os
    os.makedirs(a.out, exist_ok=True)
    terrain_path = os.path.join(a.out, "kingdom.terrain")
    with open(terrain_path, "wb") as f:
        f.write(tiles.tobytes())
    print(f"wrote {terrain_path}  ({tiles.size} bytes)")

    rgb = np.zeros((a.size, a.size, 3), dtype=np.uint8)
    for v, colour in GUIDE_COLOURS.items():
        rgb[tiles == v] = colour
    guide = Image.fromarray(rgb, "RGB")
    if a.guide_scale > 1:
        guide = guide.resize((a.size * a.guide_scale,) * 2, Image.NEAREST)
    guide_path = os.path.join(a.out, "kingdom-guide.png")
    guide.save(guide_path)
    print(f"wrote {guide_path}  {guide.width}x{guide.height}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
