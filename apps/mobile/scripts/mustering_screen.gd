extends Control
## Mustering — where troops are recruited (units.md, DEC-030/031).
##
## You walk into a training building and see its BENCH: every kind it trains, and for each kind the
## ten rungs with the Skáld's name on every one. A Barracks has one kind of man on the bench; the
## Shipyard has six hulls.
##
## The client draws what `/v1/buildings/:id/bench` returns and knows none of the names, which tiers
## are open, or why one is shut. All of that is the server's, printed as it came — the same rule the
## Rúnahöll follows, and for the same reason: a client that works out its own gates disagrees with
## the server the first time a rule changes, and the player taps a button that does nothing.
##
## The emblems are DRAWN, not loaded. Nothing has been illustrated yet, and a drawn horseshoe or hull
## says "placeholder" honestly while still reading at forty pixels on a phone. They are the same
## stopgap the Rúnahöll's carved runes are, and they go the day real art lands.

signal navigate(screen: String)
signal notify(message: String)

const REFRESH_SECONDS := 5.0

var building_id: String = ""

var _building: String = ""
var _level: int = 0
var _bench: Array = []
var _open_kind: String = ""      ## "" means the bench is showing
var _busy: bool = false
var _since: float = 0.0
var _training: Dictionary = {}

var _title: Label
var _subtitle: Label
var _scroll: ScrollContainer
var _body: VBoxContainer
var _back_btn: Button

## Emblems, drawn as strokes in a 0..1 box. `lines` are polylines; `arcs` are [cx, cy, r, from, to]
## in radians. Crude on purpose — see the file header.
const EMBLEMS := {
	"reidmadur": {  # a horseshoe
		"arcs": [[0.5, 0.52, 0.34, 2.6, 6.8]], "lines": []},
	"berserkur": {  # a bearded axe
		"arcs": [], "lines": [
			[Vector2(0.46, 0.06), Vector2(0.46, 0.96)],
			[Vector2(0.46, 0.16), Vector2(0.82, 0.28), Vector2(0.86, 0.5), Vector2(0.46, 0.54)]]},
	"bogamadur": {  # a bow, strung, with the arrow on it
		"arcs": [[0.58, 0.5, 0.38, 2.0, 4.3]], "lines": [
			[Vector2(0.35, 0.14), Vector2(0.35, 0.86)],
			[Vector2(0.18, 0.5), Vector2(0.78, 0.5)],
			[Vector2(0.66, 0.42), Vector2(0.78, 0.5), Vector2(0.66, 0.58)]]},
	"landkonnudur": {  # an open eye
		"arcs": [[0.5, 0.5, 0.42, 3.5, 5.95], [0.5, 0.5, 0.42, 0.33, 2.78], [0.5, 0.5, 0.11, 0.0, 6.28]],
		"lines": []},
}

## The six hulls, drawn from the same parts so the family reads as a family and the size reads as
## rank: keel, then a mast, then a sail, then shields, then the dragon head.
const HULLS := {
	"eikja":   {"w": 0.52, "mast": false, "sail": 0.0,  "shields": 0, "head": false},
	"karfi":   {"w": 0.64, "mast": true,  "sail": 0.18, "shields": 0, "head": false},
	"knorr":   {"w": 0.74, "mast": true,  "sail": 0.34, "shields": 0, "head": false},
	"snekkja": {"w": 0.82, "mast": true,  "sail": 0.26, "shields": 3, "head": false},
	"skeid":   {"w": 0.90, "mast": true,  "sail": 0.32, "shields": 5, "head": false},
	"dreki":   {"w": 0.96, "mast": true,  "sail": 0.36, "shields": 6, "head": true},
}


func _ready() -> void:
	var bg := ColorRect.new()
	bg.color = Tokens.IRON
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var box := VBoxContainer.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	box.add_theme_constant_override("separation", Tokens.GAP)
	box.offset_left = Tokens.PAD
	box.offset_right = -Tokens.PAD
	box.offset_top = Tokens.PAD
	box.offset_bottom = -Tokens.PAD
	add_child(box)

	_title = Tokens.label("Mustering", 40)
	box.add_child(_title)
	_subtitle = Tokens.label("", 22, Tokens.TIMBER_LIGHT)
	box.add_child(_subtitle)

	_scroll = ScrollContainer.new()
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(_scroll)
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", Tokens.GAP)
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_body)

	_back_btn = Tokens.button("Back to the bench", false)
	_back_btn.pressed.connect(func() -> void:
		_open_kind = ""
		_redraw())
	_back_btn.visible = false
	box.add_child(_back_btn)

	var leave := Tokens.button("Back to the hall", false)
	leave.pressed.connect(func() -> void: navigate.emit("city"))
	box.add_child(leave)

	await _refresh()


func _process(delta: float) -> void:
	if _training.is_empty():
		return
	_since += delta
	if _since >= REFRESH_SECONDS and not _busy:
		_since = 0.0
		await _refresh()


func _refresh() -> String:
	if building_id == "":
		_subtitle.text = "No building was named."
		return "no building"
	_busy = true
	var r: Api.Result = await Api.get_json("/v1/buildings/%s/bench" % building_id)
	_busy = false
	if not r.ok:
		notify.emit(r.message)
		# An answer the screen cannot read is not an empty room. Say so.
		_subtitle.text = r.message
		return r.message
	_building = str(r.data.get("building", ""))
	_level = int(r.data.get("level", 0))
	_bench = r.data.get("bench", [])
	_training = Session.training_timer_for(building_id)
	_redraw()
	return ""


func _kind(id: String) -> Dictionary:
	for k in _bench:
		if str((k as Dictionary).get("type", "")) == id:
			return k as Dictionary
	return {}


func _redraw() -> void:
	for child in _body.get_children():
		child.queue_free()
	_back_btn.visible = _open_kind != ""

	var pretty := _building.replace("_", " ").capitalize()
	if _open_kind == "":
		_title.text = "%s %d" % [pretty, _level]
		if _bench.is_empty():
			_subtitle.text = "Nothing is trained here."
		elif not _training.is_empty():
			var payload: Dictionary = _training.get("payload", {})
			_subtitle.text = "%d in training · ready in %s" % [
				int(payload.get("count", 0)),
				_pretty(Api.seconds_until(str(_training.get("due_at", ""))))]
		else:
			var room: int = Session.troop_capacity - Session.troops_committed
			_subtitle.text = "%d on the bench · room for %d more" % [_bench.size(), maxi(room, 0)]
		for k in _bench:
			_body.add_child(_kind_card(k as Dictionary))
	else:
		var k := _kind(_open_kind)
		_title.text = str(k.get("name", ""))
		_subtitle.text = str(k.get("gloss", ""))
		_body.add_child(_wrapped(str(k.get("blurb", "")), 21, Tokens.TIMBER_LIGHT))
		for t in (k.get("tiers", []) as Array):
			_body.add_child(_rung_row(k, t as Dictionary))


# ---------------------------------------------------------------- the bench ----

func _kind_card(k: Dictionary) -> Control:
	var locked: Variant = k.get("locked", null)
	var open := int(k.get("tiers_open", 0))
	var accent: Color = Tokens.RUNE if locked == null else Tokens.TIMBER_LIGHT

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Tokens.panel(Tokens.TIMBER, accent))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", Tokens.PAD)
	panel.add_child(row)

	var mark := _emblem(str(k.get("type", "")), accent, 56)
	mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(mark)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 3)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", Tokens.GAP)
	var name_label := Tokens.label(str(k.get("name", "")), 30, accent)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(name_label)
	var beats: Variant = k.get("beats", null)
	if beats != null and str(beats) != "":
		var b := _kind(str(beats))
		head.add_child(Tokens.label("beats %s" % str(b.get("name", beats)), 18, Tokens.TIMBER_LIGHT))
	col.add_child(head)
	col.add_child(Tokens.label(str(k.get("gloss", "")), 19, Tokens.TIMBER_LIGHT))

	if locked != null:
		col.add_child(Tokens.label(str(locked), 20, Tokens.EMBER))
	else:
		col.add_child(Tokens.label("%d of %d tiers open" % [open, int(k.get("max_tiers", 1))], 20))

	var tap := Button.new()
	tap.flat = true
	tap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	tap.pressed.connect(func() -> void:
		_open_kind = str(k.get("type", ""))
		_redraw())
	panel.add_child(tap)
	return panel


# ---------------------------------------------------------------- one rung ----

func _rung_row(k: Dictionary, t: Dictionary) -> Control:
	var is_open := bool(t.get("open", false))
	var tier := int(t.get("tier", 1))
	var accent: Color = Tokens.GOLD if is_open else Tokens.TIMBER_LIGHT

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Tokens.panel(Tokens.TIMBER, accent))
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	panel.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", Tokens.GAP)
	head.add_child(Tokens.label("T%d" % tier, 20, Tokens.TIMBER_LIGHT))
	var nm := Tokens.label(str(t.get("name", "")), 27, accent if is_open else Tokens.TIMBER_LIGHT)
	nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(nm)
	col.add_child(head)
	col.add_child(Tokens.label(str(t.get("gloss", "")), 19, Tokens.TIMBER_LIGHT))

	if not is_open:
		col.add_child(Tokens.label(
			"Needs %s %d" % [_building.replace("_", " "), int(t.get("needs_level", 0))], 20, Tokens.EMBER))
		return panel

	var cost: Dictionary = t.get("cost", {})
	col.add_child(Tokens.label("%s each · %s" % [
		_cost_text(cost), _pretty(int(t.get("seconds", 0)))], 20, Tokens.TIMBER_LIGHT))

	if not _training.is_empty():
		col.add_child(Tokens.label("The bench is busy.", 20, Tokens.EMBER))
		return panel

	var room: int = Session.troop_capacity - Session.troops_committed
	if room <= 0:
		col.add_child(Tokens.label("No room. Raise the Barracks to hold more.", 20, Tokens.EMBER))
		return panel

	# Batch sizes rather than a slider: three taps that each say what they cost beat a number you
	# have to reason about before you know what a Berserkur is.
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", Tokens.GAP)
	col.add_child(row)
	for batch: int in [5, 20, 50]:
		var n: int = mini(batch, room)
		var button := Tokens.button("%d" % n, batch == 20)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.pressed.connect(func() -> void:
			button.disabled = true
			await _train(str(k.get("type", "")), tier, n, str(t.get("name", ""))))
		row.add_child(button)
	return panel


func _train(type: String, tier: int, count: int, name: String) -> void:
	if _busy:
		return
	_busy = true
	var r: Api.Result = await Api.post_json(
		"/v1/buildings/%s/train" % building_id, {"count": count, "tier": tier, "type": type})
	_busy = false
	if not r.ok:
		notify.emit(r.message)
		return
	notify.emit("%d %s are training." % [count, name])
	await _refresh()
	await Session.refresh_hall()


# ---------------------------------------------------------------- drawing ----

func _emblem(type: String, colour: Color, px: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(px, px)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if HULLS.has(type):
		var h: Dictionary = HULLS[type]
		c.draw.connect(func() -> void: _draw_hull(c, h, colour, px))
	else:
		var e: Dictionary = EMBLEMS.get(type, {"arcs": [], "lines": []})
		c.draw.connect(func() -> void:
			var w := maxf(2.0, px * 0.07)
			for line: Array in (e.get("lines", []) as Array):
				var pts := PackedVector2Array()
				for pt: Vector2 in line:
					pts.append(Vector2(pt.x * px, pt.y * px))
				c.draw_polyline(pts, colour, w, true)
			for a: Array in (e.get("arcs", []) as Array):
				c.draw_arc(Vector2(float(a[0]) * px, float(a[1]) * px), float(a[2]) * px,
					float(a[3]), float(a[4]), 32, colour, w, true))
	return c


## One family of ships, drawn from the same parts. Size and rigging carry the rank.
func _draw_hull(c: Control, h: Dictionary, colour: Color, px: int) -> void:
	var w := maxf(2.0, px * 0.06)
	var half: float = float(h.get("w", 0.7)) * 0.5
	var left := (0.5 - half) * px
	var right := (0.5 + half) * px
	var deck := 0.62 * px
	var keel := 0.82 * px

	# Hull: a curve up at both stems, the way a clinker hull sits.
	var hull := PackedVector2Array([
		Vector2(left, deck - px * 0.10), Vector2(left + px * 0.06, deck),
		Vector2(right - px * 0.06, deck), Vector2(right, deck - px * 0.10)])
	c.draw_polyline(hull, colour, w, true)
	c.draw_polyline(PackedVector2Array([
		Vector2(left + px * 0.04, deck), Vector2(0.5 * px, keel), Vector2(right - px * 0.04, deck)]),
		colour, w, true)

	if bool(h.get("mast", false)):
		c.draw_line(Vector2(0.5 * px, deck), Vector2(0.5 * px, 0.12 * px), colour, w, true)
	var sail := float(h.get("sail", 0.0))
	if sail > 0.0:
		c.draw_polyline(PackedVector2Array([
			Vector2(0.5 * px, 0.16 * px),
			Vector2((0.5 + sail) * px, 0.34 * px),
			Vector2(0.5 * px, 0.50 * px)]), colour, w, true)
	var shields := int(h.get("shields", 0))
	for i in shields:
		var x: float = left + px * 0.10 + (right - left - px * 0.20) * (float(i) / maxf(1.0, float(shields - 1)))
		c.draw_arc(Vector2(x, deck - px * 0.04), px * 0.045, 0.0, TAU, 12, colour, w * 0.7, true)
	if bool(h.get("head", false)):
		# The dragon head on the stem. It came off before landfall at home, so as not to frighten
		# the land-spirits — which is a mechanic waiting to happen and is not one yet.
		c.draw_polyline(PackedVector2Array([
			Vector2(right, deck - px * 0.10), Vector2(right - px * 0.02, deck - px * 0.26),
			Vector2(right + px * 0.02, deck - px * 0.34)]), colour, w, true)


# ---------------------------------------------------------------- bits ----

func _wrapped(text: String, size: int, colour: Color) -> Label:
	var l := Tokens.label(text, size, colour)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


func _cost_text(cost: Dictionary) -> String:
	var parts: PackedStringArray = []
	for res: String in ["grain", "timber", "stone", "iron"]:
		var n := int(cost.get(res, 0))
		if n > 0:
			parts.append("%d %s" % [n, res])
	return " · ".join(parts) if parts.size() > 0 else "free"


func _pretty(seconds: int) -> String:
	if seconds < 60:
		return "%ds" % seconds
	if seconds < 3600:
		return "%dm" % int(seconds / 60.0)
	if seconds < 86400:
		return "%dh %dm" % [int(seconds / 3600.0), int(fmod(seconds / 60.0, 60))]
	return "%dd %dh" % [int(seconds / 86400.0), int(fmod(seconds / 3600.0, 24))]
