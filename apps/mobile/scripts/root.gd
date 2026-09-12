extends Control
## The router (P2.I01). One screen at a time plus a bottom bar, per screen-map.md.
## Screens are built in code rather than .tscn files while the art direction is open (OQ-04):
## swapping grey boxes for sprites later touches the screens, not this file.

const AuthScreen := preload("res://scripts/auth_screen.gd")
const Smoke := preload("res://scripts/smoke.gd")
const Shot := preload("res://scripts/shot.gd")
const CityScreen := preload("res://scripts/city_screen.gd")
const MapScreen := preload("res://scripts/map_screen.gd")
const SettingsScreen := preload("res://scripts/settings_screen.gd")

var _holder: Control
var _bar: HBoxContainer
var _toast: Label
var _toast_panel: PanelContainer
var _toast_seq := 0
var _current := ""


func _ready() -> void:
	name = "Root"
	# Dev entry points: a headless contract check, and a screenshot run for reviews.
	if OS.get_cmdline_user_args().has("--smoke"):
		var smoke := Smoke.new()
		add_child(smoke)
		await smoke.run()
		return
	_build_chrome()
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			var shot := Shot.new()
			add_child(shot)
			await shot.run(self)
			return
	await _open_first_screen()


func _build_chrome() -> void:
	var bg := ColorRect.new()
	bg.color = Tokens.INK
	bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var column := VBoxContainer.new()
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.add_theme_constant_override("separation", 0)
	add_child(column)

	_holder = Control.new()
	_holder.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_holder)

	_bar = HBoxContainer.new()
	_bar.add_theme_constant_override("separation", 0)
	_bar.custom_minimum_size = Vector2(0, Tokens.TOUCH)
	column.add_child(_bar)
	for entry in [["Hall", "city"], ["Map", "map"], ["Settings", "settings"]]:
		var b := Tokens.button(entry[0], false)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.pressed.connect(go.bind(entry[1]))
		_bar.add_child(b)

	# Messages sit near the TOP. They used to sit bottom-centre, which is where every bottom sheet
	# opens, so "the builders are at work" landed squarely on the Close button underneath it.
	# Nothing lives along the top edge but a status line, and a message there is out of the way of
	# the thumb as well as the sheet.
	_toast_panel = PanelContainer.new()
	_toast_panel.add_theme_stylebox_override("panel", Tokens.panel(Tokens.INK, Tokens.FIRE))
	_toast_panel.set_anchors_preset(Control.PRESET_TOP_WIDE, true)
	_toast_panel.offset_left = Tokens.PAD * 2
	_toast_panel.offset_right = -Tokens.PAD * 2
	_toast_panel.offset_top = Tokens.TOUCH * 1.6
	_toast_panel.offset_bottom = Tokens.TOUCH * 1.6 + Tokens.TOUCH
	_toast_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast_panel.visible = false
	add_child(_toast_panel)
	_toast = Tokens.label("", 24, Tokens.BONE)
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_toast.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_toast.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_toast_panel.add_child(_toast)

	Api.unauthorized.connect(_on_unauthorized)

	# Windows keyboard shortcuts (design-language.md): 1 Hall, 2 Map, 3 Settings.
	set_process_unhandled_key_input(true)


func _open_first_screen() -> void:
	if Config.jwt != "":
		var err: String = await Session.refresh_hall()
		if err == "":
			go("city")
			return
	go("auth")


func _unhandled_key_input(event: InputEvent) -> void:
	if _current == "auth" or not (event is InputEventKey) or not event.pressed:
		return
	match (event as InputEventKey).keycode:
		KEY_1: go("city")
		KEY_2: go("map")
		KEY_3: go("settings")


func go(screen: String) -> void:
	if _current == screen:
		return
	_current = screen
	for child in _holder.get_children():
		child.queue_free()
	var node: Control
	match screen:
		"city": node = CityScreen.new()
		"map": node = MapScreen.new()
		"settings": node = SettingsScreen.new()
		_: node = AuthScreen.new()
	node.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if node.has_signal("navigate"):
		node.navigate.connect(go)
	if node.has_signal("notify"):
		node.notify.connect(toast)
	_holder.add_child(node)
	_bar.visible = screen != "auth"


## The screen currently on show, or null. Used by the screenshot tool.
func current_screen() -> Control:
	var kids := _holder.get_children()
	return kids[0] as Control if kids.size() > 0 else null


func toast(message: String) -> void:
	if message == "":
		return
	_toast.text = message
	_toast_panel.visible = true
	# A newer message replaces an older one rather than queueing behind it, and only the newest
	# message's timer may hide the panel — otherwise the first message's timer clears the second.
	_toast_seq += 1
	var mine := _toast_seq
	var tree := get_tree()
	await tree.create_timer(3.0).timeout
	if is_instance_valid(_toast_panel) and mine == _toast_seq:
		_toast_panel.visible = false


func _on_unauthorized() -> void:
	Session.clear()
	go("auth")
	toast("Signed out. Sign in again to continue.")
