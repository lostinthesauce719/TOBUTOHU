// Versioned graybox tuning. Sources: /workspace/tobu-runner-spec/graybox-spring.md and
// /workspace/tobu_runner/SEASON_LANE_COURSES.md (summer + autumn + winter, KAMI sign-off 2026-11-10).
export const TUNING_VERSION = 'graybox-winter-1';
export const GENERATOR_VERSION = 'graybox-winter-1';
// Seed salt stays on the spring value so spring layouts for a seed are unchanged.
export const COURSE_SALT = 'graybox-spring-1';
export const SKILL_TIER = 'graybox';
export const CATCH_RULE_VERSION = 'graybox-spring-1';

export const TICK_HZ = 60;
export const DT = 1 / 60;
export const PITCH_DEG = 8;
export const PITCH = (Math.PI * PITCH_DEG) / 180;
export const SIN_PITCH = Math.sin(PITCH);
export const COS_PITCH = Math.cos(PITCH);

export const LANES_X = [-2, 0, 2];
export const LANE_COUNT = 3;
export const LANE_SPACING = 2;
export const INITIAL_LANE = 1;

export const LANE_CHANGE_TICKS = 11;
export const QUEUE_EXPIRE_TICKS = 9;
export const JUMP_TICKS = 36;
export const JUMP_LIFT = 1.4;
export const JUMP_BUFFER_TICKS = 9;

export const PLAYER_WIDTH = 0.6;
export const PLAYER_DEPTH = 0.8;

export const V0 = 8;
export const V_RANGE = 2;
export const SPRING_HEIGHT = 120;
export const SUMMER_HEIGHT = 240;
export const AUTUMN_HEIGHT = 360;
export const WINTER_HEIGHT = 480;      // speed and mist go flat here
export const WINTER_FLAT_HEIGHT = 600; // and the chunk mix and row gap stop ramping here
export const SEASON_CALM_M = 15;
// Speed is piecewise linear in height. Past the last segment it stays flat.
export const SPEED_SEGMENTS = Object.freeze([
  Object.freeze({ h0: 0, h1: 120, v0: 8, v1: 10 }),
  Object.freeze({ h0: 120, h1: 240, v0: 10, v1: 11 }),
  Object.freeze({ h0: 240, h1: 360, v0: 11, v1: 12 }),
  Object.freeze({ h0: 360, h1: 480, v0: 12, v1: 13 }),
]);
// Mist (rising bottom) rate cap by season, m/s.
export const MIST_CAPS = Object.freeze([
  Object.freeze({ minH: 0, cap: 0.75 }),
  Object.freeze({ minH: 120, cap: 0.80 }),
  Object.freeze({ minH: 240, cap: 0.90 }),
  Object.freeze({ minH: 360, cap: 1.00 }),
]);

export const BOTTOM_START = -12;
export const BOTTOM_RATE_CAP = 0.75;
export const BOTTOM_FRACTION = 0.75;

export const CHUNK_LENGTH = 40;

export const SOLID_WIDTH = 1.5;
export const SOLID_DEPTH = 1.0;
export const SOLID_HEIGHT = 2.5;
export const ROOT_WIDTH = 1.5;
export const ROOT_DEPTH = 0.6;
export const ROOT_HEIGHT = 0.6;
export const PAD_LENGTH = 12;
export const GUST_DEPTH = 1.2;

export const PAD_COLLAPSE_TICKS = 48;
export const WARNING_TICKS = 48;
export const WARNING_MIN_TICKS = 30;
export const GUST_PUSH_TICKS = 11;
export const S7_SPACING_TICKS = 54;
export const MIN_DECISION_GAP = 36;
export const MAX_GEN_ATTEMPTS = 16;
export const HARD_STREAK_LIMIT = 2;
export const REACTION_DELAY = 15;
export const KEEP_AHEAD = 3;
export const KEEP_BEHIND = 1;

// Summer hazards
export const BOLT_WARN_TICKS = 60;        // stripe fills over 1.0 s
export const BOLT_STRIKE_S = 0.30;        // kills for 0.30 s of travel
export const BOLT_MIN_APART_TICKS = 120;  // strikes at least 2.0 s apart
export const PUDDLE_MIN = 6;
export const PUDDLE_MAX = 10;
export const PUDDLE_LOCK_TICKS = 24;      // 0.4 s swipe lock
export const PUDDLE_VISIBLE_TICKS = 72;   // visible >= 1.2 s ahead
export const SWIPE_TICKS = LANE_CHANGE_TICKS; // 0.18 s
export const DEBUT_WINDOW_M = 30;
export const HAZARD_DEBUT = Object.freeze({ bolt: 135, puddle: 150, leafgust: 255, branch: 265, drift: 375, ice: 385 });
export const HAZARD_CODE = Object.freeze({ bolt: 'L', puddle: 'P', gust: 'G', branch: 'B', drift: 'D', ice: 'I', pad: 'pad', solid: 'stone', root: 'root', bottom: 'bottom' });

// Autumn hazards
export const LEAF_GUST_GAP_TICKS = 72;    // second shove 1.2 s after the first
export const GUST_WARN_TICKS = 48;        // 0.8 s leaf streak + ghost lane marker (KAMI: raise to 60 if testers get shoved into hits)
export const GUST_CLEAR_AFTER_TICKS = 60; // shove destination stays clear >= 1.0 s after the shove ends
export const BRANCH_SHADOW_TICKS = 54;    // shadow grows for 0.9 s
export const BRANCH_LANDED_LEAD_TICKS = 30; // and the branch is down >= 0.5 s before you reach it
export const BRANCH_STAGGER_TICKS = 60;   // canopy branches >= 1.0 s apart
export const BRANCH_DEPTH = 0.7;
export const LOG_HEIGHT = 0.6;            // low log: jump it
export const HIGH_BRANCH_HEIGHT = 2.5;    // high branch: dodge it

// Winter hazards
export const ICE_SWIPE_TICKS = 18;        // a swipe on ice takes 0.30 s instead of 0.18 s
export const ICE_NO_JUMP_TICKS = 12;      // no jump in the last 0.2 s before leaving the ice
export const ICE_VISIBLE_TICKS = 72;      // ice strip visible >= 1.2 s ahead
export const ICE_MIN = 8;
export const ICE_MAX = 12;
export const DRIFT_VISIBLE_TICKS = 60;    // drifts visible >= 1.0 s ahead
export const DRIFT_DEPTH = 0.8;
export const LOW_DRIFT_HEIGHT = 0.6;      // low drift: jump it
export const TALL_DRIFT_HEIGHT = 2.5;     // tall drift (dark lane-edge band): dodge it
export const DRIFT_STAGGER_TICKS = 60;    // whiteout drifts >= 1.0 s apart
export const ICE_TO_DRIFT_TICKS = 72;     // W5: drift 1.2 s after the ice starts
export const ICE_JUMP_CLEAR_TICKS = 30;   // a low drift in an ice lane sits >= 0.5 s past the ice end

export const CATCH_CLEARANCE = 6;
export const CATCH_RECOVERY_M = 12;

export const SWIPE_MIN_PX = 40;
export const SWIPE_MAX_MS = 300;
export const SWIPE_RATIO = 1.5;
export const TAP_MAX_MS = 250;
export const TAP_MAX_PX = 16;

export const CAMERA_FOV = 55;
export const CAMERA_BEHIND = 10;
export const CAMERA_ABOVE = 6;
export const CAMERA_LOOK_AHEAD = 8;
export const CAMERA_DAMP = 0.12;
export const RENDER_AHEAD = 12;

export const EARLIEST = Object.freeze({
  S0: 0, S1: 0, S2: 15, S3: 20, S4: 40, S5: 50, S6: 60, S7: 75,
  U1: 120, U2: 135, U3: 150, U4: 170, U5: 190, U6: 210,
  A1: 240, A2: 255, A3: 265, A4: 280, A5: 300, A6: 320,
  W1: 360, W2: 375, W3: 385, W4: 400, W5: 425, W6: 450,
});
export const HARD_TYPES = Object.freeze(['S5', 'S6', 'S7', 'U4', 'U5', 'U6', 'A5', 'A6', 'W5', 'W6']);
// Hazard kinds each chunk type introduces (stones and roots are not hazards).
export const CHUNK_HAZARDS = Object.freeze({
  S5: ['pad'], S6: ['gust'], S7: [], U2: ['bolt'], U3: ['puddle'], U4: ['bolt'], U5: ['puddle'], U6: ['bolt', 'puddle'],
  A2: ['leafgust'], A3: ['branch'], A4: ['branch'], A5: ['leafgust'], A6: ['branch'],
  W2: ['drift'], W3: ['ice'], W4: ['drift'], W5: ['ice', 'drift'], W6: ['drift'],
});

export const BANDS = Object.freeze([
  { minH: 0, maxH: 30, gapTicks: 60, weights: Object.freeze({ S0: 30, S1: 50, S2: 15, S3: 5 }) },
  { minH: 30, maxH: 60, gapTicks: 54, weights: Object.freeze({ S1: 30, S2: 30, S3: 20, S4: 15, S5: 5 }) },
  { minH: 60, maxH: 90, gapTicks: 48, weights: Object.freeze({ S2: 25, S3: 15, S4: 20, S5: 15, S6: 15, S7: 10 }) },
  { minH: 90, maxH: 120, gapTicks: 42, weights: Object.freeze({ S2: 20, S4: 20, S5: 20, S6: 20, S7: 20 }) },
  // Summer. 120-135 is the calm transition (S0 only). Spring S1-S5 keep 15% total; S6 retires.
  { minH: 120, maxH: 135, gapTicks: 42, calm: true, weights: Object.freeze({ S0: 100 }) },
  { minH: 135, maxH: 170, gapTicks: 51, weights: Object.freeze({ U1: 34, U2: 30, U3: 21, S1: 3, S2: 3, S3: 3, S4: 3, S5: 3 }) },
  { minH: 170, maxH: 205, gapTicks: 47, weights: Object.freeze({ U1: 17, U2: 21, U3: 17, U4: 17, U5: 13, S1: 3, S2: 3, S3: 3, S4: 3, S5: 3 }) },
  { minH: 205, maxH: 240, gapTicks: 43, weights: Object.freeze({ U2: 13, U3: 13, U4: 21, U5: 17, U6: 21, S1: 3, S2: 3, S3: 3, S4: 3, S5: 3 }) },
  // Autumn. 240-255 is the calm transition. Row gaps 0.75 / 0.70 / 0.66 s.
  { minH: 240, maxH: 255, gapTicks: 43, calm: true, weights: Object.freeze({ S0: 100 }) },
  { minH: 255, maxH: 290, gapTicks: 45, weights: Object.freeze({ A1: 35, A2: 30, A3: 20, A4: 15 }) },
  { minH: 290, maxH: 325, gapTicks: 42, weights: Object.freeze({ A1: 15, A2: 20, A3: 15, A4: 20, A5: 20, A6: 10 }) },
  { minH: 325, maxH: 360, gapTicks: 40, weights: Object.freeze({ A2: 15, A3: 15, A4: 15, A5: 25, A6: 20, U2: 10 }) },
  // Winter. 360-375 is the calm transition. Row gaps 0.70 / 0.66 / 0.63 / 0.60 s (floor).
  { minH: 360, maxH: 375, gapTicks: 40, calm: true, weights: Object.freeze({ S0: 100 }) },
  { minH: 375, maxH: 420, gapTicks: 42, weights: Object.freeze({ W1: 35, W2: 30, W3: 20, W4: 15 }) },
  { minH: 420, maxH: 480, gapTicks: 40, weights: Object.freeze({ W1: 15, W2: 15, W3: 20, W4: 20, W5: 20, W6: 10 }) },
  { minH: 480, maxH: 600, gapTicks: 38, weights: Object.freeze({ W3: 15, W4: 15, W5: 25, W6: 20, U2: 4, U4: 4, U5: 4, A2: 4, A4: 4, A5: 3, A6: 2 }) },
  // From 600 m nothing ramps: speed, mist and row gap are flat and the mix stays the same.
  { minH: 600, maxH: Infinity, gapTicks: 36, weights: Object.freeze({ W5: 20, W6: 20, U4: 15, A5: 15, A6: 15, W3: 15 }) },
]);

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function segFor(h) {
  if (h < SPEED_SEGMENTS[0].h0) return null;
  for (const g of SPEED_SEGMENTS) if (h < g.h1) return g;
  return null;
}

export function speedAtH(h) {
  if (h <= SPEED_SEGMENTS[0].h0) return SPEED_SEGMENTS[0].v0;
  const g = segFor(h);
  if (!g) return SPEED_SEGMENTS[SPEED_SEGMENTS.length - 1].v1;
  return g.v0 + (g.v1 - g.v0) * (h - g.h0) / (g.h1 - g.h0);
}

export function mistCapAtH(h) {
  let cap = MIST_CAPS[0].cap;
  for (const m of MIST_CAPS) if (h >= m.minH) cap = m.cap;
  return cap;
}

export function heightAtS(s) { return s * SIN_PITCH; }
export function sAtHeight(h) { return h / SIN_PITCH; }

export function laneX(lane) { return LANES_X[lane]; }

export function bottomDelta(v, h = 0) {
  return Math.min(mistCapAtH(h), BOTTOM_FRACTION * v * SIN_PITCH) / TICK_HZ;
}

export function jumpLift(u) {
  return JUMP_LIFT * 4 * u * (1 - u);
}

export function bandFor(h) {
  for (const b of BANDS) {
    if (h >= b.minH && h < b.maxH) return b;
  }
  return BANDS[BANDS.length - 1];
}

// Breakpoints (in s) where the speed law changes.
function breaksS() {
  return [SPEED_SEGMENTS[0].h0 / SIN_PITCH, ...SPEED_SEGMENTS.map(g => g.h1 / SIN_PITCH)];
}

// Time to travel s0 -> s1 within one linear-speed piece (v = a + b*h).
function segV(g, h) { return g.v0 + (g.v1 - g.v0) * (h - g.h0) / (g.h1 - g.h0); }

function pieceTime(s0, s1) {
  const g = segFor(heightAtS((s0 + s1) / 2));
  if (!g || g.v1 === g.v0) return (s1 - s0) / Math.max(speedAtH(heightAtS((s0 + s1) / 2)), 1e-9);
  const b = (g.v1 - g.v0) / (g.h1 - g.h0);
  return Math.log(segV(g, heightAtS(s1)) / segV(g, heightAtS(s0))) / (b * SIN_PITCH);
}

export function travelTime(s0, s1) {
  if (s1 <= s0) return 0;
  let t = 0;
  let a = s0;
  for (const bs of breaksS()) {
    if (a < bs && s1 > bs) { t += pieceTime(a, bs); a = bs; }
  }
  return t + pieceTime(a, s1);
}

export function ticksBetween(s0, s1) { return travelTime(s0, s1) * TICK_HZ; }

export function sAfterTime(s0, t) {
  if (t <= 0) return s0;
  let s = s0;
  let left = t;
  for (const bs of breaksS()) {
    if (s >= bs) continue;
    const tb = pieceTime(s, bs);
    if (left >= tb) { left -= tb; s = bs; continue; }
    const g = segFor(heightAtS((s + bs) / 2));
    if (!g || g.v1 === g.v0) return s + speedAtH(heightAtS((s + bs) / 2)) * left;
    const b = (g.v1 - g.v0) / (g.h1 - g.h0);
    const v0 = segV(g, heightAtS(s));
    if (b === 0) return s + v0 * left;
    const v = v0 * Math.exp(left * SIN_PITCH * b);
    const h = g.h0 + (v - g.v0) / b;
    return h / SIN_PITCH;
  }
  return s + speedAtH(heightAtS(s)) * left;
}

export function sAfterTicks(s0, ticks) { return sAfterTime(s0, ticks / TICK_HZ); }

export function contactS(centerS, depth) {
  return centerS - depth / 2 - PLAYER_DEPTH / 2;
}
