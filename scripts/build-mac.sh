#!/bin/bash
# Build CheckOne for macOS with stable code-signing (noteone-dev cert).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CERT="noteone-dev"
try_sign() {
  codesign --force --sign "$CERT" "$1" 2>/dev/null && return 0
  echo "signing with '$CERT' failed; using ad-hoc" >&2
  codesign --force --sign - "$1"
}

echo "==> 1/3 compile TypeScript"
npm run build

echo "==> 2/3 package app (unpacked) + codesign"
npx electron-builder --mac --dir --config.asar=false
APP="$ROOT/release/mac-arm64/CheckOne.app"
[ -d "$APP" ] || { echo "app not found: $APP"; exit 1; }

find "$APP/Contents/Frameworks" -name "*.app" -o -name "*.framework" -o -type f -perm +111 -name "*.dylib" 2>/dev/null | while read -r target; do
  try_sign "$target" 2>/dev/null || true
done
try_sign "$APP"
echo "    signed: $(codesign -dv "$APP" 2>&1 | grep Identifier) cert=$CERT"

echo "==> 3/3 repackage signed app into DMG"
npx electron-builder --mac --prepackaged "$APP"

echo "done: $(ls -lh "$ROOT/release/"*.dmg | awk '{print $NF, $5}')"