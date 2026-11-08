// Versioned graybox tuning. Source of truth: /workspace/tobu-runner-spec/graybox-spring.md
export const TUNING_VERSION = 'graybox-spring-1';
export const GENERATOR_VERSION = 'graybox-spring-1';
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
});
export const HARD_TYPES = Object.freeze(['S5', 'S6', 'S7']);

export const BANDS = Object.freeze([
  { minH: 0, maxH: 30, gapTicks: 60, weights: Object.freeze({ S0: 30, S1: 50, S2: 15, S3: 5 }) },
  { minH: 30, maxH: 60, gapTicks: 54, weights: Object.freeze({ S1: 30, S2: 30, S3: 20, S4: 15, S5: 5 }) },
  { minH: 60, maxH: 90, gapTicks: 48, weights: Object.freeze({ S2: 25, S3: 15, S4: 20, S5: 15, S6: 15, S7: 10 }) },
  { minH: 90, maxH: Infinity, gapTicks: 42, weights: Object.freeze({ S2: 20, S4: 20, S5: 20, S6: 20, S7: 20 }) },
]);

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function speedAtH(h) {
  return V0 + V_RANGE * clamp(h / SPRING_HEIGHT, 0, 1);
}

export function heightAtS(s) { return s * SIN_PITCH; }
export function sAtHeight(h) { return h / SIN_PITCH; }

export function laneX(lane) { return LANES_X[lane]; }

export function bottomDelta(v) {
  return Math.min(BOTTOM_RATE_CAP, BOTTOM_FRACTION * v * SIN_PITCH) / TICK_HZ;
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

export function travelTime(s0, s1) {
  if (s1 <= s0) return 0;
  const sSpring = sAtHeight(SPRING_HEIGHT);
  if (s0 < sSpring && s1 > sSpring) return travelTime(s0, sSpring) + travelTime(sSpring, s1);
  if (s0 >= sSpring) return (s1 - s0) / (V0 + V_RANGE);
  const v0 = speedAtH(heightAtS(s0));
  const v1 = speedAtH(heightAtS(s1));
  if (v1 <= v0 + 1e-18) return (s1 - s0) / Math.max(v0, 1e-9);
  return (SPRING_HEIGHT / V_RANGE / SIN_PITCH) * Math.log(v1 / v0);
}

export function ticksBetween(s0, s1) { return travelTime(s0, s1) * TICK_HZ; }

export function sAfterTime(s0, t) {
  if (t <= 0) return s0;
  const sSpring = sAtHeight(SPRING_HEIGHT);
  if (s0 >= sSpring) return s0 + (V0 + V_RANGE) * t;
  const tSpring = travelTime(s0, sSpring);
  if (t >= tSpring) return sSpring + (V0 + V_RANGE) * (t - tSpring);
  const v0 = speedAtH(heightAtS(s0));
  const v = v0 * Math.exp(t * SIN_PITCH * V_RANGE / SPRING_HEIGHT);
  return (v - V0) * (SPRING_HEIGHT / V_RANGE) / SIN_PITCH;
}

export function sAfterTicks(s0, ticks) { return sAfterTime(s0, ticks / TICK_HZ); }

export function contactS(centerS, depth) {
  return centerS - depth / 2 - PLAYER_DEPTH / 2;
}
