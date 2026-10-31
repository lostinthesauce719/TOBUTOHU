# BRUSH review — art-final @ 0e54fe6 (2026-10-31, America/Denver)

Apollo picks locked: **Hero C** sleek leap · **Walls C** fluted crystalline · **Scenery B** denser · **Menus A** frosted.
Captures: `/workspace/tobu3d/shots/artfinal01/`. Boards: `/workspace/tobu/art/clipstyle/final_options/`.
Exact menu copy: `menus/*_frost_1080x1920.png`.

**Verdict: NOT ready to show Apollo.** Three must-fixes first, then re-capture `vs_*` and season frames.

---

## Passes (keep)

| Check | Result | Evidence |
|---|---|---|
| Hero PAL colours | Locked in `clipkit.js` PAL: body `#6E9A42`, top `#86AE58`, belly `#F2EEE0`, crease `#1F2A1A`, sash `#FFD23F` | `clipkit.js` L5; chase stills show green + gold sash |
| True-grasshopper anatomy | Hind-leg V, short antennae, slim body readable in chase | `chase_ground.png`, `chase_climb.png`, `autumn_all.png` |
| Climbable luma 45–95 (near) | Face samples `#354460`–`#384865` L≈67–71 (shade/flutes); target face `#46587A` L86 | `chase_climb.png` left wall |
| Scenery luma median | spring 182 · summer 180 · autumn 189 · winter 182; in-band 87–91% | `luma.txt` |
| No scenery red/orange | autumn warm ≈0.26% gold-band only; spring/winter 0% | `luma.txt`, `autumn_all.png` |
| Autumn gold | avg sampled ≈`#CFBE71` (near `#D8B76A` / olive `#9AA052`) | `autumn_all.png` |
| Vermilion `#C44834` | Present in `summer_all.png` as **lightning telegraph columns** (hazard) — allowed | crop ~x378–449; `look.js` / `palettes.json` warning_line |
| Lane clearance | No scenery in play corridor; mid cedars sit outside | `vs_scenery.png`, chase stills |
| Draws | 20–26 / season (budget 40) | `README.txt` |
| Menus frost readable | Frost panel + Catch offer + cream pips + No thanks present on Catch state | `menu_catch.png`, `vs_catch.png` |
| Pip size | CSS `--pip:45px` at 1080; outer rings ≈42–45 px (cream core ~38 from sash-ring inset) | `index.html` `#pips`, `menu_catch.png` |
| Frost blur ≠ pixel-identical | Acceptable if readable — **accept** | `vs_title.png`, `vs_catch.png` |
| Hero slimmed procedural ≠ exact plate C | Known gap; silhouette direction OK — **accept after P1 readability** | `vs_hero.png`, `clipkit.js` Hero C comments |

---

## Grid ruling (Walls C)

Clip style still uses a thin white world grid (`look.js` `gridMat`, gA 0.7).
**Apollo’s Walls C plate** (`board_climbables.png` panel C) shows **solid fluted crystalline with no grid on the rock faces** (grid only on the ground plane under them).

**Recommendation: remove (or gA ≤ 0.15) the world grid on vertical climbable wall faces** so fluting reads. Keep the thin white grid on **ledge tops / ground** at current strength so the clip signature survives. Do **not** leave full-strength grid on Walls C verticals — it flattens the basalt language Apollo picked (`vs_climbables.png` right vs board C left).

---

## Prioritized fix list

### P0 — must fix before Apollo sees it

1. **Walls C: kill/attenuate grid on vertical faces**
   - What: `gridMat` / wall materials — set wall-face grid alpha to **0** (preferred) or **≤0.15**. Keep ledge-top / floor grid at ~0.7.
   - Why: in-game Walls C still reads as “flat slate + wireframe,” not fluted crystalline (`vs_climbables.png`, `chase_climb.png`, `chase_ground.png`).
   - Done when: side-by-side with `board_climbables.png` panel C shows visible vertical flutes/ridges without a loud white lattice.

2. **Breakables: locked look, clip palette (not plain boxes)**
   - What: stop shipping plain unit boxes. Use perforation dashes + washi tear fibres from `style3d/D_kit/breakable/breakable_D_spec.md`, **recoloured to clip climbables**:
     - Card top / face / side from `#4A5D80` / `#46587A` / `#3A4A68` / `#2F3D58` (luma ≤95)
     - Perforation dashes `#140F0A` (6 px @1080, dash/gap as spec)
     - Tear core `#EEF2E0`, lip `#D6DCC6`
     - **Never** vermilion on breakables
   - Geometry can stay box colliders; visual mesh gets dashes on long edges + tear line (`perfMat` exists in `look.js` — wire it to Walls-C-adjacent cards, not bare boxes).
   - Evidence: `README.txt` “breakables still plain boxes”; `autumn_all.png` / `seasons_combined_sheet.png` grey bricks.
   - Done when: intact / torn / falling states readable at 360; no red dashes on cards.

3. **Scenery B density + seasonal colour**
   - What: mid-band (25–70 u) cedar packing still sparse vs `board_scenery_B_overview.png`.
     - Spring: raise sakura share toward **60% white `#C4C2DC` / 40% pale pink `#CDB4CC`** on tiers; more trunks in frame.
     - Summer: denser teal/mint `#5E8C8A` / `#6E9C98` mid cedars; keep lower 40% bright.
     - Autumn: more olive `#9AA052` / gold `#D8B76A` (or `#C8BC86`) tier faces in mid band — not just a few leaf motes.
     - Winter: denser icy tiers + snow caps `#C0C6DE`.
   - Procedural cedars OK if packing/colours match B (exact HF mesh not required).
   - Evidence: `vs_scenery.png`, `spring_all.png`, `autumn_all.png` vs `board_scenery_B_overview.png`.
   - Done when: season sheet reads as dense forest walls outside the 18 u lane, not a few lonely cones.

### P1 — should fix (same pass if cheap)

4. **Hero chase readability**
   - Soften post overlay (pink/white bokeh, green ground glow, sash motes) so Hero C elongated abdomen + sash trail read at phone size (`chase_climb.png`, `vs_hero.png`). Idle/slow climb stills preferred for Apollo.
   - Mesh already has Hero C comments (elongated abdomen, sash trail) in `clipkit.js` — good direction.

5. **Catch menu copy drift**
   - Exact frost Python: **“No thanks”** only (no “end this run” sub-line) — see `menus/gameover_frost_1080x1920.png`.
   - In-game `menu_catch.png` / `index.html` `#bNo` adds `<i>end this run</i>`. Drop the sub-line to match locked copy (or hide it on the free-today state).
   - Keep: “Second chance?” · “Your free Catch for today” · “Catch (free today)” · cream filled / empty pips · Saves n/3.

6. **Climbable face value vs fog**
   - Near faces OK (L~67–71). Distant/fogged surfaces in `summer_all.png` hit L≈180 (`#A6B2E4`) — fine for fog, but ensure **contact surfaces within ~15 u** stay ≤95 so climbables never read as scenery. Spot-check after grid change.

### P2 — accept / note

7. Frost blur not pixel-identical to HF — **accept**.
8. Procedural cedars vs HF plates — **accept** once density/colour (P0.3) lands.
9. `menu_gameover.png` without Catch block — OK for used / no-offer state; show Apollo `menu_catch.png` + `menu_title.png` as the Menus A proof.
10. Title Saves 0/3 in capture — state, not art bug.
11. Summer vermilion dashes — lightning hazard telegraph — **keep**.

---

## Capture checklist for next drop

Re-shoot under same seed after P0:
- `vs_climbables.png` (board C | in-game) — flutes visible, grid soft/absent on walls
- `vs_scenery.png` + `{spring,summer,autumn,winter}_all.png` — denser B
- Breakable close-ups: intact / torn / falling @1080 and 360 row
- `vs_hero.png` with lower FX (or idle) so anatomy reads
- `vs_catch.png` with exact “No thanks” copy
- Refresh `luma.txt`

---

## Ready for Apollo?

**No.** Fix P0.1–P0.3, re-capture, then BRUSH sign-off → Apollo.
