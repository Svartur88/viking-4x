extends Node
## Where art comes from, and what happens when it isn't there yet (art-pipeline.md).
##
## Assets land family by family over weeks. Rather than gate the client on a complete set, every
## lookup falls back to the grey box it replaced, so a half-finished art pass never breaks a screen
## and a newly dropped PNG appears the next time the game runs.

const TERRAIN_NAMES := ["land", "coast", "sea", "mountain"]   ## indexed by tile byte
const BUILDINGS := "res://art/buildings/"
const MARKERS := "res://art/markers/"
const TERRAIN := "res://art/terrain/"

var _cache: Dictionary = {}


func _load(path: String) -> Texture2D:
	if _cache.has(path):
		return _cache[path]
	var tex: Texture2D = null
	if ResourceLoader.exists(path):
		tex = ResourceLoader.load(path) as Texture2D
	_cache[path] = tex
	return tex


## Which of the three visual stages a level falls in (style-bible.md: 1-7, 8-14, 15-20).
func stage_for(level: int) -> int:
	if level >= 15:
		return 3
	return 2 if level >= 8 else 1


## The hall-view sprite for a building, or null if that family is not drawn yet.
func building(kind: String, level: int) -> Texture2D:
	var tex := _load("%s%s_%d.png" % [BUILDINGS, kind, stage_for(level)])
	if tex == null:                       # a family may ship stage 1 before the rest
		tex = _load("%s%s_1.png" % [BUILDINGS, kind])
	return tex


## The tiny top-down sprite for the world map. Never the hall-view building shrunk (DEC-012).
func marker(kind: String, level: int = 1) -> Texture2D:
	return _load("%s%s_%d.png" % [MARKERS, kind, stage_for(level)])


## A terrain material, indexed by the tile byte: 0 land, 1 coast, 2 sea, 3 mountain.
func terrain(tile: int) -> Texture2D:
	if tile < 0 or tile >= TERRAIN_NAMES.size():
		return null
	return _load("%s%s.png" % [TERRAIN, TERRAIN_NAMES[tile]])


func has_terrain() -> bool:
	for i in TERRAIN_NAMES.size():
		if terrain(i) == null:
			return false
	return true
