# Security Policy

## Supported versions

Only the latest release line receives fixes. Upgrade to the newest version before reporting.

## Reporting a vulnerability

Report privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue for a security problem.

Include what you can of:

- the package version (or the `serverInfo.version` the server reports) and your Node.js version
- your Protect application version (`protect_get_info`)
- whether you connect to a local console or through `api.ui.com`, the `UNIFI_PROTECT_READ_ONLY` and `UNIFI_PROTECT_VERIFY_SSL` settings, and whether `UNIFI_PROTECT_CA_CERT` is set
- steps to reproduce, and what an attacker could achieve

Do not include API keys, RTSPS or talkback URLs, or other secrets.

## What to expect

You should get an acknowledgement within a week. Confirmed issues are fixed in a new release and disclosed through a GitHub security advisory, crediting the reporter unless they prefer otherwise.

## Scope

The server runs locally, holds a UniFi API key, and is driven by a language model that reads data other people can influence (camera and device names, doorbell messages, event fields). In scope, for example:

- a tool reaching a console endpoint or action other than the one it describes (for example through an ID)
- a write that bypasses read-only mode, `dryRun`, or a required `confirm`
- a write that still lands after the MCP call was cancelled
- the API key leaking into tool output, errors or logs
- a connection to the console that skips certificate verification while `UNIFI_PROTECT_VERIFY_SSL` is on, or accepts a certificate that neither matches `UNIFI_PROTECT_CA_CERT` nor verifies for the host
- input that crashes the server or disconnects the MCP client

By design, and not a vulnerability on its own:

- `protect_get_rtsp_streams` returns RTSPS URLs, which are credentials for live video, in read-only mode too.
- `confirm` is supplied by the model, so it asks the model to check with you but is not a human approval step. Every tool that takes it is annotated destructive, so an MCP client can ask you as well.

Vulnerabilities in UniFi Protect or UniFi OS go to Ubiquiti.

## Operating it safely

- **Use the least-privileged key that works.** Create the key from an admin account with no more access than you need; for the default read-only mode, an admin with view-only access to Protect.
- **Prefer a local console key to a Site Manager key.** A Site Manager key (Cloud Connector, `api.ui.com`) reaches every console on the account.
- **Keep certificate verification on.** Trust a self-signed console with `UNIFI_PROTECT_CA_CERT` rather than setting `UNIFI_PROTECT_VERIFY_SSL=false`.
- **Keep your MCP client's approval prompts on for destructive tools,** and run with writes enabled only when you need them.
- **Pin the major version you have tested** rather than `@latest`, so a new major version does not run with your key unannounced.
- **If a stream URL or key appears somewhere it shouldn't** (a shared transcript, a log), delete the stream session (`protect_delete_rtsp_stream`) or revoke the key in the console and create a new one.

## Handling a bad release

For maintainers. Publishing runs in CI through npm trusted publishing, which cannot change dist-tags or deprecate versions; those need a maintainer's own npm login.

```sh
# 1. Point @latest back at the last good version, so new npx runs stop pulling the bad one
npm dist-tag add @owine/unifi-protect-mcp@<last-good> latest
# 2. Warn anyone who has the bad version
npm deprecate @owine/unifi-protect-mcp@<bad> "Broken: <reason>. Use <last-good>, or upgrade once a fix is out."
# 3. Fix forward with a fix: PR; publishing the next release moves @latest again
```

If a release run failed partway (tag and GitHub Release created, nothing on npm), re-run the failed jobs of that Release workflow run. The publish step skips a version that already reached npm, so a re-run is safe.
