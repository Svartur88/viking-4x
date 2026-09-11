# Viking 4X — Godot client

Godot 4.3. The walking skeleton: sign up, see your hall, start an upgrade on a real
server timer, and pan the kingdom map. Grey boxes, on purpose — the art direction
(OQ-04) is still Hawk's to pick, and the skeleton must not wait for it.

## Run it on your own machine

1. Install **Godot 4.3** (standard build, not .NET) from godotengine.org. No account, no licence.
2. Start the server (see `apps/server` and `04-Team/09-Operator/notes/dev-setup.md` in the roadmap).
3. Open Godot → **Import** → pick this folder's `project.godot` → **Run** (F5).
4. If your server is not on `http://localhost:3000`, set it on the Settings screen inside the app.

A Windows `.exe` comes from **Project → Export → Windows Desktop** (Godot downloads
export templates the first time). Presets for Windows, Android and iOS live in
`export_presets.cfg`.

## What each file is

| File | What it does |
|---|---|
| `autoload/tokens.gd` | Colours, spacing and the two button styles (design-language.md). The only place colours live. |
| `autoload/config.gd` | Server URL, device id, saved token — in `user://config.json`. |
| `autoload/api.gd` | Every call to the server, and the clock-skew correction all countdowns use. |
| `autoload/session.gd` | The signed-in jarl: hall, buildings, pending timers. |
| `scripts/root.gd` | The router: one screen at a time, a bottom bar, toasts. |
| `scripts/auth_screen.gd` | Guest sign-in and the name that places your hall. |
| `scripts/city_screen.gd` | The hall: buildings, the upgrade sheet, live countdowns. |
| `scripts/map_screen.gd` | The kingdom: terrain chunks, hall markers, pan and zoom. |
| `scripts/settings_screen.gd` | Server URL, connection check, sign out. |

## Checks

Both run without a display, and both are what CI runs.

```bash
# project compiles, no script errors
godot --headless --quit --path apps/mobile

# end-to-end against a running server: sign up, upgrade, read the map
godot --headless --path apps/mobile -- --smoke --api=http://localhost:3000
```

`--shot=<dir>` renders the city and map screens to PNGs for review
(needs a display; on a headless box use `xvfb-run … --rendering-driver opengl3`).

## Rules this client keeps

- The server decides everything; the client renders and asks (stack.md).
- Every countdown is `due_at` minus **server** time, never a local tick, so a wrong
  device clock and a closed app both still show the truth (timer-engine.md).
- No colour is the only signal, and every tap target is at least 88 px.
