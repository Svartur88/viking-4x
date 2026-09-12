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

	_toast = Tokens.label("", 24, Tokens.BONE)
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_toast.position.y -= Tokens.TOUCH * 2
	_toast.visible = false
	add_child(_toast)

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
	_toast.visible = true
	var tree := get_tree()
	await tree.create_timer(3.0).timeout
	if is_instance_valid(_toast):
		_toast.visible = false


func _on_unauthorized() -> void:
	Session.clear()
	go("auth")
	toast("Signed out. Sign in again to continue.")
