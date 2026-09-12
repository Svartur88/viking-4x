extends Control
## Settings stub (P2.I01). Enough to point a build at staging and to sign out —
## the full settings screen is P3.I06.

signal navigate(screen: String)
signal notify(message: String)

var _url: LineEdit
var _fresh_note: Label
var _fresh_armed := false


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

	# Start fresh (dev aid). Signing out is not enough to become a new player: guest auth keys off
	# the device id, so signing back in hands you the same hall. Every time the starter set changes
	# — new buildings, nodes seeded at sign-up — an existing hall silently lacks the new thing and
	# looks broken. This makes the machine forget who it is, so the next sign-in is a real new jarl.
	box.add_child(Tokens.label("", 12))
	box.add_child(Tokens.label("Testing", 24, Tokens.TIMBER_LIGHT))
	var fresh := Tokens.button("Start fresh — new jarl, new hall", false)
	fresh.pressed.connect(_confirm_fresh)
	box.add_child(fresh)
	_fresh_note = Tokens.label("", 22, Tokens.EMBER)
	_fresh_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(_fresh_note)

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


## Two taps, because the old hall cannot be got back: a new device id means the server has no way
## to recognise the player it belonged to.
func _confirm_fresh() -> void:
	if not _fresh_armed:
		_fresh_armed = true
		_fresh_note.text = "This abandons your current hall for good. Tap again to confirm."
		await get_tree().create_timer(6.0).timeout
		if is_inside_tree() and _fresh_armed:
			_fresh_armed = false
			_fresh_note.text = ""
		return
	_fresh_armed = false
	_fresh_note.text = ""
	Config.jwt = ""
	Config.device_id = Config._new_device_id()
	Config.save()
	Session.clear()
	notify.emit("A new jarl. Claim a hall.")
	navigate.emit("auth")
