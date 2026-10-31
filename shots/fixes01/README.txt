fixes01 — visual fixes + iOS/PWA prep (FORGEPLAY)
SIM_VERSION tobu-sim-5 untouched. Tests: 14 + saves + 7 flash green.

Visual (render-only):
- Lightning: 3D depth-tested bolt columns (walls occlude); overlay lightning retired
- Mid-course cedars: live season colour cross-fade via per-zone colour buffers
- ?layer=mtn : mountains-only (no sky)
- Denser fg weather (220 particles, stronger alpha/scale)
- Antennas baked into clipkit skinned mesh (−2 draws)

Draws seed=1 (all layers, 540×~873):
  spring t=40    draws=15  wx=220
  summer t=160.2 draws=25  wx=220
  autumn t=249.5 draws=24  wx=220
  winter t=395   draws=26  wx=220

Stills: {spring,summer,autumn,winter}_{all,mtn,fg,mid,play}.png
        storm_all.png storm_play.png (summer t=160.2)

iOS: mobile/ Capacitor com.apollo.tobu — see mobile/IOS_README.md
PWA: manifest.webmanifest + sw.js (needs https for Add to Home Screen)

Honest weak spots:
- Summer storm fg weather still sparse in stills (storm dampens particles)
- Antenna sway gone (baked into mesh)
- Lightning 3D billboard can look thin vs old overlay at glancing angles
- Torii in mid-cedar merges do not season-fade (same colours all zones)
- No signed ipa on this Linux box (needs Mac + Apple secrets)
