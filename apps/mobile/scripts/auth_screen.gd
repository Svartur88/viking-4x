extends Control
## Auth screen (P2.I01). Guest start, then a name. Sign in with Apple/Google lands in P2.S03.
## onboarding.md: the first ten minutes matter, so this asks for exactly one thing.

signal navigate(screen: String)
signal notify(message: String)

var _name_field: LineEdit
var _start: Button
var _status: Label


func _ready() -> void:
	var box := VBoxContainer.new()
	box.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", Tokens.GAP * 2)
	box.offset_left = Tokens.PAD * 2
	box.offset_right = -Tokens.PAD * 2
	add_child(box)

	var title := Tokens.label("Viking 4X", 64, Tokens.BONE)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)

	var sub := Tokens.label("Walking skeleton — grey boxes on purpose.", 24, Tokens.TIMBER_LIGHT)
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(sub)

	_name_field = LineEdit.new()
	_name_field.placeholder_text = "Your jarl's name"
	_name_field.max_length = 20
	_name_field.custom_minimum_size = Vector2(0, Tokens.TOUCH)
	_name_field.add_theme_stylebox_override("normal", Tokens.panel(Tokens.IRON))
	_name_field.add_theme_stylebox_override("focus", Tokens.panel(Tokens.IRON, Tokens.FIRE))
	_name_field.add_theme_color_override("font_color", Tokens.BONE)
	_name_field.text_submitted.connect(func(_t: String) -> void: _on_start())
	box.add_child(_name_field)

	_start = Tokens.button("Claim a hall")
	_start.pressed.connect(_on_start)
	box.add_child(_start)

	_status = Tokens.label("", 24, Tokens.EMBER)
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(_status)

	var where := Tokens.label("Server: " + Config.base_url, 20, Tokens.TIMBER_LIGHT)
	where.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(where)


func _on_start() -> void:
	var jarl := _name_field.text.strip_edges()
	if jarl.length() < 2:
		_status.text = "A name of two letters or more."
		return
	_start.disabled = true
	_status.text = ""
	var err: String = await Session.start_guest()
	if err == "":
		err = await Session.create_player(jarl)
	_start.disabled = false
	if err != "":
		_status.text = err
		return
	navigate.emit("city")
	var x := int(Session.hall.get("x", 0))
	var y := int(Session.hall.get("y", 0))
	notify.emit("Your hall stands at %d, %d." % [x, y])
