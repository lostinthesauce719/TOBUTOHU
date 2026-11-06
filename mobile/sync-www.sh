#!/bin/bash
# Refresh mobile/www from the Tobu greybox root, then cap sync ios.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$(cd "$(dirname "$0")" && pwd)"
rm -rf "$MOBILE/www"
mkdir -p "$MOBILE/www"
cp -a "$ROOT/index.html" "$ROOT/hero.js" "$ROOT/scenery.js" "$ROOT/look.js" \
  "$ROOT/flash.js" "$ROOT/saves.js" "$ROOT/wallet.js" "$ROOT/economy.js" \
  "$ROOT/sim.js" "$ROOT/sim_v5.js" "$ROOT/powerups.js" "$ROOT/clipkit.js" \
  "$ROOT/palettes.json" "$ROOT/package.json" "$ROOT/README.md" \
  "$ROOT/manifest.webmanifest" "$ROOT/sw.js" \
  "$ROOT/age.js" "$ROOT/ench.js" "$MOBILE/www/"
# Optional frozen sims if present
[ -f "$ROOT/sim_v6.js" ] && cp -a "$ROOT/sim_v6.js" "$MOBILE/www/"
cp -a "$ROOT/vendor" "$ROOT/icons" "$ROOT/server" "$ROOT/art" "$MOBILE/www/"
cd "$MOBILE"
npx cap sync ios
echo "Synced web → ios/App/App/public"
