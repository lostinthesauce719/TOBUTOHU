#!/bin/bash
# Refresh mobile/www from the Tobu greybox root, then cap sync ios.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$(cd "$(dirname "$0")" && pwd)"
rm -rf "$MOBILE/www"
mkdir -p "$MOBILE/www"
cp -a "$ROOT/index.html" "$ROOT/hero.js" "$ROOT/scenery.js" "$ROOT/look.js" \
  "$ROOT/flash.js" "$ROOT/saves.js" "$ROOT/sim.js" "$ROOT/clipkit.js" \
  "$ROOT/palettes.json" "$ROOT/package.json" "$ROOT/README.md" \
  "$ROOT/manifest.webmanifest" "$ROOT/sw.js" "$MOBILE/www/"
cp -a "$ROOT/vendor" "$ROOT/icons" "$ROOT/server" "$MOBILE/www/"
cd "$MOBILE"
npx cap sync ios
echo "Synced web → ios/App/App/public"
