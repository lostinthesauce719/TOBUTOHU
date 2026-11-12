import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as C from '../runner/config.mjs';
import { createSim, perfectBotInput, runPerfectBot } from '../runner/sim.mjs';
import {
  createCourse, generateChunk, emptyCtx, makeSolid, makeRoot, makePad, makeGust, createManualCourse,
  makeBolt, makePuddle, mulberry32, makeBranch,
} from '../runner/generator.mjs';
import {
  validateChunk, validateCourseRules, impossibleLayouts, debutOk, puddleReachOk, gustClearOk,
} from '../runner/fairness.mjs';
import { recognizeGesture } from '../runner/controls.mjs';
import { createScoreboard, scoreFromHeight } from '../runner/scoring.mjs';

function hashDigest(text) {
  return createHash('sha256').update(text).digest('hex');
}

function runScripted(seed, inputs, catchPlan = []) {
  const sim = createSim({ seed });
  const hashes = [];
  const plan = catchPlan.slice();
  for (let i = 0; i < inputs.length; i++) {
    if (sim.mode === 'catch') {
      const next = plan.shift() || 'decline';
      if (next === 'use') {
        sim.useCatch();
        sim.ready();
      } else {
        sim.declineCatch();
        break;
      }
    }
    if (sim.mode !== 'play') break;
    sim.tick(inputs[i] || { laneDir: 0, jump: false });
    if (sim.state.tick % 600 === 0) hashes.push(hashDigest(sim.digest()));
  }
  hashes.push(hashDigest(sim.digest()));
  return { sim, hashes, digest: sim.digest(), snap: sim.snapshot() };
}

function scriptedInputs(n, fn) {
  return Array.from({ length: n }, (_, i) => fn(i));
}

test('determinism: same seed and scripted inputs hash identically', () => {
  const seeds = [1, 2, 7, 13, 21, 42, 99, 128];
  const ticks = 6000;
  for (const seed of seeds) {
    const inputs = scriptedInputs(ticks, (i) => ({
      laneDir: i % 90 === 10 ? 1 : i % 90 === 40 ? -1 : 0,
      jump: i % 120 === 15,
    }));
    const a = runScripted(seed, inputs, ['use']);
    const b = runScripted(seed, inputs, ['use']);
    assert.equal(a.digest, b.digest, `seed ${seed} digest mismatch`);
    assert.deepEqual(a.hashes, b.hashes, `seed ${seed} periodic hash mismatch`);
  }
});

test('determinism soak: 12 seeds x 12000 ticks', () => {
  const seeds = [3, 8, 11, 17, 23, 29, 31, 37, 44, 52, 64, 81];
  const ticks = 12000;
  const report = [];
  for (const seed of seeds) {
    const inputs = scriptedInputs(ticks, (i) => ({
      laneDir: i % 70 === 5 ? -1 : i % 70 === 35 ? 1 : 0,
      jump: i % 150 === 20,
    }));
    const a = runScripted(seed, inputs, ['use']);
    const b = runScripted(seed, inputs, ['use']);
    assert.equal(a.digest, b.digest, `soak seed ${seed}`);
    report.push({ seed, hashes: a.hashes.length, tick: a.snap.tick });
  }
  assert.equal(report.length, seeds.length);
});

test('perfect bot: 20 seeds clear 120 m with zero deaths or Catches', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
  const results = seeds.map((seed) => runPerfectBot(seed));
  const times = results.map((r) => {
    assert.ok(r.cleared, `seed ${r.seed} failed h=${r.h.toFixed(3)} mode=${r.mode} reason=${r.deathReason} catch=${r.catchUsed}`);
    assert.equal(r.catchUsed, false, `seed ${r.seed} used Catch`);
    assert.ok(r.seconds >= 90 && r.seconds <= 100, `seed ${r.seed} time ${r.seconds.toFixed(3)}s outside 90-100`);
    assert.equal(r.score, Math.floor(r.maxH));
    assert.ok(r.score >= 120 || r.maxH >= 120);
    return { seed: r.seed, seconds: r.seconds, ticks: r.ticks, maxH: r.maxH, score: r.score };
  });
  const secs = times.map((t) => t.seconds);
  const min = Math.min(...secs);
  const max = Math.max(...secs);
  const mean = secs.reduce((a, b) => a + b, 0) / secs.length;
  console.log('perfect-bot times (s):', times.map((t) => `${t.seed}:${t.seconds.toFixed(3)}`).join(' '));
  console.log(`perfect-bot range ${min.toFixed(3)}–${max.toFixed(3)} s, mean ${mean.toFixed(3)} s`);
  assert.ok(min >= 90 && max <= 100);
});

test('generator: open lanes, adjacency, seams, gates, gaps, hard-streak, S7 spacing', () => {
  const chunks = [];
  for (let seed = 1; seed <= 80; seed++) {
    const course = createCourse(seed);
    course.ensureUntil(C.sAtHeight(130) + C.CHUNK_LENGTH);
    chunks.push(...course.generated);
    const rules = validateCourseRules(course.generated);
    assert.ok(rules.ok, `seed ${seed} course rule fail: ${rules.reason} @${rules.index} ${rules.type}`);
  }
  assert.ok(chunks.length >= 1800, `only ${chunks.length} chunks`);

  for (const ch of chunks) {
    const h0 = C.heightAtS(ch.s0);
    if (h0 + 1e-9 < (C.EARLIEST[ch.type] || 0) && !ch.fallbackS0) {
      assert.fail(`chunk ${ch.index} type ${ch.type} before earliest at h=${h0}`);
    }
    let prev = null;
    for (const row of ch.rows) {
      const open = row.permanentlyOpen?.length ? row.permanentlyOpen : [0, 1, 2].filter((l) => !(row.blockedLanes || []).includes(l));
      assert.ok(open.length >= 1, 'physically open lane');
      assert.ok(open.includes(row.designated), 'designated open');
      if (prev) assert.ok(Math.abs(row.designated - prev.designated) <= 1, 'designated adjacency');
      if (row.type === 'S7' && row.kind === 'wall' && prev && prev.kind === 'root') {
        const sp = C.ticksBetween(prev.contactS, row.contactS);
        assert.ok(sp + 1e-6 >= C.S7_SPACING_TICKS, `S7 spacing ${sp}`);
      }
      prev = row;
    }
  }

  // extra chunks until we pass 10k so the suite matches the spec count
  for (let seed = 81; chunks.length < 10000; seed++) {
    const course = createCourse(seed);
    course.ensureUntil(C.sAtHeight(130) + C.CHUNK_LENGTH);
    const rules = validateCourseRules(course.generated);
    assert.ok(rules.ok, `seed ${seed} ${rules.reason}`);
    chunks.push(...course.generated);
  }
  assert.ok(chunks.length >= 10000, `generated ${chunks.length}`);
});

test('generator: impossible layouts reject and 16 failures emit S0', () => {
  for (const ex of impossibleLayouts()) {
    const v = validateChunk(ex.chunk, ex.ctx);
    assert.equal(v.ok, false, `${ex.name} should reject, got ${JSON.stringify(v)}`);
  }
  const failed = generateChunk(99, 6, emptyCtx(), { forceFail: true });
  assert.equal(failed.chunk.type, 'S0');
  assert.equal(failed.forcedS0, true);
  assert.equal(failed.attempts, C.MAX_GEN_ATTEMPTS);
  assert.equal(failed.chunk.fallbackS0, true);
});

test('bottom: rate cap, pause freeze, exact-touch death, no Catch teleport', () => {
  const sim = createSim({ seed: 4 });
  let lastB = sim.snapshot().bottom;
  for (let i = 0; i < 180; i++) {
    const before = sim.snapshot();
    sim.tick({});
    const after = sim.snapshot();
    const cap = C.bottomDelta(before.v);
    assert.ok(after.lastDb >= 0 - 1e-12);
    assert.ok(after.lastDb <= cap + 1e-9, `db ${after.lastDb} cap ${cap}`);
    assert.ok(Math.abs(after.bottom - lastB - after.lastDb) < 1e-12);
    const springRate = after.lastDb * C.TICK_HZ;
    assert.ok(Math.abs(springRate - 0.75) < 1e-9, `spring rate ${springRate}`);
    lastB = after.bottom;
  }

  const paused = createSim({ seed: 4 });
  for (let i = 0; i < 30; i++) paused.tick({});
  paused.pause();
  const bPause = paused.snapshot().bottom;
  const hPause = paused.snapshot().h;
  for (let i = 0; i < 120; i++) paused.tick({});
  assert.equal(paused.snapshot().bottom, bPause);
  assert.equal(paused.snapshot().h, hPause);
  paused.resume();
  paused.tick({});
  assert.ok(paused.snapshot().bottom > bPause);

  const nextH = (C.speedAtH(0) * C.DT) * C.SIN_PITCH;
  const db = C.bottomDelta(C.speedAtH(0));
  const live = createSim({ bottom: nextH - db - 1e-8 });
  live.tick({});
  assert.equal(live.mode, 'play');
  assert.ok(live.snapshot().h > live.snapshot().bottom);
  const die = createSim({ bottom: nextH - db + 1e-8 });
  die.tick({});
  assert.notEqual(die.mode, 'play');
  assert.equal(die.state.deathReason, 'bottom');

  const wall = makeSolid(18, 1);
  const catchSim = createSim({ course: createManualCourse([wall]), seed: 1 });
  while (catchSim.mode === 'play') catchSim.tick({});
  assert.equal(catchSim.mode, 'catch');
  const bBefore = catchSim.snapshot().bottom;
  const maxBefore = catchSim.snapshot().maxH;
  const safeH = catchSim.snapshot().lastSafe.h;
  assert.ok(catchSim.useCatch());
  assert.equal(catchSim.snapshot().bottom, bBefore);
  assert.equal(catchSim.snapshot().maxH, maxBefore);
  assert.ok(Math.abs(catchSim.snapshot().h - safeH) < 1e-9);
  assert.equal(scoreFromHeight(catchSim.snapshot().maxH), scoreFromHeight(maxBefore));
});

test('controls: gestures, buffers, edges, airborne switch, collisions, gust, pad', () => {
  assert.deepEqual(recognizeGesture({ dx: 50, dy: 0, dtMs: 180 }), { type: 'swipe', dir: 1 });
  assert.deepEqual(recognizeGesture({ dx: -60, dy: 10, dtMs: 200 }), { type: 'swipe', dir: -1 });
  assert.equal(recognizeGesture({ dx: 50, dy: 40, dtMs: 180 }).type, 'none');
  assert.equal(recognizeGesture({ dx: 5, dy: 4, dtMs: 120 }).type, 'tap');
  assert.equal(recognizeGesture({ dx: 50, dy: 0, dtMs: 400 }).type, 'none');
  assert.equal(recognizeGesture({ dx: 50, dy: 0, dtMs: 180 }).type, 'swipe');

  const air = createSim({ seed: 1 });
  air.tick({ jump: true });
  assert.ok(air.snapshot().jumpTick > 0);
  air.tick({ laneDir: 1 });
  for (let i = 0; i < 6; i++) air.tick({});
  assert.ok(air.snapshot().x > 0.2, 'airborne lane change should move x');
  assert.ok(air.snapshot().jumpTick > 0, 'still airborne');

  const edge = createSim({ seed: 1 });
  for (let i = 0; i < 20; i++) edge.tick({ laneDir: i < 12 ? -1 : 0 });
  while (edge.snapshot().laneTick > 0) edge.tick({});
  assert.equal(edge.snapshot().lane, 0);
  const xEdge = edge.snapshot().x;
  for (let i = 0; i < 8; i++) edge.tick({ laneDir: -1 });
  assert.equal(edge.snapshot().lane, 0);
  assert.ok(Math.abs(edge.snapshot().x - xEdge) < 1e-9);

  const buf = createSim({ seed: 1 });
  buf.tick({ laneDir: 1 });
  buf.tick({ laneDir: -1 });
  for (let i = 0; i < 8; i++) buf.tick({});
  assert.equal(buf.snapshot().queuedDir, 0);
  while (buf.snapshot().laneTick > 0) buf.tick({});
  assert.equal(buf.snapshot().lane, 2);

  const wall = createSim({ course: createManualCourse([makeSolid(16, 1)]), seed: 1 });
  while (wall.mode === 'play' && wall.state.tick < 400) wall.tick({});
  assert.notEqual(wall.mode, 'play');
  assert.equal(wall.state.deathReason, 'solid');

  const rootHit = createSim({ course: createManualCourse([makeRoot(24, 1)]), seed: 1 });
  while (rootHit.mode === 'play' && rootHit.state.tick < 400) rootHit.tick({});
  assert.equal(rootHit.state.deathReason, 'root');

  const root = makeRoot(24, 1);
  const rootClear = createSim({ course: createManualCourse([root]), seed: 1 });
  while (C.ticksBetween(rootClear.snapshot().s, root.contactS) > 18) rootClear.tick({});
  rootClear.tick({ jump: true });
  while (rootClear.snapshot().s < root.s1 + 3 && rootClear.mode === 'play') rootClear.tick({});
  assert.equal(rootClear.mode, 'play');
  assert.ok(rootClear.snapshot().s > root.s1);

  const gust = createSim({ course: createManualCourse([makeGust(16, 1, 1)]), seed: 1 });
  while (gust.snapshot().s < 28 && gust.mode === 'play') gust.tick({});
  assert.equal(gust.mode, 'play');
  assert.ok(gust.snapshot().lane === 2 || gust.snapshot().toLane === 2, `gust lane ${gust.snapshot().lane}`);

  const padDie = createSim({ course: createManualCourse([makePad(10, 1, 12)]), seed: 1 });
  while (padDie.mode === 'play' && padDie.state.tick < 500) padDie.tick({});
  assert.equal(padDie.state.deathReason, 'pad');

  const padLive = createSim({ course: createManualCourse([makePad(10, 1, 12)]), seed: 1 });
  while (padLive.snapshot().s < 11 && padLive.mode === 'play') padLive.tick({});
  for (let i = 0; i < 16; i++) padLive.tick({ laneDir: i < 12 ? -1 : 0 });
  while (padLive.snapshot().s < 26 && padLive.mode === 'play') padLive.tick({});
  assert.equal(padLive.mode, 'play');
});

test('Catch and results: one use, clearance, recovery, no bonus, no invented scores', () => {
  const calls = [];
  const prevFetch = globalThis.fetch;
  globalThis.fetch = (...args) => { calls.push(args); return Promise.resolve({ ok: true }); };

  const store = {
    data: {},
    getItem(k) { return k in this.data ? this.data[k] : null; },
    setItem(k, v) { this.data[k] = String(v); },
  };
  const board = createScoreboard(store);
  assert.deepEqual(board.getBoard(), { clean: [], assisted: [] });

  const walls = [makeSolid(16, 1), makeSolid(50, 1)];
  const sim = createSim({ course: createManualCourse(walls), seed: 5 });
  while (sim.mode === 'play') sim.tick({});
  assert.equal(sim.mode, 'catch');
  const maxBefore = sim.snapshot().maxH;
  const bottomBefore = sim.snapshot().bottom;
  const safeS = sim.snapshot().lastSafe.s;
  assert.ok(sim.useCatch());
  assert.equal(sim.mode, 'ready');
  assert.equal(sim.snapshot().bottom, bottomBefore);
  assert.equal(sim.snapshot().maxH, maxBefore);
  assert.ok(sim.snapshot().s < 16);
  const recovered = sim.course.obstaclesInRange(safeS, safeS + C.CATCH_RECOVERY_M);
  for (const o of recovered) {
    if (o.s0 < safeS + C.CATCH_RECOVERY_M && o.s1 > safeS) assert.equal(o.disabled, true);
  }
  sim.tick({ jump: true });
  assert.equal(sim.mode, 'ready');
  assert.ok(sim.ready());
  assert.equal(sim.mode, 'play');
  while (sim.mode === 'play' && sim.state.tick < 2000) sim.tick({});
  assert.equal(sim.mode, 'results');
  assert.equal(sim.snapshot().catchUsed, true);
  assert.ok(sim.useCatch() === false);

  const low = createSim({
    course: createManualCourse([makeSolid(12, 1)]),
    seed: 5,
    bottom: -2,
  });
  while (low.mode === 'play' && low.state.tick < 400) low.tick({});
  assert.ok(low.mode === 'results' || low.mode === 'catch');
  if (low.mode === 'catch') {
    const clearance = low.snapshot().lastSafe.h - low.snapshot().bottom;
    assert.ok(clearance >= C.CATCH_CLEARANCE);
  } else {
    const clearance = (low.snapshot().lastSafe?.h ?? low.snapshot().h) - low.snapshot().bottom;
    assert.ok(clearance < C.CATCH_CLEARANCE || low.state.deathReason === 'bottom');
  }

  board.recordRun({ maxH: sim.snapshot().maxH, seed: 5, catchUsed: true, at: 1 });
  const lists = board.getBoard();
  assert.equal(lists.clean.length, 0);
  assert.equal(lists.assisted.length, 1);
  assert.equal(lists.assisted[0].score, scoreFromHeight(sim.snapshot().maxH));
  board.recordRun({ maxH: 44.8, seed: 6, catchUsed: false, at: 2 });
  assert.equal(board.getBoard().clean[0].score, 44);
  assert.equal(calls.length, 0);
  globalThis.fetch = prevFetch;
});

test('warnings lead at least 30 ticks and chunk memory stays bounded', () => {
  const sim = createSim({ seed: 9 });
  const firstSeen = new Map();
  while (sim.mode === 'play' && sim.snapshot().h < 80) {
    for (const w of sim.warnings()) {
      if (w.kind === 'approach' && !firstSeen.has(w.obs.id)) {
        firstSeen.set(w.obs.id, C.ticksBetween(sim.snapshot().s, w.obs.contactS));
      }
    }
    sim.tick(perfectBotInput(sim));
  }
  assert.ok(firstSeen.size > 0);
  for (const [id, ticks] of firstSeen) {
    assert.ok(ticks + 1e-6 >= C.WARNING_MIN_TICKS, `warning ${id} only ${ticks} ticks`);
    assert.ok(ticks <= C.WARNING_TICKS + 2);
  }
  const long = createSim({ seed: 10 });
  for (let i = 0; i < 60 * 30; i++) {
    if (long.mode !== 'play') break;
    long.tick(perfectBotInput(long));
  }
  const resident = long.course.residentWindow(long.snapshot().s).length;
  assert.ok(resident <= C.KEEP_AHEAD + C.KEEP_BEHIND + 2, `resident ${resident}`);
});

// ---------------- Summer (120-240 m): storm ----------------

test('summer speed and mist follow the SEASONS table', () => {
  assert.equal(C.speedAtH(120), 10);
  assert.ok(Math.abs(C.speedAtH(180) - 10.5) < 1e-12);
  assert.equal(C.speedAtH(240), 11);
  assert.equal(C.speedAtH(300), 11.5);
  assert.equal(C.mistCapAtH(60), 0.75);
  assert.equal(C.mistCapAtH(150), 0.80);
  for (const h of [120, 180, 239]) {
    const climb = C.speedAtH(h) * C.SIN_PITCH;
    const share = Math.min(C.mistCapAtH(h), C.BOTTOM_FRACTION * climb) / climb;
    assert.ok(share >= 0.52 - 1e-9 && share <= 0.58 + 1e-9, `mist share ${share} at ${h}`);
  }
  // closed-form travel time matches a fine numeric integration across the 120 m seam
  const a = C.sAtHeight(100);
  const b = C.sAtHeight(200);
  let s = a;
  let n = 0;
  while (s < b) { s += C.speedAtH(C.heightAtS(s)) / 60000; n++; }
  assert.ok(Math.abs(C.travelTime(a, b) - n / 60000) < 1e-3);
  assert.ok(Math.abs(C.sAfterTime(a, C.travelTime(a, b)) - b) < 1e-6);
});

test('summer perfect bot: 20 seeds clear 240 m with zero deaths or Catches, about 80 s of summer', () => {
  const springS = C.travelTime(0, C.sAtHeight(120));
  const out = [];
  for (let seed = 1; seed <= 20; seed++) {
    const r = runPerfectBot(seed, 240, 60 * 400);
    assert.ok(r.cleared, `seed ${seed} failed at h=${r.h.toFixed(2)} reason=${r.deathReason}`);
    assert.equal(r.catchUsed, false);
    out.push(r.seconds);
  }
  const summer = out.map((t) => t - springS);
  console.log(`summer clean time ${Math.min(...summer).toFixed(2)}-${Math.max(...summer).toFixed(2)} s (full run ${Math.min(...out).toFixed(2)} s)`);
  for (const t of summer) assert.ok(t >= 75 && t <= 90, `summer time ${t}`);
});

test('summer generator: open lane, bolts apart, puddle reach, debut windows, calm transition', () => {
  const seen = {};
  let rows = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const course = createCourse(seed);
    course.ensureUntil(C.sAtHeight(245));
    const rules = validateCourseRules(course.generated);
    assert.ok(rules.ok, `seed ${seed}: ${rules.reason} @${rules.index} ${rules.type}`);
    let lastBolt = -1e6;
    let lastPuddle = null;
    for (const ch of course.generated) {
      const h0 = C.heightAtS(ch.s0);
      if (h0 >= 120) seen[ch.type] = (seen[ch.type] || 0) + 1;
      if (h0 >= 120 && h0 < 135 - 1e-9) assert.equal(ch.type, 'S0', `calm transition chunk ${ch.type} at ${h0}`);
      assert.ok(debutOk(ch), `debut stacking ${ch.type} at ${h0}`);
      if (ch.type === 'S6') assert.ok(h0 < 120, 'blossom gust retires in summer');
      for (const r of ch.rows) {
        rows++;
        const open = [0, 1, 2].filter((l) => !(r.blockedLanes || []).includes(l));
        assert.ok(open.length >= 1, 'open lane');
        assert.ok(!(r.boltLanes || []).includes(r.designated), 'bolt on the open lane');
        if ((r.boltLanes || []).length) {
          assert.ok(C.ticksBetween(lastBolt, r.contactS) + 1e-6 >= C.BOLT_MIN_APART_TICKS, 'bolts 2 s apart');
          lastBolt = r.contactS;
        }
        if (lastPuddle && r.kind !== 'hurdle') {
          assert.ok(puddleReachOk(lastPuddle.obs, lastPuddle.lane, r), `puddle reach seed ${seed}`);
          lastPuddle = null;
        }
        if (r.puddleLane != null) {
          const obs = r.obstacles.find((o) => o.type === 'puddle');
          const len = obs.s1 - obs.s0;
          assert.ok(len >= C.PUDDLE_MIN - 1e-9 && len <= C.PUDDLE_MAX + 1e-9, `puddle length ${len}`);
          lastPuddle = { obs, lane: r.puddleLane };
        }
      }
      for (const o of ch.obstacles) {
        if (o.type === 'bolt') assert.ok(C.heightAtS(o.s0) >= 135 - 1, 'lightning before 135');
        if (o.type === 'puddle') assert.ok(C.heightAtS(o.s0) >= 150 - 1, 'puddle before 150');
      }
    }
  }
  for (const t of ['U1', 'U2', 'U3', 'U4', 'U5', 'U6']) assert.ok((seen[t] || 0) > 20, `${t} too rare: ${seen[t]}`);
  console.log('summer chunk mix (200 seeds):', JSON.stringify(seen), 'rows', rows);
});

test('summer impossible layouts reject (stacked debut, puddle too close, bolt on open lane)', () => {
  const s0 = C.sAtHeight(140);
  const bolt = makeBolt(s0 + 6, 0);
  const pud = makePuddle(s0 + 20, 1, 6);
  const stacked = {
    type: 'U6', s0, s1: s0 + C.CHUNK_LENGTH, obstacles: [bolt, pud], rows: [],
  };
  assert.equal(debutOk(stacked), false);
  assert.equal(validateChunk({ ...stacked, rows: [{ type: 'U6', contactS: bolt.contactS, designated: 1, blockedLanes: [0], permanentlyOpen: [1, 2] }] }, { lastDesignated: 1 }).ok, false);

  const late = C.sAtHeight(200);
  const p = makePuddle(late + 5, 1, 8);
  const exitS = p.s1 + C.PLAYER_DEPTH / 2;
  const tooSoon = { contactS: C.sAfterTicks(exitS, C.PUDDLE_LOCK_TICKS + C.SWIPE_TICKS - 4), designated: 0, blockedLanes: [1, 2] };
  const roomy = { contactS: C.sAfterTicks(exitS, C.PUDDLE_LOCK_TICKS + 50), designated: 0, blockedLanes: [1, 2] };
  assert.equal(puddleReachOk(p, 1, tooSoon), false);
  assert.equal(puddleReachOk(p, 1, roomy), true);

  const b2 = makeBolt(late + 8, 1);
  const onOpen = {
    type: 'U2', s0: late, s1: late + C.CHUNK_LENGTH, obstacles: [b2],
    rows: [{ type: 'U2', s: b2.s, contactS: b2.contactS, designated: 1, openLanes: [0, 2], blockedLanes: [1], permanentlyOpen: [0, 1, 2], boltLanes: [1] }],
  };
  assert.equal(validateChunk(onOpen, { lastDesignated: 1, lastContactS: -1e6 }).ok, false);
});

test('puddle: swipes locked on it and 0.4 s after, jump still works; lightning cannot be jumped', () => {
  const pud = makePuddle(10, 1, 8);
  const sim = createSim({ course: createManualCourse([pud]), seed: 1 });
  while (sim.snapshot().s < 12) sim.tick({});
  assert.ok(sim.snapshot().puddleLock > 0);
  sim.tick({ laneDir: 1 });
  for (let i = 0; i < 12; i++) sim.tick({});
  assert.equal(sim.snapshot().lane, 1, 'swipe on a puddle is ignored');
  sim.tick({ jump: true });
  assert.ok(sim.snapshot().jumpTick > 0, 'jump allowed on a puddle');
  while (sim.snapshot().s < pud.s1 + C.PLAYER_DEPTH / 2 + 0.01) sim.tick({});
  // still locked right after stepping off
  sim.tick({ laneDir: 1 });
  for (let i = 0; i < 12; i++) sim.tick({});
  assert.equal(sim.snapshot().lane, 1, 'lock holds after leaving');
  for (let i = 0; i < C.PUDDLE_LOCK_TICKS; i++) sim.tick({});
  assert.equal(sim.snapshot().puddleLock, 0);
  sim.tick({ laneDir: 1 });
  while (sim.snapshot().laneTick > 0) sim.tick({});
  assert.equal(sim.snapshot().lane, 2, 'swipe works once the lock ends');
  assert.equal(sim.mode, 'play', 'a puddle alone is not deadly');

  const bolt = makeBolt(16, 1);
  const zap = createSim({ course: createManualCourse([bolt]), seed: 1 });
  while (C.ticksBetween(zap.snapshot().s, bolt.contactS) > 14) zap.tick({});
  zap.tick({ jump: true });
  while (zap.mode === 'play' && zap.state.tick < 400) zap.tick({});
  assert.equal(zap.state.deathReason, 'bolt');
  assert.equal(zap.state.deathHazard, 'L');
});

test('summer deaths by hazard: no hazard causes more than 25% of deaths (sloppy bot)', () => {
  const counts = {};
  let total = 0;
  let reached = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const sim = createSim({ seed, s: C.sAtHeight(120), h: 120, bottom: 108 });
    const rng = mulberry32(seed * 7919);
    let freeze = 0;
    while (sim.mode === 'play' && sim.snapshot().h < 240) {
      let inp = perfectBotInput(sim);
      if (freeze > 0) { freeze--; inp = { laneDir: 0, jump: false }; } else if (rng() < 0.012) freeze = 8 + Math.floor(rng() * 14);
      sim.tick(inp);
    }
    if (sim.mode !== 'play') { counts[sim.state.deathHazard] = (counts[sim.state.deathHazard] || 0) + 1; total++; } else reached++;
  }
  const share = (k) => (counts[k] || 0) / Math.max(total, 1);
  console.log(`summer deaths (300 sloppy runs): ${JSON.stringify(counts)} of ${total}; reached 240 m: ${reached}; L ${(100 * share('L')).toFixed(1)}%, P ${(100 * share('P')).toFixed(1)}%`);
  assert.ok(total > 50, 'sloppy bot should die sometimes');
  for (const k of ['L', 'P']) assert.ok(share(k) <= 0.25, `hazard ${k} causes ${(100 * share(k)).toFixed(1)}% of summer deaths`);
});

// ---------------- Autumn (240-360 m): leaf wind ----------------

test('autumn speed and mist follow the SEASONS table', () => {
  assert.equal(C.speedAtH(240), 11);
  assert.equal(C.speedAtH(360), 12);
  assert.equal(C.speedAtH(500), 12);
  assert.equal(C.mistCapAtH(300), 0.90);
  for (const h of [240, 300, 359]) {
    const climb = C.speedAtH(h) * C.SIN_PITCH;
    const share = Math.min(C.mistCapAtH(h), C.BOTTOM_FRACTION * climb) / climb;
    assert.ok(share >= 0.535 && share <= 0.59 + 1e-9, `mist share ${share} at ${h}`);
  }
  const a = C.sAtHeight(220);
  const b = C.sAtHeight(380);
  let s = a;
  let n = 0;
  while (s < b) { s += C.speedAtH(C.heightAtS(s)) / 60000; n++; }
  assert.ok(Math.abs(C.travelTime(a, b) - n / 60000) < 1e-3);
});

test('autumn perfect bot: 20 seeds clear 360 m with zero deaths or Catches', () => {
  const before = C.travelTime(0, C.sAtHeight(240));
  const out = [];
  for (let seed = 1; seed <= 20; seed++) {
    const r = runPerfectBot(seed, 360, 60 * 600);
    assert.ok(r.cleared, `seed ${seed} failed at h=${r.h.toFixed(2)} reason=${r.deathReason}`);
    assert.equal(r.catchUsed, false);
    out.push(r.seconds - before);
  }
  console.log(`autumn clean time ${Math.min(...out).toFixed(2)}-${Math.max(...out).toFixed(2)} s`);
  for (const t of out) assert.ok(t >= 70 && t <= 90, `autumn time ${t}`);
});

test('autumn generator: open lane, gust pairs, branches, debut windows, calm transition', () => {
  const seen = {};
  let fallbacks = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const course = createCourse(seed);
    course.ensureUntil(C.sAtHeight(365));
    const rules = validateCourseRules(course.generated);
    assert.ok(rules.ok, `seed ${seed}: ${rules.reason} @${rules.index} ${rules.type}`);
    for (const ch of course.generated) {
      const h0 = C.heightAtS(ch.s0);
      if (h0 < 240) continue;
      seen[ch.type] = (seen[ch.type] || 0) + 1;
      if (ch.fallbackS0) fallbacks++;
      if (h0 < 255 - 1e-9) assert.equal(ch.type, 'S0', `calm transition chunk ${ch.type} at ${h0}`);
      if (h0 >= 360) assert.equal(ch.type, 'S0', 'winter not built: calm past 360 m');
      assert.ok(debutOk(ch), `debut stacking ${ch.type} at ${h0}`);
      assert.ok(gustClearOk(ch).ok, `gust shove into a blocked cell, seed ${seed}`);
      const gusts = ch.obstacles.filter((o) => o.type === 'gust' && o.leaf);
      assert.equal(gusts.length % 2, 0, 'leaf gusts come in pairs');
      for (let i = 0; i + 1 < gusts.length; i += 2) {
        assert.equal(gusts[0 + i].dir, -gusts[i + 1].dir, 'pair shoves one way then back');
        assert.ok(Math.abs(C.ticksBetween(gusts[i].contactS, gusts[i + 1].contactS) - C.LEAF_GUST_GAP_TICKS) < 1e-6, 'second shove 1.2 s later');
        assert.ok(C.heightAtS(gusts[i].s0) >= 255 - 1, 'gust before 255');
      }
      for (const r of ch.rows) {
        const open = [0, 1, 2].filter((l) => !(r.blockedLanes || []).includes(l));
        assert.ok(open.length >= 1, 'open lane');
        assert.ok(open.includes(r.designated));
        for (const l of r.branchLanes || []) if ((r.blockedLanes || []).includes(l)) assert.notEqual(l, r.designated, 'branch on the only open lane');
      }
      const branches = ch.obstacles.filter((o) => o.type === 'branch');
      for (const b of branches) assert.ok(C.heightAtS(b.s0) >= 265 - 1, 'branch before 265');
      if (ch.type === 'A6') {
        assert.equal(branches.length, 2);
        assert.notEqual(branches[0].lane, branches[1].lane, 'canopy branches in different lanes');
        assert.ok(C.ticksBetween(branches[0].contactS, branches[1].contactS) + 1e-6 >= C.BRANCH_STAGGER_TICKS, 'canopy >= 1.0 s apart');
      }
      if (ch.type === 'A5') {
        const g2 = gusts[1];
        const wall = ch.obstacles.find((o) => o.type === 'solid');
        assert.ok(C.ticksBetween(g2.contactS, wall.contactS) + 1e-6 >= C.GUST_PUSH_TICKS + C.GUST_CLEAR_AFTER_TICKS, 'wall >= 1.0 s after the second shove');
      }
    }
  }
  for (const t of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']) assert.ok((seen[t] || 0) > 20, `${t} too rare: ${seen[t]}`);
  console.log('autumn chunk mix (200 seeds):', JSON.stringify(seen), 'fallbacks', fallbacks);
});

test('autumn impossible layouts reject (gust into a blocked cell, stacked debut, branch on the only open lane)', () => {
  const s0 = C.sAtHeight(300);
  const g = makeGust(s0 + 8, 1, -1, { leaf: true });
  const stone = makeSolid(C.sAfterTicks(g.contactS, 20), 0);
  const into = { type: 'A5', s0, s1: s0 + C.CHUNK_LENGTH, obstacles: [g, stone], rows: [] };
  assert.equal(gustClearOk(into).ok, false);
  const offTrack = { type: 'A2', s0, s1: s0 + C.CHUNK_LENGTH, obstacles: [makeGust(s0 + 8, 0, -1, { leaf: true })], rows: [] };
  assert.equal(gustClearOk(offTrack).ok, false);

  const d0 = C.sAtHeight(270);
  const stacked = { type: 'A5', s0: d0, s1: d0 + C.CHUNK_LENGTH, obstacles: [makeGust(d0 + 6, 1, 1, { leaf: true }), makeBranch(d0 + 25, 0, false)], rows: [] };
  assert.equal(debutOk(stacked), false);

  const br = makeBranch(s0 + 10, 1, false);
  const onOpen = {
    type: 'A4', s0, s1: s0 + C.CHUNK_LENGTH, obstacles: [br],
    rows: [{ type: 'A4', s: br.s, contactS: br.contactS, designated: 1, openLanes: [0, 2], blockedLanes: [1], permanentlyOpen: [0, 2], branchLanes: [1] }],
  };
  assert.equal(validateChunk(onOpen, { lastDesignated: 1, lastContactS: -1e6 }).ok, false);
});

test('branches and leaf gusts: log is jumpable, high branch is not, gust shoves you over', () => {
  const log = makeBranch(16, 1, true);
  const hop = createSim({ course: createManualCourse([log]), seed: 1 });
  while (C.ticksBetween(hop.snapshot().s, log.contactS) > 12) hop.tick({});
  hop.tick({ jump: true });
  while (hop.snapshot().s < log.s1 + 1) hop.tick({});
  assert.equal(hop.mode, 'play', 'a jumped log is cleared');

  const stay = createSim({ course: createManualCourse([makeBranch(16, 1, true)]), seed: 1 });
  while (stay.mode === 'play' && stay.state.tick < 300) stay.tick({});
  assert.equal(stay.state.deathReason, 'branch');
  assert.equal(stay.state.deathHazard, 'B');

  const high = makeBranch(16, 1, false);
  const bonk = createSim({ course: createManualCourse([high]), seed: 1 });
  while (C.ticksBetween(bonk.snapshot().s, high.contactS) > 12) bonk.tick({});
  bonk.tick({ jump: true });
  while (bonk.mode === 'play' && bonk.state.tick < 300) bonk.tick({});
  assert.equal(bonk.state.deathReason, 'branch', 'a high branch cannot be jumped');

  const g = makeGust(14, 1, -1, { leaf: true });
  const g2 = makeGust(C.sAfterTicks(g.contactS, C.LEAF_GUST_GAP_TICKS) + C.GUST_DEPTH / 2 + C.PLAYER_DEPTH / 2, 0, 1, { leaf: true });
  const wind = createSim({ course: createManualCourse([g, g2]), seed: 1 });
  while (wind.snapshot().s < g.s1 + 4) wind.tick({});
  assert.equal(wind.snapshot().lane, 0, 'first shove moves you one lane left');
  while (wind.snapshot().s < g2.s1 + 4) wind.tick({});
  assert.equal(wind.snapshot().lane, 1, 'second shove moves you back right');
  assert.equal(wind.mode, 'play', 'a gust alone is not deadly');

  // Warnings: branch tell starts >= 0.9 s + 0.5 s out; gust tell >= 0.8 s out.
  const b = makeBranch(40, 2, false);
  const look = createSim({ course: createManualCourse([b, makeGust(40, 0, 1, { leaf: true })]), seed: 1 });
  let firstB = null;
  let firstG = null;
  while (look.snapshot().s < 38) {
    for (const w of look.warnings()) {
      if (w.obs.type === 'branch' && firstB == null) firstB = w.ticks;
      if (w.obs.type === 'gust' && firstG == null) firstG = w.ticks;
    }
    look.tick({});
  }
  assert.ok(firstB >= C.BRANCH_SHADOW_TICKS + C.BRANCH_LANDED_LEAD_TICKS - 1, `branch tell ${firstB}`);
  assert.ok(firstG >= C.GUST_WARN_TICKS - 1, `gust tell ${firstG}`);
});

test('autumn deaths by hazard: logged per hazard with the 25% flag (sloppy bot)', () => {
  const counts = {};
  let total = 0;
  let reached = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const sim = createSim({ seed, s: C.sAtHeight(240), h: 240, bottom: 228 });
    const rng = mulberry32(seed * 7919);
    let freeze = 0;
    while (sim.mode === 'play' && sim.snapshot().h < 360) {
      let inp = perfectBotInput(sim);
      if (freeze > 0) { freeze--; inp = { laneDir: 0, jump: false }; } else if (rng() < 0.012) freeze = 8 + Math.floor(rng() * 14);
      sim.tick(inp);
    }
    if (sim.mode !== 'play') { counts[sim.state.deathHazard] = (counts[sim.state.deathHazard] || 0) + 1; total++; } else reached++;
  }
  const share = (k) => (counts[k] || 0) / Math.max(total, 1);
  const flags = ['G', 'B'].filter((k) => share(k) > 0.25);
  console.log(`autumn deaths (300 sloppy runs): ${JSON.stringify(counts)} of ${total}; reached 360 m: ${reached}; G ${(100 * share('G')).toFixed(1)}%, B ${(100 * share('B')).toFixed(1)}%; FLAGGED: ${flags.join(',') || 'none'}`);
  assert.ok(total > 50, 'sloppy bot should die sometimes');
  // The gust shove must never be what kills you (it only moves you into clear cells).
  assert.ok(share('G') <= 0.25, `gust causes ${(100 * share('G')).toFixed(1)}% of autumn deaths`);
  // Branch share is reported as a flag for SEASONS/KAMI per the spec, not hidden or tuned away here.
});
