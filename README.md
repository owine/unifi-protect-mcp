# UniFi Protect MCP Server

An MCP (Model Context Protocol) server that exposes UniFi Protect's Integration REST API as tools for Claude Code and other MCP clients. Provides 33 tools for managing cameras, lights, sensors, chimes, viewers, live views, and NVR status.

## Prerequisites

- Node.js 20+
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
npm install
npm run build
```

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
| `UNIFI_PROTECT_READ_ONLY` | No | `false` | Set to `true` to disable all write/mutating tools (monitoring-only mode) |

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
- **Read-only mode** — Set `UNIFI_PROTECT_READ_ONLY=true` to completely hide all write/mutating tools. Only read operations (list, get, snapshot) are registered. Ideal for monitoring-only deployments
- **Confirmation parameter** — The most dangerous tools (`protect_disable_mic`, `protect_trigger_alarm_webhook`) require an explicit `confirm: true` parameter that must be present for the call to succeed
- **Dry-run support** — All write tools (except those with `confirm`) accept an optional `dryRun: true` parameter that returns a preview of what would happen without making any changes

## Tools (33 total)

### System (2)
| Tool | Description |
|---|---|
| `protect_get_info` | Get system information and version details |
| `protect_list_nvrs` | List all NVR devices |

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

## Development

```bash
npm run build        # Compile TypeScript
npm start            # Run the server
npm run typecheck    # Type-check without emitting
npm run lint         # ESLint
npm test             # Run all tests (vitest)
```

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
