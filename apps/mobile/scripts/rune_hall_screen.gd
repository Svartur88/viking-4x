extends Control
## The Rune Hall — research (research.md, DEC-021, DEC-024).
##
## The client draws whatever `/v1/research` returns and knows none of the node names. That is the
## whole point of research.md rule 7: the Skáld's names are still being judged, and a rename must
## touch the server's catalogue and nothing here.
##
## Nothing is mirrored either. Which nodes are startable, and WHY the others are not, is decided by
## the server and printed as it came — a client that worked out its own gates would disagree with
## the server the first time a rule changed, and the player would see a button that does nothing.

signal navigate(screen: String)
signal notify(message: String)

const REFRESH_SECONDS := 5.0

var _branches: Dictionary = {}
var _nodes: Array = []
var _running: Variant = null
var _rune_hall: int = 0
var _longhouse: int = 0

var _list: VBoxContainer
var _title: Label
var _subtitle: Label
var _branch_shown: String = "bu"
var _since_refresh: float = 0.0
var _busy: bool = false


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

	_title = Tokens.label("Rune Hall", 40)
	box.add_child(_title)
	_subtitle = Tokens.label("", 22, Tokens.TIMBER_LIGHT)
	box.add_child(_subtitle)

	# Branch picker. Three buttons rather than a tab bar, because the names are the point and a tab
	# bar would shrink them.
	var tabs := HBoxContainer.new()
	tabs.add_theme_constant_override("separation", Tokens.GAP)
	box.add_child(tabs)
	for key in ["bu", "her", "berg"]:
		var b := Tokens.button("", key == _branch_shown)
		b.name = "tab_%s" % key
		b.custom_minimum_size = Vector2(0, Tokens.TOUCH)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(_show_branch.bind(key))
		tabs.add_child(b)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	box.add_child(scroll)
	_list = VBoxContainer.new()
	_list.add_theme_constant_override("separation", Tokens.GAP)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_list)

	var back := Tokens.button("Back to the hall", false)
	back.pressed.connect(func() -> void: navigate.emit("city"))
	box.add_child(back)

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
	_branches = r.data.get("branches", {})
	_nodes = r.data.get("nodes", [])
	_running = r.data.get("running", null)
	_rune_hall = int(r.data.get("rune_hall", 0))
	_longhouse = int(r.data.get("longhouse", 0))
	_redraw()
	return ""


func _show_branch(key: String) -> void:
	_branch_shown = key
	_redraw()


func _redraw() -> void:
	var info: Dictionary = _branches.get(_branch_shown, {})
	_title.text = "Rune Hall %d — %s" % [_rune_hall, str(info.get("name", ""))]
	if _rune_hall == 0:
		_subtitle.text = "Not built yet. Raise the Rune Hall to begin."
	elif _running != null:
		_subtitle.text = "%s · one research at a time" % _running_label()
	else:
		_subtitle.text = "%s · nothing being studied" % str(info.get("gloss", ""))

	for key in ["bu", "her", "berg"]:
		var tab := find_child("tab_%s" % key, true, false) as Button
		if tab != null:
			tab.text = str((_branches.get(key, {}) as Dictionary).get("name", key))
			tab.disabled = key == _branch_shown

	for child in _list.get_children():
		child.queue_free()

	var tier := 0
	for n in _nodes:
		var node := n as Dictionary
		if str(node.get("branch", "")) != _branch_shown:
			continue
		var t := int(node.get("tier", 1))
		if t != tier:
			tier = t
			_list.add_child(Tokens.label("Tier %d" % t, 22, Tokens.TIMBER_LIGHT))
		_list.add_child(_row(node))


func _running_label() -> String:
	var p: Variant = (_running as Dictionary).get("payload", {})
	var id: String = str((p as Dictionary).get("node", "")) if typeof(p) == TYPE_DICTIONARY else ""
	for n in _nodes:
		if str((n as Dictionary).get("id", "")) == id:
			return "Studying %s" % str((n as Dictionary).get("name", ""))
	return "Studying"


func _row(node: Dictionary) -> Control:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", Tokens.panel(Tokens.TIMBER))

	var row := VBoxContainer.new()
	row.add_theme_constant_override("separation", 4)
	panel.add_child(row)

	var level := int(node.get("level", 0))
	var maxl := int(node.get("max_level", 1))
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", Tokens.GAP)
	# The Skáld's name is the loud part; the gloss teaches the word without a tooltip nobody taps.
	var name_label := Tokens.label(str(node.get("name", "")), 28)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(name_label)
	head.add_child(Tokens.label("%d / %d" % [level, maxl], 24, Tokens.TIMBER_LIGHT))
	row.add_child(head)
	row.add_child(Tokens.label(str(node.get("gloss", "")), 20, Tokens.TIMBER_LIGHT))
	row.add_child(Tokens.label(str(node.get("effect", "")), 22))

	var blocked: Variant = node.get("blocked", null)
	if blocked == null:
		var cost: Variant = node.get("cost", null)
		if typeof(cost) == TYPE_DICTIONARY:
			var c := cost as Dictionary
			row.add_child(Tokens.label(
				"%d grain · %d timber · %d stone · %d iron · %s" % [
					int(c.get("grain", 0)), int(c.get("timber", 0)),
					int(c.get("stone", 0)), int(c.get("iron", 0)),
					_pretty(int(node.get("seconds", 0)))],
				20, Tokens.TIMBER_LIGHT))
		var start := Tokens.button("Study %s" % str(node.get("name", "")))
		start.pressed.connect(_start.bind(str(node.get("id", ""))))
		row.add_child(start)
	else:
		# The server said WHY. Print its words rather than greying out a box silently.
		row.add_child(Tokens.label(str(blocked), 20, Tokens.EMBER))
	return panel


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
