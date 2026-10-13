# UniFi Protect MCP Server

An MCP (Model Context Protocol) server that exposes UniFi Protect's Integration REST API as tools for Claude Code and other MCP clients. Aligned with UniFi Protect API **7.3.70** — 74 tools covering cameras, lights, sensors, chimes, viewers, sirens, fobs, relays, speakers, bridges, link stations, alarm hubs, arm profiles, live views, files, users, point-of-sale events, NVR status, and WebSocket subscriptions.

## Prerequisites

- Node.js 22.x (22.13 or newer) or 24.x — see `engines` in `package.json`
- A UniFi Protect system with the Integration API enabled
- An API key generated from your UniFi Protect console

## Setup

### Quick start (npx)

Add to Claude Code with a single command — no clone or build needed:

```bash
claude mcp add-json unifi-protect '{"command":"npx","args":["-y","@owine/unifi-protect-mcp@latest"],"env":{"UNIFI_PROTECT_HOST":"192.168.1.1","UNIFI_PROTECT_API_KEY":"your-api-key","UNIFI_PROTECT_VERIFY_SSL":"false"}}' -s user
```

Use `-s user` for global availability across all projects, or `-s project` for the current project only.

### From source

If you prefer to build locally:

```bash
git clone https://github.com/owine/unifi-protect-mcp.git
cd unifi-protect-mcp
corepack enable   # provides pnpm at the version pinned in package.json
pnpm install
pnpm run build
```

This project uses pnpm — `npm install` ignores `pnpm-lock.yaml` and may resolve different dependency versions than CI.

Then add to Claude Code:

```bash
claude mcp add-json unifi-protect '{"command":"node","args":["/path/to/unifi-protect-mcp/dist/index.js"],"env":{"UNIFI_PROTECT_HOST":"192.168.1.1","UNIFI_PROTECT_API_KEY":"your-api-key","UNIFI_PROTECT_VERIFY_SSL":"false"}}' -s user
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `UNIFI_PROTECT_HOST` | Yes | — | IP or hostname of your UniFi Protect console, optionally with `:port`. A leading `https://` and trailing `/` are stripped |
| `UNIFI_PROTECT_API_KEY` | Yes | — | API key from Protect integration settings |
| `UNIFI_PROTECT_VERIFY_SSL` | No | `true` | Set to `false` (or `0`/`no`/`off`, any case) to skip TLS certificate verification (needed for self-signed certs). Unrecognized values keep the default |
| `UNIFI_PROTECT_READ_ONLY` | No | `true` | Set to `false` (or `0`/`no`/`off`, any case) to enable write/mutating tools (default is monitoring-only mode). Unrecognized values keep the default |
| `UNIFI_PROTECT_CONSOLE_ID` | No | — | Cloud Connector console ID. Only used when `UNIFI_PROTECT_HOST` is `api.ui.com`; ignored (with a warning on stderr) otherwise |

### Manual Configuration

Alternatively, add to your `~/.claude.json` under the top-level `"mcpServers"` key:

```json
{
  "mcpServers": {
    "unifi-protect": {
      "command": "npx",
      "args": ["-y", "@owine/unifi-protect-mcp@latest"],
      "env": {
        "UNIFI_PROTECT_HOST": "192.168.1.1",
        "UNIFI_PROTECT_API_KEY": "your-api-key",
        "UNIFI_PROTECT_VERIFY_SSL": "false"
      }
    }
  }
}
```

### Cloud Connector

To reach a console through Ubiquiti's Cloud Connector instead of over the local
network, set `UNIFI_PROTECT_HOST=api.ui.com` and `UNIFI_PROTECT_CONSOLE_ID` to
the console's ID, and supply a **Site Manager** API key (unifi.ui.com →
Settings → API) as `UNIFI_PROTECT_API_KEY`. That is a different credential
from a local console API key. Requests are routed through
`/v1/connector/consoles/{id}`. Keep TLS verification enabled.

Find your console ID with:

```bash
curl -s https://api.ui.com/v1/hosts -H "X-API-KEY: $KEY" | jq -r '.data[].id'
```

**WebSocket subscriptions do not work over Cloud Connector.** The connector
proxies REST calls but returns HTTP 404 on a WebSocket upgrade, so
`protect_subscribe_devices` and `protect_subscribe_events` fail fast with an
explanatory error. Every other tool, including snapshots and file uploads,
works. Connect directly to the console host if you need subscriptions.

Note that `/v1/hosts` reports `protect` under `controllers` for consoles where
Protect is merely available, not necessarily installed; only consoles actually
running Protect will answer.

Setting `UNIFI_PROTECT_CONSOLE_ID` against a local host is not fatal: the
server logs a warning and talks to that host directly.

## Upgrading to 3.0

3.0 tightens the tools that act on the physical world: disarming the alarm, switching relay outputs, and triggering alarm-hub outputs.

**No action is needed** if you use the server only through an LLM client (Claude Code, Claude Desktop, …) and leave `UNIFI_PROTECT_READ_ONLY` and `UNIFI_PROTECT_VERIFY_SSL` unset or set to `true`/`false`. The model reads the new required parameters from the tool schemas. Read on if you call tools from scripts or saved agent configurations, or set those variables to other values.

### Check your environment variables first

2.x treated only the exact string `false` as false. 3.0 also accepts `0`, `no` and `off`, in any case, so a value that 2.x silently ignored now takes effect:

| Setting | 2.x | 3.0 |
|---|---|---|
| `UNIFI_PROTECT_READ_ONLY=0` (or `no`, `off`, `FALSE`) | Read-only | ⚠️ **Write tools enabled** |
| `UNIFI_PROTECT_VERIFY_SSL=0` (or `no`, `off`, `FALSE`) | Certificate verified | Verification **skipped** |

Any other unrecognized value keeps the safe default (read-only, verification on), as before. If you set either variable to one of these values, confirm that the 3.0 behavior is what you want.

### Tool input changes (breaking)

| Tool | 2.x | 3.0 |
|---|---|---|
| `protect_disable_arm_alarm` | No confirmation | Requires `confirm: true` |
| `protect_activate_relay_output` | Omitting `state` toggled the output | Requires `confirm: true` **and** `state` (`"on"` / `"off"`) |
| `protect_trigger_alarm_hub_output` | Omitting `enable` toggled the output | Requires `confirm: true` **and** `enable` (`true` / `false`) |

Calls without these fields now fail input validation. Toggling was removed because it is not safe to retry: a repeated toggle flips a gate or lock back to where it started. To act on the current state, read it first: each entry in `outputs` from `protect_get_relay` carries a `state`, and `protect_get_alarm_hub` reports `alarmHub.output` keyed by channel.

```jsonc
// 2.x: toggles output 0
{ "id": "<relay id>", "outputId": 0 }
// 3.0: explicit and safe to retry
{ "id": "<relay id>", "outputId": 0, "state": "on", "confirm": true }
```

These three tools are now annotated `destructiveHint: true`. MCP clients that auto-approve non-destructive tools will now ask before running them.

### Stricter validation

- **`UNIFI_PROTECT_HOST`** is parsed as a URL authority. A pasted `https://192.168.1.1/` now works, and `:443` is dropped. A path, credentials, a non-numeric or out-of-range port, or an unbracketed IPv6 address now fails at startup instead of at the first request. Write IPv6 as `[2001:db8::1]` or `[2001:db8::1]:7443`.
- **`protect_upload_file`** rejects `base64Data` that is not valid base64 (bad characters, length or padding), and empty input, where 2.x uploaded corrupt bytes without an error. A `data:` URL prefix and line breaks are accepted.
- **`protect_update_liveview`** rejects a body whose `settings.id` differs from `id`.

### Output changes

- The `protect_upload_file` dry-run preview reports `byteLength` (decoded size) in place of `dataLength` (base64 string length).
- `protect_subscribe_devices` / `protect_subscribe_events` stop after 200 messages and add `truncated: true`. `duration` is now the time actually spent listening, not the requested duration.
- The server reports its real package version to MCP clients; 2.x always reported `1.0.0`.
- Network and TLS errors name the underlying cause, e.g. `fetch failed: connect ECONNREFUSED …`, instead of a bare `fetch failed`.

## Safety Features

This server provides layered safety controls for responsible operation:

- **Tool annotations** — Every tool declares `readOnlyHint` and `destructiveHint` so MCP clients (like Claude Code) can make informed confirmation decisions
- **Read-only mode** — Enabled by default. Only read operations (list, get, snapshot) are registered. Set `UNIFI_PROTECT_READ_ONLY=false` to enable write/mutating tools
- **Confirmation parameter** — Irreversible or security-relevant physical actions (`protect_disable_mic`, `protect_trigger_alarm_webhook`, `protect_disable_arm_alarm`, `protect_activate_relay_output`, `protect_trigger_alarm_hub_output`) require an explicit `confirm: true` parameter that must be present for the call to succeed
- **Dry-run support** — All write tools accept an optional `dryRun: true` parameter that returns a preview of what would happen without making any changes. On the confirm-gated tools a dry run still requires `confirm: true`

## Tools (74 total)

### System (2)
| Tool | Description |
|---|---|
| `protect_get_info` | Get system information and version details |
| `protect_list_nvrs` | List all NVR devices |

### Subscriptions (2)
| Tool | Description |
|---|---|
| `protect_subscribe_devices` | Subscribe via WebSocket to device state updates |
| `protect_subscribe_events` | Subscribe via WebSocket to event notifications |

### Cameras (12)
| Tool | Description |
|---|---|
| `protect_list_cameras` | List all cameras |
| `protect_get_camera` | Get camera details by ID |
| `protect_update_camera` | Update camera settings |
| `protect_get_snapshot` | Get a JPEG snapshot (returns image) |
| `protect_create_rtsp_stream` | Create an RTSPS stream session |
| `protect_get_rtsp_streams` | Get active RTSPS stream sessions |
| `protect_delete_rtsp_stream` | **DESTRUCTIVE:** Stop and delete an active RTSPS stream |
| `protect_create_talkback` | Create a talkback (two-way audio) session |
| `protect_disable_mic` | **IRREVERSIBLE:** Permanently disable camera microphone (requires `confirm: true`) |
| `protect_start_ptz_patrol` | Start PTZ patrol at a given slot |
| `protect_stop_ptz_patrol` | Stop PTZ patrol |
| `protect_goto_ptz_preset` | Move PTZ to a preset position |

### Lights (3)
| Tool | Description |
|---|---|
| `protect_list_lights` | List all lights |
| `protect_get_light` | Get light details by ID |
| `protect_update_light` | Update light settings |

### Sensors (3)
| Tool | Description |
|---|---|
| `protect_list_sensors` | List all sensors |
| `protect_get_sensor` | Get sensor details by ID |
| `protect_update_sensor` | Update sensor settings |

### Chimes (3)
| Tool | Description |
|---|---|
| `protect_list_chimes` | List all chimes |
| `protect_get_chime` | Get chime details by ID |
| `protect_update_chime` | Update chime settings |

### Viewers (3)
| Tool | Description |
|---|---|
| `protect_list_viewers` | List all viewers |
| `protect_get_viewer` | Get viewer details by ID |
| `protect_update_viewer` | Update viewer settings |

### Sirens (6)
| Tool | Description |
|---|---|
| `protect_list_sirens` | List all sirens |
| `protect_get_siren` | Get siren details by ID |
| `protect_update_siren` | Update siren settings (name, volume, LED) |
| `protect_play_siren` | Activate the siren alarm for a given duration (5/10/20/30s) |
| `protect_stop_siren` | Stop an active siren |
| `protect_test_siren_sound` | Test the siren sound for 5 seconds at a given volume |

### Fobs (3)
| Tool | Description |
|---|---|
| `protect_list_fobs` | List all key fobs |
| `protect_get_fob` | Get fob details by ID |
| `protect_update_fob` | Update fob settings |

### Relays (4)
| Tool | Description |
|---|---|
| `protect_list_relays` | List all relays |
| `protect_get_relay` | Get relay details by ID |
| `protect_update_relay` | Update relay settings |
| `protect_activate_relay_output` | **DESTRUCTIVE:** Turn a relay output channel on or off, with optional pulse duration (requires `confirm: true` and an explicit `state`) |

### Speakers (4)
| Tool | Description |
|---|---|
| `protect_list_speakers` | List all speakers |
| `protect_get_speaker` | Get speaker details by ID |
| `protect_update_speaker` | Update speaker settings (volume, mic) |
| `protect_test_speaker_sound` | Test the speaker sound at a given volume |

### Bridges (3)
| Tool | Description |
|---|---|
| `protect_list_bridges` | List all bridges |
| `protect_get_bridge` | Get bridge details by ID |
| `protect_update_bridge` | Update bridge settings |

### Link Stations (3)
| Tool | Description |
|---|---|
| `protect_list_link_stations` | List all link stations (non-alarm-hub gateways) |
| `protect_get_link_station` | Get link station details by ID |
| `protect_update_link_station` | Update link station settings |

### Alarm Hubs (4)
| Tool | Description |
|---|---|
| `protect_list_alarm_hubs` | List all alarm hubs |
| `protect_get_alarm_hub` | Get alarm hub details by ID |
| `protect_update_alarm_hub` | Update alarm hub settings |
| `protect_trigger_alarm_hub_output` | **DESTRUCTIVE:** Turn an alarm hub output channel on or off (sirens, lights, etc.; requires `confirm: true` and an explicit `enable`) |

### Arm Profiles (7) — local alarm manager
| Tool | Description |
|---|---|
| `protect_list_arm_profiles` | List all arm profiles |
| `protect_create_arm_profile` | Create a new arm profile |
| `protect_set_current_arm_profile` | Set the active profile used when arming |
| `protect_update_arm_profile` | Update an arm profile |
| `protect_delete_arm_profile` | **DESTRUCTIVE:** Delete an arm profile by ID |
| `protect_enable_arm_alarm` | Arm the alarm using the current profile |
| `protect_disable_arm_alarm` | **DESTRUCTIVE:** Disarm the alarm (requires `confirm: true`) |

### Live Views (4)
| Tool | Description |
|---|---|
| `protect_list_liveviews` | List all live views |
| `protect_get_liveview` | Get live view details by ID |
| `protect_create_liveview` | Create a new live view |
| `protect_update_liveview` | Update a live view |

### Alarm & Files (3)
| Tool | Description |
|---|---|
| `protect_trigger_alarm_webhook` | **DESTRUCTIVE:** Trigger an alarm webhook (fires external alarm action; requires `confirm: true`) |
| `protect_list_files` | List device asset files (`animations`) |
| `protect_upload_file` | Upload a device asset file (base64 in, sent as multipart/form-data) |

### Users (4)
| Tool | Description |
|---|---|
| `protect_list_users` | List Protect users (filtered by access permissions) |
| `protect_get_user` | Get a Protect user by ID |
| `protect_list_ulp_users` | List UniFi Identity (ULP) users with enrolled credentials |
| `protect_get_ulp_user` | Get a UniFi Identity user by ID |

### Point of Sale (1)
| Tool | Description |
|---|---|
| `protect_ingest_pos_transaction` | Record a POS transaction as a camera event so it can be overlaid on recorded footage |

## Development

The Node version used for development is pinned in `.nvmrc`. With [fnm](https://github.com/Schniz/fnm) installed, `fnm use` reads it automatically on `cd`.

```bash
pnpm run build         # Compile TypeScript
pnpm start             # Run the server
pnpm run typecheck     # Type-check without emitting
pnpm run lint          # ESLint
pnpm run lint:fix      # ESLint with auto-fix
pnpm test              # Run all tests (vitest)
pnpm run test:watch    # Run tests in watch mode
pnpm run test:coverage # Run tests with coverage
```

Git hooks are managed by [lefthook](https://github.com/evilmartians/lefthook) — `pnpm exec lefthook install` enables them. Pre-commit runs ESLint on staged files, a full typecheck, and a GitGuardian secret scan when [ggshield](https://github.com/GitGuardian/ggshield) is installed (skipped otherwise), so fnm and pnpm both need to be on your PATH.

### Commit conventions

This project uses [conventional commits](https://www.conventionalcommits.org/) and [release-please](https://github.com/googleapis/release-please) for automated releases:

- `feat: ...` — new feature (minor version bump)
- `fix: ...` — bug fix (patch version bump)
- `deps: ...` — dependency update (patch version bump; Renovate's type for package bumps)
- `feat!: ...` or `BREAKING CHANGE:` footer — breaking change (major version bump)
- `chore:`, `docs:`, `ci:`, etc. — no version bump

On push to `main`, release-please opens a Release PR that bumps the version and updates `CHANGELOG.md`. Merging that PR publishes to npm automatically.

To override the version number, add `Release-As: x.x.x` in the commit body:

```bash
git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
```

## License

MIT
