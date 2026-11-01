# Tobu power-ups (clip style) — BRUSH helper, 2026-10-31

Original art only. Flat layered paper-cutout shapes with soft shadow and a cream/icy halo.
No vermilion `#C44834` (hazard-only). No red/orange in scenery pickups; autumn gold `#D8B76A` is allowed on the autumn leaf and wing tint. Hero sash `#FFD23F` appears only on hero mocks.

Final art context: master `b2b188e`. Apollo asked for both seasonal in-game pickups and a shop entry for repeatable power-ups.

## Hex palette

| Role | Hex |
|------|-----|
| Spring white lit/shade | `#F4F3EE` / `#DCDDE0` (≈60%) |
| Spring sakura lit/shade | `#E9D6D8` / `#D9B8BE` (≈40%) |
| Summer teal / lit / shade / mint | `#5E8C8A` / `#7AA8A4` / `#456E6C` / `#A8C9C0` |
| Autumn olive / shade / gold / gold lit | `#9AA052` / `#7A8240` / `#D8B76A` / `#E8CF8E` |
| Winter ice lit / mid / shade / white | `#E8F0F8` / `#C8D8EA` / `#8FA8C4` / `#F6F8FC` |
| Halo cream / icy | soft `#F4F3EE` / `#C8D8EA` alpha |
| Soft shadow | `#1C2438` @ ~27% |
| Hero body / top / belly / crease / sash | `#6E9A42` / `#86AE58` / `#F2EEE0` / `#1F2A1A` / `#FFD23F` |
| UI navy / navy2 / frost | `#1C2A44` / `#3A4A68` / `#E8EEF6` |

## Files

### Pickups (`pickups/`)
Transparent PNGs, square, with halo + soft shadow baked in (safe on any clear bg).

| Season | Shape | Sizes |
|--------|-------|-------|
| spring | 5-petal blossom (60% white / 40% sakura) | `_128` `_256` `_512` `_1024` |
| summer | Teal/mint raindrop leaf (dragonfly-wing veins) | same |
| autumn | Olive leaf with gold tip/edge (no rust) | same |
| winter | 6-fold snow crystal (white + icy blue) | same |

Suggested in-world scale (hero BL ≈ 1.1): **pickup diameter ≈ 0.55–0.7 world units**. At chase-cam distance the 256 atlas reads; use 512 if the cam pushes in.

### Wings (`wings/`)
Per-season tint. Flat paper layers + shadow + seasonal halo.

| File | Notes |
|------|-------|
| `{season}_open.png` | 512² spread/open pose |
| `{season}_folded.png` | 512² tucked against body |
| `{season}_flap_sheet.png` | 8 frames × 512, left→right sine flap |
| `{season}_hero_mock.png` | 512² wings on hero (anatomy: hind V, short antennae, sash) |

### Shop (`shop/`)
Frosted icy-glass, matching approved menus (`final_options/menus/*_frost_1080x1920.png`).

| File | Notes |
|------|-------|
| `shop_1080x1920.png` | Full shop: 4 wing cards (available / owned·active / locked) |
| `shop_360x640.png` | Preview |
| `shop_button.png` | Main-menu entry (320×100) |
| `shop_card_states.png` | Chrome strip for the three states |

Price slots say **TBD**. No premium currency invented (Apollo: none). Teen/adult tone.

### Board
- `board_powerups.png` — labelled overview (~1920 wide)
- `README.md` — this file
- `make_powerups.py` — regenerator (PIL only, 0 Higgsfield credits)

## Integration notes for FORGEPLAY (three.js)

1. **Pickup billboard / sprite**
   - `THREE.Sprite` or a camera-facing Plane with `MeshBasicMaterial({map, transparent:true, depthWrite:false, fog:true})`.
   - Atlas: pack the four `_256` or `_512` icons; UV per season via `zoneMix` / season index.
   - World scale: start at `0.6` (diameter). Keep inside scenery-tuck band (lane clearance 18 u — place pickups on branch ledges / cedar near-lane shelves, not in the empty 0–18 band).
   - Glow is already in the PNG; if you want a live pulse, multiply material opacity 0.85–1.0 on a 1.6 s sine, or add a second larger sprite using the same map at 0.35 opacity.
   - Collect: hide sprite, spawn wing VFX, do not tint vermilion.

2. **Wings on hero**
   - Attach two planes (L/R) to `root` behind the thorax, local offset ≈ `(±0.05, 0.05, -0.12)` scaled to BL.
   - Swap map by season; animate UV or swap frames from `*_flap_sheet.png` (8 frames). Folded map when grounded / idle; open + flap while boost active.
   - Material: unlit, transparent, `depthWrite:false`, same fog as hero. Paper look = no specular.
   - Boost feel: extend jump impulse / short glide — art only here; gameplay is yours.

3. **Shop UI**
   - Overlay like game-over frost panels. Reuse frosted panel fill ≈ `rgba(232,238,246,0.82)`, outline `#1C2A44`, navy text.
   - Wire card states: `available` (gold pill + TBD cost), `owned`/`active` (teal pill), `locked` (navy pill + lock).
   - Main menu: add `shop_button.png` under Daily/Weekly/Friends or as a fourth entry.
   - Do not invent a currency glyph; leave cost label as TBD until Apollo sets it (ads / saves / free daily / etc.).

4. **Luma / palette rules (unchanged)**
   - Scenery pickups sit in scenery luma band (target ~126–199). These icons are bright paper; they are collectibles, not climbables — no collider.
   - Birds remain `#6F7FA0`. Hazards alone use `#C44834`.

5. **Originality (store / Apple 4.1)**
   - All shapes drawn procedurally in `make_powerups.py` for Tobu. Not copied from other games or living artists. Seasonal motifs (blossom, leaf, crystal, paper wings) are generic.

## Credits spent
0 (PIL only; Higgsfield not used).

## Open for Apollo / FORGEPLAY
- Actual cost model for TBD slots (daily free? saves? ad?).
- Whether wings are one shared unlock tinted by season, or four separate shop rows (board shows four rows).
- Pickup spawn rate / max on screen (art suggests ≤2 glowing pickups in view to match waterfall budget).
