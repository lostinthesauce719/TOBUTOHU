artfinal02 — BRUSH review fixes on art-final (not merged to master)
Base: 0e54fe6. Apollo picks unchanged: Hero C, Walls C, Scenery B, Menus A frost.

P0 fixes (BRUSH_review.md):
1. Walls C: gridMat gAV=0 on vertical faces; ledge tops keep gA 0.7. Flutes read without white lattice.
2. Breakables: climbable-slate cards via perfMat (face #46587A, top #4A5D80, side #3A4A68, deep #2F3D58),
   dashes #140F0A, tear #EEF2E0, lip #D6DCC6, luma clamp ≤95, never vermilion. Close-ups: brk_*.
3. Scenery B: mid cedar step 4.5 / fill 0.97; far cedars 64 @ 4.4 spacing. Seasonal colours unchanged
   (spring sakura #CDB4CC, summer teal #5E8C8A, autumn olive/gold #9AA052/#D8B76A, winter snow #C0C6DE).

P1:
4. Hero post FX softened (rim/trail/motes) so slim abdomen + sash read in chase.
5. Catch "No thanks" — removed "end this run" sub-line (matches gameover_frost).

Draws (seed 1): spring 20, summer 25, autumn 24, winter 26, hero clip max 13 (budget 40).
SIM_VERSION tobu-sim-5 untouched. Tests: 14 + saves + 7 flash green.

Files: {season}_all.png, chase_{ground,climb,storm}.png, menu_{title,gameover,catch}.png,
  hero_idle_climb.mp4, seasons_combined_sheet.png, vs_*.png, brk_{intact,torn,falling}_{1080,360}.png,
  brk_360_row.png, luma.txt, meta.json, ref_*_frost.png
