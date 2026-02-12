# Changelog

## [2.0.0](https://github.com/owine/unifi-protect-mcp/compare/v1.1.0...v2.0.0) (2026-02-12)


### ⚠ BREAKING CHANGES

* UNIFI_PROTECT_READ_ONLY now defaults to true (was false). Users who need write tools must explicitly set UNIFI_PROTECT_READ_ONLY=false. This follows the principle of least privilege — an MCP server that can control cameras should require opt-in for writes, not opt-out.

### Features

* default read-only mode to true for safety ([1835991](https://github.com/owine/unifi-protect-mcp/commit/18359911c9b3ae24a67943de5a012de35a2f4e89))


### Bug Fixes

* align write endpoints with official API documentation ([7bd62a2](https://github.com/owine/unifi-protect-mcp/commit/7bd62a288d2985ae79cd0bd24bcac048f523ea99))

## [1.1.0](https://github.com/owine/unifi-protect-mcp/compare/v1.0.0...v1.1.0) (2026-02-12)


### Features

* add tool safety with annotations, read-only mode, confirm and dry-run ([88649a0](https://github.com/owine/unifi-protect-mcp/commit/88649a028eebd823a085bee088cb4e82e00107b7))

## [1.0.0](https://github.com/owine/unifi-protect-mcp/compare/v1.0.0...v1.0.0) (2026-02-11)


### Features

* prepare package for npm publishing with release-please ([3adddb8](https://github.com/owine/unifi-protect-mcp/commit/3adddb8bd1991601f32cdd0ac3762a60e4c4ffce))


### Bug Fixes

* drop Node 18 from CI matrix and gate release on CI success ([32a192e](https://github.com/owine/unifi-protect-mcp/commit/32a192efd92165b26ab79dc4bac34b64b8ba792e))
* switch npm publish to OIDC trusted publishing ([bc935f9](https://github.com/owine/unifi-protect-mcp/commit/bc935f977d97c8248e713c4c877c24de4dd18272))
* use Node 24 for publish job (npm OIDC requires npm v11+) ([978e693](https://github.com/owine/unifi-protect-mcp/commit/978e6937f5337810273447862d53713f8d84e3e9))
* use semantic commits for Renovate and update docs to reference npm package ([8ddf03c](https://github.com/owine/unifi-protect-mcp/commit/8ddf03c3a945e908ae0457a5c4d36c9cec975c62))


### Miscellaneous Chores

* retrigger release 1.0.0 ([00aafd6](https://github.com/owine/unifi-protect-mcp/commit/00aafd6250768b9b2eef3dfe9451b311c3be45d9))

## 1.0.0 (2026-02-11)


### Features

* prepare package for npm publishing with release-please ([3adddb8](https://github.com/owine/unifi-protect-mcp/commit/3adddb8bd1991601f32cdd0ac3762a60e4c4ffce))


### Bug Fixes

* drop Node 18 from CI matrix and gate release on CI success ([32a192e](https://github.com/owine/unifi-protect-mcp/commit/32a192efd92165b26ab79dc4bac34b64b8ba792e))
* switch npm publish to OIDC trusted publishing ([bc935f9](https://github.com/owine/unifi-protect-mcp/commit/bc935f977d97c8248e713c4c877c24de4dd18272))
* use Node 24 for publish job (npm OIDC requires npm v11+) ([978e693](https://github.com/owine/unifi-protect-mcp/commit/978e6937f5337810273447862d53713f8d84e3e9))
* use semantic commits for Renovate and update docs to reference npm package ([8ddf03c](https://github.com/owine/unifi-protect-mcp/commit/8ddf03c3a945e908ae0457a5c4d36c9cec975c62))
