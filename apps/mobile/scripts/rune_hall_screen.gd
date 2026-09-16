extends Control
## The Rúnahöll — research (research.md, DEC-028, DEC-029).
##
## Two views. The HALL is ten doors in three wings; a door opens ONE TREE, drawn as a descent: nodes
## laid out by generation with lines running from each node to the ones it feeds.
##
## The client draws whatever `/v1/research` returns and knows none of the node names. That is the
## whole point of research.md rule 4: the Skáld's names are still being judged, and a rename must
## touch the server's catalogue and nothing here. The SHAPE is the server's too — `gen` and `needs`
## come down with every node, and this file positions and draws them without deciding any of it.
##
## Nothing is mirrored either. Which nodes are startable, and WHY the others are not, is decided by
## the server and printed as it came — a client that worked out its own gates would disagree with
## the server the first time a rule changed, and the player would see a button that does nothing.

signal navigate(screen: String)
signal notify(message: String)

const REFRESH_SECONDS := 5.0

## Layout of the descent. Tuned for a phone: a tree is wider than the screen and scrolls both ways,
## which is what every reference game's tech tree does too.
const NODE_W := 196
const NODE_H := 168
const COL_W := 252
const ROW_H := 268
const CANVAS_PAD := 36

## The mark carved on each stone: the sixteen Younger Futhark runes, drawn as strokes rather than
## typed as text. Two reasons. No font in the client carries the Runic block, so a glyph would come
## out as an empty box — and a rune IS strokes cut into stone, so drawing it is the honest way round.
## These stand in for the 120 icons nobody has drawn. The letter means nothing about the node.
## Each entry is a list of polylines in a 0..1 box, drawn top-left to bottom-right.
var RUNE_STROKES := {
	0x16A0: [[Vector2(0.34,0.0),Vector2(0.34,1.0)], [Vector2(0.34,0.22),Vector2(0.82,0.04)], [Vector2(0.34,0.52),Vector2(0.82,0.34)]],
	0x16A2: [[Vector2(0.72,0.0),Vector2(0.72,1.0)], [Vector2(0.72,0.06),Vector2(0.28,0.5),Vector2(0.28,1.0)]],
	0x16A6: [[Vector2(0.32,0.0),Vector2(0.32,1.0)], [Vector2(0.32,0.2),Vector2(0.8,0.45),Vector2(0.32,0.7)]],
	0x16AC: [[Vector2(0.32,0.0),Vector2(0.32,1.0)], [Vector2(0.32,0.1),Vector2(0.82,0.3)], [Vector2(0.32,0.42),Vector2(0.82,0.62)]],
	0x16B1: [[Vector2(0.32,0.0),Vector2(0.32,1.0)], [Vector2(0.32,0.04),Vector2(0.8,0.27),Vector2(0.32,0.5)], [Vector2(0.32,0.5),Vector2(0.8,0.97)]],
	0x16B4: [[Vector2(0.32,0.0),Vector2(0.32,1.0)], [Vector2(0.32,0.46),Vector2(0.8,0.06)]],
	0x16BC: [[Vector2(0.24,0.0),Vector2(0.24,1.0)], [Vector2(0.76,0.0),Vector2(0.76,1.0)], [Vector2(0.24,0.34),Vector2(0.76,0.62)]],
	0x16BE: [[Vector2(0.5,0.0),Vector2(0.5,1.0)], [Vector2(0.18,0.66),Vector2(0.82,0.3)]],
	0x16C1: [[Vector2(0.5,0.0),Vector2(0.5,1.0)]],
	0x16C5: [[Vector2(0.5,0.0),Vector2(0.5,1.0)], [Vector2(0.5,0.42),Vector2(0.9,0.14)]],
	0x16CB: [[Vector2(0.26,0.04),Vector2(0.72,0.28),Vector2(0.3,0.6),Vector2(0.76,0.92)]],
	0x16CF: [[Vector2(0.5,0.0),Vector2(0.5,1.0)], [Vector2(0.14,0.34),Vector2(0.5,0.0),Vector2(0.86,0.34)]],
	0x16D2: [[Vector2(0.32,0.0),Vector2(0.32,1.0)], [Vector2(0.32,0.04),Vector2(0.8,0.24),Vector2(0.32,0.46)], [Vector2(0.32,0.5),Vector2(0.8,0.72),Vector2(0.32,0.96)]],
	0x16D8: [[Vector2(0.24,0.0),Vector2(0.24,1.0)], [Vector2(0.76,0.0),Vector2(0.76,1.0)], [Vector2(0.24,0.36),Vector2(0.5,0.12),Vector2(0.76,0.36)]],
	0x16DA: [[Vector2(0.34,0.0),Vector2(0.34,1.0)], [Vector2(0.34,0.06),Vector2(0.8,0.32)]],
	0x16E6: [[Vector2(0.5,0.0),Vector2(0.5,1.0)], [Vector2(0.5,0.6),Vector2(0.1,0.98)], [Vector2(0.5,0.6),Vector2(0.9,0.98)]],
}

var _trees: Array = []          ## [{id, name, gloss, wing, renown, blurb}]
var _wings: Dictionary = {}     ## wing id -> {name, why}
var _nodes: Array = []
var _by_id: Dictionary = {}
var _running: Variant = null
var _rune_hall: int = 0
var _longhouse: int = 0
var _ordstir: int = 0

var _title: Label
var _subtitle: Label
var _body: VBoxContainer          ## the hall view
var _scroll: ScrollContainer      ## the tree view
var _canvas: Control
var _back_btn: Button

var _open_tree: String = ""       ## "" means the hall is showing
var _since_refresh: float = 0.0
var _busy: bool = false
var _pos: Dictionary = {}         ## node id -> Vector2, top-left of its panel


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

	_title = Tokens.label("Rúnahöll", 40)
	box.add_child(_title)
	_subtitle = Tokens.label("", 22, Tokens.TIMBER_LIGHT)
	box.add_child(_subtitle)

	# The hall: a scrolling column of wings and doors.
	var hall_scroll := ScrollContainer.new()
	hall_scroll.name = "hall_scroll"
	hall_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	hall_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(hall_scroll)
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", Tokens.GAP)
	_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hall_scroll.add_child(_body)

	# One tree: scrolls both ways, because a descent is wider than a phone.
	_scroll = ScrollContainer.new()
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.visible = false
	box.add_child(_scroll)
	_canvas = Control.new()
	_canvas.draw.connect(_draw_lines)
	_scroll.add_child(_canvas)

	_back_btn = Tokens.button("Back to the hall", false)
	_back_btn.pressed.connect(_close_tree)
	_back_btn.visible = false
	box.add_child(_back_btn)

	var leave := Tokens.button("Leave the Rúnahöll", false)
	leave.pressed.connect(func() -> void: navigate.emit("city"))
	box.add_child(leave)

	await _refresh()


func _process(delta: float) -> void:
	# A research finishing while the screen is open should appear without a tap. Cheap: one small
	# GET, and only when nothing else is in flight.
	if _running == null:
		return
	_since_refresh += delta
	if _since_refresh >= REFRESH_SECONDS and not _busy:
		_since_refresh = 0.0
		await _refresh()


func _refresh() -> String:
	_busy = true
	var r: Api.Result = await Api.get_json("/v1/research")
	_busy = false
	if not r.ok:
		notify.emit(r.message)
		return r.message
	_trees = r.data.get("trees", [])
	_wings = r.data.get("wings", {})
	_nodes = r.data.get("nodes", [])
	_running = r.data.get("running", null)
	_rune_hall = int(r.data.get("rune_hall", 0))
	_longhouse = int(r.data.get("longhouse", 0))
	_ordstir = int(r.data.get("ordstir", 0))
	_by_id.clear()
	for n in _nodes:
		_by_id[str((n as Dictionary).get("id", ""))] = n
	_redraw()
	return ""


func _redraw() -> void:
	if _open_tree == "":
		_draw_hall()
	else:
		_draw_tree()


# ---------------------------------------------------------------- the hall ----

func _draw_hall() -> void:
	_scroll.visible = false
	_back_btn.visible = false
	(find_child("hall_scroll", true, false) as Control).visible = true

	_title.text = "Rúnahöll %d" % _rune_hall
	_title.add_theme_color_override("font_color", Tokens.BONE)
	if _rune_hall == 0:
		_subtitle.text = "Not built yet. Raise the Rúnahöll to begin."
	elif _running != null:
		_subtitle.text = "%s · one research at a time · %d Orðstír" % [_running_label(), _ordstir]
	else:
		_subtitle.text = "Ten doors · nothing being studied · %d Orðstír" % _ordstir

	for child in _body.get_children():
		child.queue_free()

	for wing_id in ["heim", "vopn", "vik"]:
		var wing: Dictionary = _wings.get(wing_id, {})
		if wing.is_empty():
			continue
		_body.add_child(Tokens.label(str(wing.get("name", "")), 26, Tokens.GOLD))
		_body.add_child(Tokens.label(str(wing.get("why", "")), 19, Tokens.TIMBER_LIGHT))
		for t in _trees:
			var tree := t as Dictionary
			if str(tree.get("wing", "")) != wing_id:
				continue
			_body.add_child(_door(tree))


func _door(tree: Dictionary) -> Control:
	var id := str(tree.get("id", ""))
	var accent := _tree_colour(id)
	var mine: Array = []
	var done := 0
	var total := 0
	var first_rune := 0x16C1
	for n in _nodes:
		var node := n as Dictionary
		if str(node.get("tree", "")) != id:
			continue
		if mine.is_empty():
			first_rune = int(node.get("rune", 0x16C1))
		mine.append(node)
		done += int(node.get("level", 0))
		total += int(node.get("max_level", 1))
	var pct := 0 if total == 0 else int(round(100.0 * done / total))

	# A door: a tall arched-ish frame in the tree's own colour, with the mark on it. The lintel is a
	# thicker top border; Godot's StyleBoxFlat can do that without an image.
	var frame := StyleBoxFlat.new()
	frame.bg_color = Tokens.TIMBER.darkened(0.15)
	frame.border_color = accent
	frame.set_border_width_all(2)
	frame.border_width_top = 6
	frame.corner_radius_top_left = 26
	frame.corner_radius_top_right = 26
	frame.corner_radius_bottom_left = 4
	frame.corner_radius_bottom_right = 4
	frame.content_margin_left = Tokens.PAD
	frame.content_margin_right = Tokens.PAD
	frame.content_margin_top = Tokens.GAP
	frame.content_margin_bottom = Tokens.GAP

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", frame)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", Tokens.PAD)
	panel.add_child(row)

	var mark := _rune_mark(first_rune, accent, 44)
	mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(mark)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 3)
	col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(col)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", Tokens.GAP)
	var name_label := Tokens.label(str(tree.get("name", "")), 32, accent)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(name_label)
	if bool(tree.get("renown", false)):
		head.add_child(Tokens.label("Orðstír", 18, Tokens.RUNE))
	head.add_child(Tokens.label("%d carvings · %d%%" % [mine.size(), pct], 18, Tokens.TIMBER_LIGHT))
	col.add_child(head)
	col.add_child(Tokens.label(str(tree.get("gloss", "")), 19, Tokens.TIMBER_LIGHT))
	var blurb := Tokens.label(str(tree.get("blurb", "")), 19)
	blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(blurb)

	# The progress bar sits under the door like a worn threshold.
	var bar := Control.new()
	bar.custom_minimum_size = Vector2(0, 5)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.draw.connect(func() -> void:
		var w := bar.size.x
		bar.draw_rect(Rect2(0, 0, w, 5), Tokens.IRON.darkened(0.2))
		bar.draw_rect(Rect2(0, 0, w * pct / 100.0, 5), accent))
	col.add_child(bar)

	var tap := Button.new()
	tap.flat = true
	tap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	tap.pressed.connect(_open.bind(id))
	panel.add_child(tap)
	return panel


# ---------------------------------------------------------------- one tree ----

func _open(tree_id: String) -> void:
	_open_tree = tree_id
	_redraw()


func _close_tree() -> void:
	_open_tree = ""
	_redraw()


## Each door has its own hue, sent by the server with the tree list. Ten doors that look like ten
## places rather than ten rows — which is most of the difference between a hall and a form.
func _tree_colour(id: String) -> Color:
	var hex := str(_tree_meta(id).get("colour", ""))
	return Color(hex) if hex.begins_with("#") else Tokens.GOLD


func _tree_meta(id: String) -> Dictionary:
	for t in _trees:
		if str((t as Dictionary).get("id", "")) == id:
			return t as Dictionary
	return {}


func _draw_tree() -> void:
	(find_child("hall_scroll", true, false) as Control).visible = false
	_scroll.visible = true
	_back_btn.visible = true

	var meta := _tree_meta(_open_tree)
	_title.text = str(meta.get("name", ""))
	_title.add_theme_color_override("font_color", _tree_colour(_open_tree))
	_subtitle.text = "%s · read downward · a stone opens the ones it feeds" % str(meta.get("gloss", ""))

	for child in _canvas.get_children():
		child.queue_free()

	# Group by generation, keeping the server's order inside each one.
	var gens: Dictionary = {}
	for n in _nodes:
		var node := n as Dictionary
		if str(node.get("tree", "")) != _open_tree:
			continue
		var g := int(node.get("gen", 1))
		if not gens.has(g):
			gens[g] = []
		(gens[g] as Array).append(node)

	var gen_keys: Array = gens.keys()
	gen_keys.sort()
	var widest := 1
	for g in gen_keys:
		widest = maxi(widest, (gens[g] as Array).size())
	var width := widest * COL_W + CANVAS_PAD * 2
	var height := gen_keys.size() * ROW_H - (ROW_H - NODE_H) + CANVAS_PAD * 2

	_pos.clear()
	for i in gen_keys.size():
		var row: Array = gens[gen_keys[i]]
		var start_x := (width - row.size() * COL_W) / 2.0
		for j in row.size():
			var node := row[j] as Dictionary
			var cx := start_x + j * COL_W + COL_W / 2.0
			_pos[str(node.get("id", ""))] = Vector2(cx - NODE_W / 2.0, CANVAS_PAD + i * ROW_H)

	_canvas.custom_minimum_size = Vector2(width, height)
	_canvas.size = Vector2(width, height)

	for g in gen_keys:
		for n in (gens[g] as Array):
			_canvas.add_child(_stone(n as Dictionary))

	_canvas.queue_redraw()


## Lines from each parent to each child, drawn as elbows so the descent reads as a family tree
## rather than a spray of diagonals. A line is lit when its PARENT has at least one level, which
## makes the path a jarl has actually walked visible at a glance.
func _draw_lines() -> void:
	if _open_tree == "":
		return
	for n in _nodes:
		var node := n as Dictionary
		if str(node.get("tree", "")) != _open_tree:
			continue
		var child_id := str(node.get("id", ""))
		if not _pos.has(child_id):
			continue
		var child_top: Vector2 = _pos[child_id] + Vector2(NODE_W / 2.0, 0)
		for raw_parent in (node.get("needs", []) as Array):
			var parent_id := str(raw_parent)
			if not _pos.has(parent_id):
				continue
			var parent_bottom: Vector2 = _pos[parent_id] + Vector2(NODE_W / 2.0, NODE_H)
			var parent_node: Dictionary = _by_id.get(parent_id, {})
			var lit := int(parent_node.get("level", 0)) > 0
			var colour := Tokens.GOLD if lit else Tokens.TIMBER_LIGHT
			var w := 3.0 if lit else 2.0
			var mid := parent_bottom.y + (child_top.y - parent_bottom.y) / 2.0
			_canvas.draw_line(parent_bottom, Vector2(parent_bottom.x, mid), colour, w)
			_canvas.draw_line(Vector2(parent_bottom.x, mid), Vector2(child_top.x, mid), colour, w)
			_canvas.draw_line(Vector2(child_top.x, mid), child_top, colour, w)
			_canvas.draw_circle(child_top + Vector2(0, -4), 4.0, colour)


func _stone(node: Dictionary) -> Control:
	var id := str(node.get("id", ""))
	var level := int(node.get("level", 0))
	var maxl := int(node.get("max_level", 1))
	var blocked: Variant = node.get("blocked", null)

	# Four states, four looks (research.md, and the reference games all do this): finished in gold,
	# open in the tree's own hue, blocked in timber, being carved in ember.
	var accent := _tree_colour(_open_tree)
	var edge := Tokens.TIMBER_LIGHT
	var mark := Tokens.TIMBER_LIGHT
	if _running_node_id() == id:
		edge = Tokens.EMBER
		mark = Tokens.EMBER
	elif level >= maxl:
		edge = Tokens.GOLD
		mark = Tokens.GOLD
	elif blocked == null:
		edge = accent
		mark = accent

	var panel := PanelContainer.new()
	panel.position = _pos.get(id, Vector2.ZERO)
	panel.custom_minimum_size = Vector2(NODE_W, NODE_H)
	panel.size = Vector2(NODE_W, NODE_H)
	panel.add_theme_stylebox_override("panel", Tokens.panel(Tokens.TIMBER, edge))

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 4)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	panel.add_child(col)

	var mark_row := HBoxContainer.new()
	mark_row.alignment = BoxContainer.ALIGNMENT_CENTER
	mark_row.add_child(_rune_mark(int(node.get("rune", 0x16C1)), mark, 34))
	col.add_child(mark_row)

	var name_label := Tokens.label(str(node.get("name", "")), 23)
	name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(name_label)
	var gloss := Tokens.label(str(node.get("gloss", "")), 16, Tokens.TIMBER_LIGHT)
	gloss.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	gloss.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(gloss)

	if maxl == 1:
		var u := Tokens.label("unlock", 16, Tokens.GOLD)
		u.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		col.add_child(u)
	else:
		var pip_row := HBoxContainer.new()
		pip_row.alignment = BoxContainer.ALIGNMENT_CENTER
		pip_row.add_child(_pips(level, maxl, Tokens.GOLD))
		col.add_child(pip_row)

	var tap := Button.new()
	tap.flat = true
	tap.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	tap.pressed.connect(_open_sheet.bind(id))
	panel.add_child(tap)
	return panel


func _rune_mark(codepoint: int, colour: Color, px: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(px, px)
	c.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var strokes: Array = RUNE_STROKES.get(codepoint, RUNE_STROKES[0x16C1])
	c.draw.connect(func() -> void:
		var w := maxf(2.0, px * 0.09)
		for line in strokes:
			var pts := PackedVector2Array()
			for pt in line:
				pts.append(Vector2(pt.x * px, pt.y * px))
			c.draw_polyline(pts, colour, w, true))
	return c


## Level as a row of dots rather than "3 / 5". A glance reads dots; text has to be read.
func _pips(level: int, maxl: int, colour: Color) -> Control:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 5)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for i in mini(maxl, 10):
		var dot := Control.new()
		dot.custom_minimum_size = Vector2(9, 9)
		dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var on := i < level
		dot.draw.connect(func() -> void:
			if on:
				dot.draw_circle(Vector2(4.5, 4.5), 4.5, colour)
			else:
				dot.draw_arc(Vector2(4.5, 4.5), 3.6, 0.0, TAU, 14, Tokens.TIMBER_LIGHT, 1.6, true))
		row.add_child(dot)
	return row


func _running_node_id() -> String:
	if _running == null:
		return ""
	var p: Variant = (_running as Dictionary).get("payload", {})
	return str((p as Dictionary).get("node", "")) if typeof(p) == TYPE_DICTIONARY else ""


func _running_label() -> String:
	var id := _running_node_id()
	var n: Dictionary = _by_id.get(id, {})
	return "Carving %s" % str(n.get("name", "")) if not n.is_empty() else "Carving"


# ---------------------------------------------------------------- the sheet ----

func _names_for(ids: Array) -> String:
	var out: Array[String] = []
	for i in ids:
		var n: Dictionary = _by_id.get(str(i), {})
		out.append(str(n.get("name", i)))
	return ", ".join(out)


func _open_sheet(node_id: String) -> void:
	var node: Dictionary = _by_id.get(node_id, {})
	if node.is_empty():
		return

	var scrim := ColorRect.new()
	scrim.color = Color(0, 0, 0, 0.66)
	scrim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	scrim.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(scrim)

	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Tokens.panel(Tokens.IRON, Tokens.TIMBER_LIGHT))
	panel.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(min(560, size.x - Tokens.PAD * 4), 0)
	scrim.add_child(panel)

	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", Tokens.GAP)
	panel.add_child(col)

	col.add_child(Tokens.label(str(node.get("name", "")), 34))
	col.add_child(Tokens.label(str(node.get("gloss", "")), 21, Tokens.TIMBER_LIGHT))

	var blurb := Tokens.label(str(node.get("blurb", "")), 21)
	blurb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	blurb.custom_minimum_size = Vector2(min(520, size.x - Tokens.PAD * 6), 0)
	col.add_child(blurb)

	col.add_child(Tokens.label(str(node.get("effect", "")), 23, Tokens.GOLD))

	# Where it sits in the descent. The server sent both directions, so this prints rather than walks.
	var needs: Array = node.get("needs", [])
	var opens: Array = node.get("opens", [])
	var lineage := "A root — nothing above it." if needs.is_empty() else "Comes of %s." % _names_for(needs)
	if not opens.is_empty():
		lineage += " Opens %s." % _names_for(opens)
	var lineage_label := Tokens.label(lineage, 19, Tokens.TIMBER_LIGHT)
	lineage_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(lineage_label)

	col.add_child(Tokens.label("Level %d / %d" % [int(node.get("level", 0)), int(node.get("max_level", 1))], 21))

	var blocked: Variant = node.get("blocked", null)
	if blocked == null:
		var cost: Variant = node.get("cost", null)
		if typeof(cost) == TYPE_DICTIONARY:
			var c := cost as Dictionary
			var line := ""
			if int(c.get("ordstir", 0)) > 0:
				line = "%d Orðstír" % int(c.get("ordstir", 0))
			else:
				line = "%d grain · %d timber · %d stone · %d iron" % [
					int(c.get("grain", 0)), int(c.get("timber", 0)),
					int(c.get("stone", 0)), int(c.get("iron", 0))]
			col.add_child(Tokens.label("%s · %s" % [line, _pretty(int(node.get("seconds", 0)))], 20, Tokens.TIMBER_LIGHT))
		var start := Tokens.button("Carve the rune")
		start.pressed.connect(func() -> void:
			scrim.queue_free()
			await _start(node_id))
		col.add_child(start)
	else:
		# The server said WHY. Print its words rather than greying out a box silently.
		col.add_child(Tokens.label(str(blocked), 20, Tokens.EMBER))

	var close := Tokens.button("Close", false)
	close.pressed.connect(func() -> void: scrim.queue_free())
	col.add_child(close)


func _pretty(seconds: int) -> String:
	if seconds < 60:
		return "%ds" % seconds
	if seconds < 3600:
		return "%dm" % int(seconds / 60.0)
	if seconds < 86400:
		return "%dh %dm" % [int(seconds / 3600.0), int(fmod(seconds / 60.0, 60))]
	return "%dd %dh" % [int(seconds / 86400.0), int(fmod(seconds / 3600.0, 24))]


func _start(node_id: String) -> void:
	if _busy:
		return
	_busy = true
	var r: Api.Result = await Api.post_json("/v1/research/start", {"node": node_id})
	_busy = false
	if not r.ok:
		notify.emit(r.message)
		return
	await _refresh()
	await Session.refresh_hall()   # the cost came out of the stores; the header should say so
