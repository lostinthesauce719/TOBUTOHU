artfinal06 — screen-space particle clearance (render-only, scenery.js weather) on art-final from 3ddb722, not merged.
Particles whose projected position falls in an ellipse ~1.4x the hero's projected bounds (padded by the quad's own screen size) shrink to 0, smooth fade over the outer 30%.
Weather is drawn with depthTest off, so particles behind the hero also paint over it; those are cleared too (not only nearer ones). 1.5u radius + 3u camera fade kept. Legs unchanged.
Seed 1, cam=close: spring t=20 (draws 13), summer t=140 (18), autumn t=250 (20), winter t=390 (17). tests 14 + saves + 7 flash green; tobu-sim-5.
