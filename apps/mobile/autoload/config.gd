extends Node
## Where the server lives, and the saved session. Stored in user:// so a Windows build,
## a phone, and CI all behave the same. Never put secrets here; the JWT is the only token
## and it is short-lived by policy (auth/jwt.ts).

const PATH := "user://config.json"
const DEFAULT_BASE_URL := "http://localhost:3000"

var base_url: String = DEFAULT_BASE_URL
var device_id: String = ""
var jwt: String = ""


func _ready() -> void:
	_load()
	# --api=https://host overrides the saved value (staging builds, CI smoke tests).
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--api="):
			base_url = arg.substr(6)
	if device_id == "":
		device_id = _new_device_id()
		save()


func _new_device_id() -> String:
	# Stable per install, not per session; the server hashes it (auth/routes.ts).
	var rng := Crypto.new().generate_random_bytes(24)
	return Marshalls.raw_to_base64(rng).replace("/", "_").replace("+", "-")


func _load() -> void:
	if not FileAccess.file_exists(PATH):
		return
	var f := FileAccess.open(PATH, FileAccess.READ)
	if f == null:
		return
	var data: Variant = JSON.parse_string(f.get_as_text())
	f.close()
	if typeof(data) != TYPE_DICTIONARY:
		return
	base_url = str(data.get("base_url", DEFAULT_BASE_URL))
	device_id = str(data.get("device_id", ""))
	jwt = str(data.get("jwt", ""))


func save() -> void:
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f == null:
		push_warning("Could not write config")
		return
	f.store_string(JSON.stringify({"base_url": base_url, "device_id": device_id, "jwt": jwt}))
	f.close()


func clear_session() -> void:
	jwt = ""
	save()
