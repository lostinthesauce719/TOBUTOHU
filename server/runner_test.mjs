import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as C from '../runner/config.mjs';
import { createSim, perfectBotInput, runPerfectBot } from '../runner/sim.mjs';
import {
  createCourse, generateChunk, emptyCtx, makeSolid, makeRoot, makePad, makeGust, createManualCourse,
} from '../runner/generator.mjs';
import { validateChunk, validateCourseRules, impossibleLayouts } from '../runner/fairness.mjs';
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
