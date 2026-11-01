// Tobu economy — single tunable config (Apollo 2026-11-01).
 // Honest rules: difficulty never reads wallet or ad value; coins are seeded earn-only;
 // ranked runs that used a wing boost are tagged (same board + wing glyph), never hidden.
 // Real-money gem packs are UI stubs only — LAUNCH owns store compliance.

export const ECONOMY = {
  // --- coins (run earn) ---
  coins: {
    pickupValue: 1,          // TUNABLE: coins per seeded coin pickup
    // Seeded spacing aims ~1 coin / ~22 m → ~18–25 coins on a 400 m climb (honest, not drip-fed).
    y0: 12,                  // first coin band (m)
    yMax: 520,
    gapMin: 18,              // TUNABLE
    gapSpan: 10,             // TUNABLE: gap = gapMin + rand*gapSpan
    radius: 1.15,
    laneX: [0.3, 1.4],       // |x| range in climb lane
  },

  // --- gems (premium; IAP stub) ---
  gems: {
    // Real-money packs: UI stub only. Never grants gems until LAUNCH wires store.
    packs: [
      { id: 'gems20', gems: 20, priceLabel: '$0.99', stub: true },
      { id: 'gems60', gems: 60, priceLabel: '$2.99', stub: true },
      { id: 'gems150', gems: 150, priceLabel: '$5.99', stub: true },
    ],
  },

  // --- wing power-ups (seasonal rows; colour changes with season) ---
  // TUNABLE prices — edit here only. Prefer coins for grind, gems for shortcut.
  wings: {
    coinPrice: { spring: 80, summer: 120, autumn: 160, winter: 200 },
    gemPrice: { spring: 5, summer: 8, autumn: 10, winter: 12 },
  },

  // --- wing boost (sim; mirrored in sim.js WING) ---
  // Documented here so LAUNCH/KAMI can tune without hunting physics.
  boost: {
    duration: 8,       // seconds of buff after equip/pickup
    jumps: 4,          // boosted jumps within that window
    jumpMul: 1.22,     // ground jump vy multiplier
    wallJumpMul: 1.15, // wall-jump up multiplier
    glideG: 0.55,      // gravity scale during short glide
    glideT: 0.40,      // glide window after a boosted jump (s)
  },

  // --- ranked score policy (chosen 2026-11-01) ---
  // SAME board as skill-only runs. claim.powered=true and claim.wings=[...] when any
  // wing boost was active. Client/leaderboard UI shows a small wing glyph next to height.
  // Difficulty / mist / course never read spending or power-up ownership.
  ranked: {
    policy: 'tag-same-board',
    glyph: 'wing',
    note: 'Powered ranked scores stay on the daily/weekly/alltime board and show a wing icon. No separate board; no score inflation beyond the verified sim height.',
  },
};

export const WING_SEASONS = ['spring', 'summer', 'autumn', 'winter'];
