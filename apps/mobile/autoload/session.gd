extends Node
## What we know about the signed-in jarl right now. The server is the truth;
## this is a cache that every screen reads so they never disagree with each other.

signal hall_changed  ## hall, buildings or timers moved — redraw

const BUILDERS := 2  ## PR-01: two free builders, never a paid third

var player: Dictionary = {}      ## id, name, x, y, kingdomId
var hall: Dictionary = {}        ## row from halls: id, x, y, grain, timber, stone, iron
var buildings: Array = []        ## [{id, kind, slot, level}]
var timers: Array = []           ## pending timers for this hall


func signed_in() -> bool:
	return Config.jwt != "" and not player.is_empty()


func clear() -> void:
	player = {}
	hall = {}
	buildings = []
	timers = []


## Guest sign-in. Returns "" on success, else a message to show.
func start_guest() -> String:
	var r: Api.Result = await Api.post_json("/v1/auth/guest", {"device_id": Config.device_id})
	if not r.ok:
		return r.message
	Config.jwt = str(r.data.get("jwt", ""))
	Config.save()
	var p: Variant = r.data.get("player")
	if typeof(p) == TYPE_DICTIONARY and not (p as Dictionary).is_empty():
		player = p
	return ""


## Create the jarl and place the hall. Returns "" on success.
func create_player(name: String) -> String:
	var r: Api.Result = await Api.post_json("/v1/players", {"name": name})
	if not r.ok:
		if r.code == "ALREADY_IN_KINGDOM":
			return await refresh_hall()
		return r.message
	player = r.data.get("player", {})
	Config.jwt = str(r.data.get("jwt", Config.jwt))
	Config.save()
	return await refresh_hall()


## Pull the hall, buildings and pending timers. Returns "" on success.
func refresh_hall() -> String:
	var r: Api.Result = await Api.get_json("/v1/hall")
	if not r.ok:
		return r.message
	hall = r.data.get("hall", {})
	buildings = r.data.get("buildings", [])
	timers = r.data.get("timers", [])
	if player.is_empty():
		player = {"id": hall.get("player_id", ""), "x": hall.get("x", 0), "y": hall.get("y", 0)}
	hall_changed.emit()
	return ""


func building_by_id(id: String) -> Dictionary:
	for b in buildings:
		if str(b.get("id", "")) == id:
			return b
	return {}


func longhouse_level() -> int:
	for b in buildings:
		if str(b.get("kind", "")) == "longhouse":
			return int(b.get("level", 1))
	return 1


## The pending timer for a building, or {} if it is not being worked on.
func timer_for(building_id: String) -> Dictionary:
	for t in timers:
		if str(t.get("ref_type", "")) == "building" and str(t.get("ref_id", "")) == building_id:
			return t
	return {}


func builders_busy() -> int:
	var n := 0
	for t in timers:
		if str(t.get("kind", "")) == "build":
			n += 1
	return n


## Start an upgrade. Returns "" on success, else a message the player can act on.
func upgrade(building_id: String) -> String:
	var r: Api.Result = await Api.post_json("/v1/buildings/%s/upgrade" % building_id)
	if not r.ok:
		return _upgrade_message(r)
	await refresh_hall()
	return ""


func _upgrade_message(r: Api.Result) -> String:
	match r.code:
		"LONGHOUSE_GATE":
			return "The Longhouse must be higher before this can grow."
		"NO_BUILDER":
			return "Both builders are busy."
		"INSUFFICIENT":
			return "Not enough resources yet."
		"MAX_LEVEL":
			return "This is as high as it goes."
		_:
			return r.message
