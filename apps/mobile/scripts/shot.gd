extends Node
## Screenshot helper for reviews (dev tool, not shipped behaviour).
##   xvfb-run godot --path apps/mobile -- --shot=/tmp/out --api=http://localhost:3000
## Signs up a throwaway jarl, then saves the city and map screens as PNGs so the
## look of a build can be reviewed without a device in hand.

var _dir := "/tmp"


func run(root: Control) -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			_dir = arg.substr(7)

	Config.device_id = Config._new_device_id()
	Config.jwt = ""
	var err: String = await Session.start_guest()
	if err == "":
		err = await Session.create_player("Skygga%d" % (Time.get_unix_time_from_system() as int % 10000))
	if err != "":
		print("shot: could not sign up: ", err)
		get_tree().quit(1)
		return

	root.go("city")
	await _settle()
	_save("city")

	# Zoom the hall by pushing REAL wheel events rather than calling the handler, because a check
	# that calls the handler proves only that the handler works. Note Input.parse_input_event does
	# nothing headless and reports no error; get_viewport().push_input is the one that works.
	var hall: Control = root.current_screen()
	if hall != null:
		# In WINDOW pixels, not control pixels: with a content scale factor the two differ, and an
		# event pushed in control coordinates lands outside the window and is silently dropped.
		var where := Vector2(DisplayServer.window_get_size()) * 0.5
		for i in 6:
			_wheel(where, MOUSE_BUTTON_WHEEL_UP)
		await _settle(1.0)
		_save("city-near")
		# And all the way back out. Far enough notches to hit the floor, so this proves both that
		# zoom is reversible AND that the floor is the whole plate rather than the opening framing.
		for i in 24:
			_wheel(where, MOUSE_BUTTON_WHEEL_DOWN)
		await _settle(1.0)
		_save("city-far")

	root.go("map")
	await _settle(2.5)
	_save("map")

	# Close in, where the ground detail lives.
	var near: Control = root.current_screen()
	if near != null and near.has_method("_zoom_at"):
		near.call("_zoom_at", near.size * 0.5, 2.6)
		await _settle(2.0)
		_save("map-near")

	# Pull all the way out: the kingdom band (DEC-011).
	var screen: Control = root.current_screen()
	if screen != null and screen.has_method("_show_whole_kingdom"):
		screen.call("_show_whole_kingdom")
		await _settle(3.0)
		_save("kingdom")

	get_tree().quit(0)


## One wheel notch at a point, as the engine delivers it: press then release.
func _wheel(at: Vector2, button: int) -> void:
	for pressed in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.button_index = button
		ev.pressed = pressed
		ev.position = at
		ev.global_position = at
		get_viewport().push_input(ev)


func _settle(seconds: float = 1.0) -> void:
	await get_tree().create_timer(seconds).timeout
	await RenderingServer.frame_post_draw


func _save(what: String) -> void:
	var image := get_viewport().get_texture().get_image()
	var path := "%s/%s.png" % [_dir, what]
	# Make the directory and CHECK the result. This printed "wrote" for a directory that did not
	# exist and saved nothing — a review that silently reviews last run's screenshots is worse than
	# no review at all.
	DirAccess.make_dir_recursive_absolute(_dir)
	var err := image.save_png(path)
	if err != OK:
		push_error("shot: could NOT write %s (error %d)" % [path, err])
		print("shot: FAILED to write ", path, " (error ", err, ")")
		return
	print("shot: wrote ", path)
