import * as C from './config.mjs';
import { createCourse, createManualCourse } from './generator.mjs';
import { sweptAgainstList } from './collision.mjs';
import { createActor, stepActor, stableLane, actorDigest } from './move.mjs';
import { scoreFromHeight } from './scoring.mjs';

export function createSim(opts = {}) {
  const seed = (opts.seed ?? 1) | 0;
  const course = opts.course || createCourse(seed, opts.courseOpts || {});
  const actor = createActor({ s: opts.s ?? 0, lane: opts.lane ?? C.INITIAL_LANE });
  if (opts.h != null) actor.h = opts.h;

  const state = {
    seed,
    tick: 0,
    mode: opts.mode || 'play',
    bottom: opts.bottom ?? C.BOTTOM_START,
    maxH: actor.h,
    catchAvailable: true,
    catchUsed: false,
    catchOffered: false,
    deathReason: null,
    lastSafe: null,
    lastDb: 0,
    lastV: C.speedAtH(actor.h),
    recoveries: [],
    inputs: [],
    catchChoices: [],
    score: 0,
    tuningVersion: C.TUNING_VERSION,
    generatorVersion: C.GENERATOR_VERSION,
    skillTier: opts.skillTier || C.SKILL_TIER,
    catchRuleVersion: C.CATCH_RULE_VERSION,
  };

  function running() { return state.mode === 'play'; }

  function rememberSafe() {
    state.lastSafe = {
      s: actor.s,
      h: actor.h,
      lane: stableLane(actor),
      x: actor.x,
      tick: state.tick,
    };
  }
  rememberSafe();

  function obstaclesNear() {
    course.ensureUntil(actor.s);
    return course.obstaclesInRange(actor.s - 4, actor.s + C.RENDER_AHEAD + 8);
  }

  function updatePads(hits) {
    for (const obs of hits.pads || []) {
      if (obs.contactedTick == null) obs.contactedTick = state.tick;
    }
    for (const c of course.chunks) {
      for (const o of c.obstacles) {
        if (o.type === 'pad' && o.contactedTick != null && !o.collapsed) {
          if (state.tick - o.contactedTick >= C.PAD_COLLAPSE_TICKS) o.collapsed = true;
        }
      }
    }
  }

  function updateGusts(hits) {
    if (actor.gustTick > 0 || actor.pendingGustDir) return;
    for (const g of hits.gusts || []) {
      const committed = actor.laneTick > 0 ? actor.toLane : actor.lane;
      if (g.lane !== committed && g.lane !== actor.lane) continue;
      const dest = g.lane + g.dir;
      if (dest < 0 || dest > 2) continue;
      actor.pendingGustDir = g.dir;
      return;
    }
  }

  function offerOrEnd(reason) {
    state.deathReason = reason;
    const clearance = (state.lastSafe ? state.lastSafe.h : actor.h) - state.bottom;
    if (state.catchAvailable && clearance >= C.CATCH_CLEARANCE) {
      state.mode = 'catch';
      state.catchOffered = true;
      return 'catch';
    }
    endRun();
    return 'ended';
  }

  function endRun() {
    state.mode = 'results';
    state.score = scoreFromHeight(state.maxH);
  }

  function tick(input = {}) {
    const recorded = { laneDir: input.laneDir || 0, jump: !!input.jump };
    if (!running()) {
      state.inputs[state.tick] = recorded;
      return snapshot();
    }

    course.ensureUntil(actor.s + C.CHUNK_LENGTH);
    const { prev, v } = stepActor(actor, recorded);
    state.lastV = v;
    const db = C.bottomDelta(v);
    state.bottom += db;
    state.lastDb = db;
    if (actor.h > state.maxH) state.maxH = actor.h;

    const nearby = obstaclesNear();
    // collapse pads that have matured before testing this tick's overlap
    for (const o of nearby) {
      if (o.type === 'pad' && o.contactedTick != null && !o.collapsed && state.tick - o.contactedTick >= C.PAD_COLLAPSE_TICKS) {
        o.collapsed = true;
      }
    }
    const hits = sweptAgainstList(prev, { x: actor.x, s: actor.s, lift: actor.lift }, nearby);
    updatePads(hits);
    updateGusts(hits);

    let fatal = null;
    if (actor.h <= state.bottom) fatal = 'bottom';
    else if (hits.hit) fatal = hits.hit.obs.type === 'pad' ? 'pad' : hits.hit.obs.type;

    state.inputs[state.tick] = recorded;
    state.tick += 1;

    if (fatal) {
      offerOrEnd(fatal);
    } else {
      rememberSafe();
    }
    return snapshot();
  }

  function useCatch() {
    if (state.mode !== 'catch' || !state.catchAvailable) return false;
    const clearance = (state.lastSafe ? state.lastSafe.h : actor.h) - state.bottom;
    if (clearance < C.CATCH_CLEARANCE) return false;
    state.catchAvailable = false;
    state.catchUsed = true;
    state.catchChoices.push({ tick: state.tick, action: 'use', version: C.CATCH_RULE_VERSION });
    const safe = state.lastSafe;
    actor.s = safe.s;
    actor.h = safe.h;
    actor.jumpTick = 0;
    actor.jumping = false;
    actor.jumpBuffer = 0;
    actor.queuedDir = 0;
    actor.queuedAge = 0;
    actor.gustTick = 0;
    actor.gustDir = 0;
    actor.pendingGustDir = 0;
    actor.laneTick = 0;
    actor.lift = 0;
    const clearLane = pickClearLane(safe.s, safe.lane);
    actor.lane = clearLane;
    actor.fromLane = clearLane;
    actor.toLane = clearLane;
    actor.x = C.laneX(clearLane);
    const rec = { fromS: actor.s, toS: actor.s + C.CATCH_RECOVERY_M };
    course.addRecovery(rec.fromS, rec.toS);
    state.recoveries.push(rec);
    state.mode = 'ready';
    return true;
  }

  function pickClearLane(s, preferred) {
    const obs = course.obstaclesInRange(s - 1, s + 2).filter(o => !o.disabled && o.type === 'solid');
    const blocked = new Set();
    for (const o of obs) {
      if (o.s0 <= s + C.PLAYER_DEPTH / 2 && o.s1 >= s - C.PLAYER_DEPTH / 2) blocked.add(o.lane);
    }
    const des = course.designatedLaneAt(s);
    if (!blocked.has(preferred)) return preferred;
    if (!blocked.has(des)) return des;
    for (const l of [0, 1, 2]) if (!blocked.has(l)) return l;
    return preferred;
  }

  function declineCatch() {
    if (state.mode !== 'catch') return false;
    state.catchChoices.push({ tick: state.tick, action: 'decline', version: C.CATCH_RULE_VERSION });
    endRun();
    return true;
  }

  function ready() {
    if (state.mode !== 'ready') return false;
    state.mode = 'play';
    return true;
  }

  function pause() {
    if (state.mode === 'play') state.mode = 'paused';
  }
  function resume() {
    if (state.mode === 'paused') state.mode = 'play';
  }

  function snapshot() {
    return {
      tick: state.tick,
      mode: state.mode,
      seed: state.seed,
      s: actor.s,
      h: actor.h,
      x: actor.x,
      lane: actor.lane,
      toLane: actor.toLane,
      laneTick: actor.laneTick,
      jumpTick: actor.jumpTick,
      lift: actor.lift,
      bottom: state.bottom,
      maxH: state.maxH,
      score: scoreFromHeight(state.maxH),
      catchAvailable: state.catchAvailable,
      catchUsed: state.catchUsed,
      catchOffered: state.catchOffered,
      deathReason: state.deathReason,
      lastDb: state.lastDb,
      lastV: state.lastV,
      recoveries: state.recoveries.slice(),
      lastSafe: state.lastSafe ? { ...state.lastSafe } : null,
      queuedDir: actor.queuedDir,
      queuedAge: actor.queuedAge,
      gustTick: actor.gustTick,
      v: C.speedAtH(actor.h),
    };
  }

  function digest() {
    return [
      state.tick, state.mode, actorDigest(actor),
      state.bottom.toFixed(9), state.maxH.toFixed(9),
      state.catchAvailable ? 1 : 0, state.catchUsed ? 1 : 0,
      state.deathReason || '',
    ].join('|');
  }

  function replayKey() {
    return {
      seed,
      generatorVersion: state.generatorVersion,
      tuningVersion: state.tuningVersion,
      skillTier: state.skillTier,
      catchRuleVersion: state.catchRuleVersion,
      inputs: state.inputs.map(i => i ? [i.laneDir || 0, i.jump ? 1 : 0] : [0, 0]),
      catchChoices: state.catchChoices.slice(),
    };
  }

  function warnings(leadTicks = C.WARNING_TICKS) {
    const list = [];
    const ahead = C.sAfterTicks(actor.s, leadTicks);
    for (const o of course.obstaclesInRange(actor.s - 1, ahead + 4)) {
      if (o.disabled) continue;
      const ttc = C.ticksBetween(actor.s, o.contactS);
      if (o.type === 'pad' && o.contactedTick != null && !o.collapsed) {
        const remain = C.PAD_COLLAPSE_TICKS - (state.tick - o.contactedTick);
        if (remain > 0 && remain <= leadTicks) {
          list.push({ obs: o, ticks: remain, kind: 'collapse' });
        }
      }
      if (ttc > 0 && ttc <= leadTicks) list.push({ obs: o, ticks: ttc, kind: 'approach' });
    }
    return list;
  }

  return {
    tick,
    useCatch,
    declineCatch,
    ready,
    pause,
    resume,
    snapshot,
    digest,
    replayKey,
    warnings,
    actor,
    course,
    state,
    pickClearLane,
    get mode() { return state.mode; },
    get seed() { return seed; },
  };
}

export function perfectBotInput(sim) {
  const snap = sim.snapshot();
  if (snap.mode !== 'play') return { laneDir: 0, jump: false };
  const look = C.sAfterTicks(snap.s, C.LANE_CHANGE_TICKS);
  const want = sim.course.designatedLaneAt(look);
  const cur = snap.laneTick > 0 || snap.gustTick > 0 ? snap.toLane : snap.lane;
  let laneDir = 0;
  if (want !== cur) laneDir = Math.sign(want - cur);
  return { laneDir, jump: false };
}

export function runPerfectBot(seed, targetH = C.SPRING_HEIGHT, maxTicks = 60 * 200) {
  const sim = createSim({ seed });
  const deaths = [];
  while (sim.state.tick < maxTicks && sim.snapshot().h < targetH && sim.mode === 'play') {
    sim.tick(perfectBotInput(sim));
    if (sim.mode !== 'play') {
      deaths.push(sim.state.deathReason);
      break;
    }
  }
  const snap = sim.snapshot();
  return {
    seed,
    h: snap.h,
    maxH: snap.maxH,
    ticks: snap.tick,
    seconds: snap.tick / C.TICK_HZ,
    score: snap.score,
    mode: snap.mode,
    catchUsed: snap.catchUsed,
    deathReason: sim.state.deathReason,
    cleared: snap.h >= targetH && !snap.catchUsed && snap.mode === 'play',
    deaths,
  };
}

export function replaySim(key) {
  const sim = createSim({ seed: key.seed, skillTier: key.skillTier });
  const inputs = key.inputs || [];
  for (let i = 0; i < inputs.length; i++) {
    const pair = inputs[i] || [0, 0];
    const input = { laneDir: pair[0], jump: !!pair[1] };
    if (sim.mode === 'catch') {
      const choice = (key.catchChoices || []).find(c => c.tick === sim.state.tick);
      if (choice?.action === 'use') { sim.useCatch(); sim.ready(); }
      else if (choice?.action === 'decline') { sim.declineCatch(); break; }
    }
    if (sim.mode === 'play') sim.tick(input);
    else break;
  }
  return sim;
}

export { createManualCourse, createCourse };
