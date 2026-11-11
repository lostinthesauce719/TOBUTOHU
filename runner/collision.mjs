import { PLAYER_WIDTH, PLAYER_DEPTH } from './config.mjs';

export function playerExtents() {
  return { hw: PLAYER_WIDTH / 2, hd: PLAYER_DEPTH / 2 };
}

export function boxOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.s0 < b.s1 && a.s1 > b.s0;
}

export function playerBox(x, s) {
  const { hw, hd } = playerExtents();
  return { x0: x - hw, x1: x + hw, s0: s - hd, s1: s + hd };
}

export function obstacleBox(obs) {
  return { x0: obs.x0, x1: obs.x1, s0: obs.s0, s1: obs.s1 };
}

// Ray vs AABB. Returns entry time in [0, 1] or null.
export function rayAabb(px, ps, dx, ds, box) {
  let t0 = 0;
  let t1 = 1;
  if (dx !== 0) {
    let inv = 1 / dx;
    let a = (box.x0 - px) * inv;
    let b = (box.x1 - px) * inv;
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  } else if (px < box.x0 || px > box.x1) {
    return null;
  }
  if (ds !== 0) {
    let inv = 1 / ds;
    let a = (box.s0 - ps) * inv;
    let b = (box.s1 - ps) * inv;
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
  } else if (ps < box.s0 || ps > box.s1) {
    return null;
  }
  if (t0 <= t1) return t0;
  return null;
}

// Swept player AABB vs static obstacle AABB. Player center moves (x0,s0) -> (x1,s1).
export function sweptPlayerHit(x0, s0, x1, s1, obs) {
  const { hw, hd } = playerExtents();
  const expanded = {
    x0: obs.x0 - hw,
    x1: obs.x1 + hw,
    s0: obs.s0 - hd,
    s1: obs.s1 + hd,
  };
  const inside = x0 >= expanded.x0 && x0 <= expanded.x1 && s0 >= expanded.s0 && s0 <= expanded.s1;
  if (inside) return 0;
  const dx = x1 - x0;
  const ds = s1 - s0;
  if (dx === 0 && ds === 0) return null;
  return rayAabb(x0, s0, dx, ds, expanded);
}

export function liftClears(lift, height) {
  return lift + 1e-12 >= height;
}

// Obstacles that occupy volume: solid, root (if lift too low), collapsed pad.
export function isLethalVolume(obs, lift) {
  if (obs.disabled) return false;
  if (obs.type === 'gust' || obs.type === 'puddle') return false;
  if (obs.type === 'bolt') return true; // a strike can't be jumped
  if (obs.type === 'pad') return !!obs.collapsed;
  if (obs.type === 'root') return !liftClears(lift, obs.height);
  if (obs.type === 'solid') return !liftClears(lift, obs.height);
  return false;
}

export function isPadSurface(obs) {
  return obs.type === 'pad' && !obs.collapsed && !obs.disabled;
}

export function sweptAgainstList(prev, curr, obstacles) {
  const hits = [];
  const pads = [];
  const gusts = [];
  const puddles = [];
  for (const obs of obstacles) {
    if (obs.disabled) continue;
    const t = sweptPlayerHit(prev.x, prev.s, curr.x, curr.s, obs);
    if (t == null) continue;
    // Mid-sweep lift: use the lower of the two lifts so we never clip through a root.
    const lift = Math.min(prev.lift ?? 0, curr.lift ?? 0);
    if (obs.type === 'gust') {
      gusts.push({ obs, t });
      continue;
    }
    if (obs.type === 'puddle') {
      puddles.push(obs);
      continue;
    }
    if (isPadSurface(obs)) {
      pads.push({ obs, t });
      continue;
    }
    if (isLethalVolume(obs, lift)) hits.push({ obs, t });
  }
  hits.sort((a, b) => a.t - b.t);
  pads.sort((a, b) => a.t - b.t);
  gusts.sort((a, b) => a.t - b.t);
  return {
    hit: hits[0] || null,
    pads: pads.map(p => p.obs),
    gusts: gusts.map(g => g.obs),
    puddles,
  };
}
