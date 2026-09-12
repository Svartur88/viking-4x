extends Control
## Hall view (P2.I02, revised for DEC-012). Your village seen at a three-quarter angle: buildings
## stand on the ground where you left them, each with its level and, while the builders work, a
## countdown bubble. Tap one for the upgrade sheet.
##
## This is a different screen from the world map and deliberately a different projection: the map
## is straight down, this is three-quarter (presentation-patterns.md — nine of the ten reference
## games split it this way). Buildings with no art yet fall back to a labelled box, so the art
## can land family by family without breaking the screen.

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

## Where each building stands, as a fraction of the ground plane, and how big it is relative to
## the plane's width. The Longhouse sits high and centre because it is the heart of the hall.
const PLOTS := {
	"longhouse": {"at": Vector2(0.50, 0.42), "size": 0.46},
	"farm": {"at": Vector2(0.24, 0.66), "size": 0.30},
	"timber_camp": {"at": Vector2(0.76, 0.64), "size": 0.30},
	"quarry": {"at": Vector2(0.22, 0.86), "size": 0.28},
	"iron_pit": {"at": Vector2(0.78, 0.86), "size": 0.28},
	"storehouse": {"at": Vector2(0.50, 0.78), "size": 0.26},
	"barracks": {"at": Vector2(0.50, 0.94), "size": 0.30},
}
const SPARE_PLOT := {"at": Vector2(0.50, 0.58), "size": 0.26}
const RESOURCE_NAMES := {"grain": "Grain", "timber": "Timber", "stone": "Stone", "iron": "Iron"}

var _resources: Label
var _builders: Label
var _ground: Control
var _sheet: PanelContainer
var _sheet_building_id := ""
var _plots: Dictionary = {}   ## building_id -> {node, timer_label}


func _ready() -> void:
	var column := VBoxContainer.new()
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.add_theme_constant_override("separation", 0)
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

	_ground = Control.new()
	_ground.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_ground.clip_contents = true
	_ground.draw.connect(_draw_ground)
	_ground.resized.connect(_rebuild)
	column.add_child(_ground)

	_sheet = PanelContainer.new()
	_sheet.add_theme_stylebox_override("panel", Tokens.panel(Tokens.TIMBER, Tokens.FIRE))
	_sheet.visible = false
	# Anchor it to the bottom edge, but do NOT freeze its height here: the preset would size the
	# sheet to its minimum size *now*, while it is empty, and it would stay nought pixels tall
	# for the rest of the run — a tap would open a panel with nothing visible in it.
	_sheet.set_anchors_preset(Control.PRESET_BOTTOM_WIDE, true)
	_sheet.minimum_size_changed.connect(_fit_sheet)
	add_child(_sheet)

	Session.hall_changed.connect(_rebuild)
	_rebuild()
	set_process(true)
	_poll_loop()


## Turf and a shoreline until the painted ground plate lands. Drawn rather than tiled so the
## screen has somewhere for the art to go without a placeholder image in the repo.
func _draw_ground() -> void:
	var r := Rect2(Vector2.ZERO, _ground.size)
	_ground.draw_rect(r, Tokens.LAND)
	var band := r.size.y * 0.18
	_ground.draw_rect(Rect2(0, 0, r.size.x, band), Tokens.LAND_HIGH)
	_ground.draw_rect(Rect2(0, band, r.size.x, 3), Tokens.LAND.lightened(0.1))


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
	_draw_resources()
	for id: String in _plots:
		var t: Dictionary = Session.timer_for(id)
		var label: Label = _plots[id]["timer"]
		label.visible = not t.is_empty()
		if not t.is_empty():
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
	_draw_resources()
	_builders.text = "Builders %d/%d   ·   Hall at %d, %d" % [
		Session.BUILDERS - Session.builders_busy(), Session.BUILDERS,
		int(hall.get("x", 0)), int(hall.get("y", 0))]

	for child in _ground.get_children():
		child.queue_free()
	_plots.clear()
	if _ground.size.x <= 0.0:
		return

	# Far buildings first, so nearer ones overlap them correctly.
	var ordered: Array = Session.buildings.duplicate()
	ordered.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return _plot_for(str(a.get("kind", ""))).at.y < _plot_for(str(b.get("kind", ""))).at.y)

	for b: Dictionary in ordered:
		_place(b)


## The header, redrawn every frame so the counts visibly climb. A full store says so, because a
## player who does not notice is quietly earning nothing (economy.md rule 3).
func _draw_resources() -> void:
	if Session.hall.is_empty():
		_resources.text = ""
		return
	var parts: PackedStringArray = []
	for res: String in RESOURCE_NAMES:
		var amount := Session.resource_now(res)
		var text := "%s %s" % [RESOURCE_NAMES[res], _thousands(amount)]
		if Session.at_storage_cap(res):
			text += " (full)"
		parts.append(text)
	_resources.text = "   ".join(parts)


## Rates run to thousands within a session, and "17431" is unreadable at a glance.
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


func _plot_for(kind: String) -> Dictionary:
	var p: Variant = PLOTS.get(kind, SPARE_PLOT)
	return {"at": p["at"], "size": p["size"]}


func _place(b: Dictionary) -> void:
	var id := str(b.get("id", ""))
	var kind := str(b.get("kind", ""))
	var level := int(b.get("level", 1))
	var plot := _plot_for(kind)
	var width: float = _ground.size.x * float(plot["size"])
	var centre: Vector2 = Vector2(plot["at"]) * _ground.size

	var holder := Control.new()
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ground.add_child(holder)

	var tex := Art.building(kind, level)
	var art_height := width * 0.75
	if tex != null:
		# Sprites keep their own proportions; the plot only sets how wide they stand.
		var rect := TextureRect.new()
		rect.texture = tex
		rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		art_height = width * float(tex.get_height()) / float(tex.get_width())
		rect.size = Vector2(width, art_height)
		rect.position = centre - Vector2(width * 0.5, art_height)   # stand on the plot, not centred on it
		rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(rect)
	else:
		var box := PanelContainer.new()
		box.add_theme_stylebox_override("panel", Tokens.panel(Tokens.LAND.darkened(0.15), Tokens.TIMBER))
		box.size = Vector2(width, art_height)
		box.position = centre - Vector2(width * 0.5, art_height)
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var name_label := Tokens.label(KIND_NAMES.get(kind, kind.capitalize()), 24)
		name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		box.add_child(name_label)
		holder.add_child(box)

	# Level plate at the foot of the building, timer bubble above its roof.
	var caption := "%s %d" % [KIND_NAMES.get(kind, kind.capitalize()), level]
	var plate := Tokens.label(caption, 20, Tokens.BONE)
	plate.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	plate.size = Vector2(width, 24)
	plate.position = centre - Vector2(width * 0.5, -2)
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(plate)

	var timer := Tokens.label("", 22, Tokens.FIRE)
	timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	timer.size = Vector2(width, 26)
	timer.position = centre - Vector2(width * 0.5, art_height + 28)
	timer.visible = false
	timer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(timer)

	var button := Button.new()
	button.flat = true
	button.size = Vector2(width, art_height + 26)
	button.position = centre - Vector2(width * 0.5, art_height)
	button.pressed.connect(_open_sheet.bind(id))
	holder.add_child(button)

	_plots[id] = {"timer": timer}


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
			# Re-checked every frame: production may make it affordable while the sheet is open.
			act.disabled = not t.is_empty() or not _can_afford(b)
		var short: Label = _sheet.get_meta("shortfall") as Label
		if short != null:
			short.text = _shortfall_text(b)
		return

	# Detach before freeing: queue_free() is deferred, so the old rows would still be counted when
	# the sheet's height is measured a few lines below.
	for child in _sheet.get_children():
		_sheet.remove_child(child)
		child.queue_free()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", Tokens.GAP)
	_sheet.add_child(box)

	var kind := str(b.get("kind", ""))
	box.add_child(Tokens.label(KIND_NAMES.get(kind, kind.capitalize()), 36))
	var level := int(b.get("level", 1))
	box.add_child(Tokens.label("Level %d  →  %d" % [level, level + 1], 26, Tokens.BONE))

	var raw_cost: Variant = b.get("next_cost")
	var cost: Dictionary = raw_cost if typeof(raw_cost) == TYPE_DICTIONARY else {}
	if not cost.is_empty():
		box.add_child(Tokens.label(_cost_text(cost), 24, Tokens.TIMBER_LIGHT))

	var countdown := Tokens.label("", 26, Tokens.FIRE)
	box.add_child(countdown)
	_sheet.set_meta("countdown", countdown)

	var shortfall := Tokens.label(_shortfall_text(b), 24, Tokens.EMBER)
	box.add_child(shortfall)
	_sheet.set_meta("shortfall", shortfall)

	var action := Tokens.button("Upgrade")
	action.disabled = not t.is_empty() or not _can_afford(b)
	action.pressed.connect(_on_upgrade)
	box.add_child(action)
	_sheet.set_meta("action", action)

	var close := Tokens.button("Close", false)
	close.pressed.connect(func() -> void:
		_sheet.visible = false
		_sheet_building_id = "")
	box.add_child(close)

	_fit_sheet()


## Height the sheet to whatever it now contains. Called on every rebuild and again whenever a
## child reports a new minimum size, since fonts and buttons settle a frame later.
func _fit_sheet() -> void:
	var wanted: float = _sheet.get_combined_minimum_size().y
	_sheet.offset_left = 0.0
	_sheet.offset_right = 0.0
	_sheet.offset_top = -wanted
	_sheet.offset_bottom = 0.0


func _cost_text(cost: Dictionary) -> String:
	var parts: PackedStringArray = []
	for res: String in RESOURCE_NAMES:
		var amount := float(cost.get(res, 0))
		if amount > 0.0:
			parts.append("%s %s" % [RESOURCE_NAMES[res], _thousands(amount)])
	return "Costs " + "   ".join(parts)


func _can_afford(b: Dictionary) -> bool:
	var cost: Variant = b.get("next_cost")
	if typeof(cost) != TYPE_DICTIONARY:
		return false
	for res: String in RESOURCE_NAMES:
		if Session.resource_now(res) < float((cost as Dictionary).get(res, 0)):
			return false
	return true


## Name what is missing and roughly how long the builders' own production needs to cover it, so a
## blocked upgrade is a wait with a length rather than a dead button.
func _shortfall_text(b: Dictionary) -> String:
	var cost: Variant = b.get("next_cost")
	if typeof(cost) != TYPE_DICTIONARY or _can_afford(b):
		return ""
	var worst := 0.0
	var missing: PackedStringArray = []
	for res: String in RESOURCE_NAMES:
		var short: float = float((cost as Dictionary).get(res, 0)) - Session.resource_now(res)
		if short <= 0.0:
			continue
		missing.append(RESOURCE_NAMES[res])
		var rate := float(Session.per_hour.get(res, 0.0))
		worst = maxf(worst, 1e9 if rate <= 0.0 else short * 3600.0 / rate)
	if missing.is_empty():
		return ""
	if worst >= 1e8:
		return "Short of " + ", ".join(missing) + " — nothing is producing it."
	return "Short of " + ", ".join(missing) + " — about %s away." % _countdown(worst)


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
	# Say what is actually true: one builder working reads wrong as "the builders".
	var busy := Session.builders_busy()
	var free := Session.BUILDERS - busy
	var working := "A builder is at work" if busy == 1 else "%d builders are at work" % busy
	if free <= 0:
		notify.emit(working + " — none left idle.")
	elif free == 1:
		notify.emit(working + " — one builder still idle.")
	else:
		notify.emit(working + " — %d builders still idle." % free)
