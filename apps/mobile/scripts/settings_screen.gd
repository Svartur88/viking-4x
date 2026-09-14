extends Control
## Settings stub (P2.I01). Enough to point a build at staging and to sign out —
## the full settings screen is P3.I06.

signal navigate(screen: String)
signal notify(message: String)

var _url: LineEdit
var _fresh_note: Label
var _jump_note: Label
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

	# Jump. Every system now lands deep in the ladder — research at Longhouse 7, the favour ladder
	# around 13, the Berg branch at 17 — and climbing to each before looking at it is ten minutes of
	# clicking per look. The server refuses this outright when NODE_ENV=production, so the button
	# simply reports what the server said rather than hiding itself.
	box.add_child(Tokens.label("", 8))
	box.add_child(Tokens.label("Jump to a level — raises the hall, founds everything unlocked, fills the stores", 20, Tokens.TIMBER_LIGHT))
	var jump_row := HBoxContainer.new()
	jump_row.add_theme_constant_override("separation", Tokens.GAP)
	box.add_child(jump_row)
	for lvl in [7, 13, 17, 30]:
		var j := Tokens.button(str(lvl), false)
		j.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		j.custom_minimum_size = Vector2(0, Tokens.TOUCH)
		j.pressed.connect(_jump.bind(lvl))
		jump_row.add_child(j)
	_jump_note = Tokens.label("", 22, Tokens.EMBER)
	_jump_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(_jump_note)

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


## Put this jarl at `level` so a system can be reached without playing to it.
##
## Every line after an await is guarded by is_inside_tree(), the same way _confirm_fresh below is.
## A screen can be freed while a request is in flight — the router frees the whole holder on any
## navigation — and touching a freed Label afterwards halts the running game in the editor with
## "previously freed instance". The game window then sits there frozen mid-sentence, which looks
## like a hang and is really a paused process.
##
## `_jumping` stops a second tap starting a second request: the first is still in flight, the
## server would do the work twice, and the two replies would fight over the label.
var _jumping := false

func _jump(level: int) -> void:
	if _jumping:
		return
	_jumping = true
	_jump_note.text = "Jumping to %d..." % level
	var r: Api.Result = await Api.post_json("/v1/dev/jump", {"level": level})
	if not is_inside_tree():
		return
	_jumping = false
	if not r.ok:
		# A 404 here is the production guard doing its job, not a bug. Say which it is.
		var missing: bool = r.code == "NOT_FOUND" or r.code == "HTTP_404"
		_jump_note.text = "Not available on this server — it is a testing tool and the live build refuses it." if missing else r.message
		return
	var err: String = await Session.refresh_hall()
	if not is_inside_tree():
		return
	if err != "":
		_jump_note.text = err
		return
	_jump_note.text = "Now at Longhouse %d. Everything unlocked is built." % level
	notify.emit("Jumped to Longhouse %d" % level)


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
