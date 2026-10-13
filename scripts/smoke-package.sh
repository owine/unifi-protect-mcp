#!/bin/sh
# Pack the package exactly as npm would publish it, install that tarball into
# an empty project, and smoke-test the installed binary over stdio. Catches
# what tests against src/ cannot: the files list, the bin entry and shebang,
# and runtime lookups such as ../package.json from dist/.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cd "$root"
npm pack --silent --pack-destination "$work" >/dev/null

cd "$work"
npm init -y >/dev/null
npm install --silent --ignore-scripts --no-audit --no-fund ./*.tgz

node "$root/scripts/smoke-stdio.mjs" "$work/node_modules/.bin/unifi-protect-mcp"
