// Tobu replay check. The phone sends {log, claim:{height}}; we rerun sim.js and only accept the height we reproduce.
// Run: node server/verify.mjs [port]   POST /verify   GET /seed?board=daily|weekly
// Known sim versions: tobu-sim-7 (current), tobu-sim-6 (sim_v6.js), tobu-sim-5 (sim_v5.js). Unknown versions rejected.
import http from 'node:http';
import { createHash } from 'node:crypto';
import { replay as replay7, unpackLog, SIM_VERSION, DT, ADAPT_MIN, ADAPT_MAX } from '../sim.js';
import { replay as replay6, SIM_VERSION as SIM_V6 } from '../sim_v6.js';
import { replay as replay5, SIM_VERSION as SIM_V5 } from '../sim_v5.js';

const SALT = process.env.TOBU_SEED_SALT || 'dev-salt-change-me';
export const RESET_OFFSET_MS = 7 * 3600e3;
export function periodKey(board, now = new Date()) {
  const t = new Date(now.getTime() - RESET_OFFSET_MS);
  if (board === 'daily') return 'D' + t.toISOString().slice(0, 10);
  if (board === 'weekly') { const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - t.getUTCDay()));
    return 'W' + d.toISOString().slice(0, 10); }
  return null;
}
export function seedFor(board, key, salt = SALT) { return createHash('sha256').update(`${salt}|${board}|${key}`).digest().readUInt32BE(0); }

const MAX_TAPS_PER_SEC = 25;
const GRACE_MS = 15 * 60 * 1000;
const KNOWN = new Set([SIM_VERSION, SIM_V6, SIM_V5]);

function replayFor(log) {
  if (log.v === SIM_VERSION) return replay7(log);
  if (log.v === SIM_V6) return replay6(log);
  if (log.v === SIM_V5) return replay5(log);
  return { ok: false, reason: 'version' };
}

export function verifyRun(body, { now = new Date(), salt = SALT } = {}) {
  const claim = body?.claim; let log; try { log = unpackLog(body?.log); } catch { return { ok: false, reason: 'bad input log' }; }
  if (!log || !KNOWN.has(log.v)) return { ok: false, reason: 'old or unknown game version' };
  if (!['free', 'daily', 'weekly', 'alltime'].includes(log.board)) return { ok: false, reason: 'unknown board' };
  if (log.board === 'daily' || log.board === 'weekly') {
    const keys = new Set([periodKey(log.board, now), periodKey(log.board, new Date(now - GRACE_MS))]);
    if (![...keys].some(k => seedFor(log.board, k, salt) === log.seed)) return { ok: false, reason: 'seed is not this period\'s seed' };
    if (log.adapt !== 1) return { ok: false, reason: 'skill adaptation must be off on daily and weekly' };
  } else if (!(log.adapt >= ADAPT_MIN && log.adapt <= ADAPT_MAX)) return { ok: false, reason: 'adapt out of range' };
  const taps = log.taps, st = log.steer;
  if (!Array.isArray(taps) || !Array.isArray(st)) return { ok: false, reason: 'bad input log' };
  for (let i = 1; i < taps.length; i++) if (!(taps[i] > taps[i - 1])) return { ok: false, reason: 'taps out of order' };
  for (let i = 0; i < st.length; i++) { const [t, q] = st[i]; if (!Number.isInteger(t) || !Number.isInteger(q) || q < -127 || q > 127 || (i && t <= st[i - 1][0])) return { ok: false, reason: 'bad steer log' }; }
  const win = Math.round(1 / DT);
  for (let i = 0, j = 0; i < taps.length; i++) { while (taps[i] - taps[j] >= win) j++; if (i - j + 1 > MAX_TAPS_PER_SEC) return { ok: false, reason: 'tap rate faster than a human' }; }
  const r = replayFor(log);
  if (!r.ok) return { ok: false, reason: r.reason };
  if (!r.dead) return { ok: false, reason: 'run did not end in the replay' };
  if (Math.abs(r.height - (+claim?.height)) > 0.05) return { ok: false, reason: `claimed ${claim?.height} m, replay says ${r.height} m`, height: r.height };
  // Honest ranked tag: powered runs stay on the same board; UI shows a wing glyph (ECONOMY.ranked).
  const powered = !!(r.powered || log.wings0);
  return {
    ok: true, height: r.height, seconds: Math.round(r.t), board: log.board,
    catchUsed: r.stats.catch > 0, powered, wings: log.wings0 ? [log.wings0] : [],
    v: log.v,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = +process.argv[2] || 8787;
  http.createServer((req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'OPTIONS') return send(204, {});
    const u = new URL(req.url, 'http://x');
    if (req.method === 'GET' && u.pathname === '/seed') { const b = u.searchParams.get('board'); const k = periodKey(b); if (!k) return send(400, { error: 'board' }); return send(200, { board: b, period: k, seed: seedFor(b, k), v: SIM_VERSION }); }
    if (req.method === 'POST' && u.pathname === '/verify') { let s = ''; req.on('data', c => { s += c; if (s.length > 2e6) req.destroy(); });
      req.on('end', () => { try { const t0 = Date.now(); const out = verifyRun(JSON.parse(s)); out.ms = Date.now() - t0; send(out.ok ? 200 : 422, out); } catch (e) { send(400, { ok: false, reason: 'bad json' }); } }); return; }
    send(404, { error: 'not found' });
  }).listen(port, () => console.log('tobu verify on :' + port));
}
