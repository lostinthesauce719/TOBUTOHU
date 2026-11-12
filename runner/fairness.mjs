import * as C from './config.mjs';
import { sweptAgainstList } from './collision.mjs';
import { createActor, stepActor, stableLane, applySurface, shouldJumpRoot, applyGusts } from './move.mjs';

// Hazard kinds present in a chunk (stones and roots are not hazards).
export function chunkHazards(chunk) {
  const kinds = new Set();
  for (const o of chunk.obstacles || []) {
    if (o.type === 'gust') kinds.add(o.leaf ? 'leafgust' : 'gust');
    else if (o.type === 'bolt' || o.type === 'puddle' || o.type === 'pad' || o.type === 'branch') kinds.add(o.type);
  }
  return kinds;
}

// KAMI fix 2: for the first 30 m after a hazard debuts, it is the only hazard in its chunk.
export function debutOk(chunk) {
  const kinds = chunkHazards(chunk);
  if (kinds.size <= 1) return true;
  const hA = C.heightAtS(chunk.s0 ?? 0);
  const hB = C.heightAtS(chunk.s1 ?? ((chunk.s0 ?? 0) + C.CHUNK_LENGTH));
  for (const k of kinds) {
    const d = C.HAZARD_DEBUT[k];
    if (d == null) continue;
    if (hB > d && hA < d + C.DEBUT_WINDOW_M) return false;
  }
  return true;
}

// KAMI fix 1: after a puddle, the next row must leave room for the 0.4 s lock plus the swipe
// (or lock plus a full row gap if it blocks the puddle lane).
export function puddleReachOk(puddle, lane, next) {
  if (!puddle || !next) return true;
  const exitS = puddle.s1 + C.PLAYER_DEPTH / 2;
  const t = C.ticksBetween(exitS, next.contactS);
  const band = C.bandFor(C.heightAtS(Math.max(next.contactS, 0)));
  if ((next.blockedLanes || []).includes(lane)) {
    return t + 1e-6 >= C.PUDDLE_LOCK_TICKS + Math.max(band.gapTicks, C.MIN_DECISION_GAP);
  }
  if (next.designated !== lane) return t + 1e-6 >= C.PUDDLE_LOCK_TICKS + C.SWIPE_TICKS;
  return true;
}

// A gust never shoves you into a blocked cell or off the track: the destination lane has no
// lethal cell from the gust until 1.0 s after the shove ends, and a branch never sits on the
// gust lane itself in that window either.
export function gustClearOk(chunk) {
  const obstacles = chunk.obstacles || [];
  for (const g of obstacles) {
    if (g.type !== 'gust' || !g.leaf) continue;
    const dest = g.lane + g.dir;
    if (dest < 0 || dest > 2) return { ok: false, reason: 'gust-off-track' };
    const from = g.s0 - C.PLAYER_DEPTH;
    const to = C.sAfterTicks(g.contactS, C.GUST_PUSH_TICKS + C.GUST_CLEAR_AFTER_TICKS) + C.PLAYER_DEPTH;
    for (const o of obstacles) {
      if (o === g || o.type === 'gust' || o.type === 'puddle') continue;
      if (o.lane !== dest && o.lane !== g.lane) continue;
      if (o.s1 > from && o.s0 < to) return { ok: false, reason: 'gust-into-blocked' };
    }
  }
  return { ok: true };
}

export function physicallyOpenLanes(row) {
  if (row.permanentlyOpen && row.permanentlyOpen.length) return row.permanentlyOpen.slice();
  const blocked = new Set(row.blockedLanes || []);
  return [0, 1, 2].filter(l => !blocked.has(l));
}

export function validateChunk(chunk, ctx = {}) {
  if (!chunk) return { ok: false, reason: 'empty' };
  const lastDes = ctx.lastDesignated ?? C.INITIAL_LANE;
  const lastContact = ctx.lastContactS ?? -1e6;
  const h0 = C.heightAtS(chunk.s0 ?? 0);

  if (chunk.type && chunk.type !== 'S0' && !chunk.fallbackS0 && h0 + 1e-9 < (C.EARLIEST[chunk.type] ?? 0)) {
    return { ok: false, reason: 'earliest-height' };
  }

  if (chunk.type === 'S0' && (!chunk.rows || chunk.rows.length === 0)) {
    return { ok: true, reason: 's0' };
  }

  if (!debutOk(chunk)) return { ok: false, reason: 'debut-stacking' };

  let prevDes = lastDes;
  let prevContact = lastContact;
  let prevRow = null;
  let lastBolt = ctx.lastBoltS ?? -1e6;
  let pendingPuddle = ctx.lastPuddle || null;

  for (const row of chunk.rows || []) {
    const open = physicallyOpenLanes(row);
    if (!open.length) return { ok: false, reason: 'no-open-lane' };
    if (!open.includes(row.designated)) return { ok: false, reason: 'designated-not-open' };
    if (Math.abs(row.designated - prevDes) > 1) return { ok: false, reason: 'designated-adjacency' };

    const band = C.bandFor(C.heightAtS(Math.max(row.contactS, 0)));
    const need = Math.max(band.gapTicks, C.MIN_DECISION_GAP);
    if (prevContact > -1e5) {
      const gap = C.ticksBetween(prevContact, row.contactS);
      if (gap + 1e-6 < need) return { ok: false, reason: `decision-gap ${gap.toFixed(2)} < ${need}` };
    }

    if (row.type === 'S7' && row.kind === 'wall' && prevRow && prevRow.kind === 'root') {
      const sp = C.ticksBetween(prevRow.contactS, row.contactS);
      if (sp + 1e-6 < C.S7_SPACING_TICKS) return { ok: false, reason: 's7-spacing' };
    }

    if ((row.rootedLanes || []).length > 2) return { ok: false, reason: 'root-three-lanes' };
    if ((row.blockedLanes || []).length >= 3) return { ok: false, reason: 'all-blocked' };

    if ((row.boltLanes || []).length) {
      if (row.boltLanes.includes(row.designated)) return { ok: false, reason: 'bolt-on-open-lane' };
      if (lastBolt > -1e5 && C.ticksBetween(lastBolt, row.contactS) + 1e-6 < C.BOLT_MIN_APART_TICKS) {
        return { ok: false, reason: 'bolts-too-close' };
      }
      lastBolt = row.contactS;
    }
    if (pendingPuddle && !(row.kind === 'hurdle' && row.designated === pendingPuddle.lane)) {
      if (!puddleReachOk(pendingPuddle.obs, pendingPuddle.lane, row)) return { ok: false, reason: 'puddle-reach' };
      pendingPuddle = null;
    }
    if (row.puddleLane != null) {
      const obs = (row.obstacles || []).find(o => o.type === 'puddle');
      pendingPuddle = { obs, lane: row.puddleLane };
    }

    prevDes = row.designated;
    prevContact = row.spacingS ?? row.contactS;
    prevRow = row;
  }

  const gc = gustClearOk(chunk);
  if (!gc.ok) return gc;

  const path = traceDesignated(chunk, { lastDesignated: lastDes, lastContactS: lastContact }, lastDes);
  if (!path.ok) return { ok: false, reason: `unreachable:${path.reason}` };

  const adj = [lastDes - 1, lastDes + 1].filter(l => l >= 0 && l <= 2);
  for (const lane of adj) {
    const extra = traceDesignated(chunk, { lastDesignated: lastDes, lastContactS: lastContact }, lane);
    if (!extra.ok) return { ok: false, reason: `seam:${extra.reason}:lane${lane}` };
  }

  return { ok: true };
}

export function designatedAt(rows, s, fallback) {
  let d = fallback;
  for (const r of rows) if (r.contactS <= s) d = r.designated;
  return d;
}

export function traceDesignated(chunk, ctx, entryLane) {
  const rows = chunk.rows || [];
  const obstacles = (chunk.obstacles || []).filter(o => !o.disabled);
  const p = createActor({ s: chunk.s0 ?? 0, lane: entryLane });
  const fallback = ctx.lastDesignated ?? C.INITIAL_LANE;
  const limit = 480;
  for (let t = 0; t < limit; t++) {
    let laneDir = 0;
    if (t >= C.REACTION_DELAY) {
      const look = C.sAfterTicks(p.s, C.LANE_CHANGE_TICKS);
      const want = designatedAt(rows, look, fallback);
      const cur = p.laneTick > 0 || p.gustTick > 0 ? p.toLane : p.lane;
      if (want !== cur) laneDir = Math.sign(want - cur);
    }
    const jump = shouldJumpRoot(p, obstacles, true);
    const { prev } = stepActor(p, { laneDir, jump });
    const report = sweptAgainstList(prev, { x: p.x, s: p.s, lift: p.lift }, obstacles);
    applySurface(p, report);
    applyGusts(p, report.gusts);
    if (report.hit) return { ok: false, reason: `hit-${report.hit.obs.type}@${p.s.toFixed(2)}` };
    if (p.s >= (chunk.s1 ?? (chunk.s0 + C.CHUNK_LENGTH))) {
      return { ok: true, exitLane: stableLane(p), ticks: t + 1 };
    }
  }
  return { ok: false, reason: 'timeout' };
}

export function validateCourseRules(chunks) {
  let ctx = {
    lastContactS: -1e6,
    lastDesignated: C.INITIAL_LANE,
    hardStreak: 0,
    lastBoltS: -1e6,
    lastPuddle: null,
  };
  for (const ch of chunks) {
    const v = validateChunk(ch, ctx);
    if (!v.ok) return { ok: false, reason: v.reason, index: ch.index, type: ch.type };
    const isHard = C.HARD_TYPES.includes(ch.type) && !ch.fallbackS0;
    let lastPuddle = ctx.lastPuddle;
    if (ch.rows && ch.rows.length) {
      lastPuddle = null;
      for (const r of ch.rows) {
        if (r.puddleLane != null) lastPuddle = { obs: r.obstacles.find(o => o.type === 'puddle'), lane: r.puddleLane };
        else if (!(r.kind === 'hurdle')) lastPuddle = null;
      }
    }
    ctx = {
      lastContactS: ch.lastContactS,
      lastDesignated: ch.lastDesignated,
      hardStreak: isHard ? ctx.hardStreak + 1 : 0,
      lastBoltS: ch.lastBoltS ?? ctx.lastBoltS,
      lastPuddle,
    };
    if (ctx.hardStreak > C.HARD_STREAK_LIMIT) {
      return { ok: false, reason: 'max-two-hard', index: ch.index, type: ch.type };
    }
  }
  return { ok: true };
}

export function impossibleLayouts() {
  const solid = (s, lanes) => lanes.map(l => ({
    type: 'solid', lane: l, s, depth: C.SOLID_DEPTH, height: C.SOLID_HEIGHT,
    x0: C.laneX(l) - C.SOLID_WIDTH / 2, x1: C.laneX(l) + C.SOLID_WIDTH / 2,
    s0: s - C.SOLID_DEPTH / 2, s1: s + C.SOLID_DEPTH / 2,
    contactS: C.contactS(s, C.SOLID_DEPTH),
  }));
  return [
    {
      name: 'all-lanes-blocked',
      chunk: {
        type: 'S2', s0: 40, s1: 80, lastDesignated: 1, lastContactS: 50,
        rows: [{
          type: 'S2', s: 50, contactS: C.contactS(50, C.SOLID_DEPTH), designated: 0,
          openLanes: [], blockedLanes: [0, 1, 2], permanentlyOpen: [],
          obstacles: solid(50, [0, 1, 2]),
        }],
        obstacles: solid(50, [0, 1, 2]),
      },
      ctx: { lastDesignated: 1, lastContactS: 20 },
    },
    {
      name: 'left-to-right-jump',
      chunk: {
        type: 'S2', s0: 40, s1: 80, lastDesignated: 2, lastContactS: 62,
        rows: [
          {
            type: 'S2', s: 50, contactS: C.contactS(50, C.SOLID_DEPTH), designated: 0,
            openLanes: [0], blockedLanes: [1, 2], permanentlyOpen: [0],
            obstacles: solid(50, [1, 2]),
          },
          {
            type: 'S2', s: 62, contactS: C.contactS(62, C.SOLID_DEPTH), designated: 2,
            openLanes: [2], blockedLanes: [0, 1], permanentlyOpen: [2],
            obstacles: solid(62, [0, 1]),
          },
        ],
        obstacles: [...solid(50, [1, 2]), ...solid(62, [0, 1])],
      },
      ctx: { lastDesignated: 0, lastContactS: 20 },
    },
    {
      name: 'three-lane-root',
      chunk: {
        type: 'S3', s0: 160, s1: 200, lastDesignated: 1, lastContactS: 170,
        rows: [{
          type: 'S3', s: 170, contactS: C.contactS(170, C.ROOT_DEPTH), designated: 1,
          openLanes: [], blockedLanes: [], permanentlyOpen: [], rootedLanes: [0, 1, 2],
          obstacles: [],
        }],
        obstacles: [],
      },
      ctx: { lastDesignated: 1, lastContactS: 140 },
    },
  ];
}
