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

## Ground detail belongs to the Near band only (DEC-011). Zoomed out, a photographic material
## squeezed into twelve pixels a tile reads as either a repeating grid or as static, and neither
## helps you find anything — so Mid uses the flat token colours, which stay legible. Close in, each
## tile shows one window of the material, marching in order so neighbouring tiles join up.
const MATERIAL_WINDOWS := 4

const RESOURCE_NAMES := {"grain": "Grain", "timber": "Timber", "stone": "Stone", "iron": "Iron"}

## Node ring colours, one per resource.
const NODE_COLOURS := {
	"grain": Color("C8A24B"),
	"timber": Color("6E8B4A"),
	"stone": Color("9AA3AD"),
	"iron": Color("8C6A55"),
}

var _camera := Vector2.ZERO      ## top-left of the view, in tiles
var _zoom := 12.0                ## pixels per tile
var _chunks: Dictionary = {}     ## "cx,cy" -> PackedByteArray
var _requested: Dictionary = {}  ## chunks already asked for
var _halls: Array = []           ## from the viewport endpoint
var _nodes: Array = []           ## resource nodes in view
var _marches: Array = []         ## marches crossing the view, anyone's
var _sheet: PanelContainer
var _sheet_node: Dictionary = {}
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

	# Bottom sheet for whatever the thumb landed on. Anchored only — its height comes from its
	# contents every time it is rebuilt, the lesson from the hall view's invisible panel.
	_sheet = PanelContainer.new()
	_sheet.add_theme_stylebox_override("panel", Tokens.panel(Tokens.TIMBER, Tokens.FIRE))
	_sheet.visible = false
	_sheet.set_anchors_preset(Control.PRESET_BOTTOM_WIDE, true)
	_sheet.minimum_size_changed.connect(_fit_sheet)
	add_child(_sheet)

	Session.hall_changed.connect(_on_hall_changed)
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
	_nodes = r.data.get("nodes", [])
	_marches = r.data.get("marches", [])
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

	# Detail only when it can be seen; below that, colour beats texture.
	var painted := Art.has_terrain() and _zoom >= BAND_NEAR
	for y in range(y0, y1):
		for x in range(x0, x1):
			var t := _terrain_at(x, y)
			if t < 0:
				continue
			var pos := (Vector2(x, y) - _camera) * _zoom
			var cell := Rect2(pos, Vector2(_zoom, _zoom) + Vector2.ONE)
			if painted:
				var tex := Art.terrain(t)
				var window: float = float(tex.get_width()) / float(MATERIAL_WINDOWS)
				var wx := posmod(x, MATERIAL_WINDOWS)
				var wy := posmod(y, MATERIAL_WINDOWS)
				var src := Rect2(Vector2(wx, wy) * window, Vector2(window, window))
				_canvas.draw_texture_rect_region(tex, cell, src)
			else:
				_canvas.draw_rect(cell, Tokens.TERRAIN[t])

	var mine := str(Session.hall.get("id", ""))
	var labelled: Array[Vector2] = []      # where a label already sits, so the next one can yield
	for h: Dictionary in _halls:
		var pos := (Vector2(float(h.get("x", 0)), float(h.get("y", 0))) - _camera) * _zoom
		var own := str(h.get("hall_id", "")) == mine
		var span := Vector2(_zoom, _zoom)
		var tex := Art.marker("hall", int(h.get("level", 1)))
		if tex != null:
			# A roof seen from above, drawn a little larger than its tile so it reads at a glance.
			var draw_w := _zoom * 1.6
			var draw_h := draw_w * float(tex.get_height()) / float(tex.get_width())
			_canvas.draw_texture_rect(tex, Rect2(pos + span * 0.5 - Vector2(draw_w, draw_h) * 0.5,
				Vector2(draw_w, draw_h)), false)
		else:
			_canvas.draw_rect(Rect2(pos, span), Tokens.GOLD if own else Tokens.TIMBER)
			var edge: Color = Tokens.BONE if own else Tokens.IRON
			_canvas.draw_rect(Rect2(pos, span), edge, false, maxf(1.0, _zoom * 0.08))
		if own:
			# Yours is findable at any zoom without hunting for a name.
			var ring_w: float = maxf(1.5, _zoom * 0.09)
			_canvas.draw_arc(pos + span * 0.5, _zoom * 1.1, 0.0, TAU, 28, Tokens.GOLD, ring_w)
		if bool(h.get("shielded", false)) and _zoom >= 8.0:
			_canvas.draw_arc(pos + span * 0.5, _zoom * 1.35, 0.0, TAU, 24, Tokens.RUNE, 2.0)
		# Labels: own hall first, then whoever fits. Overlapping names are dropped, never shrunk
		# (map.md label priority).
		if _zoom >= BAND_NEAR:
			var at := pos + Vector2(0, -_zoom * 0.9)
			var clear := true
			for taken in labelled:
				if absf(taken.y - at.y) < 18.0 and absf(taken.x - at.x) < 110.0:
					clear = false
			if clear or own:
				labelled.append(at)
				var who := str(h.get("name", ""))
				_canvas.draw_string(ThemeDB.fallback_font, at, who,
					HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Tokens.GOLD if own else Tokens.BONE)

	_draw_nodes()
	_draw_marches()

	var band := "near" if _zoom >= BAND_NEAR else "mid"
	var out := Session.marches.size()
	_status.text = "%d, %d   ·   %d halls   ·   %d nodes   ·   marches %d/%d   ·   %s" % [
		int(_camera.x + across.x * 0.5), int(_camera.y + across.y * 0.5),
		_halls.size(), _nodes.size(), out, Session.march_slots, band]


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
	for n: Dictionary in _nodes:
		if int(n.get("x", -1)) == int(tile.x) and int(n.get("y", -1)) == int(tile.y):
			_open_node_sheet(n)
			return
	for h: Dictionary in _halls:
		if int(h.get("x", -1)) == int(tile.x) and int(h.get("y", -1)) == int(tile.y):
			var who := str(h.get("name", "a jarl"))
			var shield := " · under starter shield" if bool(h.get("shielded", false)) else ""
			notify.emit("%s, Longhouse %d%s" % [who, int(h.get("level", 1)), shield])
			return
	_close_sheet()


## A small ring in the resource's colour with its level inside; greyed when someone is already
## working it, because a node you cannot send to should look unavailable before you spend a march
## slot finding out.
func _draw_nodes() -> void:
	for n: Dictionary in _nodes:
		var pos := (Vector2(float(n.get("x", 0)), float(n.get("y", 0))) - _camera) * _zoom
		var centre := pos + Vector2(_zoom, _zoom) * 0.5
		var res := str(n.get("resource", "grain"))
		var held := bool(n.get("held", false))
		var colour: Color = NODE_COLOURS.get(res, Tokens.BONE)
		if held:
			colour = colour.darkened(0.45)
		var radius: float = maxf(3.0, _zoom * 0.34)
		_canvas.draw_circle(centre, radius, Color(colour, 0.35 if held else 0.85))
		_canvas.draw_arc(centre, radius, 0.0, TAU, 20, colour, maxf(1.0, _zoom * 0.06))
		if _zoom >= BAND_NEAR:
			var text := str(int(n.get("level", 1)))
			_canvas.draw_string(ThemeDB.fallback_font, centre + Vector2(-5, 6), text,
				HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Tokens.INK if not held else Tokens.IRON)


## Marches, drawn as a line from where they set out to where they are going and a dot at the point
## they have actually reached. The dot's position is interpolated from the server's timestamps
## rather than tracked, which is the whole reason the server needs no per-second tick.
func _draw_marches() -> void:
	var mine := str(Session.player.get("id", ""))
	for m: Dictionary in _marches:
		var from := Vector2(float(m.get("origin_x", 0)), float(m.get("origin_y", 0)))
		var to := Vector2(float(m.get("target_x", 0)), float(m.get("target_y", 0)))
		var state := str(m.get("state", ""))
		var own := str(m.get("player_id", "")) == mine
		var colour: Color = Tokens.GOLD if own else Tokens.EMBER

		var a := (from - _camera) * _zoom + Vector2(_zoom, _zoom) * 0.5
		var b := (to - _camera) * _zoom + Vector2(_zoom, _zoom) * 0.5
		_canvas.draw_line(a, b, Color(colour, 0.35), maxf(1.0, _zoom * 0.05))

		var at := b
		if state == "travelling":
			at = a.lerp(b, _progress(m, "departed_at", "arrives_at"))
		elif state == "returning":
			# Home is the origin; it is walking the line the other way.
			at = b.lerp(a, _progress(m, "departed_at", "returns_at"))
		_canvas.draw_circle(at, maxf(3.0, _zoom * 0.22), colour)
		if state == "gathering":
			# Sitting on the node, working. A second ring says so without a label.
			_canvas.draw_arc(b, maxf(5.0, _zoom * 0.5), 0.0, TAU, 20, colour, 2.0)


## How far along a march is, 0 to 1, from two server timestamps.
func _progress(m: Dictionary, from_key: String, to_key: String) -> float:
	var total := Api.seconds_until(str(m.get(to_key, "")))
	if total <= 0.0:
		return 1.0
	var started := str(m.get(from_key, ""))
	var whole: float = maxf(1.0, Api.seconds_until(str(m.get(to_key, ""))) + _elapsed_since(started))
	return clampf(1.0 - total / whole, 0.0, 1.0)


func _elapsed_since(iso: String) -> float:
	if iso == "":
		return 0.0
	return maxf(0.0, -Api.seconds_until(iso))


func _fit_sheet() -> void:
	var wanted: float = _sheet.get_combined_minimum_size().y
	_sheet.offset_left = 0.0
	_sheet.offset_right = 0.0
	_sheet.offset_top = -wanted
	_sheet.offset_bottom = 0.0


func _close_sheet() -> void:
	_sheet_node = {}
	_sheet.visible = false


func _on_hall_changed() -> void:
	# A march left or came home: the node's held flag and our slot count both moved.
	if not _sheet_node.is_empty():
		_open_node_sheet(_sheet_node)
	_after_move(true)


## What is here, and the one thing you can do about it.
func _open_node_sheet(node: Dictionary) -> void:
	_sheet_node = node
	_sheet.visible = true
	for child in _sheet.get_children():
		_sheet.remove_child(child)
		child.queue_free()

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", Tokens.GAP)
	_sheet.add_child(box)

	var res := str(node.get("resource", "grain"))
	var name: String = RESOURCE_NAMES.get(res, res.capitalize())
	box.add_child(Tokens.label("%s node, level %d" % [name, int(node.get("level", 1))], 34))
	box.add_child(Tokens.label("%s left in the ground   ·   %s an hour" % [
		_thousands(float(node.get("remaining", 0))),
		_thousands(float(node.get("rate_per_hour", 0)))], 24, Tokens.TIMBER_LIGHT))

	var mine := _my_march_to(str(node.get("node_id", "")))
	if not mine.is_empty():
		var state := str(mine.get("state", ""))
		var word := "coming home"
		if state == "travelling":
			word = "on their way"
		elif state == "gathering":
			word = "working it"
		box.add_child(Tokens.label("Your gatherers are " + word + ".", 24, Tokens.FIRE))
		if state != "returning":
			var back := Tokens.button("Recall them")
			back.pressed.connect(func() -> void:
				back.disabled = true
				var err: String = await Session.recall_march(str(mine.get("id", "")))
				if err != "":
					notify.emit(err)
				else:
					notify.emit("They are turning back.")
				await Session.refresh_hall())
			box.add_child(back)
	elif bool(node.get("held", false)):
		box.add_child(Tokens.label("Another jarl is working this one.", 24, Tokens.EMBER))
	else:
		var send := Tokens.button("Send gatherers")
		var out := Session.marches.size()
		send.disabled = out >= Session.march_slots
		if send.disabled:
			var busy := "Every march is already out (%d of %d)." % [out, Session.march_slots]
			box.add_child(Tokens.label(busy, 24, Tokens.EMBER))
		send.pressed.connect(func() -> void:
			send.disabled = true
			var err: String = await Session.send_gather(str(node.get("node_id", "")))
			if err != "":
				notify.emit(err)
				send.disabled = false
			else:
				notify.emit("Your gatherers are on their way.")
			await Session.refresh_hall())
		box.add_child(send)

	var close := Tokens.button("Close", false)
	close.pressed.connect(_close_sheet)
	box.add_child(close)
	_fit_sheet()


func _my_march_to(node_id: String) -> Dictionary:
	for m in Session.marches:
		if str(m.get("target_id", "")) == node_id:
			return m
	return {}


func _thousands(value: float) -> String:
	var n := int(floor(maxf(0.0, value)))
	var s := str(n)
	var out := ""
	var count := 0
	for i in range(s.length() - 1, -1, -1):
		out = s[i] + out
		count += 1
		if count % 3 == 0 and i > 0:
			out = "," + out
	return out
