import * as C from './config.mjs';
import { validateChunk as defaultValidate } from './fairness.mjs';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function chunkSeed(seed, chunkIndex, attempt, version = C.GENERATOR_VERSION) {
  const v = hashString(String(version));
  return (
    Math.imul(seed | 0, 0x9E3779B1) ^
    Math.imul((chunkIndex + 1) | 0, 0x85EBCA6B) ^
    Math.imul((attempt + 1) | 0, 0xC2B2AE35) ^
    v
  ) >>> 0;
}

export function makeRng(seed, chunkIndex, attempt) {
  return mulberry32(chunkSeed(seed, chunkIndex, attempt));
}

export function makeSolid(s, lane, extras = {}) {
  const x = C.laneX(lane);
  const hw = C.SOLID_WIDTH / 2;
  const hd = C.SOLID_DEPTH / 2;
  return {
    type: 'solid',
    lane,
    lanes: [lane],
    s,
    depth: C.SOLID_DEPTH,
    height: C.SOLID_HEIGHT,
    x0: x - hw, x1: x + hw,
    s0: s - hd, s1: s + hd,
    contactS: C.contactS(s, C.SOLID_DEPTH),
    disabled: false,
    ...extras,
  };
}

export function makeRoot(s, lane, extras = {}) {
  const x = C.laneX(lane);
  const hw = C.ROOT_WIDTH / 2;
  const hd = C.ROOT_DEPTH / 2;
  return {
    type: 'root',
    lane,
    lanes: [lane],
    s,
    depth: C.ROOT_DEPTH,
    height: C.ROOT_HEIGHT,
    x0: x - hw, x1: x + hw,
    s0: s - hd, s1: s + hd,
    contactS: C.contactS(s, C.ROOT_DEPTH),
    disabled: false,
    ...extras,
  };
}

export function makePad(startS, lane, length = C.PAD_LENGTH, extras = {}) {
  const x = C.laneX(lane);
  const hw = C.SOLID_WIDTH / 2;
  const s0 = startS;
  const s1 = startS + length;
  return {
    type: 'pad',
    lane,
    lanes: [lane],
    s: (s0 + s1) / 2,
    depth: length,
    height: 0,
    x0: x - hw, x1: x + hw,
    s0, s1,
    contactS: startS - C.PLAYER_DEPTH / 2,
    collapseTicks: C.PAD_COLLAPSE_TICKS,
    contactedTick: null,
    collapsed: false,
    disabled: false,
    ...extras,
  };
}

export function makeGust(s, lane, dir, extras = {}) {
  const x = C.laneX(lane);
  const hw = C.SOLID_WIDTH / 2;
  const hd = C.GUST_DEPTH / 2;
  return {
    type: 'gust',
    lane,
    lanes: [lane],
    dir,
    s,
    depth: C.GUST_DEPTH,
    height: 0,
    x0: x - hw, x1: x + hw,
    s0: s - hd, s1: s + hd,
    contactS: C.contactS(s, C.GUST_DEPTH),
    disabled: false,
    ...extras,
  };
}

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return 'S0';
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

export function eligibleWeights(h, hardStreak) {
  if (h >= C.SPRING_HEIGHT) return { S0: 100 };
  const band = C.bandFor(h);
  const out = {};
  for (const [type, w] of Object.entries(band.weights)) {
    if (h + 1e-9 >= C.EARLIEST[type]) out[type] = w;
  }
  if ((hardStreak || 0) >= C.HARD_STREAK_LIMIT) return { S0: 50, S1: 50 };
  return out;
}

function otherLanes(lane) { return [0, 1, 2].filter(l => l !== lane); }

function pickAdjacent(rng, from, allowed = [0, 1, 2]) {
  const opts = allowed.filter(l => Math.abs(l - from) <= 1);
  if (!opts.length) return null;
  return opts[Math.floor(rng() * opts.length)];
}

export function placeContacts(n, chunkS0, lastContactS, gapTicks, rng) {
  const sEnd = chunkS0 + C.CHUNK_LENGTH;
  let c = Math.max(C.sAfterTicks(lastContactS, gapTicks), chunkS0 + 5) + rng() * 2;
  const contacts = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) c = C.sAfterTicks(c, gapTicks) + rng() * 1.5;
    if (c + 2 > sEnd - 4) break;
    contacts.push(c);
  }
  return contacts;
}

function makeRow(fields) {
  const depth = fields.depth ?? C.SOLID_DEPTH;
  const s = fields.s;
  return {
    type: fields.type,
    s,
    depth,
    contactS: fields.contactS ?? C.contactS(s, depth),
    designated: fields.designated,
    openLanes: (fields.openLanes || []).slice(),
    blockedLanes: (fields.blockedLanes || []).slice(),
    permanentlyOpen: (fields.permanentlyOpen || fields.openLanes || []).slice(),
    rootedLanes: (fields.rootedLanes || []).slice(),
    obstacles: fields.obstacles || [],
    kind: fields.kind || null,
    padLanes: fields.padLanes || [],
    gustLane: fields.gustLane,
    gustDir: fields.gustDir,
  };
}

function buildS0(ctx) {
  return { type: 'S0', rows: [], obstacles: [], designated: ctx.lastDesignated };
}

function buildS1(rng, chunkS0, ctx, band) {
  const n = 2 + (rng() < 0.45 ? 1 : 0);
  const contacts = placeContacts(n, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!contacts.length) return null;
  const rows = [];
  const obstacles = [];
  let des = ctx.lastDesignated;
  for (const c of contacts) {
    des = pickAdjacent(rng, des);
    const others = otherLanes(des);
    const blocked = others[Math.floor(rng() * others.length)];
    const obs = makeSolid(c, blocked, { rowType: 'S1' });
    obstacles.push(obs);
    rows.push(makeRow({
      type: 'S1', s: c, depth: C.SOLID_DEPTH, designated: des,
      openLanes: [0, 1, 2].filter(l => l !== blocked),
      blockedLanes: [blocked],
      permanentlyOpen: [0, 1, 2].filter(l => l !== blocked),
      obstacles: [obs],
    }));
  }
  return { type: 'S1', rows, obstacles, designated: des };
}

function buildS2(rng, chunkS0, ctx, band) {
  const n = 1 + (rng() < 0.4 ? 1 : 0);
  const contacts = placeContacts(n, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!contacts.length) return null;
  const rows = [];
  const obstacles = [];
  let des = ctx.lastDesignated;
  for (const c of contacts) {
    des = pickAdjacent(rng, des);
    const blocked = otherLanes(des);
    const obs = blocked.map(l => makeSolid(c, l, { rowType: 'S2' }));
    obstacles.push(...obs);
    rows.push(makeRow({
      type: 'S2', s: c, depth: C.SOLID_DEPTH, designated: des,
      openLanes: [des], blockedLanes: blocked, permanentlyOpen: [des],
      obstacles: obs,
    }));
  }
  return { type: 'S2', rows, obstacles, designated: des };
}

function buildS3(rng, chunkS0, ctx, band, extraGap) {
  const gap = Math.max(band.gapTicks, extraGap || 0, C.MIN_DECISION_GAP);
  const n = 1 + (rng() < 0.35 ? 1 : 0);
  const contacts = placeContacts(n, chunkS0, ctx.lastContactS, gap, rng);
  if (!contacts.length) return null;
  const rows = [];
  const obstacles = [];
  let des = ctx.lastDesignated;
  for (const c of contacts) {
    des = pickAdjacent(rng, des);
    const others = otherLanes(des);
    const rooted = rng() < 0.55 ? others.slice() : [others[Math.floor(rng() * others.length)]];
    const obs = rooted.map(l => makeRoot(c, l, { rowType: 'S3' }));
    obstacles.push(...obs);
    rows.push(makeRow({
      type: 'S3', s: c, depth: C.ROOT_DEPTH, designated: des,
      openLanes: [0, 1, 2].filter(l => !rooted.includes(l)),
      blockedLanes: [],
      permanentlyOpen: [des],
      rootedLanes: rooted,
      obstacles: obs,
    }));
  }
  return { type: 'S3', rows, obstacles, designated: des };
}

function buildS4(rng, chunkS0, ctx, band) {
  const start = ctx.lastDesignated;
  let seq;
  if (start === 0) seq = [0, 1, 2, 1];
  else if (start === 2) seq = [2, 1, 0, 1];
  else seq = rng() < 0.5 ? [1, 0, 1, 2] : [1, 2, 1, 0];
  const contacts = placeContacts(seq.length, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (contacts.length < seq.length) return null;
  const rows = [];
  const obstacles = [];
  for (let i = 0; i < seq.length; i++) {
    const des = seq[i];
    const c = contacts[i];
    const blocked = otherLanes(des);
    const obs = blocked.map(l => makeSolid(c, l, { rowType: 'S4' }));
    obstacles.push(...obs);
    rows.push(makeRow({
      type: 'S4', s: c, depth: C.SOLID_DEPTH, designated: des,
      openLanes: [des], blockedLanes: blocked, permanentlyOpen: [des],
      obstacles: obs,
    }));
  }
  return { type: 'S4', rows, obstacles, designated: seq[seq.length - 1] };
}

function buildS5(rng, chunkS0, ctx, band) {
  const contacts = placeContacts(1, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!contacts.length) return null;
  const startS = contacts[0];
  if (startS + C.PAD_LENGTH > chunkS0 + C.CHUNK_LENGTH - 3) return null;
  let des = pickAdjacent(rng, ctx.lastDesignated);
  const others = otherLanes(des);
  const padLane = others[Math.floor(rng() * others.length)];
  const blockLane = others.find(l => l !== padLane);
  const pad = makePad(startS, padLane, C.PAD_LENGTH, { rowType: 'S5' });
  const wall = makeSolid(startS + C.SOLID_DEPTH / 2, blockLane, { rowType: 'S5' });
  const rows = [makeRow({
    type: 'S5',
    s: startS + C.PAD_LENGTH / 2,
    depth: C.PAD_LENGTH,
    contactS: pad.contactS,
    designated: des,
    openLanes: [des, padLane],
    blockedLanes: [blockLane],
    permanentlyOpen: [des],
    padLanes: [padLane],
    obstacles: [pad, wall],
  })];
  return { type: 'S5', rows, obstacles: [pad, wall], designated: des };
}

function buildS6(rng, chunkS0, ctx, band) {
  const contacts = placeContacts(1, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!contacts.length) return null;
  const c = contacts[0];
  const des = ctx.lastDesignated;
  const candidates = otherLanes(des).filter(l => Math.abs(l - des) === 1);
  if (!candidates.length) return null;
  const lane = candidates[Math.floor(rng() * candidates.length)];
  const dir = Math.sign(des - lane);
  if (lane + dir < 0 || lane + dir > 2) return null;
  const gust = makeGust(c, lane, dir, { rowType: 'S6' });
  const rows = [makeRow({
    type: 'S6', s: c, depth: C.GUST_DEPTH, designated: des,
    openLanes: [0, 1, 2], blockedLanes: [], permanentlyOpen: [0, 1, 2],
    obstacles: [gust], gustLane: lane, gustDir: dir,
  })];
  return { type: 'S6', rows, obstacles: [gust], designated: des };
}

function buildS7(rng, chunkS0, ctx, band) {
  const first = placeContacts(1, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!first.length) return null;
  const rootS = first[0];
  let des = pickAdjacent(rng, ctx.lastDesignated);
  const others = otherLanes(des);
  const rooted = rng() < 0.6 ? others.slice() : [others[Math.floor(rng() * others.length)]];
  const roots = rooted.map(l => makeRoot(rootS, l, { rowType: 'S7' }));
  const row1 = makeRow({
    type: 'S7', s: rootS, depth: C.ROOT_DEPTH, designated: des,
    openLanes: [0, 1, 2].filter(l => !rooted.includes(l)),
    blockedLanes: [], permanentlyOpen: [des], rootedLanes: rooted,
    obstacles: roots, kind: 'root',
  });
  const wallS = C.sAfterTicks(row1.contactS, Math.max(band.gapTicks, C.S7_SPACING_TICKS)) + rng() * 1.2;
  if (wallS + 2 > chunkS0 + C.CHUNK_LENGTH - 4) return null;
  const des2 = pickAdjacent(rng, des);
  const blocked = otherLanes(des2);
  const walls = blocked.map(l => makeSolid(wallS, l, { rowType: 'S7' }));
  const row2 = makeRow({
    type: 'S7', s: wallS, depth: C.SOLID_DEPTH, designated: des2,
    openLanes: [des2], blockedLanes: blocked, permanentlyOpen: [des2],
    obstacles: walls, kind: 'wall',
  });
  return { type: 'S7', rows: [row1, row2], obstacles: [...roots, ...walls], designated: des2 };
}

export function buildTypedChunk(type, rng, chunkS0, ctx) {
  const band = C.bandFor(C.heightAtS(chunkS0));
  if (type === 'S0') return buildS0(ctx);
  if (type === 'S1') return buildS1(rng, chunkS0, ctx, band);
  if (type === 'S2') return buildS2(rng, chunkS0, ctx, band);
  if (type === 'S3') return buildS3(rng, chunkS0, ctx, band);
  if (type === 'S4') return buildS4(rng, chunkS0, ctx, band);
  if (type === 'S5') return buildS5(rng, chunkS0, ctx, band);
  if (type === 'S6') return buildS6(rng, chunkS0, ctx, band);
  if (type === 'S7') return buildS7(rng, chunkS0, ctx, band);
  return null;
}

export function finalizeChunk(built, index, chunkS0, ctx) {
  let n = 0;
  for (const o of built.obstacles) {
    o.id = o.id || `c${index}-o${n++}`;
    o.chunkIndex = index;
  }
  for (const r of built.rows) r.chunkIndex = index;
  return {
    index,
    type: built.type,
    s0: chunkS0,
    s1: chunkS0 + C.CHUNK_LENGTH,
    rows: built.rows,
    obstacles: built.obstacles,
    designated: built.designated ?? ctx.lastDesignated,
    lastContactS: built.rows.length ? built.rows[built.rows.length - 1].contactS : ctx.lastContactS,
    lastDesignated: built.designated ?? ctx.lastDesignated,
    fallbackS0: !!built.fallbackS0,
  };
}

export function emptyCtx() {
  return {
    lastContactS: -1e6,
    lastDesignated: C.INITIAL_LANE,
    hardStreak: 0,
    lastType: null,
    admittedLanes: [C.INITIAL_LANE],
  };
}

export function generateChunk(seed, index, ctx, opts = {}) {
  const chunkS0 = opts.chunkS0 ?? index * C.CHUNK_LENGTH;
  const h0 = C.heightAtS(chunkS0);
  const validate = opts.validate || defaultValidate;

  if (index === 0 && !opts.forceType) {
    return { chunk: finalizeChunk(buildS0(ctx), index, chunkS0, ctx), attempts: 1, forcedS0: false };
  }
  if (h0 >= C.SPRING_HEIGHT && !opts.forceType) {
    return { chunk: finalizeChunk(buildS0(ctx), index, chunkS0, ctx), attempts: 1, forcedS0: false, calm: true };
  }

  let weights = eligibleWeights(h0, ctx.hardStreak || 0);
  if (opts.forceType) weights = { [opts.forceType]: 100 };

  for (let attempt = 0; attempt < C.MAX_GEN_ATTEMPTS; attempt++) {
    const rng = makeRng(seed, index, attempt);
    const type = pickWeighted(rng, weights);
    const raw = opts.forceFail ? null : buildTypedChunk(type, rng, chunkS0, ctx);
    if (!raw) continue;
    const chunk = finalizeChunk(raw, index, chunkS0, ctx);
    const verdict = validate(chunk, ctx);
    if (verdict.ok) return { chunk, attempts: attempt + 1, forcedS0: false };
  }
  const chunk = finalizeChunk({ ...buildS0(ctx), fallbackS0: true }, index, chunkS0, ctx);
  chunk.fallbackS0 = true;
  return { chunk, attempts: C.MAX_GEN_ATTEMPTS, forcedS0: true };
}

export function nextCtx(ctx, chunk) {
  const isHard = C.HARD_TYPES.includes(chunk.type) && !chunk.fallbackS0;
  return {
    lastContactS: chunk.lastContactS,
    lastDesignated: chunk.lastDesignated,
    hardStreak: isHard ? (ctx.hardStreak || 0) + 1 : 0,
    lastType: chunk.type,
    admittedLanes: [chunk.lastDesignated],
  };
}

export function createCourse(seed, opts = {}) {
  const chunks = [];
  const generated = [];
  const recoveries = [];
  let ctx = emptyCtx();
  let locked = !!opts.lockGeneration;

  let retiredDesignated = C.INITIAL_LANE;

  function nextIndex() {
    return chunks.length ? chunks[chunks.length - 1].index + 1 : 0;
  }

  function appendChunk(extra = {}) {
    const index = nextIndex();
    const result = generateChunk(seed, index, ctx, { ...opts, ...extra });
    chunks.push(result.chunk);
    generated.push(result.chunk);
    ctx = nextCtx(ctx, result.chunk);
    return result;
  }

  function dropOld(s) {
    const minS = s - C.KEEP_BEHIND * C.CHUNK_LENGTH;
    while (chunks.length > C.KEEP_AHEAD + C.KEEP_BEHIND + 1 && chunks[0].s1 < minS) {
      retiredDesignated = chunks[0].lastDesignated;
      chunks.shift();
    }
  }

  function ensureUntil(s) {
    if (!locked) {
      const needEnd = s + C.KEEP_AHEAD * C.CHUNK_LENGTH;
      while ((chunks.length ? chunks[chunks.length - 1].s1 : 0) < needEnd) appendChunk();
    }
    dropOld(s);
  }

  function lock() { locked = true; }

  function residentWindow(s) {
    const minS = s - C.KEEP_BEHIND * C.CHUNK_LENGTH;
    const maxS = s + C.KEEP_AHEAD * C.CHUNK_LENGTH;
    return chunks.filter(c => c.s1 >= minS && c.s0 <= maxS);
  }

  function allRows() {
    const rows = [];
    for (const c of chunks) for (const r of c.rows) rows.push(r);
    return rows;
  }

  function designatedLaneAt(s) {
    let d = retiredDesignated;
    for (const r of allRows()) if (r.contactS <= s) d = r.designated;
    return d;
  }

  function isRecovered(o) {
    for (const r of recoveries) {
      if (o.s0 < r.toS && o.s1 > r.fromS) return true;
    }
    return false;
  }

  function obstaclesInRange(s0, s1) {
    const out = [];
    for (const c of chunks) {
      if (c.s1 < s0 - 2 || c.s0 > s1 + 2) continue;
      for (const o of c.obstacles) {
        if (o.s1 < s0 || o.s0 > s1) continue;
        out.push(isRecovered(o) ? Object.assign({}, o, { disabled: true }) : o);
      }
    }
    return out;
  }

  function addRecovery(fromS, toS) {
    recoveries.push({ fromS, toS });
    for (const c of chunks) {
      for (const o of c.obstacles) {
        if (o.s0 < toS && o.s1 > fromS) o.disabled = true;
      }
    }
  }

  function nextDecision(s) {
    for (const r of allRows()) if (r.contactS > s) return r;
    return null;
  }

  appendChunk();

  return {
    seed,
    chunks,
    generated,
    recoveries,
    appendChunk,
    ensureUntil,
    residentWindow,
    allRows,
    designatedLaneAt,
    obstaclesInRange,
    addRecovery,
    nextDecision,
    lock,
    get ctx() { return ctx; },
    get locked() { return locked; },
  };
}

export function createManualCourse(obstacles = [], rows = []) {
  const course = createCourse(1, { forceType: 'S0' });
  course.chunks.length = 0;
  const sMax = obstacles.reduce((m, o) => Math.max(m, o.s1 || o.s || 0), 80);
  const count = Math.max(3, Math.ceil((sMax + 40) / C.CHUNK_LENGTH));
  for (let i = 0; i < count; i++) {
    course.chunks.push({
      index: i,
      type: 'S0',
      s0: i * C.CHUNK_LENGTH,
      s1: (i + 1) * C.CHUNK_LENGTH,
      rows: [],
      obstacles: [],
      designated: C.INITIAL_LANE,
      lastContactS: -1e6,
      lastDesignated: C.INITIAL_LANE,
    });
  }
  for (const o of obstacles) {
    const idx = Math.max(0, Math.min(course.chunks.length - 1, Math.floor((o.s || o.s0 || 0) / C.CHUNK_LENGTH)));
    course.chunks[idx].obstacles.push(o);
  }
  for (const r of rows) {
    const idx = Math.max(0, Math.min(course.chunks.length - 1, Math.floor((r.s || r.contactS || 0) / C.CHUNK_LENGTH)));
    course.chunks[idx].rows.push(r);
  }
  course.lock();
  return course;
}
