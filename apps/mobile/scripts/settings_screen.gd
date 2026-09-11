extends Control
## Settings stub (P2.I01). Enough to point a build at staging and to sign out —
## the full settings screen is P3.I06.

signal navigate(screen: String)
signal notify(message: String)

var _url: LineEdit


func _ready() -> void:
	var box := VBoxContainer.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	box.add_theme_constant_override("separation", Tokens.GAP)
	box.offset_left = Tokens.PAD
	box.offset_right = -Tokens.PAD
	box.offset_top = Tokens.PAD
	add_child(box)

	box.add_child(Tokens.label("Settings", 40))
	box.add_child(Tokens.label("Server", 24, Tokens.TIMBER_LIGHT))

	_url = LineEdit.new()
	_url.text = Config.base_url
	_url.custom_minimum_size = Vector2(0, Tokens.TOUCH)
	_url.add_theme_stylebox_override("normal", Tokens.panel(Tokens.IRON))
	_url.add_theme_color_override("font_color", Tokens.BONE)
	box.add_child(_url)

	var save := Tokens.button("Save server")
	save.pressed.connect(func() -> void:
		Config.base_url = _url.text.strip_edges()
		Config.save()
		notify.emit("Server set to " + Config.base_url))
	box.add_child(save)

	var check := Tokens.button("Check connection", false)
	check.pressed.connect(_check)
	box.add_child(check)

	box.add_child(Tokens.label("", 12))
	var out := Tokens.button("Sign out", false)
	out.pressed.connect(func() -> void:
		Config.clear_session()
		Session.clear()
		navigate.emit("auth"))
	box.add_child(out)

	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(spacer)
	box.add_child(Tokens.label("Viking 4X · walking skeleton · Phase 2", 20, Tokens.TIMBER_LIGHT))


func _check() -> void:
	var r: Api.Result = await Api.get_json("/health")
	notify.emit("Server is up." if r.ok else "No answer from " + Config.base_url)
