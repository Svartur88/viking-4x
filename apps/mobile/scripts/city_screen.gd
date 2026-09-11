extends Control
## City view v0 (P2.I02). The hall ground, one box per building, tap for a sheet
## with level, cost and Upgrade, and a countdown drawn against server time.
##
## Grey boxes stand in for the painted village (design-language.md "Hall style") until OQ-04.
## The important part is already real: the level, the timer and the refusal all come from
## the server, and the countdown survives closing the app because it is due_at minus server now.

signal navigate(screen: String)
signal notify(message: String)

const KIND_NAMES := {
	"longhouse": "Longhouse",
	"farm": "Farm",
	"timber_camp": "Timber camp",
	"quarry": "Quarry",
	"iron_pit": "Iron pit",
	"storehouse": "Storehouse",
	"barracks": "Barracks",
	"wall": "Wall",
}

var _resources: Label
var _builders: Label
var _ground: GridContainer
var _sheet: PanelContainer
var _sheet_building_id := ""
var _tiles: Dictionary = {}   ## building_id -> {panel, level, timer}


func _ready() -> void:
	var column := VBoxContainer.new()
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.add_theme_constant_override("separation", Tokens.GAP)
	add_child(column)

	var header := PanelContainer.new()
	header.add_theme_stylebox_override("panel", Tokens.panel(Tokens.TIMBER))
	column.add_child(header)
	var header_box := VBoxContainer.new()
	header.add_child(header_box)
	_resources = Tokens.label("", 26, Tokens.BONE)
	header_box.add_child(_resources)
	_builders = Tokens.label("", 22, Tokens.BONE)
	header_box.add_child(_builders)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	column.add_child(scroll)

	_ground = GridContainer.new()
	_ground.columns = 2
	_ground.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_ground.add_theme_constant_override("h_separation", Tokens.GAP)
	_ground.add_theme_constant_override("v_separation", Tokens.GAP)
	scroll.add_child(_ground)

	_sheet = PanelContainer.new()
	_sheet.add_theme_stylebox_override("panel", Tokens.panel(Tokens.TIMBER, Tokens.FIRE))
	_sheet.visible = false
	_sheet.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	add_child(_sheet)

	Session.hall_changed.connect(_rebuild)
	_rebuild()
	set_process(true)
	_poll_loop()


## The server owns completion; we ask again a moment after a timer is due rather than
## incrementing a level ourselves (PR-13: one timer engine, and the client never guesses).
func _poll_loop() -> void:
	while is_inside_tree():
		await get_tree().create_timer(5.0).timeout
		if not is_inside_tree():
			return
		var due := false
		for t in Session.timers:
			if Api.seconds_until(str(t.get("due_at", ""))) <= 0.0:
				due = true
		if due:
			await Session.refresh_hall()


func _process(_delta: float) -> void:
	for id: String in _tiles:
		var t: Dictionary = Session.timer_for(id)
		var label: Label = _tiles[id]["timer"]
		if t.is_empty():
			label.text = ""
			continue
		label.text = _countdown(Api.seconds_until(str(t.get("due_at", ""))))
	if _sheet.visible and _sheet_building_id != "":
		_refresh_sheet()


func _countdown(seconds: float) -> String:
	if seconds <= 0.0:
		return "finishing…"
	var s := int(ceil(seconds))
	if s >= 3600:
		return "%d:%02d:%02d" % [s / 3600, (s % 3600) / 60, s % 60]
	return "%d:%02d" % [s / 60, s % 60]


func _rebuild() -> void:
	var hall: Dictionary = Session.hall
	_resources.text = "Grain %s   Timber %s   Stone %s   Iron %s" % [
		hall.get("grain", 0), hall.get("timber", 0), hall.get("stone", 0), hall.get("iron", 0)]
	_builders.text = "Builders %d/%d   ·   Hall at %d, %d" % [
		Session.BUILDERS - Session.builders_busy(), Session.BUILDERS,
		int(hall.get("x", 0)), int(hall.get("y", 0))]

	for child in _ground.get_children():
		child.queue_free()
	_tiles.clear()

	for b: Dictionary in Session.buildings:
		var id := str(b.get("id", ""))
		var tile := PanelContainer.new()
		tile.custom_minimum_size = Vector2(0, 180)
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tile.add_theme_stylebox_override("panel", Tokens.panel(Tokens.LAND, Tokens.TIMBER))
		var box := VBoxContainer.new()
		box.alignment = BoxContainer.ALIGNMENT_CENTER
		tile.add_child(box)
		var kind := str(b.get("kind", ""))
		var title := Tokens.label(KIND_NAMES.get(kind, kind.capitalize()), 28)
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		box.add_child(title)
		var level := Tokens.label("Level %d" % int(b.get("level", 1)), 24, Tokens.BONE)
		level.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		box.add_child(level)
		var timer := Tokens.label("", 24, Tokens.FIRE)
		timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		box.add_child(timer)

		var button := Button.new()
		button.flat = true
		button.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		button.pressed.connect(_open_sheet.bind(id))
		tile.add_child(button)

		_tiles[id] = {"level": level, "timer": timer}
		_ground.add_child(tile)


func _open_sheet(building_id: String) -> void:
	_sheet_building_id = building_id
	_sheet.visible = true
	_refresh_sheet(true)


func _refresh_sheet(rebuild: bool = false) -> void:
	var b: Dictionary = Session.building_by_id(_sheet_building_id)
	if b.is_empty():
		_sheet.visible = false
		return
	var t: Dictionary = Session.timer_for(_sheet_building_id)

	if not rebuild:
		var count: Label = _sheet.get_meta("countdown") as Label
		if count != null:
			var left := _countdown(Api.seconds_until(str(t.get("due_at", ""))))
			count.text = "" if t.is_empty() else "Ready in " + left
		var act: Button = _sheet.get_meta("action") as Button
		if act != null:
			act.disabled = not t.is_empty()
		return

	for child in _sheet.get_children():
		child.queue_free()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", Tokens.GAP)
	_sheet.add_child(box)

	var kind := str(b.get("kind", ""))
	box.add_child(Tokens.label(KIND_NAMES.get(kind, kind.capitalize()), 36))
	var level := int(b.get("level", 1))
	box.add_child(Tokens.label("Level %d  →  %d" % [level, level + 1], 26, Tokens.BONE))

	var countdown := Tokens.label("", 26, Tokens.FIRE)
	box.add_child(countdown)
	_sheet.set_meta("countdown", countdown)

	var action := Tokens.button("Upgrade")
	action.disabled = not t.is_empty()
	action.pressed.connect(_on_upgrade)
	box.add_child(action)
	_sheet.set_meta("action", action)

	var close := Tokens.button("Close", false)
	close.pressed.connect(func() -> void:
		_sheet.visible = false
		_sheet_building_id = "")
	box.add_child(close)


func _on_upgrade() -> void:
	var action: Button = _sheet.get_meta("action") as Button
	if action != null:
		action.disabled = true
	var err: String = await Session.upgrade(_sheet_building_id)
	if err != "":
		notify.emit(err)
		if action != null and is_instance_valid(action):
			action.disabled = false
		return
	_refresh_sheet(true)
	notify.emit("The builders are at work.")
