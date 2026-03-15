# UniFi Protect API 7.0.88 Upgrade Design

## Summary

Upgrade the MCP server from UniFi Protect Integration API 6.2.88 to 7.0.88. The new API version adds two WebSocket subscription endpoints for real-time device and event streaming. All existing REST endpoints remain unchanged.

## Scope

1. **Version bump**: Update API version references from 6.2.88 → 7.0.88
2. **New dependency**: Add `ws` (runtime, caret-pinned) and `@types/ws` (dev, exact-pinned)
3. **ProtectClient enhancement**: Add `connectWebSocket(path)` method
4. **Two new MCP tools**: `protect_subscribe_devices` and `protect_subscribe_events`
5. **Tests**: Full test coverage for the new tools and client method
6. **Docs**: Update `docs/api/04-websocket.md` with the new endpoint schemas

## Non-goals

- Long-lived streaming or persistent connections
- WebSocket reconnection logic
- Event filtering beyond what the API provides natively

---

## Design

### 1. Version bump

Update any references to API version 6.2.88 → 7.0.88. This includes doc files and code comments. The base URL path (`/proxy/protect/integration/v1`) is unchanged.

### 2. New dependency: `ws`

| Package | Section | Pinning | Version |
|---------|---------|---------|---------|
| `ws` | dependencies | `^` (caret) | `^8.18.0` |
| `@types/ws` | devDependencies | exact | `8.18.0` |

Rationale: `ws` is the standard Node.js WebSocket client. It has zero transitive dependencies and is actively maintained. Version pinning follows the project convention: caret for runtime deps, exact for dev deps.

### 3. ProtectClient changes

Add one new method to `src/client.ts`:

```ts
connectWebSocket(path: string): WebSocket
```

**Behavior:**
- Constructs URL: `wss://{config.host}/proxy/protect/integration/v1{path}`
- Sets `X-API-KEY` header for authentication
- Passes `rejectUnauthorized: config.verifySsl` to respect TLS config
- Returns the raw `WebSocket` instance — caller manages lifecycle

**Why return raw WebSocket:** Keeps the client thin and consistent with its role as a transport layer. The tool handler owns the collect/timeout/close logic.

### 4. New tool module: `src/tools/subscriptions.ts`

Exports: `registerSubscriptionTools(server: McpServer, client: ProtectClient)`

#### Tool: `protect_subscribe_devices`

- **Description**: "Connect to the device update WebSocket and collect messages for a specified duration. Returns real-time add/update/remove events for Protect-managed hardware devices."
- **Input schema**:
  - `duration`: `z.number().min(1).max(30).default(5).describe("Seconds to listen for device updates")`
- **Annotations**: `READ_ONLY` (`readOnlyHint: true`, `destructiveHint: false`)
- **Always registered** (not gated by `readOnly` flag)

#### Tool: `protect_subscribe_events`

- **Description**: "Connect to the Protect event WebSocket and collect messages for a specified duration. Returns events like motion detection, doorbell rings, and smart detections."
- **Input schema**:
  - `duration`: `z.number().min(1).max(30).default(5).describe("Seconds to listen for Protect events")`
- **Annotations**: `READ_ONLY`
- **Always registered**

#### Shared handler logic

Both tools follow the same pattern:

```
1. Call client.connectWebSocket(path)
2. On "message": parse JSON, push to messages[]
3. On "error": record error, close WebSocket
4. After `duration` seconds: close WebSocket
5. Return formatSuccess({ messages, duration, error? })
```

If the WebSocket fails to connect or errors mid-stream, the tool returns whatever messages were collected plus the error — it does not throw. This follows the existing `formatError` pattern for graceful degradation.

### 5. Wire up in `src/tools/index.ts`

Add `registerSubscriptionTools(server, client)` to `registerAllTools()`. These tools are always registered (read-only), so the call goes alongside other read-only tool registrations, not inside the `if (!readOnly)` gate.

### 6. Tests: `tests/tools/subscriptions.test.ts`

Mock strategy: `client.connectWebSocket()` returns a mock object that extends `EventEmitter` with a `close()` method, simulating the `ws` WebSocket interface.

**Test cases:**
- Success: messages collected and returned after timeout
- Multiple messages: verifies array accumulation
- Error handling: WebSocket error mid-stream returns partial results
- Connection error: WebSocket fails immediately, returns error
- Annotations: both tools have `READ_ONLY` annotations
- Duration validation: default is 5, rejects < 1 and > 30
- Registration: both tools registered in read-only mode and write mode
- Message parsing: invalid JSON messages are handled gracefully

### 7. API docs update

Update `docs/api/04-websocket.md` to document:

**GET /v1/subscribe/devices** (WebSocket)
- Event types: `add`, `update`, `remove`
- Message schema: `{ type: string, item: { id, modelKey, name, ... } }`

**GET /v1/subscribe/events** (WebSocket)
- Event types: `add`, `update`
- Message schema: `{ type: string, item: { id, modelKey: "event", type: "ring"|"motion"|..., start, end, device } }`

---

## File changes summary

| File | Action | Description |
|------|--------|-------------|
| `package.json` | modify | Add `ws` dep, `@types/ws` devDep |
| `src/client.ts` | modify | Add `connectWebSocket()` method |
| `src/tools/subscriptions.ts` | create | New tool module with 2 tools |
| `src/tools/index.ts` | modify | Wire `registerSubscriptionTools` |
| `tests/tools/subscriptions.test.ts` | create | Tests for new tools |
| `docs/api/04-websocket.md` | modify | Document subscription endpoints |

---

## Risk assessment

- **Low risk**: All existing endpoints unchanged; purely additive
- **WebSocket dependency**: `ws` is well-established with zero transitive deps
- **Timeout behavior**: On quiet systems, tools will return empty arrays — this is expected and documented in the tool description
- **TLS**: Reuses existing `verifySsl` config, no new TLS surface
