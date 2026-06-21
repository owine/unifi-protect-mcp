# CLAUDE.md

## Project overview

MCP server exposing UniFi Protect's Integration API as tool calls. Built with the MCP SDK, TypeScript, and Zod for input validation. Runs on Node.js via stdio transport. Aligned with UniFi Protect API **7.1.83** (73 tools across 9 domains).

## Local dev setup

- Node version pinned in `.nvmrc` (24.15.0). Use [fnm](https://github.com/Schniz/fnm) — `fnm use` auto-reads `.nvmrc` on `cd`. The published library declares broader `engines.node` (`^22.13.0 || ^24.0.0`) for consumers; the `.nvmrc` only pins *development*.
- Package manager: pnpm via Corepack. `corepack enable`, then `pnpm install`.
- Dev install/build use pnpm; **publishing uses `npm publish --provenance`** (hybrid — npm has the most battle-tested OIDC flow).

## Commands

```bash
pnpm install         # Install dependencies (frozen-lockfile in CI)
pnpm run build       # Compile TypeScript to dist/
pnpm run typecheck   # Type-check without emitting
pnpm run lint        # ESLint (strict + stylistic)
pnpm run lint:fix    # ESLint with auto-fix
pnpm test            # Run all tests (vitest)
pnpm run test:watch  # Run tests in watch mode
```

## Architecture

```
src/
  index.ts            # Entry point — creates server, connects stdio transport
  config.ts           # Loads and validates env vars with Zod
  client.ts           # ProtectClient — HTTP wrapper for the Protect API
  tools/              # Tool handlers, one file per API domain
    index.ts          # registerAllTools() — wires all tool modules
    cameras.ts        # Camera CRUD, snapshots, RTSP, PTZ, talkback
    devices.ts        # Config-driven CRUD for lights, sensors, chimes, viewers, sirens, fobs, relays, speakers, bridges, link-stations, alarm-hubs
    device-actions.ts # Action endpoints: siren play/stop/test, speaker test, relay activate, alarm-hub trigger
    arm-profiles.ts   # Arm profile CRUD, set-current, enable/disable arm alarm
    users.ts          # Read-only Protect users + UniFi Identity (ULP) users
    liveviews.ts      # Live view CRUD
    files.ts          # File listing, upload
    system.ts         # NVR info, protect system info
    subscriptions.ts  # WebSocket subscriptions for devices and events
  schemas/            # Zod output schemas for tools/list metadata + runtime validation
    common.ts         # passthroughObject(), deviceCommonFields, listResultSchema()
    cameras.ts        # cameraSchema, rtspStreamSchema, talkbackSessionOutputSchema
    devices.ts        # DEVICE_SCHEMAS map for the 11 config-driven device types
    misc.ts           # nvr, user, ulp-user, liveview, arm-profile, file, subscription schemas
  utils/
    responses.ts      # formatSuccess() / formatError() helpers
```

### Adding a new tool

1. Add a function `registerXTools(server, client, readOnly)` in `src/tools/<domain>.ts`
2. Use `server.registerTool(name, { description, inputSchema, outputSchema, annotations }, handler)` — follow the existing try/catch + `formatSuccess`/`formatError` pattern
3. Set appropriate annotations: `readOnlyHint` and `destructiveHint`
4. For write tools: gate behind `if (!readOnly)`, add optional `dryRun` parameter
5. For dangerous tools: require `confirm: z.literal(true)` parameter
6. Wire it into `src/tools/index.ts` via `registerAllTools()`
7. Add tests in `tests/tools/<domain>.test.ts` using `createMockServer()` and `createMockClient()` from `tests/tools/_helpers.ts`

### Output schemas

Tools declare an `outputSchema` (a Zod shape — `Record<string, ZodType>`) so MCP clients receive a typed response contract in `tools/list`, and the SDK validates `structuredContent` against it at call time.

Conventions:
- **All fields `.optional()`** — Protect's responses vary by hardware/firmware. Required fields would cause spurious validation failures.
- **`.passthrough()` on every object** (via `passthroughObject()` in `schemas/common.ts`) — lets new/unknown fields flow through without rejection when Protect adds them.
- **List endpoints** wrap the array under `{ result: z.array(itemSchema) }` because `structuredContent` must be an object per MCP spec. `formatSuccess()` auto-wraps non-object/array data under the same key.
- The schema describes *what the LLM should know about*, not a strict 1:1 mirror of the API. Treat it as documentation that happens to be machine-readable.

### Tool safety

- All tools declare `readOnlyHint` and `destructiveHint` annotations
- `UNIFI_PROTECT_READ_ONLY=true` prevents write tool registration entirely
- `protect_disable_mic` and `protect_trigger_alarm_webhook` require `confirm: true` (validated by `z.literal(true)`)
- Write tools support `dryRun: true` to preview actions without executing

### Testing patterns

Tests mock `ProtectClient` methods and capture tool handlers via `createMockServer()`, which returns `handlers` (name → handler) and `configs` (name → config with annotations). Use `mockFn(client, "get")` for type-safe access to mock functions. Each tool gets a success and error test at minimum, plus annotation checks, read-only mode tests, and dry-run/confirm tests where applicable.

## Code style

- ESLint with `typescript-eslint` strict + stylistic rulesets
- All imports use `.js` extensions (Node16 module resolution)
- Use `z.string().describe()` for tool parameter descriptions
- `no-explicit-any` and `no-non-null-assertion` are relaxed in test files only

## API version bumps

For updating tools to match a new UniFi Protect API version, follow the skill at `~/.claude/skills/unifi-api-update/SKILL.md`.

## Releases

Versioning and npm publishing are automated via [release-please](https://github.com/googleapis/release-please).

- Use **conventional commits** — release-please reads these to determine semver bumps and generate changelogs
  - `feat: ...` → minor bump
  - `fix: ...` → patch bump
  - `deps: ...` → patch bump (production dependency updates)
  - `feat!: ...` or `BREAKING CHANGE:` footer → major bump
  - `chore:`, `docs:`, `ci:`, `refactor:`, `test:` → no release
- **Dependency commits**: Only `feat`, `fix`, and `deps` are "releasable units" in release-please. Renovate is configured to use `deps:` for all dependency updates (triggers a patch release)
- On push to `main`, release-please opens/updates a "Release PR" that bumps `package.json` version and updates `CHANGELOG.md`
- Merging the Release PR triggers `npm publish` to `@owine/unifi-protect-mcp` with provenance attestation
- To override the version number, add `Release-As: x.x.x` in the **commit body** (not the title):
  ```
  git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
  ```
