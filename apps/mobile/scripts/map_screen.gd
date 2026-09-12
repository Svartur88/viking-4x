extends Control
## World map v0 (P2.I03). Pan and zoom the kingdom, drawn from terrain chunks, with
## hall markers from the viewport endpoint and your own hall marked.
##
## Two data sources on purpose (map-model.md): terrain arrives as 64x64 chunks and is cached
## forever because it never changes, while occupants come from a bounded rectangle refetched
## as you pan. Drawing is a single _draw pass over visible tiles: no per-tile nodes, so panning
## stays cheap on a mid-range phone.

signal navigate(screen: String)
signal notify(message: String)

const CHUNK := 64
const MIN_ZOOM := 0.6      ## pixels per tile: far enough out to hold a 600-tile kingdom on a phone
const MAX_ZOOM := 48.0
const REFETCH_TILES := 8   ## refetch occupants once the view has moved this far

## Zoom bands (map.md, DEC-011). Each band is a different representation, not the same art resized.
const BAND_NEAR := 24.0    ## >= this: labels and full interaction
const BAND_KINGDOM := 8.0  ## < this: stop drawing tiles, draw the one rendered kingdom image
const FLY_DOWN_ZOOM := 16.0

var _camera := Vector2.ZERO      ## top-left of the view, in tiles
var _zoom := 12.0                ## pixels per tile
var _chunks: Dictionary = {}     ## "cx,cy" -> PackedByteArray
var _requested: Dictionary = {}  ## chunks already asked for
var _halls: Array = []           ## from the viewport endpoint
var _last_fetch_centre := Vector2(-9999, -9999)
var _dragging := false
var _drag_moved := 0.0
var _canvas: Control
var _status: Label

## Kingdom band: one immutable picture of the whole kingdom, plus the live layer over it.
var _overview: ImageTexture = null
var _overview_asked := false
var _kingdom_size := 600
var _kingdom_halls: Array = []
var _kingdom_asked_at := -1000.0   ## "never asked": a plain 0 would suppress the first fetch
var _want_whole := false   ## re-frame once we learn the real kingdom size


func _in_kingdom_band() -> bool:
	return _zoom < BAND_KINGDOM


func _ready() -> void:
	_canvas = Control.new()
	_canvas.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_canvas.draw.connect(_draw_map)
	add_child(_canvas)

	var overlay := VBoxContainer.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	overlay.offset_left = Tokens.PAD
	overlay.offset_top = Tokens.PAD
	add_child(overlay)
	_status = Tokens.label("", 22, Tokens.BONE)
	overlay.add_child(_status)

	var home := Tokens.button("My hall", false)
	home.custom_minimum_size = Vector2(220, Tokens.TOUCH)
	home.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_RIGHT)
	home.offset_left = -220 - Tokens.PAD
	home.offset_top = -Tokens.TOUCH - Tokens.PAD
	home.offset_right = -Tokens.PAD
	home.offset_bottom = -Tokens.PAD
	home.pressed.connect(_centre_on_hall)
	add_child(home)

	var whole := Tokens.button("Whole kingdom", false)
	whole.custom_minimum_size = Vector2(280, Tokens.TOUCH)
	whole.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	whole.offset_left = Tokens.PAD
	whole.offset_top = -Tokens.TOUCH - Tokens.PAD
	whole.offset_right = Tokens.PAD + 280
	whole.offset_bottom = -Tokens.PAD
	whole.pressed.connect(_show_whole_kingdom)
	add_child(whole)

	_centre_on_hall()


func _centre_on_hall() -> void:
	var hx := float(Session.hall.get("x", 300))
	var hy := float(Session.hall.get("y", 300))
	_camera = Vector2(hx, hy) - (size / _zoom) * 0.5
	_after_move(true)


func _tiles_across() -> Vector2:
	return size / _zoom


func _after_move(force: bool = false) -> void:
	if _in_kingdom_band():
		# Nothing per-tile is drawn out here, so ask for nothing per-tile.
		_ensure_overview()
		_canvas.queue_redraw()
		return
	_request_visible_chunks()
	var centre := _camera + _tiles_across() * 0.5
	if force or centre.distance_to(_last_fetch_centre) > REFETCH_TILES:
		_last_fetch_centre = centre
		_fetch_viewport(centre)
	_canvas.queue_redraw()


## Pull all the way out to see the island whole.
func _show_whole_kingdom() -> void:
	_want_whole = true
	_ensure_overview()
	_frame_whole_kingdom()
	_after_move(true)


## Fit the whole kingdom in the viewport with a small margin. Called again when the real
## kingdom size arrives, because until then we are only guessing at how big the island is.
func _frame_whole_kingdom() -> void:
	var fit: float = minf(size.x, size.y) * 0.92 / float(maxi(_kingdom_size, 1))
	_zoom = clampf(fit, MIN_ZOOM, MAX_ZOOM)
	_camera = Vector2(_kingdom_size, _kingdom_size) * 0.5 - _tiles_across() * 0.5


## The picture never changes, so it is fetched once per run and kept. The markers over it do
## change, so they are refreshed on a slow cadence while the band is open.
func _ensure_overview() -> void:
	if not _overview_asked:
		_overview_asked = true
		_fetch_overview_image()
	if Time.get_ticks_msec() / 1000.0 - _kingdom_asked_at > 20.0:
		_kingdom_asked_at = Time.get_ticks_msec() / 1000.0
		_fetch_overview_markers()


func _fetch_overview_image() -> void:
	var bytes := await Api.get_bytes("/v1/map/overview.png")
	if bytes.is_empty():
		_overview_asked = false          # let a later pan retry
		return
	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK:
		return
	_kingdom_size = image.get_width()
	_overview = ImageTexture.create_from_image(image)
	if _want_whole:
		_frame_whole_kingdom()
	if is_inside_tree():
		_canvas.queue_redraw()


func _fetch_overview_markers() -> void:
	var r: Api.Result = await Api.get_json("/v1/map/overview")
	if not r.ok:
		return
	_kingdom_size = int(r.data.get("size", _kingdom_size))
	_kingdom_halls = r.data.get("halls", [])
	if _want_whole:
		_frame_whole_kingdom()
	if is_inside_tree():
		_canvas.queue_redraw()


func _request_visible_chunks() -> void:
	var across := _tiles_across()
	var cx0 := int(floor(_camera.x / CHUNK))
	var cy0 := int(floor(_camera.y / CHUNK))
	var cx1 := int(floor((_camera.x + across.x) / CHUNK))
	var cy1 := int(floor((_camera.y + across.y) / CHUNK))
	for cy in range(cy0, cy1 + 1):
		for cx in range(cx0, cx1 + 1):
			if cx < 0 or cy < 0:
				continue
			var key := "%d,%d" % [cx, cy]
			if _requested.has(key):
				continue
			_requested[key] = true
			_fetch_chunk(cx, cy, key)


func _fetch_chunk(cx: int, cy: int, key: String) -> void:
	var r: Api.Result = await Api.get_json("/v1/map/chunk?cx=%d&cy=%d" % [cx, cy])
	if not r.ok:
		_requested.erase(key)   # out of bounds or offline: allow a later retry
		return
	var bytes := Marshalls.base64_to_raw(str(r.data.get("tiles", "")))
	_chunks[key] = {"w": int(r.data.get("w", CHUNK)), "h": int(r.data.get("h", CHUNK)), "tiles": bytes}
	if is_inside_tree():
		_canvas.queue_redraw()


func _fetch_viewport(centre: Vector2) -> void:
	# The server caps a viewport at 64 tiles a side, so never ask for more.
	var half: int = mini(31, int(_tiles_across().x * 0.5) + 2)
	var x0: int = int(centre.x) - half
	var y0: int = int(centre.y) - half
	var query := "/v1/map/viewport?x0=%d&y0=%d&x1=%d&y1=%d" % [x0, y0, x0 + half * 2, y0 + half * 2]
	var r: Api.Result = await Api.get_json(query)
	if not r.ok:
		if r.code == "NO_CONNECTION":
			notify.emit("Cannot reach the server.")
		return
	_halls = r.data.get("halls", [])
	if is_inside_tree():
		_canvas.queue_redraw()


func _terrain_at(x: int, y: int) -> int:
	var key := "%d,%d" % [x / CHUNK, y / CHUNK]
	if not _chunks.has(key):
		return -1
	var chunk: Dictionary = _chunks[key]
	var lx := x % CHUNK
	var ly := y % CHUNK
	if lx >= int(chunk["w"]) or ly >= int(chunk["h"]):
		return -1
	var tiles: PackedByteArray = chunk["tiles"]
	var i := ly * int(chunk["w"]) + lx
	return tiles[i] if i < tiles.size() else -1


func _draw_map() -> void:
	if _in_kingdom_band():
		_draw_kingdom()
		return
	var across := _tiles_across()
	var x0 := int(floor(_camera.x))
	var y0 := int(floor(_camera.y))
	var x1 := int(ceil(_camera.x + across.x))
	var y1 := int(ceil(_camera.y + across.y))
	_canvas.draw_rect(Rect2(Vector2.ZERO, size), Tokens.INK)

	for y in range(y0, y1):
		for x in range(x0, x1):
			var t := _terrain_at(x, y)
			if t < 0:
				continue
			var pos := (Vector2(x, y) - _camera) * _zoom
			_canvas.draw_rect(Rect2(pos, Vector2(_zoom, _zoom) + Vector2.ONE), Tokens.TERRAIN[t])

	var mine := str(Session.hall.get("id", ""))
	for h: Dictionary in _halls:
		var pos := (Vector2(float(h.get("x", 0)), float(h.get("y", 0))) - _camera) * _zoom
		var own := str(h.get("hall_id", "")) == mine
		var marker := Vector2(_zoom, _zoom)
		_canvas.draw_rect(Rect2(pos, marker), Tokens.GOLD if own else Tokens.TIMBER)
		var edge: Color = Tokens.BONE if own else Tokens.IRON
		_canvas.draw_rect(Rect2(pos, marker), edge, false, maxf(1.0, _zoom * 0.08))
		if bool(h.get("shielded", false)) and _zoom >= 8.0:
			var ring := Rect2(pos - Vector2.ONE * 2, marker + Vector2.ONE * 4)
			_canvas.draw_rect(ring, Tokens.RUNE, false, 2.0)
		if _zoom >= 16.0:
			var font := ThemeDB.fallback_font
			var at := pos + Vector2(0, -4)
			var who := str(h.get("name", ""))
			_canvas.draw_string(font, at, who, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Tokens.BONE)

	var band := "near" if _zoom >= BAND_NEAR else "mid"
	_status.text = "%d, %d   ·   %d halls in view   ·   %s" % [
		int(_camera.x + across.x * 0.5), int(_camera.y + across.y * 0.5), _halls.size(), band]


## Kingdom band: the rendered island, with the live layer painted over it. Nothing here is
## tappable except "fly back down" — a hall is one pixel wide out here, and a mis-tap at this
## zoom would send an army to the wrong place.
func _draw_kingdom() -> void:
	_canvas.draw_rect(Rect2(Vector2.ZERO, size), Tokens.INK)
	if _overview == null:
		var font := ThemeDB.fallback_font
		_canvas.draw_string(font, size * 0.5 - Vector2(80, 0), "drawing the kingdom…",
			HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Tokens.TIMBER_LIGHT)
		_status.text = "kingdom view"
		return

	var origin := -_camera * _zoom
	var extent := Vector2(_kingdom_size, _kingdom_size) * _zoom
	_canvas.draw_texture_rect(_overview, Rect2(origin, extent), false)
	_canvas.draw_rect(Rect2(origin, extent), Tokens.TIMBER, false, 2.0)

	var mine := str(Session.hall.get("id", ""))
	for h: Dictionary in _kingdom_halls:
		var at := origin + Vector2(float(h.get("x", 0)), float(h.get("y", 0))) * _zoom
		var own := str(h.get("hall_id", "")) == mine
		if own:
			# Your own hall is findable at any distance: a ring, not a dot.
			_canvas.draw_circle(at, 7.0, Tokens.GOLD)
			_canvas.draw_arc(at, 12.0, 0.0, TAU, 24, Tokens.BONE, 2.0)
		else:
			_canvas.draw_rect(Rect2(at - Vector2.ONE, Vector2(2, 2)), Tokens.TIMBER_LIGHT)

	_status.text = "kingdom view   ·   %d halls   ·   tap to fly down" % _kingdom_halls.size()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
			_zoom_at(mb.position, 1.15)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
			_zoom_at(mb.position, 1.0 / 1.15)
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			_dragging = mb.pressed
			if mb.pressed:
				_drag_moved = 0.0
			elif _drag_moved < 8.0:
				_tap(mb.position)
	elif event is InputEventMouseMotion and _dragging:
		var mm := event as InputEventMouseMotion
		_drag_moved += mm.relative.length()
		_camera -= mm.relative / _zoom
		_clamp_camera()
		_after_move()
	elif event is InputEventMagnifyGesture:
		_zoom_at(size * 0.5, (event as InputEventMagnifyGesture).factor)


func _zoom_at(focus: Vector2, factor: float) -> void:
	_want_whole = false
	var before := _camera + focus / _zoom
	_zoom = clamp(_zoom * factor, MIN_ZOOM, MAX_ZOOM)
	_camera = before - focus / _zoom
	_clamp_camera()
	_after_move()


func _clamp_camera() -> void:
	_camera.x = max(0.0, _camera.x)
	_camera.y = max(0.0, _camera.y)


func _tap(at: Vector2) -> void:
	var tile := (_camera + at / _zoom).floor()
	if _in_kingdom_band():
		# Fly back down to the mid band, centred where the thumb landed.
		_want_whole = false
		_zoom = FLY_DOWN_ZOOM
		_camera = tile - _tiles_across() * 0.5
		_clamp_camera()
		_after_move(true)
		return
	for h: Dictionary in _halls:
		if int(h.get("x", -1)) == int(tile.x) and int(h.get("y", -1)) == int(tile.y):
			var who := str(h.get("name", "a jarl"))
			var shield := " · under starter shield" if bool(h.get("shielded", false)) else ""
			notify.emit("%s, Longhouse %d%s" % [who, int(h.get("level", 1)), shield])
			return
