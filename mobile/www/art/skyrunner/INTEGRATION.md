# Tobu Sky-Runner Production Pack — Integration Note for FORGEPLAY

Apollo OK'd skyrunner03 hybrid (A walnut stage frame + C saturated paper layers). This pack is the first game-ready cut under `/workspace/tobu/art/skyrunner_prod/`.

## Layout
| Path | Role |
|------|------|
| `{spring,summer,autumn,winter}/layer_XX_*.png` | Parallax layers, 1080×1920, vertically tileable |
| `pads/<season>/pad_NN.png` (+ `@2x`, `_shadow`) | Landing sprites |
| `torii/torii.png` + `torii_glow.png` (+ `@2x`) | Milestone gate |
| `transitions/flat_*` | Torn-paper edges + season slide panels |
| `frame/stage_frame_1080x1920.png` | 9-slice overlay (`nine_slice.json` / manifest insets) |
| `frame/hud_*` | Distance plaque, currency bar, gem/coin icons |
| `manifest.json` | Every file, size, layer order, parallax factor, pad hitboxes |
| `preview.png` | Spring stack proof (also `preview_summer.png`) |

## Parallax
Scroll each layer at `parallax_factor` × player rise speed.
Suggested: sky **0.15**, far **0.35**, mid **0.55**, mist **0.70**, near **0.90**.
Within a season, tile layers vertically. At gates **120 / 250 / 400 m**, slide `flat_panel_<season>` with `flat_top_edge` / `flat_bottom_edge`, crossfade season layer sets, show torii + glow.

## Pads
Hitbox = top opaque surface (`hitbox.top_y`, `width`, `left`/`right` in manifest, 1× space).
Place soft shadow under pad at roughly +6,+10 px. Use `@2x` on retina.

## Frame / HUD
Draw stage frame above world. Center rect clear with insets L125 R125 T225 B175. HUD pieces are separate so numbers are dynamic (plaque art is a baked sample).

## Known gaps (not final-polish)
1. Vertical tiling is PIL edge-blend, not artist-authored seamless — soft band possible every tile height.
2. Minor chroma fringe may remain on torii/pads on mid tones; tint glow to gold `#E8C050` in engine if needed.
3. Autumn/winter near layers were derived earlier; mist layers are fresh gens.
4. Frame is mockup-extracted; inner-corner carving may need a clean redraw for perfect 9-slice.
5. Transition panels are PIL gradients + torn edges, not painted washi.
6. HUD plaque text is baked ("12 m"); drive real height in code.
7. No audio, VFX particles, or breakable pad variants.
8. Hero is **not** in this pack — use FORGEPLAY `skyrunner03/hero_renders/`.

## Palette
Lush; no red/orange except autumn gold and hero sash. Vermilion = hazards only.
