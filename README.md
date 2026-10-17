# Tobu 3D greybox
Run: `python3 -m http.server` in this folder, open index.html (needs a local server for ES modules).
Flags: ?seed=N  ?bot (autoplay)  ?debug  ?sim=SECONDS (headless bot run; result JSON in document.title)  &trace
Controls: auto-run; tap = jump / wall-kick; drag = steer. Keys: A/D or arrows, Space.
Modules (seeded): step, wallrun (single trunk), chimney (two trunks, kick wall-to-wall). Rising mist = bottom; one Catch.
Tuning tables: T (movement), MIST (rising bottom), ZONES.

## Replay check (leaderboards)
- `sim.js` is the whole run (course, physics, breakables, mist, Catch) with no DOM or Three.js. The game and the server run this same file.
- The game records the seed, every tap, and steering (-127..127) by tick (1/120 s). On death it sends `{log, claim:{height}}`, delta-packed (about 7–20 KB gzipped).
- `node server/verify.mjs 8787` handles `POST /verify`, which reruns the log and accepts only the height it reproduces, and `GET /seed?board=daily|weekly`, which issues seeds from a salted hash of the UTC day or ISO week (`TOBU_SEED_SALT`).
- Rejected: wrong height, edited inputs, a seed that isn't the current period's, adaptation not set to 1 on daily or weekly, a run cut before death, tapping faster than 25/s, or an old sim version.
- `node server/test.mjs` runs the tests. Play in the browser with `?verify=http://localhost:8787&board=daily`.
- Any change to physics or tuning must bump `SIM_VERSION`.
