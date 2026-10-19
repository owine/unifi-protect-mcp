# CLAUDE.md

## Project overview

MCP server exposing UniFi Protect's Integration API as tool calls. Built with the MCP SDK, TypeScript, and Zod for input validation. Runs on Node.js via stdio transport. Aligned with UniFi Protect API **7.3.70**; one tool module per API domain under `src/tools/` (the README's tool tables list them all).

## Local dev setup

- Node version pinned in `.nvmrc` (Renovate keeps it current, so read the file rather than restating the version here). Use [fnm](https://github.com/Schniz/fnm) — `fnm use` auto-reads `.nvmrc` on `cd`. The published library declares broader `engines.node` (`^22.19.0 || ^24.0.0`) for consumers; the `.nvmrc` only pins *development*.
- Package manager: pnpm via Corepack. `corepack enable`, then `pnpm install`.
- Dev install/build use pnpm; **publishing uses `npm publish --provenance`** (hybrid — npm has the most battle-tested OIDC flow).

### TypeScript 6/7 side-by-side

`package.json` deliberately aliases both TypeScript packages — **do not "simplify" this back to a single `typescript` entry**:

```jsonc
"@typescript/native": "npm:typescript@<7.x>",               // real TS 7 — owns the `tsc` bin
"typescript": "npm:@typescript/typescript6@<wrapper ver>",  // vendors a TS 6 release — owns the `tsc6` bin
```

The `typescript` entry's version will usually **not** match the TypeScript version `tsc6` reports, and that is not a typo: `@typescript/typescript6` carries its own version line, independent of the TypeScript release it vendors. Compare the two with `node -e 'console.log(require("typescript/package.json").version)'` (wrapper version) and `./node_modules/.bin/tsc6 --version` (vendored TypeScript).

typescript-eslint cannot run on TypeScript 7: the Go port ships no JS API, so `typescript-estree` crashes at module load with `TypeError: Cannot read properties of undefined (reading 'Cjs')`. Aliasing the `typescript` *specifier* to `@typescript/typescript6` keeps a real JS API in front of the linter, while `@typescript/native` claims the `tsc` bin so `build`/`typecheck` use the v7 compiler with no script changes.

- `tsc` → TypeScript 7 (build, typecheck), `tsc6` → TypeScript 6 (what the linter resolves); `--version` on each shows the exact releases
- Sanity check after dependency changes: `node -e 'console.log(require("typescript/package.json").name)'` must print `@typescript/typescript6`, and `pnpm lint` must not crash
- Collapse the split only once [typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940) is resolved (upstream targets TS 7.1, which is expected to ship a new API)
- Renovate PR titles for these two entries read oddly because of the aliasing — check which *specifier* moved, not just the version string

## Commands

```bash
pnpm install           # Install dependencies (frozen-lockfile in CI)
pnpm run build         # Compile TypeScript to dist/
pnpm run typecheck     # Type-check src/ and tests/ (tsconfig.test.json) without emitting
pnpm run lint          # ESLint, type-aware (strictTypeChecked + stylisticTypeChecked)
pnpm run lint:fix      # ESLint with auto-fix
pnpm test              # Run all tests (vitest); check the exit code, not just the counts
pnpm run test:watch    # Run tests in watch mode
pnpm run test:coverage # Run tests with coverage
pnpm run test:package  # Pack, install the tarball into an empty project, smoke-test it over stdio
```

## Architecture

```
src/
  index.ts            # Entry point: config, server instructions, tool registration, stdio transport with a larger read buffer, startup mode log
  config.ts           # Env vars → Config (Zod): host normalisation, API key trim + control-character check, UNIFI_PROTECT_CA_CERT file, Cloud Connector TLS rules
  client.ts           # ProtectClient: one send() core (path guard, redirect: "error", timeout combined with the call's abort signal, bounded body reads); JSON, binary, multipart, WebSocket
  tls.ts              # Scoped TLS: undici dispatcher (keep-alive) and WebSocket options; pinning for UNIFI_PROTECT_CA_CERT
  instructions.ts     # serverInstructions(readOnly): cross-tool guidance sent once per session
  version.ts          # SERVER_VERSION, read from package.json at runtime for serverInfo
  tools/
    index.ts          # registerAllTools(): wires every tool module through instrumentTools()
    registrar.ts      # instrumentTools() and the ToolRegistrar type modules receive: loose output schemas, dry-run preview fields, call signal, one catch, result-size guard, read-only fail-fast, titles, openWorldHint
    cameras.ts        # Camera reads and updates, snapshots, RTSPS, talkback, mic disable, PTZ
    devices.ts        # Config-driven list/get/update for lights, sensors, chimes, viewers, sirens, fobs, relays, speakers, bridges, link stations, alarm hubs (confirmFields for field-level gates)
    device-actions.ts # Action endpoints: siren play/stop/test, speaker test, relay output, alarm-hub output
    arm-profiles.ts   # Arm profile CRUD, set-current, enable/disable arm alarm
    users.ts          # Read-only Protect users + UniFi Identity (ULP) users
    pos.ts            # Point-of-sale transaction ingestion (overlays POS data on footage)
    liveviews.ts      # Live view CRUD
    files.ts          # Device asset file listing, multipart upload
    alarm-manager.ts  # Alarm manager webhook trigger
    system.ts         # NVR info, Protect application info
    subscriptions.ts  # WebSocket subscriptions for devices and events (count and size budget, bounded close)
  schemas/            # Zod output schemas for tools/list metadata + runtime validation
    common.ts         # passthroughObject(), looseOutput(), dryRunPreviewFields, nullableString(), hardwareModelFields(), listResultSchema()
    cameras.ts        # cameraSchema, rtspStreamSchema, talkbackSessionOutputSchema
    devices.ts        # DEVICE_SCHEMAS map for the config-driven device types
    misc.ts           # nvr, user, ulp-user, liveview, arm-profile, file, subscription schemas
    pos.ts            # posTransactionOutputSchema
  utils/
    limits.ts         # Payload ceilings and timeouts, derived from the SDK's stdio buffer size and request timeout
    paging.ts         # pagingInput, PAGING_NOTE, pageOf(): optional limit/offset for list tools
    params.ts         # resourceId(), armProfileId(), webhookId(): ID input schemas
    responses.ts      # formatSuccess() (compact JSON) / formatError()
    safety.ts         # READ_ONLY/WRITE/DESTRUCTIVE, formatDryRun(), dryRunInput(), confirmGate(), confirmInput(), requireConfirmation(), requireConfirmationForFields()
    url.ts            # safePath tagged template: URL-encodes interpolated path segments
scripts/
  smoke-package.sh    # `pnpm run test:package` (and release): installs a tarball into an empty project, runs smoke-stdio.mjs
  smoke-stdio.mjs     # Drives the installed binary over real stdio: version, instructions, read-only vs read-write, oversized upload
```

### Adding a new tool

1. Add `registerXTools(server: ToolRegistrar, client, readOnly)` in `src/tools/<domain>.ts` and wire it into `registerAllTools()`. The `server` a module receives comes from `instrumentTools()` in `tools/registrar.ts`, which applies the cross-cutting rules (see the file's header), so modules never need a raw `McpServer`.
2. `server.registerTool(name, { description, inputSchema, outputSchema, annotations }, handler)`. The handler returns `formatSuccess(data)` and simply lets errors throw: the registrar catches them once and returns `formatError`. `outputSchema` is a raw shape or `z.object` from `src/schemas/`, never an array or union.
3. ID inputs use `resourceId()` from `utils/params.ts` (`armProfileId()` beside literal routes, `webhookId()` for user-defined IDs), never `z.string()`. Build paths with `safePath`.
4. Annotations from `utils/safety.ts`: `READ_ONLY` for reads; `DESTRUCTIVE` for anything that deletes, replaces or changes existing state, which includes every update/PATCH tool (MCP reserves `destructiveHint: false` for additive-only changes) and every tool that takes `confirm`; `WRITE` only for creations and momentary actions.
5. Write tools go below the module's `if (readOnly) return` (the registrar also refuses a write tool in read-only mode at startup), take `dryRun: dryRunInput()`, and return `formatDryRun(method, path, body)` **before** any confirm check or request.
6. Gated tools: `const GATE = confirmGate("<action>")` at module level, `confirm: GATE.input` in the schema, and after the dry-run branch `const denied = GATE.check(confirm); if (denied) return denied;`. For an update gated only for some settings, use `requireConfirmationForFields()` (or `confirmFields` in a `DeviceConfig`). Say "Requires confirm: true" in the description, and update `src/instructions.ts` if the gate is a new kind.
7. A list tool that returns an array takes `inputSchema: pagingInput`, appends `PAGING_NOTE` to its description, and returns `formatSuccess(pageOf(data, limit, offset))`.
8. Sizes and timeouts come from `utils/limits.ts`. Never hard-code a number in prose; a description that states a limit interpolates the constant.
9. Tests: handler tests in `tests/tools/<domain>.test.ts` with `createMockServer()`/`createMockClient()`. Behaviour at the SDK boundary goes in `tests/sdk-contract.test.ts`. Add the tool to the README tool table with its markers; `tests/docs-drift.test.ts` checks them.

### Output schemas

Tools declare an `outputSchema` so MCP clients receive a typed response contract in `tools/list`. The SDK validates `structuredContent` against it on the server, and SDK *clients* validate it again against the **published** JSON Schema, which is why the published schema must be loose.

Conventions:
- **All fields `.optional()`.** Protect's responses vary by hardware and firmware; required fields would cause spurious validation failures. Strings that Protect may send as `null` use `nullableString()`, and nested objects it may send as `null` are `.nullable().optional()`.
- **Loose everywhere.** Nested objects use `passthroughObject()` (`.loose()`). The top level is published loose by `instrumentTools()` via `looseOutput()`, because a raw shape would publish `additionalProperties: false` and every SDK client would reject the first field a firmware update adds. Tools that take `dryRun` also get the preview fields (`dryRun`, `action`, `path`, `body`) declared automatically.
- **List endpoints** wrap the array under `{ result: z.array(itemSchema) }` (`listResultSchema()`), because `structuredContent` must be an object; a paged result adds `totalCount` and `offset`. `formatSuccess()` wraps a non-object result under the same key.
- The schema describes *what the LLM should know about*, not a strict 1:1 mirror of the API. Treat it as documentation that happens to be machine-readable.

### Tool safety

- Every tool declares `readOnlyHint` and `destructiveHint`, and gets `openWorldHint: false` and a `title` from the registrar. Every update tool and every tool that takes `confirm` is destructive; `sdk-contract.test.ts` enforces both.
- Read-only mode (`UNIFI_PROTECT_READ_ONLY` unset or true) registers no write tools; the registrar refuses one at startup. `sdk-contract.test.ts` proves it by calling every listed tool and asserting the console saw only GETs.
- `confirm` is optional in the schema and enforced in the handler after the dry-run branch, so a preview never needs it. The rule for which tools take it: irreversible actions, physical outputs, the alarm webhook, stopping a siren, disarming or weakening alarm coverage, and opening stream access. The README tool table marks each one.
- Every write tool supports `dryRun: true`, and its preview validates against the published output schema.
- Server instructions (`src/instructions.ts`) carry the cross-tool rules: console data is untrusted, stream URLs are credentials, dry run then confirm.
- Every result must fit one stdio message: per-kind ceilings in `utils/limits.ts`, and the registrar measures the final serialised result.

### Testing patterns

- Handler tests mock `ProtectClient` methods and capture tool handlers via `createMockServer()`, which registers through `instrumentTools()` like production. It returns `handlers` (name → handler) and `configs` (name → published config). Use `mockFn(client, "get")` for type-safe access to mock functions. Each tool gets a success and error test at minimum, plus annotation checks, read-only mode tests, and dry-run/confirm tests where applicable.
- `tests/sdk-contract.test.ts` runs the real `McpServer` and SDK `Client` over `InMemoryTransport` with `fetch` stubbed. It lists tools first, as hosts do, because the client validates only against schemas it has listed. Anything at the SDK boundary is tested here: published output schemas, dry-run previews, confirm, annotations, read-only by behaviour, hostile IDs, cancellation, timeouts, payload sizes, paging.
- `tests/tls.test.ts` runs real loopback HTTPS + WSS servers with certificates generated per run (self-signed and CA-issued).
- Meta-tests: `safety-compliance.test.ts`, `resource-ids.test.ts` (every ID input of every tool), `validation.test.ts`, `path-encoding.test.ts`, `docs-drift.test.ts` (README, CLAUDE.md, SECURITY.md, `.env.example` and descriptions against the code; count-free).
- `pnpm run test:package` packs the tarball, installs it, and drives the binary over real stdio.
- Tests never contact a console: stub `fetch` or use loopback servers. A new guard test is mutation-checked: reintroduce the bug and watch the test fail.

## Code style

- ESLint with `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`, against `tsconfig.test.json`
- All imports use `.js` extensions (Node16 module resolution)
- Build request paths with the ``safePath`` tagged template from `utils/url.ts`, never a plain template literal; ID inputs use `resourceId()` (and its variants) with `.describe()`
- Test files relax a narrow set of type-aware rules for deliberately loose mocks; see `eslint.config.mjs`

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
- **Dependency commits**: Only `feat`, `fix`, and `deps` are "releasable units" in release-please. Renovate's commit types come from the shared `owine/renovate-config` presets: package bumps are `deps:` (patch release), lock file maintenance is `chore:` and GitHub Actions/workflow updates are `ci:` (no release), and security updates are `fix:`. Those presets keep `ci:` and `deps:` updates on separate group branches, because a branch takes one commit type and a mixed group once shipped a runtime bump (`ws`, #284) as `ci:` with no release
- On push to `main`, release-please opens/updates a "Release PR" that bumps `package.json` version and updates `CHANGELOG.md`
- Merging the Release PR triggers `npm publish` to `@owine/unifi-protect-mcp` with provenance attestation. The release workflow builds, tests and smoke-tests the tagged commit in a job without the npm token, then a separate publish job checks the tarball's hash and publishes it; a re-run skips a version already on npm. Dist-tag and deprecate fixes need a maintainer login (see SECURITY.md)
- Merge PRs with a **rebase merge**, so each conventional commit (and any `BREAKING CHANGE` footer) reaches the changelog
- To override the version number, add `Release-As: x.x.x` in the **commit body** (not the title):
  ```
  git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
  ```
