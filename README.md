# UniFi Protect MCP Server

An MCP (Model Context Protocol) server that exposes UniFi Protect's Integration REST API as tools for Claude Code and other MCP clients. Aligned with UniFi Protect API **7.1.83** — 73 tools covering cameras, lights, sensors, chimes, viewers, sirens, fobs, relays, speakers, bridges, link stations, alarm hubs, arm profiles, live views, files, users, NVR status, and WebSocket subscriptions.

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
| `UNIFI_PROTECT_HOST` | Yes | — | IP or hostname of your UniFi Protect console |
| `UNIFI_PROTECT_API_KEY` | Yes | — | API key from Protect integration settings |
| `UNIFI_PROTECT_VERIFY_SSL` | No | `true` | Set to `false` to skip TLS certificate verification (needed for self-signed certs) |
| `UNIFI_PROTECT_READ_ONLY` | No | `true` | Set to `false` to enable write/mutating tools (default is monitoring-only mode) |

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

## Safety Features

This server provides layered safety controls for responsible operation:

- **Tool annotations** — Every tool declares `readOnlyHint` and `destructiveHint` so MCP clients (like Claude Code) can make informed confirmation decisions
- **Read-only mode** — Enabled by default. Only read operations (list, get, snapshot) are registered. Set `UNIFI_PROTECT_READ_ONLY=false` to enable write/mutating tools
- **Confirmation parameter** — The most dangerous tools (`protect_disable_mic`, `protect_trigger_alarm_webhook`) require an explicit `confirm: true` parameter that must be present for the call to succeed
- **Dry-run support** — All write tools (except those with `confirm`) accept an optional `dryRun: true` parameter that returns a preview of what would happen without making any changes

## Tools (73 total)

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
| `protect_delete_rtsp_stream` | Stop and delete an active RTSPS stream |
| `protect_create_talkback` | Create a talkback (two-way audio) session |
| `protect_disable_mic` | **IRREVERSIBLE:** Permanently disable camera microphone |
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
| `protect_activate_relay_output` | Set/toggle a relay output channel, with optional pulse duration |

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
| `protect_trigger_alarm_hub_output` | Trigger an alarm hub output channel (sirens, lights, etc.) |

### Arm Profiles (7) — local alarm manager
| Tool | Description |
|---|---|
| `protect_list_arm_profiles` | List all arm profiles |
| `protect_create_arm_profile` | Create a new arm profile |
| `protect_set_current_arm_profile` | Set the active profile used when arming |
| `protect_update_arm_profile` | Update an arm profile |
| `protect_delete_arm_profile` | **DESTRUCTIVE:** Delete an arm profile by ID |
| `protect_enable_arm_alarm` | Arm the alarm using the current profile |
| `protect_disable_arm_alarm` | Disarm the alarm |

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
| `protect_trigger_alarm_webhook` | Trigger an alarm webhook (fires external alarm action) |
| `protect_list_files` | List files by type |
| `protect_upload_file` | Upload a file (base64-encoded) |

### Users (4)
| Tool | Description |
|---|---|
| `protect_list_users` | List Protect users (filtered by access permissions) |
| `protect_get_user` | Get a Protect user by ID |
| `protect_list_ulp_users` | List UniFi Identity (ULP) users with enrolled credentials |
| `protect_get_ulp_user` | Get a UniFi Identity user by ID |

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

Git hooks are managed by [lefthook](https://github.com/evilmartians/lefthook) — `pnpm exec lefthook install` enables them. Pre-commit runs ESLint on staged files and a full typecheck, so fnm and pnpm both need to be on your PATH.

### Commit conventions

This project uses [conventional commits](https://www.conventionalcommits.org/) and [release-please](https://github.com/googleapis/release-please) for automated releases:

- `feat: ...` — new feature (minor version bump)
- `fix: ...` — bug fix (patch version bump)
- `feat!: ...` or `BREAKING CHANGE:` footer — breaking change (major version bump)
- `chore:`, `docs:`, `ci:`, etc. — no version bump

On push to `main`, release-please opens a Release PR that bumps the version and updates `CHANGELOG.md`. Merging that PR publishes to npm automatically.

To override the version number, add `Release-As: x.x.x` in the commit body:

```bash
git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
```

## License

MIT
