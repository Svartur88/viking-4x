extends Node
## What we know about the signed-in jarl right now. The server is the truth;
## this is a cache that every screen reads so they never disagree with each other.

signal hall_changed  ## hall, buildings or timers moved — redraw

const BUILDERS := 2  ## PR-01: two free builders, never a paid third

var player: Dictionary = {}      ## id, name, x, y, kingdomId
var hall: Dictionary = {}        ## row from halls: id, x, y, grain, timber, stone, iron
var buildings: Array = []        ## [{id, kind, slot, level}]
var timers: Array = []           ## pending timers for this hall
var per_hour: Dictionary = {}    ## grain/timber/stone/iron produced per hour, from the server
var storage_cap: float = 0.0     ## per resource; production stops here (economy.md rule 3)
var resources_read_at: float = 0.0  ## unix seconds when the counts above were true
var marches: Array = []          ## this jarl's marches in the air
var march_slots: int = 1         ## from the Longhouse (progression.md rule 4)
var troops: Array = []           ## stacks standing in the hall: [{type, tier, count, carry}]
var troop_capacity: int = 0      ## from the Barracks (units.md rule 8)
var troops_committed: int = 0    ## at home + in training + away on a march
var unit_costs: Dictionary = {}  ## per-type stats and costs, straight from the server
var trains: Dictionary = {}      ## building kind -> troop type; from the server, never mirrored


func signed_in() -> bool:
	return Config.jwt != "" and not player.is_empty()


## Forget everything about the signed-in jarl. Every field, not just the obvious four: a stale
## march list or production rate carried into a new sign-in shows numbers belonging to someone who
## no longer exists.
func clear() -> void:
	player = {}
	hall = {}
	buildings = []
	timers = []
	marches = []
	march_slots = 1
	troops = []
	troop_capacity = 0
	troops_committed = 0
	per_hour = {}
	storage_cap = 0.0
	resources_read_at = 0.0


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
	marches = r.data.get("marches", [])
	march_slots = int(r.data.get("march_slots", 1))
	troops = r.data.get("troops", [])
	troop_capacity = int(r.data.get("troop_capacity", 0))
	troops_committed = int(r.data.get("troops_committed", 0))
	unit_costs = r.data.get("unit_costs", {})
	trains = r.data.get("trains", {})
	var prod: Variant = r.data.get("production", {})
	if typeof(prod) == TYPE_DICTIONARY:
		per_hour = (prod as Dictionary).get("per_hour", {})
		storage_cap = float((prod as Dictionary).get("cap", 0.0))
	# The server settled production the instant it answered, so this is the moment the counts
	# below are true of. The header counts on from here rather than waiting for the next read.
	resources_read_at = Time.get_unix_time_from_system()
	if player.is_empty():
		player = {"id": hall.get("player_id", ""), "x": hall.get("x", 0), "y": hall.get("y", 0)}
	hall_changed.emit()
	return ""


## What a resource stands at right now, counting on from the last server read at the standing
## rate. The server is still the truth — this only keeps the header alive between reads, and it
## stops at the cap for the same reason the server does.
func resource_now(res: String) -> float:
	var banked := float(hall.get(res, 0.0))
	var rate := float(per_hour.get(res, 0.0))
	if rate <= 0.0 or resources_read_at <= 0.0:
		return banked
	var elapsed: float = maxf(0.0, Time.get_unix_time_from_system() - resources_read_at)
	var grown := banked + rate * elapsed / 3600.0
	if storage_cap > 0.0 and banked < storage_cap:
		return minf(grown, storage_cap)
	return banked if storage_cap > 0.0 else grown


func at_storage_cap(res: String) -> bool:
	return storage_cap > 0.0 and resource_now(res) >= storage_cap


## Send gatherers to a node. Returns "" on success, else a message to show.
func send_gather(node_id: String) -> String:
	var r: Api.Result = await Api.post_json("/v1/marches/gather", {"node_id": node_id})
	if not r.ok:
		return _march_message(r)
	marches = r.data.get("marches", [])
	hall_changed.emit()
	return ""


## Turn a march around. Returns "" on success.
func recall_march(march_id: String) -> String:
	var r: Api.Result = await Api.post_json("/v1/marches/%s/recall" % march_id, {})
	if not r.ok:
		return _march_message(r)
	marches = r.data.get("marches", [])
	hall_changed.emit()
	return ""


func _march_message(r: Api.Result) -> String:
	match r.code:
		"NO_MARCH_SLOT": return "Every march is already out."
		"NODE_OCCUPIED": return "Someone is already working that."
		"NODE_EMPTY": return "There is nothing left there."
		"NO_NODE": return "That is gone."
		_: return r.message


## Men standing in the hall right now, all types together.
func troops_at_home() -> int:
	var n := 0
	for s: Dictionary in troops:
		n += int(s.get("count", 0))
	return n


## Start a batch. Returns "" on success, else a message to show.
func train(building_id: String, count: int) -> String:
	var r: Api.Result = await Api.post_json("/v1/buildings/%s/train" % building_id, {"count": count})
	if not r.ok:
		return _train_message(r)
	await refresh_hall()
	return ""


func _train_message(r: Api.Result) -> String:
	match r.code:
		"ALREADY_TRAINING": return "That building is already training a batch."
		"OVER_CAPACITY": return "Your barracks cannot hold that many. Upgrade it first."
		"INSUFFICIENT": return "Not enough resources for that many."
		"NOT_A_TRAINER": return "That building does not train anyone."
		_: return r.message


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


## The pending BUILD timer for a building, or {} if nobody is upgrading it. Training timers hang
## off the same building id, so the kind has to be checked or a barracks training men looks like a
## barracks being upgraded.
func timer_for(building_id: String) -> Dictionary:
	return _timer_of_kind(building_id, "build")


## The pending TRAINING timer for a building, or {}.
func training_timer_for(building_id: String) -> Dictionary:
	return _timer_of_kind(building_id, "train")


func _timer_of_kind(building_id: String, kind: String) -> Dictionary:
	for t in timers:
		if str(t.get("kind", "")) != kind:
			continue
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
