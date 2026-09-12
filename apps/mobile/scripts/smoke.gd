extends Node
## End-to-end smoke test of the walking skeleton, client side.
##   godot --headless --path apps/mobile -- --smoke --api=http://localhost:3000
## Exits 0 when a guest can sign up, see a hall, start an upgrade, and read the map;
## non-zero with a reason otherwise. This is what CI runs so the client cannot drift
## away from the server contract unnoticed (packages/shared/openapi).

var _failures: Array[String] = []


func check(condition: bool, what: String) -> void:
	if condition:
		print("  ok   ", what)
	else:
		_failures.append(what)
		print("  FAIL ", what)


func run() -> void:
	print("Walking skeleton smoke test against ", Config.base_url)

	var health: Api.Result = await Api.get_json("/health")
	check(health.ok, "server answers /health")
	if not health.ok:
		return _finish()

	# A fresh install every run, so placement and sign-up are genuinely exercised.
	Config.device_id = Config._new_device_id()
	Config.jwt = ""
	var err: String = await Session.start_guest()
	check(err == "", "guest sign-in (%s)" % err)

	var jarl := "Smoke%d" % (Time.get_unix_time_from_system() as int % 100000)
	err = await Session.create_player(jarl)
	check(err == "", "sign up places a hall (%s)" % err)
	check(not Session.hall.is_empty(), "hall came back")
	check(Session.buildings.size() >= 3, "starter buildings: %d" % Session.buildings.size())

	var skew: float = absf(Api.clock_skew)
	check(skew < 86400.0, "server clock read (skew %.1fs)" % Api.clock_skew)

	var longhouse := ""
	for b: Dictionary in Session.buildings:
		if str(b.get("kind", "")) == "longhouse":
			longhouse = str(b.get("id", ""))
	check(longhouse != "", "longhouse found")

	if longhouse != "":
		err = await Session.upgrade(longhouse)
		check(err == "", "upgrade starts (%s)" % err)
		var t: Dictionary = Session.timer_for(longhouse)
		check(not t.is_empty(), "a pending timer exists for the longhouse")
		if not t.is_empty():
			check(Api.seconds_until(str(t.get("due_at", ""))) > 0.0, "the countdown is in the future")
		err = await Session.upgrade(longhouse)
		check(err != "", "a second upgrade on the same building is refused")

	var hx: int = int(Session.hall.get("x", 0))
	var hy: int = int(Session.hall.get("y", 0))
	var chunk: Api.Result = await Api.get_json("/v1/map/chunk?cx=%d&cy=%d" % [hx / 64, hy / 64])
	check(chunk.ok, "terrain chunk fetched")
	if chunk.ok:
		var bytes := Marshalls.base64_to_raw(str(chunk.data.get("tiles", "")))
		var expected := int(chunk.data.get("w", 0)) * int(chunk.data.get("h", 0))
		check(bytes.size() == expected, "chunk decodes to w*h bytes")

	var query := "/v1/map/viewport?x0=%d&y0=%d&x1=%d&y1=%d" % [hx - 4, hy - 4, hx + 4, hy + 4]
	var view: Api.Result = await Api.get_json(query)
	check(view.ok, "viewport fetched")
	if view.ok:
		var found := false
		for h: Dictionary in view.data.get("halls", []):
			if str(h.get("hall_id", "")) == str(Session.hall.get("id", "")):
				found = true
				check(bool(h.get("shielded", false)), "own hall is under the starter shield")
		check(found, "own hall appears on the map")

	var overview: Api.Result = await Api.get_json("/v1/map/overview")
	check(overview.ok, "kingdom overview markers fetched")
	if overview.ok:
		check(int(overview.data.get("size", 0)) > 0, "overview reports the kingdom size")
		var own := 0
		for h: Dictionary in overview.data.get("halls", []):
			if bool(h.get("own", false)):
				own += 1
		check(own == 1, "exactly one hall is flagged as mine")

	var png := await Api.get_bytes("/v1/map/overview.png")
	check(png.size() > 100, "kingdom overview PNG fetched (%d bytes)" % png.size())
	if png.size() > 100:
		var image := Image.new()
		check(image.load_png_from_buffer(png) == OK, "overview PNG decodes in the client")
		var expected_px := int(overview.data.get("size", 0))
		check(image.get_width() == expected_px, "overview image is one pixel per tile")

	# --- marches and gathering (P3.M01) ---
	var nx := int(Session.hall.get("x", 0))
	var ny := int(Session.hall.get("y", 0))
	var around := "/v1/map/viewport?x0=%d&y0=%d&x1=%d&y1=%d" % [nx - 30, ny - 30, nx + 30, ny + 30]
	var near: Api.Result = await Api.get_json(around)
	var nodes: Array = near.data.get("nodes", []) if near.ok else []
	check(not nodes.is_empty(), "nodes were seeded around the new hall (%d)" % nodes.size())
	var kinds := {}
	for n: Dictionary in nodes:
		kinds[str(n.get("resource", ""))] = true
	check(kinds.size() == 4, "all four resources are gatherable nearby")

	# Nothing may leave the hall without men (P3.T01): a brand-new jarl has none.
	if not nodes.is_empty():
		var empty_handed: String = await Session.send_gather(str(nodes[0].get("node_id", "")))
		check(empty_handed != "", "a march with no troops is refused (%s)" % empty_handed)

	# Training: the Barracks stands from the first minute and a batch starts on a timer.
	var barracks := ""
	for b: Dictionary in Session.buildings:
		if str(b.get("kind", "")) == "barracks":
			barracks = str(b.get("id", ""))
	check(barracks != "", "the hall has a Barracks")
	var room := Session.troop_capacity
	check(room > 0, "the Barracks gives the hall a troop capacity (%d)" % room)
	if barracks != "":
		var trained: String = await Session.train(barracks, 5)
		check(trained == "", "a batch starts training (%s)" % trained)
		check(Session.troops_committed == 5, "five men are committed while they train")
		# One queue per building. Capacity is NOT checked here: with a batch already running, a
		# refusal would say ALREADY_TRAINING and the check would pass for the wrong reason.
		# test/troops.test.ts covers capacity properly, on a hall with an idle Barracks.
		var again: String = await Session.train(barracks, 5)
		check(again != "", "one queue per building: a second batch is refused")

	_finish()


func _finish() -> void:
	if _failures.is_empty():
		print("smoke: all checks passed")
		get_tree().quit(0)
	else:
		print("smoke: %d check(s) failed" % _failures.size())
		get_tree().quit(1)
