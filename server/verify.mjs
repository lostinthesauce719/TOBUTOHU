// Tobu replay check. The phone sends {log, claim:{height}}; we rerun sim.js and only accept the height we reproduce.
// Run: node server/verify.mjs [port]   POST /verify   GET /seed?board=daily|weekly
import http from 'node:http';
import { createHash } from 'node:crypto';
import { replay, unpackLog, SIM_VERSION, DT, ADAPT_MIN, ADAPT_MAX } from '../sim.js';

const SALT = process.env.TOBU_SEED_SALT || 'dev-salt-change-me'; // keeps daily/weekly seeds unknown until the period opens
export function periodKey(board, now = new Date()) {
  if (board === 'daily') return now.toISOString().slice(0, 10);              // UTC day
  if (board === 'weekly') { const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);    // ISO week
    const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return d.getUTCFullYear() + '-W' + String(Math.ceil(((d - y0) / 864e5 + 1) / 7)).padStart(2, '0'); }
  return null;
}
export function seedFor(board, key, salt = SALT) { return createHash('sha256').update(`${salt}|${board}|${key}`).digest().readUInt32BE(0); }

const MAX_TAPS_PER_SEC = 25;   // faster than any thumb; the test bot taps at most 10/s
const GRACE_MS = 15 * 60 * 1000; // a run started just before midnight UTC still counts for that day

export function verifyRun(body, { now = new Date(), salt = SALT } = {}) {
  const claim = body?.claim; let log; try { log = unpackLog(body?.log); } catch { return { ok: false, reason: 'bad input log' }; }
  if (!log || log.v !== SIM_VERSION) return { ok: false, reason: 'old or unknown game version' };
  if (!['free', 'daily', 'weekly', 'alltime'].includes(log.board)) return { ok: false, reason: 'unknown board' };
  // ranked seeds come from the server, never the phone
  if (log.board === 'daily' || log.board === 'weekly') {
    const keys = new Set([periodKey(log.board, now), periodKey(log.board, new Date(now - GRACE_MS))]);
    if (![...keys].some(k => seedFor(log.board, k, salt) === log.seed)) return { ok: false, reason: 'seed is not this period\'s seed' };
    if (log.adapt !== 1) return { ok: false, reason: 'skill adaptation must be off on daily and weekly' };
  } else if (!(log.adapt >= ADAPT_MIN && log.adapt <= ADAPT_MAX)) return { ok: false, reason: 'adapt out of range' };
  // input sanity before spending CPU
  const taps = log.taps, st = log.steer;
  if (!Array.isArray(taps) || !Array.isArray(st)) return { ok: false, reason: 'bad input log' };
  for (let i = 1; i < taps.length; i++) if (!(taps[i] > taps[i - 1])) return { ok: false, reason: 'taps out of order' };
  for (let i = 0; i < st.length; i++) { const [t, q] = st[i]; if (!Number.isInteger(t) || !Number.isInteger(q) || q < -127 || q > 127 || (i && t <= st[i - 1][0])) return { ok: false, reason: 'bad steer log' }; }
  const win = Math.round(1 / DT);
  for (let i = 0, j = 0; i < taps.length; i++) { while (taps[i] - taps[j] >= win) j++; if (i - j + 1 > MAX_TAPS_PER_SEC) return { ok: false, reason: 'tap rate faster than a human' }; }
  // the actual check
  const r = replay(log);
  if (!r.ok) return { ok: false, reason: r.reason };
  if (!r.dead) return { ok: false, reason: 'run did not end in the replay' };
  if (Math.abs(r.height - (+claim?.height)) > 0.05) return { ok: false, reason: `claimed ${claim?.height} m, replay says ${r.height} m`, height: r.height };
  return { ok: true, height: r.height, seconds: Math.round(r.t), board: log.board, catchUsed: r.stats.catch > 0 };
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
