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

export function chunkSeed(seed, chunkIndex, attempt, version = C.COURSE_SALT) {
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

export function makeBolt(startS, lane, extras = {}) {
  const x = C.laneX(lane);
  const hw = C.SOLID_WIDTH / 2;
  const len = C.speedAtH(C.heightAtS(startS)) * C.BOLT_STRIKE_S;
  return {
    type: 'bolt',
    lane,
    lanes: [lane],
    s: startS + len / 2,
    depth: len,
    height: Infinity,
    x0: x - hw, x1: x + hw,
    s0: startS, s1: startS + len,
    contactS: startS - C.PLAYER_DEPTH / 2,
    warnTicks: C.BOLT_WARN_TICKS,
    disabled: false,
    ...extras,
  };
}

export function makePuddle(startS, lane, length, extras = {}) {
  const x = C.laneX(lane);
  const hw = C.SOLID_WIDTH / 2;
  return {
    type: 'puddle',
    lane,
    lanes: [lane],
    s: startS + length / 2,
    depth: length,
    height: 0,
    x0: x - hw, x1: x + hw,
    s0: startS, s1: startS + length,
    contactS: startS - C.PLAYER_DEPTH / 2,
    // The swipe lock ends this far along the track (0.4 s after stepping off).
    lockEndS: C.sAfterTicks(startS + length + C.PLAYER_DEPTH / 2, C.PUDDLE_LOCK_TICKS),
    disabled: false,
    ...extras,
  };
}

// Falling branch: a shadow grows for 0.9 s, then it lands and stays as a low log (jump it)
// or a high branch (dodge it). In the sim it is a static cell; the fall is only the tell.
export function makeBranch(s, lane, low, extras = {}) {
  const x = C.laneX(lane);
  const hw = C.SOLID_WIDTH / 2;
  const hd = C.BRANCH_DEPTH / 2;
  return {
    type: 'branch',
    low: !!low,
    lane,
    lanes: [lane],
    s,
    depth: C.BRANCH_DEPTH,
    height: low ? C.LOG_HEIGHT : C.HIGH_BRANCH_HEIGHT,
    x0: x - hw, x1: x + hw,
    s0: s - hd, s1: s + hd,
    contactS: C.contactS(s, C.BRANCH_DEPTH),
    warnTicks: C.BRANCH_SHADOW_TICKS + C.BRANCH_LANDED_LEAD_TICKS,
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
  const band = C.bandFor(h);
  if (band.calm) return { S0: 100 };
  const out = {};
  for (const [type, w] of Object.entries(band.weights)) {
    if (h + 1e-9 >= C.EARLIEST[type]) out[type] = w;
  }
  if ((hardStreak || 0) >= C.HARD_STREAK_LIMIT) {
    if (h >= C.SUMMER_HEIGHT) return { S0: 50, A1: 50 };
    return h >= C.SPRING_HEIGHT ? { S0: 50, U1: 50 } : { S0: 50, S1: 50 };
  }
  return out;
}

function otherLanes(lane) { return [0, 1, 2].filter(l => l !== lane); }

function pickAdjacent(rng, from, allowed = [0, 1, 2]) {
  const opts = allowed.filter(l => Math.abs(l - from) <= 1);
  if (!opts.length) return null;
  return opts[Math.floor(rng() * opts.length)];
}

export function placeContacts(n, chunkS0, lastContactS, gapTicks, rng, minFirstS = -1e9) {
  const sEnd = chunkS0 + C.CHUNK_LENGTH;
  let c = Math.max(C.sAfterTicks(lastContactS, gapTicks), chunkS0 + 5, minFirstS) + rng() * 2;
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
    boltLanes: fields.boltLanes || [],
    puddleLane: fields.puddleLane ?? null,
    spacingS: fields.spacingS ?? null,
    branchLanes: fields.branchLanes || [],
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

// ---------- Summer (120-240 m): storm ----------

function relabel(built, type) {
  if (!built) return null;
  built.type = type;
  for (const r of built.rows) r.type = type;
  for (const o of built.obstacles) o.rowType = type;
  return built;
}

function boltFloorS(ctx) {
  return ctx.lastBoltS > -1e5 ? C.sAfterTicks(ctx.lastBoltS, C.BOLT_MIN_APART_TICKS) + C.PLAYER_DEPTH / 2 : -1e9;
}

// One bolt in a non-designated lane; the other two lanes are open.
function boltRow(rng, c, prevDes, type) {
  const des = pickAdjacent(rng, prevDes);
  const others = otherLanes(des);
  const lane = others[Math.floor(rng() * others.length)];
  const bolt = makeBolt(c + C.PLAYER_DEPTH / 2, lane, { rowType: type });
  const open = [0, 1, 2].filter(l => l !== lane);
  return makeRow({
    type, s: bolt.s, depth: bolt.depth, contactS: bolt.contactS, designated: des,
    openLanes: open, blockedLanes: [lane], permanentlyOpen: open,
    obstacles: [bolt], boltLanes: [lane], kind: 'bolt',
  });
}

// Puddle in the designated lane; stones beside its entry in the other two lanes.
function puddleRow(rng, c, prevDes, type, length) {
  const des = pickAdjacent(rng, prevDes);
  const startS = c + C.PLAYER_DEPTH / 2;
  const puddle = makePuddle(startS, des, length, { rowType: type });
  const blocked = otherLanes(des);
  const stones = blocked.map(l => makeSolid(startS + C.SOLID_DEPTH / 2, l, { rowType: type }));
  const row = makeRow({
    type, s: puddle.s, depth: puddle.depth, contactS: puddle.contactS, designated: des,
    openLanes: [des], blockedLanes: blocked, permanentlyOpen: [des],
    obstacles: [puddle, ...stones], puddleLane: des, spacingS: puddle.lockEndS, kind: 'puddle',
  });
  row.puddle = puddle;
  return row;
}

function rowsToChunk(type, rows) {
  const obstacles = [];
  for (const r of rows) obstacles.push(...r.obstacles);
  return { type, rows, obstacles, designated: rows[rows.length - 1].designated };
}

function buildU1(rng, chunkS0, ctx, band) {
  return relabel(rng() < 0.55 ? buildS1(rng, chunkS0, ctx, band) : buildS2(rng, chunkS0, ctx, band), 'U1');
}

function buildU2(rng, chunkS0, ctx, band) {
  const n = 1 + (rng() < 0.4 ? 1 : 0);
  const gap = Math.max(band.gapTicks, C.BOLT_MIN_APART_TICKS);
  const contacts = placeContacts(n, chunkS0, ctx.lastContactS, band.gapTicks, rng, boltFloorS(ctx));
  if (!contacts.length) return null;
  const rows = [];
  let des = ctx.lastDesignated;
  for (let i = 0; i < contacts.length; i++) {
    let c = contacts[i];
    if (i > 0) c = Math.max(c, C.sAfterTicks(rows[i - 1].contactS, gap));
    if (c + 4 > chunkS0 + C.CHUNK_LENGTH - 4) break;
    const row = boltRow(rng, c, des, 'U2');
    rows.push(row);
    des = row.designated;
  }
  return rowsToChunk('U2', rows);
}

function buildU3(rng, chunkS0, ctx, band) {
  const contacts = placeContacts(1, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!contacts.length) return null;
  const length = C.PUDDLE_MIN + rng() * (C.PUDDLE_MAX - C.PUDDLE_MIN);
  if (contacts[0] + length + 2 > chunkS0 + C.CHUNK_LENGTH - 2) return null;
  return rowsToChunk('U3', [puddleRow(rng, contacts[0], ctx.lastDesignated, 'U3', length)]);
}

// Lightning on one of the two open lanes of a one-stone row; the third lane is open.
function buildU4(rng, chunkS0, ctx, band) {
  const contacts = placeContacts(1, chunkS0, ctx.lastContactS, band.gapTicks, rng, boltFloorS(ctx));
  if (!contacts.length) return null;
  const c = contacts[0];
  const des = pickAdjacent(rng, ctx.lastDesignated);
  const others = otherLanes(des);
  const boltLane = others[Math.floor(rng() * others.length)];
  const stoneLane = others.find(l => l !== boltLane);
  const bolt = makeBolt(c + C.PLAYER_DEPTH / 2, boltLane, { rowType: 'U4' });
  const stone = makeSolid(c + C.PLAYER_DEPTH / 2 + C.SOLID_DEPTH / 2, stoneLane, { rowType: 'U4' });
  const row = makeRow({
    type: 'U4', s: bolt.s, depth: bolt.depth, contactS: bolt.contactS, designated: des,
    openLanes: [des], blockedLanes: [boltLane, stoneLane], permanentlyOpen: [des],
    obstacles: [bolt, stone], boltLanes: [boltLane], kind: 'bolt',
  });
  return rowsToChunk('U4', [row]);
}

// Puddle, then a root hurdle on the puddle near its end (jump allowed on a puddle).
function buildU5(rng, chunkS0, ctx, band) {
  const contacts = placeContacts(1, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!contacts.length) return null;
  const c = contacts[0];
  const gap = Math.max(band.gapTicks, C.MIN_DECISION_GAP);
  const rootContact = C.sAfterTicks(c, gap) + rng() * 0.5;
  const rootS = rootContact + C.ROOT_DEPTH / 2 + C.PLAYER_DEPTH / 2;
  const startS = c + C.PLAYER_DEPTH / 2;
  const length = rootS + C.ROOT_DEPTH / 2 + 0.3 - startS;
  if (length < C.PUDDLE_MIN || length > C.PUDDLE_MAX) return null;
  if (startS + length + 2 > chunkS0 + C.CHUNK_LENGTH - 2) return null;
  const row1 = puddleRow(rng, c, ctx.lastDesignated, 'U5', length);
  const lane = row1.designated;
  const root = makeRoot(rootS, lane, { rowType: 'U5', hurdle: true });
  const row2 = makeRow({
    type: 'U5', s: rootS, depth: C.ROOT_DEPTH, designated: lane,
    openLanes: [0, 1, 2], blockedLanes: [], permanentlyOpen: [lane], rootedLanes: [lane],
    obstacles: [root], kind: 'hurdle', spacingS: row1.spacingS,
  });
  row1.spacingS = null;
  return rowsToChunk('U5', [row1, row2]);
}

// Alternating lightning and puddle rows, never both on the same row.
function buildU6(rng, chunkS0, ctx, band) {
  const sEnd = chunkS0 + C.CHUNK_LENGTH - 4;
  const gap = Math.max(band.gapTicks, C.MIN_DECISION_GAP);
  let kind = rng() < 0.5 ? 'bolt' : 'puddle';
  let last = ctx.lastContactS;
  let lastBolt = ctx.lastBoltS;
  let des = ctx.lastDesignated;
  const rows = [];
  for (let i = 0; i < 3; i++) {
    let c = Math.max(C.sAfterTicks(last, gap), chunkS0 + 5) + rng() * 1.5;
    if (kind === 'bolt' && lastBolt > -1e5) c = Math.max(c, C.sAfterTicks(lastBolt, C.BOLT_MIN_APART_TICKS) + 0.01);
    const length = C.PUDDLE_MIN + rng() * 2;
    const endS = kind === 'bolt' ? c + 4 : c + length + 2;
    if (endS > sEnd) break;
    const row = kind === 'bolt' ? boltRow(rng, c, des, 'U6') : puddleRow(rng, c, des, 'U6', length);
    rows.push(row);
    des = row.designated;
    last = row.spacingS ?? row.contactS;
    if (kind === 'bolt') lastBolt = row.contactS;
    kind = kind === 'bolt' ? 'puddle' : 'bolt';
  }
  if (rows.length < 2) return null;
  return rowsToChunk('U6', rows);
}


// ---------- Autumn (240-360 m): leaf wind ----------

function buildA1(rng, chunkS0, ctx, band) {
  return relabel(rng() < 0.55 ? buildS1(rng, chunkS0, ctx, band) : buildS2(rng, chunkS0, ctx, band), 'A1');
}

// A leaf-gust pair in the centre lane: a shove one lane left, then one lane right 1.2 s later.
// The centre lane is the only lane that can be shoved both ways without leaving the track, so
// the generator always puts the pair there ("moves the gust" rather than shove off the edge).
// All three lanes stay open; the shove destinations are clear cells.
function gustPairRows(rng, c, type) {
  const first = rng() < 0.5 ? -1 : 1;
  const g1 = makeGust(c + C.GUST_DEPTH / 2 + C.PLAYER_DEPTH / 2, 1, first, { rowType: type, leaf: true });
  const c2 = C.sAfterTicks(g1.contactS, C.LEAF_GUST_GAP_TICKS);
  const g2 = makeGust(c2 + C.GUST_DEPTH / 2 + C.PLAYER_DEPTH / 2, 1, -first, { rowType: type, leaf: true, pairOf: 2 });
  g1.pairOf = 1;
  const all = [0, 1, 2];
  const row1 = makeRow({
    type, s: g1.s, depth: C.GUST_DEPTH, contactS: g1.contactS, designated: 1,
    openLanes: all, blockedLanes: [], permanentlyOpen: all,
    obstacles: [g1], gustLane: 1, gustDir: first, kind: 'gust',
  });
  const row2 = makeRow({
    type, s: g2.s, depth: C.GUST_DEPTH, contactS: g2.contactS, designated: 1,
    openLanes: all, blockedLanes: [], permanentlyOpen: all,
    obstacles: [g2], gustLane: 1, gustDir: -first, kind: 'gust',
    // the next row waits until the second shove has finished
    spacingS: C.sAfterTicks(g2.contactS, C.GUST_PUSH_TICKS),
  });
  return [row1, row2];
}

function buildA2(rng, chunkS0, ctx, band) {
  if (Math.abs(ctx.lastDesignated - 1) > 1) return null;
  const contacts = placeContacts(1, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!contacts.length) return null;
  const rows = gustPairRows(rng, contacts[0], 'A2');
  if (rows[1].spacingS > chunkS0 + C.CHUNK_LENGTH - 4) return null;
  return rowsToChunk('A2', rows);
}

function branchRow(rng, c, prevDes, type, mode) {
  const des = pickAdjacent(rng, prevDes);
  const s = c + C.BRANCH_DEPTH / 2 + C.PLAYER_DEPTH / 2;
  if (mode === 'log') {
    // Low log: half the time it lands in your lane (jump it), otherwise beside you.
    const onPath = rng() < 0.5;
    const lane = onPath ? des : otherLanes(des)[Math.floor(rng() * 2)];
    const log = makeBranch(s, lane, true, { rowType: type, hurdle: onPath });
    return makeRow({
      type, s, depth: C.BRANCH_DEPTH, designated: des,
      openLanes: [0, 1, 2], blockedLanes: [], permanentlyOpen: onPath ? [des] : [0, 1, 2].filter(l => l !== lane),
      rootedLanes: [lane], obstacles: [log], kind: onPath ? 'hurdle-log' : 'log', branchLanes: [lane],
    });
  }
  const others = otherLanes(des);
  const lane = others[Math.floor(rng() * others.length)];
  const br = makeBranch(s, lane, false, { rowType: type });
  const open = [0, 1, 2].filter(l => l !== lane);
  return makeRow({
    type, s, depth: C.BRANCH_DEPTH, designated: des,
    openLanes: open, blockedLanes: [lane], permanentlyOpen: open,
    obstacles: [br], kind: 'branch', branchLanes: [lane],
  });
}

function buildA3(rng, chunkS0, ctx, band) {
  const n = 1 + (rng() < 0.4 ? 1 : 0);
  const contacts = placeContacts(n, chunkS0, ctx.lastContactS, Math.max(band.gapTicks, C.MIN_DECISION_GAP), rng);
  if (!contacts.length) return null;
  const rows = [];
  let des = ctx.lastDesignated;
  for (const c of contacts) {
    const row = branchRow(rng, c, des, 'A3', 'log');
    rows.push(row);
    des = row.designated;
  }
  return rowsToChunk('A3', rows);
}

function buildA4(rng, chunkS0, ctx, band) {
  const n = 1 + (rng() < 0.35 ? 1 : 0);
  const contacts = placeContacts(n, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!contacts.length) return null;
  const rows = [];
  let des = ctx.lastDesignated;
  for (const c of contacts) {
    const row = branchRow(rng, c, des, 'A4', 'high');
    rows.push(row);
    des = row.designated;
  }
  return rowsToChunk('A4', rows);
}

// Gust pair, then a two-stone row at least 1.0 s after the second shove ends.
function buildA5(rng, chunkS0, ctx, band) {
  if (Math.abs(ctx.lastDesignated - 1) > 1) return null;
  const contacts = placeContacts(1, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!contacts.length) return null;
  const [r1, r2] = gustPairRows(rng, contacts[0], 'A5');
  const wallC = C.sAfterTicks(r2.spacingS, Math.max(C.GUST_CLEAR_AFTER_TICKS, band.gapTicks, C.MIN_DECISION_GAP)) + rng() * 1.0;
  const wallS = wallC + C.SOLID_DEPTH / 2 + C.PLAYER_DEPTH / 2;
  if (r2.spacingS > chunkS0 + C.CHUNK_LENGTH - 4) return null;
  if (wallS + 2 > chunkS0 + C.CHUNK_LENGTH - 2) return null;
  const des = pickAdjacent(rng, 1);
  const blocked = otherLanes(des);
  const walls = blocked.map(l => makeSolid(wallS, l, { rowType: 'A5' }));
  const r3 = makeRow({
    type: 'A5', s: wallS, depth: C.SOLID_DEPTH, designated: des,
    openLanes: [des], blockedLanes: blocked, permanentlyOpen: [des], obstacles: walls, kind: 'wall',
  });
  return rowsToChunk('A5', [r1, r2, r3]);
}

// Canopy: two branches in different lanes, staggered >= 1.0 s apart.
function buildA6(rng, chunkS0, ctx, band) {
  const contacts = placeContacts(1, chunkS0, ctx.lastContactS, band.gapTicks, rng);
  if (!contacts.length) return null;
  const r1 = branchRow(rng, contacts[0], ctx.lastDesignated, 'A6', rng() < 0.5 ? 'high' : 'log');
  const c2 = C.sAfterTicks(r1.contactS, Math.max(C.BRANCH_STAGGER_TICKS, band.gapTicks)) + rng() * 1.2;
  if (c2 + 3 > chunkS0 + C.CHUNK_LENGTH - 3) return null;
  let r2 = null;
  for (let k = 0; k < 4 && !r2; k++) {
    const cand = branchRow(rng, c2, r1.designated, 'A6', 'high');
    if (cand.branchLanes[0] !== r1.branchLanes[0]) r2 = cand;
  }
  if (!r2) return null;
  return rowsToChunk('A6', [r1, r2]);
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
  if (type === 'U1') return buildU1(rng, chunkS0, ctx, band);
  if (type === 'U2') return buildU2(rng, chunkS0, ctx, band);
  if (type === 'U3') return buildU3(rng, chunkS0, ctx, band);
  if (type === 'U4') return buildU4(rng, chunkS0, ctx, band);
  if (type === 'U5') return buildU5(rng, chunkS0, ctx, band);
  if (type === 'U6') return buildU6(rng, chunkS0, ctx, band);
  if (type === 'A1') return buildA1(rng, chunkS0, ctx, band);
  if (type === 'A2') return buildA2(rng, chunkS0, ctx, band);
  if (type === 'A3') return buildA3(rng, chunkS0, ctx, band);
  if (type === 'A4') return buildA4(rng, chunkS0, ctx, band);
  if (type === 'A5') return buildA5(rng, chunkS0, ctx, band);
  if (type === 'A6') return buildA6(rng, chunkS0, ctx, band);
  return null;
}

export function finalizeChunk(built, index, chunkS0, ctx) {
  let n = 0;
  for (const o of built.obstacles) {
    o.id = o.id || `c${index}-o${n++}`;
    o.chunkIndex = index;
  }
  for (const r of built.rows) r.chunkIndex = index;
  let lastBoltS = ctx.lastBoltS ?? -1e6;
  for (const r of built.rows) if ((r.boltLanes || []).length) lastBoltS = Math.max(lastBoltS, r.contactS);
  const lastRow = built.rows[built.rows.length - 1];
  return {
    index,
    type: built.type,
    s0: chunkS0,
    s1: chunkS0 + C.CHUNK_LENGTH,
    rows: built.rows,
    obstacles: built.obstacles,
    designated: built.designated ?? ctx.lastDesignated,
    lastContactS: lastRow ? (lastRow.spacingS ?? lastRow.contactS) : ctx.lastContactS,
    lastDesignated: built.designated ?? ctx.lastDesignated,
    lastBoltS,
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
    lastBoltS: -1e6,
  };
}

export function generateChunk(seed, index, ctx, opts = {}) {
  const chunkS0 = opts.chunkS0 ?? index * C.CHUNK_LENGTH;
  const h0 = C.heightAtS(chunkS0);
  const validate = opts.validate || defaultValidate;

  if (index === 0 && !opts.forceType) {
    return { chunk: finalizeChunk(buildS0(ctx), index, chunkS0, ctx), attempts: 1, forcedS0: false };
  }
  if (C.bandFor(h0).calm && !opts.forceType) {
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
    lastBoltS: chunk.lastBoltS ?? ctx.lastBoltS ?? -1e6,
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
