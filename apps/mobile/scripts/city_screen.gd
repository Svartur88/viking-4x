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

## The painted ground the whole hall stands on. Every building position in the server catalogue is a
## fraction of THIS image, so the ground keeps the plate's shape exactly — letterbox it or crop it
## and the Naust stops being on the beach.
const HALL_GROUND := "res://art/hall/hall-ground.webp"

## How much of the plate's height fits in the window (DEC-017). Less than one, so there is always
## somewhere to drag to: the forest and the shore are a real distance apart. The width follows from
## the plate's own shape rather than being chosen separately.
const HALL_VISIBLE := 0.62

const RESOURCE_NAMES := {"grain": "Grain", "timber": "Timber", "stone": "Stone", "iron": "Iron"}

## Display names only. WHICH building trains WHOM comes from the server (Session.trains) — this
## screen used to keep its own copy of that mapping, and two copies of one table drift.
const UNIT_NAMES := {
	"shieldwall": "Shieldwall",
	"archer": "Archers",
	"berserker": "Berserkers",
	"longship": "Longships",
}

var _resources: Label
var _builders: Label
var _view: Control            ## the window onto the hall
var _ground: Control          ## the land, larger than the window
var _plate: Texture2D         ## the painted ground, or null before it has been imported
var _camera := Vector2.ZERO   ## top-left of the window, in ground pixels
var _dragging := false
var _drag_moved := 0.0
var _centred_once := false
var _hits: Array = []         ## tappable areas in ground coordinates, near to far
var _sheet: PanelContainer
var _sheet_building_id := ""
var _sheet_empty_kind := ""
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

	# The hall is bigger than the screen (DEC-017). `_view` is the window onto it and does the
	# clipping; `_ground` is the land itself, larger, and it moves under the window when dragged.
	_view = Control.new()
	_view.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_view.clip_contents = true
	_view.gui_input.connect(_on_view_input)
	_view.resized.connect(_on_view_resized)
	column.add_child(_view)

	# The plate may not be imported yet on a fresh clone; the ground copes with that rather than
	# refusing to draw, so a missing texture costs the landscape and not the screen.
	if ResourceLoader.exists(HALL_GROUND):
		_plate = load(HALL_GROUND) as Texture2D

	_ground = Control.new()
	_ground.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_ground.draw.connect(_draw_ground)
	_view.add_child(_ground)

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


## The land inside the hall (DEC-017): forest to the left, scree up and to the right, the cleared
## yard in the middle, fields below it, and the marsh and shore at the bottom. Bigger than the
## window — you drag to find the rest of it.
##
## The painted plate, stretched over the whole ground and nothing else drawn on top of it. The flat
## coloured bands that used to live here were a stand-in; the plate replaces them outright, and the
## catalogue's coordinates are read off this exact image.
func _draw_ground() -> void:
	if _ground.size.x <= 0.0 or _ground.size.y <= 0.0:
		return
	if _plate == null:
		# No plate imported yet: plain earth rather than a black hole, so the hall still reads.
		_ground.draw_rect(Rect2(Vector2.ZERO, _ground.size), Tokens.LAND)
		return
	_ground.draw_texture_rect(_plate, Rect2(Vector2.ZERO, _ground.size), false)


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
	var army := "no troops"
	if Session.troop_capacity > 0:
		army = "%d troops (%d/%d)" % [
			Session.troops_at_home(), Session.troops_committed, Session.troop_capacity]
	_builders.text = "Builders %d/%d   ·   %s   ·   Hall at %d, %d" % [
		Session.BUILDERS - Session.builders_busy(), Session.BUILDERS, army,
		int(hall.get("x", 0)), int(hall.get("y", 0))]

	# The sheet shows things that just changed — troops in training, what is affordable — so it is
	# rebuilt too, not just the ground. Refreshing only the countdown left it showing batch buttons
	# for a batch that had already started.
	if _sheet.visible and _sheet_building_id != "":
		_refresh_sheet(true)
	elif _sheet.visible and _sheet_empty_kind != "":
		for p: Dictionary in Session.plots:
			if str(p.get("kind", "")) == _sheet_empty_kind:
				_rebuild_empty_sheet(p)

	for child in _ground.get_children():
		child.queue_free()
	_plots.clear()
	_hits.clear()
	if _ground.size.x <= 0.0:
		return

	# The server sends every slot in the hall, already sorted far to near, so nearer buildings
	# overlap further ones correctly and empty ground is drawn in its proper place.
	for plot: Dictionary in Session.plots:
		_place_plot(plot)


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


## One slot: the building if it stands, bare ground with its name and the level that unlocks it if
## it does not. An empty slot is visible from the first minute — you can see where the Rune hall
## will go long before you can build it, and that anticipation is free.
func _place_plot(plot: Dictionary) -> void:
	var kind := str(plot.get("kind", ""))
	var built := bool(plot.get("built", false))
	var level := int(plot.get("level", 0))
	var at: Dictionary = plot.get("at", {"x": 0.5, "y": 0.5})
	var width: float = _ground.size.x * float(plot.get("size", 0.14))
	var centre := Vector2(float(at.get("x", 0.5)), float(at.get("y", 0.5))) * _ground.size

	var holder := Control.new()
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_ground.add_child(holder)

	var art_height := width * 0.75
	var tex: Texture2D = Art.building(kind, level) if built else null
	if tex != null:
		var rect := TextureRect.new()
		rect.texture = tex
		rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		art_height = width * float(tex.get_height()) / float(tex.get_width())
		rect.size = Vector2(width, art_height)
		rect.position = centre - Vector2(width * 0.5, art_height)
		rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(rect)
	else:
		var box := PanelContainer.new()
		var ready_to_build := bool(plot.get("can_found", false))
		if built:
			var solid := Tokens.panel(Tokens.LAND.darkened(0.15), Tokens.TIMBER)
			box.add_theme_stylebox_override("panel", solid)
		elif ready_to_build:
			# Cleared ground with a stake in it: this one you could start today.
			var cleared := Tokens.panel(Color("6B5B3E", 0.55), Tokens.FIRE)
			box.add_theme_stylebox_override("panel", cleared)
		else:
			# Just ground. Something will stand here one day.
			var bare := Tokens.panel(Color("000000", 0.18), Color("000000", 0.30))
			box.add_theme_stylebox_override("panel", bare)
		box.size = Vector2(width, art_height)
		box.position = centre - Vector2(width * 0.5, art_height)
		box.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.add_child(box)

	var caption := str(plot.get("name", kind))
	if built:
		caption = "%s %d" % [caption, level]
	var plate := Tokens.label(caption, 20, Tokens.BONE if built else Color(Tokens.BONE, 0.55))
	plate.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	plate.size = Vector2(width, 24)
	plate.position = centre - Vector2(width * 0.5, -2)
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(plate)

	if not built:
		var founding: Dictionary = Session.founding_timer_for(kind)
		var note := ""
		if not founding.is_empty():
			note = "building  " + _countdown(Api.seconds_until(str(founding.get("due_at", ""))))
		elif bool(plot.get("later", false)):
			note = "not yet"
		elif not bool(plot.get("can_found", false)):
			note = "Longhouse %d" % int(plot.get("unlock", 1))
		if note != "":
			var tone: Color = Tokens.FIRE if not founding.is_empty() else Color(Tokens.BONE, 0.4)
			var hint := Tokens.label(note, 18, tone)
			hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			hint.size = Vector2(width, 22)
			hint.position = centre - Vector2(width * 0.5, -24)
			hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
			holder.add_child(hint)

	var timer := Tokens.label("", 22, Tokens.FIRE)
	timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	timer.size = Vector2(width, 26)
	timer.position = centre - Vector2(width * 0.5, art_height + 28)
	timer.visible = false
	timer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(timer)

	# No Button here on purpose. A button would swallow the press that starts a drag, so dragging
	# from anywhere near a building would fail to move the hall. Taps are hit-tested in
	# _on_view_input instead, the same way the world map does it.
	_hits.append({
		"kind": kind,
		"id": str(plot.get("id", "")),
		"built": built,
		"rect": Rect2(centre - Vector2(width * 0.5, art_height), Vector2(width, art_height + 26)),
	})
	if built:
		_plots[str(plot.get("id", ""))] = {"timer": timer}


## Tapping bare ground. Says what will stand here, what it is for, and either offers to start it or
## says plainly what is in the way.
func _open_empty_sheet(kind: String) -> void:
	var plot: Dictionary = {}
	for p: Dictionary in Session.plots:
		if str(p.get("kind", "")) == kind:
			plot = p
	if plot.is_empty():
		return
	_sheet_building_id = ""
	_sheet_empty_kind = kind
	_sheet.visible = true
	_rebuild_empty_sheet(plot)


func _rebuild_empty_sheet(plot: Dictionary) -> void:
	for child in _sheet.get_children():
		_sheet.remove_child(child)
		child.queue_free()
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", Tokens.GAP)
	_sheet.add_child(box)

	var kind := str(plot.get("kind", ""))
	box.add_child(Tokens.label(str(plot.get("name", kind)), 34))
	box.add_child(Tokens.label(str(plot.get("purpose", "")), 24, Tokens.TIMBER_LIGHT))

	var founding: Dictionary = Session.founding_timer_for(kind)
	if not founding.is_empty():
		var left := _countdown(Api.seconds_until(str(founding.get("due_at", ""))))
		box.add_child(Tokens.label("Being built  ·  ready in " + left, 26, Tokens.FIRE))
	elif bool(plot.get("later", false)):
		box.add_child(Tokens.label("Not in the game yet.", 24, Tokens.EMBER))
	elif not bool(plot.get("can_found", false)):
		var needs := int(plot.get("unlock", 1))
		var have := Session.longhouse_level()
		box.add_child(Tokens.label(
			"Needs Longhouse %d. Yours is %d." % [needs, have], 24, Tokens.EMBER))
	else:
		var cost: Variant = plot.get("found_cost")
		if typeof(cost) == TYPE_DICTIONARY:
			box.add_child(Tokens.label(_cost_text(cost as Dictionary), 24, Tokens.TIMBER_LIGHT))
		var start := Tokens.button("Build it")
		start.pressed.connect(func() -> void:
			start.disabled = true
			var err: String = await Session.found(kind)
			notify.emit(err if err != "" else "The builders have begun."))
		box.add_child(start)

	var close := Tokens.button("Close", false)
	close.pressed.connect(func() -> void:
		_sheet.visible = false
		_sheet_empty_kind = "")
	box.add_child(close)
	_fit_sheet()


func _open_sheet(building_id: String) -> void:
	_sheet_empty_kind = ""
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

	_add_training(box, b)

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


## Training, for a building that trains. Batch sizes rather than a slider: three taps that each say
## what they cost beat a number you have to reason about before you know what a Shieldwall is.
func _add_training(box: VBoxContainer, b: Dictionary) -> void:
	var kind := str(b.get("kind", ""))
	var type := str(Session.trains.get(kind, ""))
	if type == "":
		return
	var unit: String = UNIT_NAMES.get(type, type.capitalize())
	var id := str(b.get("id", ""))

	box.add_child(Tokens.label("", 8))
	box.add_child(Tokens.label("Train %s" % unit, 28, Tokens.BONE))

	var t: Dictionary = Session.training_timer_for(id)
	if not t.is_empty():
		var left := _countdown(Api.seconds_until(str(t.get("due_at", ""))))
		var payload: Dictionary = t.get("payload", {})
		box.add_child(Tokens.label("%d in training  ·  ready in %s" % [
			int(payload.get("count", 0)), left], 24, Tokens.FIRE))
		return

	var room: int = Session.troop_capacity - Session.troops_committed
	if room <= 0:
		box.add_child(Tokens.label("The barracks is full. Upgrade it to hold more.", 24, Tokens.EMBER))
		return

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", Tokens.GAP)
	box.add_child(row)
	for batch: int in [5, 20, 50]:
		var n: int = mini(batch, room)
		var button := Tokens.button("%d" % n, batch == 20)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.disabled = not _can_pay_for(kind, n)
		button.pressed.connect(func() -> void:
			button.disabled = true
			var err: String = await Session.train(id, n)
			notify.emit(err if err != "" else "%d %s are training." % [n, unit.to_lower()]))
		row.add_child(button)

	box.add_child(Tokens.label(_train_cost_text(kind, 5), 22, Tokens.TIMBER_LIGHT))


## Per-man cost, straight from the server's own table so it cannot drift from what is charged.
func _unit_cost(kind: String) -> Dictionary:
	var type := str(Session.trains.get(kind, ""))
	var entry: Variant = Session.unit_costs.get(type, {})
	if typeof(entry) != TYPE_DICTIONARY:
		return {}
	var cost: Variant = (entry as Dictionary).get("cost", {})
	return cost if typeof(cost) == TYPE_DICTIONARY else {}


func _can_pay_for(kind: String, count: int) -> bool:
	var cost := _unit_cost(kind)
	if cost.is_empty():
		return true            # the server will say no if we are wrong; never block on missing data
	for res: String in RESOURCE_NAMES:
		if Session.resource_now(res) < float(cost.get(res, 0)) * count:
			return false
	return true


func _train_cost_text(kind: String, count: int) -> String:
	var cost := _unit_cost(kind)
	if cost.is_empty():
		return ""
	var parts: PackedStringArray = []
	for res: String in RESOURCE_NAMES:
		var each := float(cost.get(res, 0))
		if each > 0.0:
			parts.append("%s %s" % [RESOURCE_NAMES[res], _thousands(each * count)])
	return "%d costs " % count + "   ".join(parts)


func _on_view_resized() -> void:
	if _view.size.x <= 0.0:
		return
	# The ground keeps the plate's own shape: the catalogue's coordinates are fractions of that
	# image, so any stretching moves buildings off the ground they were placed on. Height is chosen
	# first, then widened if a wide window would otherwise see past the edge of the world.
	var aspect := 0.75
	if _plate != null and _plate.get_height() > 0:
		aspect = float(_plate.get_width()) / float(_plate.get_height())
	var ground_h: float = maxf(_view.size.y / HALL_VISIBLE, _view.size.x / aspect)
	_ground.size = Vector2(ground_h * aspect, ground_h)
	_clamp_camera()
	if not _centred_once:
		_centre_on_longhouse()
		_centred_once = true
	_rebuild()


## Open looking at the Longhouse. Whatever else the hall holds, that is where you live.
func _centre_on_longhouse() -> void:
	for plot: Dictionary in Session.plots:
		if str(plot.get("kind", "")) == "longhouse":
			var at: Dictionary = plot.get("at", {})
			var spot := Vector2(float(at.get("x", 0.5)), float(at.get("y", 0.5))) * _ground.size
			_camera = spot - _view.size * 0.5
			_clamp_camera()
			return


func _clamp_camera() -> void:
	var span := _ground.size - _view.size
	_camera.x = clampf(_camera.x, 0.0, maxf(0.0, span.x))
	_camera.y = clampf(_camera.y, 0.0, maxf(0.0, span.y))
	_ground.position = -_camera


## Press, hold and move to look around the hall. A press that barely moves is a tap and is left to
## the buttons underneath; anything further is a drag and the buttons must not fire.
func _on_view_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			_dragging = mb.pressed
			if mb.pressed:
				_drag_moved = 0.0
			elif _drag_moved < 8.0:
				_tap_hall(mb.position)
	elif event is InputEventMouseMotion and _dragging:
		var mm := event as InputEventMouseMotion
		_drag_moved += mm.relative.length()
		if _drag_moved > 6.0:
			_camera -= mm.relative
			_clamp_camera()


## A tap inside the hall. Nearest building wins, and the ones in front are tested first so a
## Longhouse standing over the ground behind it takes the tap rather than what it hides.
func _tap_hall(at_view: Vector2) -> void:
	var at := at_view + _camera
	for i in range(_hits.size() - 1, -1, -1):
		var hit: Dictionary = _hits[i]
		var rect: Rect2 = hit["rect"]
		if rect.grow(6.0).has_point(at):
			if bool(hit["built"]):
				_open_sheet(str(hit["id"]))
			else:
				_open_empty_sheet(str(hit["kind"]))
			return
	_sheet.visible = false
	_sheet_empty_kind = ""
	_sheet_building_id = ""
