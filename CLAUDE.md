# CLAUDE.md

## Project overview

MCP server exposing UniFi Protect's Integration API as tool calls. Built with the MCP SDK, TypeScript, and Zod for input validation. Runs on Node.js via stdio transport.

## Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Type-check without emitting
npm run lint         # ESLint (strict + stylistic)
npm run lint:fix     # ESLint with auto-fix
npm test             # Run all tests (vitest)
npm run test:watch   # Run tests in watch mode
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
    devices.ts        # Lights, sensors, chimes, viewers
    liveviews.ts      # Live view CRUD
    files.ts          # File listing, upload
    system.ts         # NVR info, protect system info
  utils/
    responses.ts      # formatSuccess() / formatError() helpers
```

### Adding a new tool

1. Add a function `registerXTools(server, client)` in `src/tools/<domain>.ts`
2. Use `server.tool(name, description, zodSchema, handler)` — follow the existing try/catch + `formatSuccess`/`formatError` pattern
3. Wire it into `src/tools/index.ts` via `registerAllTools()`
4. Add tests in `tests/tools/<domain>.test.ts` using `createMockServer()` and `createMockClient()` from `tests/tools/_helpers.ts`

### Testing patterns

Tests mock `ProtectClient` methods and capture tool handlers via `createMockServer()`. Use `mockFn(client, "get")` for type-safe access to mock functions. Each tool gets a success and error test at minimum.

## Code style

- ESLint with `typescript-eslint` strict + stylistic rulesets
- All imports use `.js` extensions (Node16 module resolution)
- Use `z.string().describe()` for tool parameter descriptions
- `no-explicit-any` and `no-non-null-assertion` are relaxed in test files only

## Releases

Versioning and npm publishing are automated via [release-please](https://github.com/googleapis/release-please).

- Use **conventional commits** — release-please reads these to determine semver bumps and generate changelogs
  - `feat: ...` → minor bump
  - `fix: ...` → patch bump
  - `feat!: ...` or `BREAKING CHANGE:` footer → major bump
  - `chore:`, `docs:`, `ci:`, `refactor:`, `test:` → no release
- On push to `main`, release-please opens/updates a "Release PR" that bumps `package.json` version and updates `CHANGELOG.md`
- Merging the Release PR triggers `npm publish` to `@owine/unifi-protect-mcp` with provenance attestation
- To override the version number, add `Release-As: x.x.x` in the **commit body** (not the title):
  ```
  git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
  ```
