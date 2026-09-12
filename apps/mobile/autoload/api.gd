extends Node
## The only place the client talks to the server. Every call returns a Result;
## the client never computes an outcome itself (stack.md: the server is authoritative).

signal unauthorized  ## the token died; the router sends us back to the auth screen

## Difference between server time and this device's clock, in seconds.
## Every countdown in the game is drawn from this, never from a local tick count,
## so a phone with a wrong clock still shows the right timer (timer-engine.md client contract).
var clock_skew: float = 0.0


class Result:
	var ok: bool
	var status: int
	var data: Dictionary
	var code: String   ## server error code, e.g. LONGHOUSE_GATE
	var message: String

	func _init(p_ok: bool, p_status: int, p_data: Dictionary, p_code := "", p_message := "") -> void:
		ok = p_ok
		status = p_status
		data = p_data
		code = p_code
		message = p_message


func server_now() -> float:
	return Time.get_unix_time_from_system() + clock_skew


## Seconds left until an ISO-8601 due time, measured against server time.
func seconds_until(iso: String) -> float:
	if iso == "":
		return 0.0
	return max(0.0, Time.get_unix_time_from_datetime_string(iso) - server_now())


func _note_server_time(data: Dictionary) -> void:
	var iso: String = str(data.get("server_now", ""))
	if iso == "":
		return
	clock_skew = Time.get_unix_time_from_datetime_string(iso) - Time.get_unix_time_from_system()


func get_json(path: String) -> Result:
	return await _request(HTTPClient.METHOD_GET, path, {})


## Fetch raw bytes (the kingdom-view PNG). Returns an empty array on failure.
func get_bytes(path: String) -> PackedByteArray:
	var http := HTTPRequest.new()
	http.timeout = 30.0
	add_child(http)
	var headers := PackedStringArray([])
	if Config.jwt != "":
		headers.append("Authorization: Bearer " + Config.jwt)
	var err := http.request(Config.base_url + path, headers, HTTPClient.METHOD_GET, "")
	if err != OK:
		http.queue_free()
		return PackedByteArray()
	var res: Array = await http.request_completed
	http.queue_free()
	if int(res[0]) != HTTPRequest.RESULT_SUCCESS or int(res[1]) < 200 or int(res[1]) >= 300:
		return PackedByteArray()
	return res[3]


func post_json(path: String, body: Dictionary = {}) -> Result:
	return await _request(HTTPClient.METHOD_POST, path, body)


func _request(method: int, path: String, body: Dictionary) -> Result:
	var http := HTTPRequest.new()
	http.timeout = 20.0
	add_child(http)

	var headers := PackedStringArray(["Accept: application/json"])
	if body.size() > 0:
		headers.append("Content-Type: application/json")
	if Config.jwt != "":
		headers.append("Authorization: Bearer " + Config.jwt)

	var payload := JSON.stringify(body) if body.size() > 0 else ""
	var err := http.request(Config.base_url + path, headers, method, payload)
	if err != OK:
		http.queue_free()
		return Result.new(false, 0, {}, "NO_CONNECTION", "Could not reach the server.")

	var res: Array = await http.request_completed
	http.queue_free()

	var result: int = res[0]
	var status: int = res[1]
	var text := (res[3] as PackedByteArray).get_string_from_utf8()

	if result != HTTPRequest.RESULT_SUCCESS:
		return Result.new(false, 0, {}, "NO_CONNECTION", "Could not reach the server.")

	var parsed: Variant = JSON.parse_string(text)
	var data: Dictionary = parsed if typeof(parsed) == TYPE_DICTIONARY else {}

	if status >= 200 and status < 300:
		_note_server_time(data)
		return Result.new(true, status, data)

	if status == 401:
		Config.clear_session()
		unauthorized.emit()

	var e: Dictionary = data.get("error", {}) if data.has("error") else {}
	var code := str(e.get("code", "HTTP_%d" % status))
	var message := str(e.get("message", "Something went wrong."))
	return Result.new(false, status, data, code, message)
