# UniFi Protect MCP Server

An MCP (Model Context Protocol) server that exposes UniFi Protect's Integration REST API as tools for Claude Code and other MCP clients. Aligned with UniFi Protect API **7.3.70**, with tools covering cameras, lights, sensors, chimes, viewers, sirens, fobs, relays, speakers, bridges, link stations, alarm hubs, arm profiles, live views, files, users, point-of-sale events, NVR status, and WebSocket subscriptions.

## Prerequisites

- Node.js 22.x (22.19 or newer) or 24.x — see `engines` in `package.json`
- A UniFi Protect system with the Integration API enabled
- An API key generated from your UniFi Protect console (see [Choosing an API key](#choosing-an-api-key))

## Setup

### Quick start (npx)

Add to Claude Code with a single command — no clone or build needed:

```bash
claude mcp add-json unifi-protect '{"command":"npx","args":["-y","@owine/unifi-protect-mcp@latest"],"env":{"UNIFI_PROTECT_HOST":"192.168.1.1","UNIFI_PROTECT_API_KEY":"your-api-key"}}' -s user
```

Use `-s user` for global availability across all projects, or `-s project` for the current project only.

A local console usually has a self-signed certificate, so the first call fails with a certificate error until you trust it: see [Self-signed console certificates](#self-signed-console-certificates).

`@latest` runs the newest release every time the server starts, including a new major version. To take fixes but choose when to make breaking upgrades, pin the major version you have tested instead (`@owine/unifi-protect-mcp@<major>`).

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
claude mcp add-json unifi-protect '{"command":"node","args":["/path/to/unifi-protect-mcp/dist/index.js"],"env":{"UNIFI_PROTECT_HOST":"192.168.1.1","UNIFI_PROTECT_API_KEY":"your-api-key"}}' -s user
```

### Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `UNIFI_PROTECT_HOST` | Yes | — | IP or hostname of your UniFi Protect console, optionally with `:port`. A leading `https://` and trailing `/` are stripped; bracket IPv6 addresses |
| `UNIFI_PROTECT_API_KEY` | Yes | — | API key from the console's integration settings (see [Choosing an API key](#choosing-an-api-key)). Surrounding whitespace is trimmed; a key with a control character inside is refused at startup |
| `UNIFI_PROTECT_CA_CERT` | No | — | Absolute path to a PEM file with the console's certificate, to verify a self-signed console without turning verification off (see below). Not allowed with `api.ui.com` or together with `UNIFI_PROTECT_VERIFY_SSL=false` |
| `UNIFI_PROTECT_VERIFY_SSL` | No | `true` | Set to `false` (or `0`/`no`/`off`, any case) to skip certificate verification for this server's connections to the console. Prefer `UNIFI_PROTECT_CA_CERT`. Not allowed with `api.ui.com`. Unrecognized values keep the default |
| `UNIFI_PROTECT_READ_ONLY` | No | `true` | Set to `false` (or `0`/`no`/`off`, any case) to enable write tools (default is monitoring-only mode). Unrecognized values keep the default |
| `UNIFI_PROTECT_CONSOLE_ID` | No | — | Cloud Connector console ID. Only used when `UNIFI_PROTECT_HOST` is `api.ui.com`; ignored (with a warning on stderr) otherwise |

The startup line in the MCP host's server log says whether the server is read-only or read-write. A configuration error names the variable at fault, and the server exits.

### Self-signed console certificates

UniFi consoles ship with a self-signed certificate, so the first call to a local console usually fails with a certificate error. The safe fix is to trust that one certificate. Save it:

```bash
openssl s_client -connect 192.168.1.1:443 </dev/null 2>/dev/null | openssl x509 > ~/.config/unifi-protect-console.pem
```

Set `UNIFI_PROTECT_CA_CERT` to the file's **absolute** path (for example `/home/you/.config/unifi-protect-console.pem`); MCP hosts do not expand `~` or `$HOME` in `env`. The server then accepts exactly that certificate, even though it is issued to a name like `unifi.local` and you connect by IP. This also works for a certificate issued by a CA (one you installed on the console yourself): pinning the console's own certificate is enough, without the CA's. Any other certificate must chain to the file **and** match the hostname. If the network between you and the console is not trusted, compare the fingerprint (`openssl x509 -in <file> -noout -fingerprint -sha256`) with the console's. If the console later generates a new certificate, save it again.

Setting `UNIFI_PROTECT_VERIFY_SSL=false` instead turns certificate checks off for this server's connections to the console, and only those (other TLS connections in the process are unaffected). Anyone who can intercept that traffic can then read the API key, so use it only on a network you trust.

### Choosing an API key

- **Use the least-privileged key that works.** Create the key from an admin account with no more access than you need. For the default read-only mode, that means an admin with view-only access to Protect; use a full-access admin only with `UNIFI_PROTECT_READ_ONLY=false`.
- **Prefer a local console key to a Site Manager key.** A Site Manager key (Cloud Connector, `api.ui.com`) reaches every console on the account and travels over the internet.

### Manual Configuration

Alternatively, add to your `~/.claude.json` under the top-level `"mcpServers"` key, or to Claude Desktop's `claude_desktop_config.json` the same way:

```json
{
  "mcpServers": {
    "unifi-protect": {
      "command": "npx",
      "args": ["-y", "@owine/unifi-protect-mcp@latest"],
      "env": {
        "UNIFI_PROTECT_HOST": "192.168.1.1",
        "UNIFI_PROTECT_API_KEY": "your-api-key",
        "UNIFI_PROTECT_CA_CERT": "/absolute/path/to/console.pem"
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
`/v1/connector/consoles/{id}`.

TLS verification stays on: the server refuses to start with
`UNIFI_PROTECT_VERIFY_SSL=false` or `UNIFI_PROTECT_CA_CERT` for `api.ui.com`.
Ubiquiti's cloud has a publicly trusted certificate, and a pinned certificate
would replace the public certificate authorities for this server's connections.

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

3.0 puts more actions behind confirmation: physical outputs, disarming, anything that weakens alarm coverage, and live video and two-way audio. It also scopes TLS settings to this server, keeps every result within what one MCP message can carry, and makes cancellation stop the request to Protect.

**If you use the server only through an LLM client** (Claude Code, Claude Desktop, …), the model reads the new parameters from the tool schemas, so most setups need no change. Check three things:

- **Cloud Connector with verification off no longer starts.** Unset `UNIFI_PROTECT_VERIFY_SSL` when `UNIFI_PROTECT_HOST=api.ui.com`.
- **Spellings of `UNIFI_PROTECT_READ_ONLY` / `UNIFI_PROTECT_VERIFY_SSL`** that 2.x ignored now take effect (table below).
- **Expect more approval prompts.** Update tools and every confirm-gated tool are now annotated destructive (below).

Read on if you call tools from scripts or saved agent configurations, or keep allow-lists keyed on tool annotations.

### Check your environment variables first

2.x treated only the exact string `false` as false. 3.0 also accepts `0`, `no` and `off`, in any case, so a value that 2.x silently ignored now takes effect:

| Setting | 2.x | 3.0 |
|---|---|---|
| `UNIFI_PROTECT_READ_ONLY=0` (or `no`, `off`, `FALSE`) | Read-only | ⚠️ **Write tools enabled** |
| `UNIFI_PROTECT_VERIFY_SSL=0` (or `no`, `off`, `FALSE`) | Certificate verified | Verification **skipped** |
| `UNIFI_PROTECT_HOST=api.ui.com` with `UNIFI_PROTECT_VERIFY_SSL=false` (or `0`/`no`/`off`) | Verification skipped | ⚠️ **Startup fails**: "TLS verification cannot be disabled for api.ui.com". Unset `UNIFI_PROTECT_VERIFY_SSL` |
| `UNIFI_PROTECT_VERIFY_SSL=false` | Turned verification off for **every** TLS connection in the process | Applies only to this server's connections to the console. Prefer the new `UNIFI_PROTECT_CA_CERT` |
| `UNIFI_PROTECT_API_KEY` pasted with a trailing newline or spaces | Sent as is; every call failed and the error quoted the key | Trimmed |
| `UNIFI_PROTECT_API_KEY` with a control character inside | Same | Startup fails with a message that does not repeat the key |

Any other unrecognized value keeps the safe default (read-only, verification on), as before. New: `UNIFI_PROTECT_CA_CERT` verifies a console's self-signed certificate (see [Self-signed console certificates](#self-signed-console-certificates)). Configuration errors now name the variable at fault, and the startup log line says whether the server is read-only or read-write.

### Tool input changes (breaking)

| Tool | 2.x | 3.0 |
|---|---|---|
| `protect_disable_arm_alarm` | No confirmation | Requires `confirm: true` |
| `protect_activate_relay_output` | Omitting `state` toggled the output | Requires `confirm: true` **and** `state` (`"on"` / `"off"`) |
| `protect_trigger_alarm_hub_output` | Omitting `enable` toggled the output | Requires `confirm: true` **and** `enable` (`true` / `false`) |
| `protect_create_rtsp_stream`, `protect_create_talkback` | No confirmation | Requires `confirm: true`; the returned URLs are credentials |
| `protect_stop_siren` | No confirmation | Requires `confirm: true` |
| `protect_delete_arm_profile`, `protect_set_current_arm_profile` | No confirmation | Requires `confirm: true` |
| `protect_update_sensor` | No confirmation | Requires `confirm: true` when `settings` include `alarmSettings`, `motionSettings`, `glassBreakSettings`, `armProfileIds` or `scheduleMode` |
| `protect_update_fob` | No confirmation | Requires `confirm: true` when `settings` include `armControlSettings` |
| `protect_update_arm_profile` | No confirmation | Requires `confirm: true` when `settings` include `schedules` or `automations` |
| Every tool that takes an ID | Any string | Only IDs as list and get tools return them: letters, digits, `-` and `_`. An arm profile ID cannot be `settings`, `enable` or `disable`; an alarm webhook ID cannot be `.` or `..` |

A call that leaves out `state` or `enable`, or passes a malformed ID, fails input validation. A call without `confirm: true` returns an error result ("This action requires confirmation: …"), so the agent can ask you and call again.

Toggling was removed because it is not safe to retry: a repeated toggle flips a gate or lock back to where it started. To act on the current state, read it first: each entry in `outputs` from `protect_get_relay` carries a `state`, and `protect_get_alarm_hub` reports `alarmHub.output` keyed by channel.

```jsonc
// 2.x: toggles output 0
{ "id": "<relay id>", "outputId": 0 }
// 3.0: explicit and safe to retry
{ "id": "<relay id>", "outputId": 0, "state": "on", "confirm": true }
```

**Relaxed:** a `dryRun: true` preview never needs `confirm`. In 2.x, `protect_disable_mic` and `protect_trigger_alarm_webhook` rejected a dry run without `confirm: true`. Calls that send both still work.

**New:** every list tool except `protect_list_nvrs` takes optional `limit` and `offset`. A call with neither returns the whole list, as before.

### Annotation changes (breaking for allow-lists)

- `protect_update_camera`, every `protect_update_<device>` tool, `protect_update_arm_profile` and `protect_update_liveview` are now `destructiveHint: true`, and so is every tool that takes `confirm` (`protect_stop_siren`, `protect_set_current_arm_profile`, `protect_create_rtsp_stream`, `protect_create_talkback`, `protect_disable_arm_alarm`, `protect_activate_relay_output`, `protect_trigger_alarm_hub_output` among them). MCP clients that auto-approve non-destructive tools will now ask before running them, and allow-lists keyed on the annotation need updating.
- Every tool now has a `title` and `openWorldHint: false`; the relay and alarm-hub output tools declare `idempotentHint: true`.

### Stricter validation

- **`UNIFI_PROTECT_HOST`** is parsed as a URL authority. A pasted `https://192.168.1.1/` now works, and `:443` is dropped. A path, credentials, a non-numeric or out-of-range port, or an unbracketed IPv6 address now fails at startup instead of at the first request. Write IPv6 as `[2001:db8::1]` or `[2001:db8::1]:7443`.
- **`protect_upload_file`** rejects `base64Data` that is not valid base64 (bad characters, length or padding), and empty input, where 2.x uploaded corrupt bytes without an error. A `data:` URL prefix and line breaks are accepted. A file too large to fit one MCP message is refused with "File too large to send in one MCP message"; in 2.x an oversized request closed the server's stdio transport and the server exited with nothing logged.
- **`protect_update_liveview`** rejects a body whose `settings.id` differs from `id`.

### Output changes

- Text results are compact JSON, not indented. `structuredContent` is unchanged; use it if you parse results.
- Single-object results and dry-run previews now pass MCP clients' output validation. In 2.x, a top-level field the schema did not list, or any dry-run preview of a tool with an output schema, failed with `-32602`.
- A snapshot, response or other result too large for one MCP message is refused with an error saying so. In 2.x it was sent, and the MCP client dropped the connection.
- The `protect_upload_file` dry-run preview reports `byteLength` (decoded size) in place of `dataLength` (base64 string length).
- `protect_subscribe_devices` / `protect_subscribe_events` stop at a message cap **or** a size budget, whichever comes first (both stated in each tool's description), and add `truncated: true`. `duration` is the time actually spent listening. A listen that fails before any message arrives (refused or unauthorized socket) returns an **error result**; in 2.x it returned `{messages: [], error}` as a success. One that fails partway still returns what it collected, with `error`.
- A timeout names the call and what to do: `PATCH /cameras/…: Protect did not respond within … s`, followed by "Retry when the console responds" for reads, or "The change may still have been applied; check before retrying" for writes. Snapshots and uploads time out before the MCP client's own request timeout, so you see this message instead of a bare client timeout.
- Network and TLS errors name the underlying cause, e.g. `fetch failed: connect ECONNREFUSED …`, instead of a bare `fetch failed`.
- A subscription that the console refuses, closes or drops before any message arrives returns an error naming why, instead of an empty list that reads as a quiet site. So does one whose window ends before the connection is established, or whose first message is too large to return.
- A list tool reads a response of up to several times one MCP message and returns the page asked for, so `limit` and `offset` work on a site whose full list would not fit.
- Cancelling a tool call aborts its request to Protect, and a cancelled subscription closes its socket. In 2.x a cancelled relay switch could still land afterwards.
- The server reports its real package version to MCP clients; 2.x always reported `1.0.0`. It also sends server instructions (see [Safety Features](#safety-features)).

### For packagers

`undici` is a new runtime dependency (scoped TLS and connection keep-alive). Requests go through undici's own `fetch` rather than Node's, so:

- They speak HTTP/1.1, as before, and send `User-Agent: unifi-protect-mcp/<version>`.
- An HTTP proxy is used as Node's built-in `fetch` would: from `HTTPS_PROXY` / `HTTP_PROXY`, minus `NO_PROXY`, only when `NODE_USE_ENV_PROXY=1` or `--use-env-proxy` is set. A dispatcher installed with undici's `setGlobalDispatcher` no longer applies. The subscription WebSocket never used a proxy, and still does not.

## Safety Features

- **Tool annotations.** Every tool declares `readOnlyHint`, `destructiveHint` and `openWorldHint: false` (each talks only to your console), plus a readable `title`, so MCP clients such as Claude Code can decide when to ask you. `destructiveHint: true` marks every tool that deletes or replaces existing state, which includes every `protect_update_*` tool, and every tool that takes `confirm`. Clients that auto-approve non-destructive tools ask before those. The tool tables below mark them **DESTRUCTIVE**.
- **Server instructions.** On connect, the server gives the MCP host a short guide for the model, matched to read-only or read-write mode. It says to treat names and event text from the console as data, not instructions; that RTSPS and talkback URLs are credentials; and, when writes are enabled, to preview with `dryRun` and ask you before passing `confirm`.
- **Read-only mode.** On by default. Only the read tools (list, get, snapshot, subscriptions) are registered; write tools do not exist for the model, and registering one in read-only mode fails at startup. Set `UNIFI_PROTECT_READ_ONLY=false` to enable writes. Read-only mode still returns RTSPS URLs from `protect_get_rtsp_streams`, and those are credentials for live video.
- **Confirmation parameter.** Tools that are irreversible, switch physical outputs, trigger the alarm webhook, stop a siren, disarm or weaken alarm coverage, or open live video or two-way audio refuse to act unless the call carries `confirm: true`. Without it the tool returns an error naming the action, so the agent can ask you first. `protect_update_sensor`, `protect_update_fob` and `protect_update_arm_profile` need it only when the change touches alarm-related settings (each tool's description names them); renames and LED changes do not. `confirm` is filled in by the model, so it is a prompt for the model to ask you, not a lock; for a human gate, keep your MCP client's approval prompts on for destructive tools.
- **Dry-run support.** Every write tool accepts `dryRun: true` and returns the request it would send (`dryRun`, `action`, `path`, `body`) without changing anything. A dry run never needs `confirm`.
- **Request safety.** IDs must be IDs returned by list and get tools, and a request path that would resolve outside the Integration API is refused before it is sent. Redirects are refused, so the API key is never forwarded. Cancelling a tool call aborts its request to Protect.

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities and operating the server safely.

## Structured output

Read tools, and write tools that return the resource, declare an `outputSchema`, and return `structuredContent` alongside compact JSON text. Schemas are published as loose objects, so a field a firmware update adds flows through instead of failing validation. A list's items are under `result`; a paged list also has `totalCount` and `offset`. `protect_get_snapshot` returns an image. A dry run returns `{dryRun, action, path, body}`. Action endpoints that return no body succeed with an empty result.

## Tools

**DESTRUCTIVE** marks tools annotated `destructiveHint: true`. *Requires `confirm: true`* marks tools that take `confirm`; every one of them is also DESTRUCTIVE. *Pages with `limit`/`offset`* marks list tools that take them.

### System
| Tool | Description |
|---|---|
| `protect_get_info` | Get system information and version details |
| `protect_list_nvrs` | Get the NVR console info (a single object) |

### Subscriptions
| Tool | Description |
|---|---|
| `protect_subscribe_devices` | Subscribe via WebSocket to device state updates for a short window (not over Cloud Connector) |
| `protect_subscribe_events` | Subscribe via WebSocket to event notifications for a short window (not over Cloud Connector) |

### Cameras
| Tool | Description |
|---|---|
| `protect_list_cameras` | List all cameras (pages with `limit`/`offset`) |
| `protect_get_camera` | Get camera details by ID |
| `protect_update_camera` | **DESTRUCTIVE:** Update camera settings |
| `protect_get_snapshot` | Get a JPEG snapshot (returns image) |
| `protect_create_rtsp_stream` | **DESTRUCTIVE:** Create an RTSPS stream session; the returned URLs are credentials for live video (requires `confirm: true`) |
| `protect_get_rtsp_streams` | Get active RTSPS stream sessions (the URLs are credentials for live video) |
| `protect_delete_rtsp_stream` | **DESTRUCTIVE:** Stop and delete an active RTSPS stream |
| `protect_create_talkback` | **DESTRUCTIVE:** Create a talkback (two-way audio) session; the returned URL is a credential (requires `confirm: true`) |
| `protect_disable_mic` | **DESTRUCTIVE:** Irreversibly disable the camera microphone; only a factory reset restores it (requires `confirm: true`) |
| `protect_start_ptz_patrol` | Start PTZ patrol at a given slot |
| `protect_stop_ptz_patrol` | Stop PTZ patrol |
| `protect_goto_ptz_preset` | Move PTZ to a preset position |

### Lights
| Tool | Description |
|---|---|
| `protect_list_lights` | List all lights (pages with `limit`/`offset`) |
| `protect_get_light` | Get light details by ID |
| `protect_update_light` | **DESTRUCTIVE:** Update light settings |

### Sensors
| Tool | Description |
|---|---|
| `protect_list_sensors` | List all sensors (pages with `limit`/`offset`) |
| `protect_get_sensor` | Get sensor details by ID |
| `protect_update_sensor` | **DESTRUCTIVE:** Update sensor settings (requires `confirm: true` to change alarm, motion or glass-break settings, arm profiles or schedule mode) |

### Chimes
| Tool | Description |
|---|---|
| `protect_list_chimes` | List all chimes (pages with `limit`/`offset`) |
| `protect_get_chime` | Get chime details by ID |
| `protect_update_chime` | **DESTRUCTIVE:** Update chime settings |

### Viewers
| Tool | Description |
|---|---|
| `protect_list_viewers` | List all viewers (pages with `limit`/`offset`) |
| `protect_get_viewer` | Get viewer details by ID |
| `protect_update_viewer` | **DESTRUCTIVE:** Update viewer settings |

### Sirens
| Tool | Description |
|---|---|
| `protect_list_sirens` | List all sirens (pages with `limit`/`offset`) |
| `protect_get_siren` | Get siren details by ID |
| `protect_update_siren` | **DESTRUCTIVE:** Update siren settings (name, volume, LED) |
| `protect_play_siren` | Activate the siren alarm for a given duration (5/10/20/30s) |
| `protect_stop_siren` | **DESTRUCTIVE:** Stop an active siren; it silences an alarm (requires `confirm: true`) |
| `protect_test_siren_sound` | Test the siren sound for 5 seconds at a given volume |

### Fobs
| Tool | Description |
|---|---|
| `protect_list_fobs` | List all key fobs (pages with `limit`/`offset`) |
| `protect_get_fob` | Get fob details by ID |
| `protect_update_fob` | **DESTRUCTIVE:** Update fob settings (requires `confirm: true` to change arm control settings) |

### Relays
| Tool | Description |
|---|---|
| `protect_list_relays` | List all relays (pages with `limit`/`offset`) |
| `protect_get_relay` | Get relay details by ID, including each output's state |
| `protect_update_relay` | **DESTRUCTIVE:** Update relay settings |
| `protect_activate_relay_output` | **DESTRUCTIVE:** Turn a relay output channel on or off, with optional pulse duration (requires `confirm: true` and an explicit `state`) |

### Speakers
| Tool | Description |
|---|---|
| `protect_list_speakers` | List all speakers (pages with `limit`/`offset`) |
| `protect_get_speaker` | Get speaker details by ID |
| `protect_update_speaker` | **DESTRUCTIVE:** Update speaker settings (volume, mic) |
| `protect_test_speaker_sound` | Test the speaker sound at a given volume |

### Bridges
| Tool | Description |
|---|---|
| `protect_list_bridges` | List all bridges (pages with `limit`/`offset`) |
| `protect_get_bridge` | Get bridge details by ID |
| `protect_update_bridge` | **DESTRUCTIVE:** Update bridge settings |

### Link Stations
| Tool | Description |
|---|---|
| `protect_list_link_stations` | List all link stations, the non-alarm-hub gateways (pages with `limit`/`offset`) |
| `protect_get_link_station` | Get link station details by ID |
| `protect_update_link_station` | **DESTRUCTIVE:** Update link station settings |

### Alarm Hubs
| Tool | Description |
|---|---|
| `protect_list_alarm_hubs` | List all alarm hubs (pages with `limit`/`offset`) |
| `protect_get_alarm_hub` | Get alarm hub details by ID |
| `protect_update_alarm_hub` | **DESTRUCTIVE:** Update alarm hub settings |
| `protect_trigger_alarm_hub_output` | **DESTRUCTIVE:** Turn an alarm hub output channel on or off: sirens, lights, locks (requires `confirm: true` and an explicit `enable`) |

### Arm Profiles — local alarm manager
| Tool | Description |
|---|---|
| `protect_list_arm_profiles` | List all arm profiles (pages with `limit`/`offset`) |
| `protect_create_arm_profile` | Create a new arm profile |
| `protect_set_current_arm_profile` | **DESTRUCTIVE:** Set the active profile used when arming (requires `confirm: true`) |
| `protect_update_arm_profile` | **DESTRUCTIVE:** Update an arm profile (requires `confirm: true` to change schedules or automations) |
| `protect_delete_arm_profile` | **DESTRUCTIVE:** Delete an arm profile by ID (requires `confirm: true`) |
| `protect_enable_arm_alarm` | Arm the alarm using the current profile |
| `protect_disable_arm_alarm` | **DESTRUCTIVE:** Disarm the alarm (requires `confirm: true`) |

### Live Views
| Tool | Description |
|---|---|
| `protect_list_liveviews` | List all live views (pages with `limit`/`offset`) |
| `protect_get_liveview` | Get live view details by ID |
| `protect_create_liveview` | Create a new live view |
| `protect_update_liveview` | **DESTRUCTIVE:** Replace a live view (send the full object from `protect_get_liveview`) |

### Alarm & Files
| Tool | Description |
|---|---|
| `protect_trigger_alarm_webhook` | **DESTRUCTIVE:** Trigger an alarm webhook, firing its external alarm action (requires `confirm: true`) |
| `protect_list_files` | List device asset files (`animations`; pages with `limit`/`offset`) |
| `protect_upload_file` | Upload a device asset file (base64 in, sent as multipart/form-data) |

### Users
| Tool | Description |
|---|---|
| `protect_list_users` | List Protect users, filtered by the key's access (pages with `limit`/`offset`) |
| `protect_get_user` | Get a Protect user by ID |
| `protect_list_ulp_users` | List UniFi Identity (ULP) users with enrolled credentials (pages with `limit`/`offset`) |
| `protect_get_ulp_user` | Get a UniFi Identity user by ID |

### Point of Sale
| Tool | Description |
|---|---|
| `protect_ingest_pos_transaction` | Record a POS transaction as a camera event so it can be overlaid on recorded footage |

## Troubleshooting

Configuration errors go to the MCP host's server log and the server exits. Tool errors reach the agent as results starting with `Error:`.

| Message | Cause and fix |
|---|---|
| `Configuration error: UNIFI_PROTECT_HOST is required` / `UNIFI_PROTECT_API_KEY is required` | Missing from the server's `env`. |
| `UNIFI_PROTECT_HOST must be a hostname or IP …` | A path, credentials or a bad port in the host; bracket IPv6 addresses. |
| `UNIFI_PROTECT_API_KEY contains a control character …` | Paste the key again. |
| `cannot read UNIFI_PROTECT_CA_CERT (…)` | The path does not exist for the server. Use an absolute path; `~` is not expanded. |
| `UNIFI_PROTECT_CA_CERT must name a PEM file containing a certificate` | No `BEGIN CERTIFICATE` block; run the `openssl` command again. |
| `…cannot be combined with UNIFI_PROTECT_VERIFY_SSL=false` / `TLS verification cannot be disabled for api.ui.com` / `UNIFI_PROTECT_CA_CERT is for local consoles` | Unset `UNIFI_PROTECT_VERIFY_SSL` (or `UNIFI_PROTECT_CA_CERT` for `api.ui.com`). |
| `Ignoring UNIFI_PROTECT_CONSOLE_ID` (log line) | The console ID only applies with `UNIFI_PROTECT_HOST=api.ui.com`. |
| `… (read-only: write tools are not registered)` (log line) and no write tools | Read-only is the default. Set `UNIFI_PROTECT_READ_ONLY=false` and restart the host. |
| `fetch failed: … The console's TLS certificate could not be verified …` | Save the console's certificate to `UNIFI_PROTECT_CA_CERT`. If you already did, the console has a new certificate: save it again. |
| `fetch failed: … The certificate for api.ui.com could not be verified …` | Something between you and Ubiquiti's cloud is presenting another certificate, such as a TLS-inspecting proxy or firewall. |
| `fetch failed: connect ECONNREFUSED …`, `ENOTFOUND` | Wrong or unreachable host. |
| `HTTP 401` / `HTTP 403` | Wrong or revoked key, or its admin lacks the rights. |
| `… Protect did not respond within … s` | The console is slow. For a write, check whether it was applied before retrying. |
| `… exceeds the …-byte limit` / `Result too large to send in one MCP message …` | The response is too large for one MCP message. Page a list with `limit` and `offset`; for a snapshot, drop `highQuality`. |
| `File too large to send in one MCP message` | Upload a smaller file. |
| `This action requires confirmation: …` | Expected: the action needs `confirm: true`, and the agent should ask you first. |
| `Use an ID returned by a list or get tool` | The agent passed a name or a malformed ID. |
| `Subscription failed: …` | The WebSocket was refused or unauthorized; this is not "no activity". |
| `WebSocket subscriptions are not available over Cloud Connector …` | Connect to the console directly for subscriptions. |
| `MCP error -32602 … Input validation error` | The call broke the tool's input schema (for example a missing `state`); the message names the field. |

## Development

The Node version used for development is pinned in `.nvmrc`. With [fnm](https://github.com/Schniz/fnm) installed, `fnm use` reads it automatically on `cd`.

```bash
pnpm run build         # Compile TypeScript
pnpm start             # Run the server
pnpm run typecheck     # Type-check src/ and tests/ without emitting
pnpm run lint          # ESLint, type-aware
pnpm run lint:fix      # ESLint with auto-fix
pnpm test              # Run all tests (vitest)
pnpm run test:watch    # Run tests in watch mode
pnpm run test:coverage # Run tests with coverage
pnpm run test:package  # Pack, install the tarball and smoke-test it over stdio
```

Git hooks are managed by [lefthook](https://github.com/evilmartians/lefthook) — `pnpm exec lefthook install` enables them. Pre-commit runs ESLint on staged files, a full typecheck, and a GitGuardian secret scan when [ggshield](https://github.com/GitGuardian/ggshield) is installed (skipped otherwise), so fnm and pnpm both need to be on your PATH.

### Commit conventions

This project uses [conventional commits](https://www.conventionalcommits.org/) and [release-please](https://github.com/googleapis/release-please) for automated releases:

- `feat: ...` — new feature (minor version bump)
- `fix: ...` — bug fix (patch version bump)
- `deps: ...` — dependency update (patch version bump; Renovate's type for package bumps)
- `feat!: ...` or `BREAKING CHANGE:` footer — breaking change (major version bump)
- `chore:`, `docs:`, `ci:`, etc. — no version bump

On push to `main`, release-please opens a Release PR that bumps the version and updates `CHANGELOG.md`. Merging that PR publishes to npm automatically. Merge pull requests with a rebase merge, so each commit (and any `BREAKING CHANGE` footer) reaches the changelog.

To override the version number, add `Release-As: x.x.x` in the commit body:

```bash
git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
```

## License

MIT
