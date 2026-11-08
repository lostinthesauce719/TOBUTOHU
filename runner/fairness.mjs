import * as C from './config.mjs';
import { sweptAgainstList } from './collision.mjs';
import { createActor, stepActor, stableLane } from './move.mjs';

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

  let prevDes = lastDes;
  let prevContact = lastContact;
  let prevRow = null;

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

    prevDes = row.designated;
    prevContact = row.contactS;
    prevRow = row;
  }

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
    const { prev } = stepActor(p, { laneDir, jump: false });
    const report = sweptAgainstList(prev, { x: p.x, s: p.s, lift: p.lift }, obstacles);
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
  };
  for (const ch of chunks) {
    const v = validateChunk(ch, ctx);
    if (!v.ok) return { ok: false, reason: v.reason, index: ch.index, type: ch.type };
    const isHard = C.HARD_TYPES.includes(ch.type) && !ch.fallbackS0;
    ctx = {
      lastContactS: ch.lastContactS,
      lastDesignated: ch.lastDesignated,
      hardStreak: isHard ? ctx.hardStreak + 1 : 0,
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
