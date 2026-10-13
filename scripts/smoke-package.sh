#!/bin/sh
# Install a package tarball into an empty project and smoke-test the
# installed binary over stdio. Catches what tests against src/ cannot: the
# files list, the bin entry and shebang, and runtime lookups such as
# ../package.json from dist/.
#
# Usage: smoke-package.sh [tarball]
# With no argument, packs the package exactly as npm would publish it. The
# release workflow passes the tarball it is about to publish.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

if [ $# -gt 0 ]; then
  tarball=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
else
  (cd "$root" && npm pack --silent --pack-destination "$work" >/dev/null)
  tarball=$(ls "$work"/*.tgz)
fi

cd "$work"
npm init -y >/dev/null
npm install --silent --ignore-scripts --no-audit --no-fund "$tarball"

node "$root/scripts/smoke-stdio.mjs" "$work/node_modules/.bin/unifi-protect-mcp"
