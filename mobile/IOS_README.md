# Tobu iOS test build (Capacitor)

This folder wraps the Tobu greybox (`../`) as a native iOS app via Capacitor.
**This Linux box cannot produce a signed `.ipa`** — there is no Xcode / CocoaPods here.
`npx cap add ios` already generated the Xcode project; `pod install` was skipped on Linux (expected).

App id (placeholder): `com.apollo.tobu`  
Orientation: portrait only · fullscreen · safe-area insets via `viewport-fit=cover` · no zoom / bounce.

## What Apollo must provide

| Item | Why | Where it goes |
|---|---|---|
| **Apple Developer Program** membership ($99/yr) | Required to install on a real iPhone / TestFlight / App Store | [developer.apple.com/programs](https://developer.apple.com/programs/) |
| **Team ID** (10-char, e.g. `A1B2C3D4E5`) | Signing + GitHub Actions `APPLE_TEAM_ID` | Membership details on developer.apple.com |
| **App Store Connect API key** | CI upload to TestFlight without 2FA | App Store Connect → Users and Access → Integrations → App Store Connect API → Generate Key (App Manager). Save: Key ID, Issuer ID, and the `.p8` file |
| **A GitHub repo** this tree can be pushed to | The macOS Actions runner builds from the repo | Create an empty private repo; add it as `git remote` (FORGEPLAY will not push without your OK) |
| **His iPhone + TestFlight** | Install the build | Install TestFlight from the App Store; accept the invite once CI uploads |

### Optional (local Mac build, no CI)

- A Mac with Xcode 15+ and CocoaPods (`sudo gem install cocoapods`)
- Signing cert + provisioning profile (Xcode "Automatically manage signing" with your Team is enough for device debug)

## Secrets for GitHub Actions (`.github/workflows/ios.yml`)

Set these as repository secrets (Settings → Secrets and variables → Actions):

| Secret | Contents |
|---|---|
| `APPLE_TEAM_ID` | 10-character Team ID |
| `APP_STORE_CONNECT_API_KEY_ID` | Key ID from App Store Connect |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID from App Store Connect |
| `APP_STORE_CONNECT_API_KEY_P8` | Full contents of the `.p8` private key file |
| `MATCH_PASSWORD` *(optional)* | Only if you later switch to fastlane match for certs |
| `MATCH_GIT_URL` *(optional)* | Private certs repo for match |

Unsigned / simulator builds need **no** secrets — the `simulator` job runs on every push/PR to `master`.

TestFlight upload runs only on `workflow_dispatch` or tags `ios-*`, and only when the App Store Connect secrets are present.

## Local Mac steps (once you have a Mac + Team)

```bash
cd mobile
npm install
bash ./sync-www.sh          # copies greybox → www → ios/App/App/public + cap sync
cd ios/App && pod install   # needs CocoaPods; fails on Linux (expected)
cd ../..
npx cap open ios            # opens Xcode
# In Xcode: select your Team, pick a device or simulator, hit Run
```

## PWA fallback (test on iPhone Safari today)

No Apple Developer account needed.

1. Serve the greybox over **https** (required for Add to Home Screen / service worker). Easiest: push to any static host, or `npx localtunnel --port 8766` / Cloudflare tunnel against the local server.
2. On iPhone Safari open the https URL.
3. Share → **Add to Home Screen**.
4. Launch from the home-screen icon (standalone, portrait).

Files: `manifest.webmanifest`, `sw.js`, `icons/`, apple-mobile-web-app meta tags in `index.html`.

Local http (no https) still plays in Safari; you just cannot install it as a home-screen app.

## Sync after greybox changes

From `mobile/`:

```bash
npm run sync
```

Or from repo root after editing JS/HTML, re-copy then `npx cap sync ios` on a Mac before archiving.

## Honest limits

- Bundle id `com.apollo.tobu` is a placeholder — change it in `capacitor.config.json` + Xcode if the id is taken.
- No real ad SDK, no Game Center, no push — this is a playable test shell.
- `pod install` and `xcodebuild` only work on macOS.
- FORGEPLAY will not create Apple / GitHub accounts or push to a remote.
