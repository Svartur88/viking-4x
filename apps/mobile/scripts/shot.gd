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

	root.go("map")
	await _settle(2.5)
	_save("map")

	# Pull all the way out: the kingdom band (DEC-011).
	var screen: Control = root.current_screen()
	if screen != null and screen.has_method("_show_whole_kingdom"):
		screen.call("_show_whole_kingdom")
		await _settle(3.0)
		_save("kingdom")

	get_tree().quit(0)


func _settle(seconds: float = 1.0) -> void:
	await get_tree().create_timer(seconds).timeout
	await RenderingServer.frame_post_draw


func _save(what: String) -> void:
	var image := get_viewport().get_texture().get_image()
	var path := "%s/%s.png" % [_dir, what]
	image.save_png(path)
	print("shot: wrote ", path)
