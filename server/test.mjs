// node server/test.mjs — record bot runs, then try to cheat them past the replay check.
import { createSim, packLog } from '../sim.js';
import { gzipSync } from 'node:zlib';
import { verifyRun, seedFor, periodKey } from './verify.mjs';
const now = new Date(); let pass = 0, fail = 0;
const expect = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
function play(seed, board = 'free', o = {}) { const sim = createSim({ seed, board, ...o }); while (sim.P.mode !== 'dead' && sim.ticks < 59 * 60 * 120 /* replay cap is 60 min; the fixed bot now outlives 25 min on seed 1 */) sim.tick(sim.botInput()); return sim; }
const clone = x => JSON.parse(JSON.stringify(x));

// 1) honest runs pass, height reproduced exactly
for (const s of [1, 2, 4, 6, 8]) { const sim = play(s, 'free', { miss: 0.1 }); const h = Math.round(sim.P.maxH * 10) / 10;
  const r = verifyRun({ log: sim.log, claim: { height: h } }); expect(`honest free run seed ${s} (${h} m)`, r.ok, JSON.stringify(r)); }
const dseed = seedFor('daily', periodKey('daily', now)); const D = play(dseed, 'daily', { miss: 0.35 }); const dh = Math.round(D.P.maxH * 10) / 10;
expect(`honest daily run (${dh} m, Catch used: ${D.P.stats.catch > 0})`, verifyRun({ log: D.log, claim: { height: dh } }).ok);
// 2) cheats
const L = D.log;
let r = verifyRun({ log: L, claim: { height: dh + 50 } }); expect('inflated height rejected', !r.ok, r.reason);
let x = clone(L); x.taps.splice(x.taps.length >> 1, 10); r = verifyRun({ log: x, claim: { height: dh } }); expect('edited taps rejected', !r.ok, r.reason); // 10 taps: a single dropped tap can be a true no-op (e.g. a buffered tap mid-air), which replays identically and isn't a cheat
x = clone(L); x.seed = 12345; r = verifyRun({ log: x, claim: { height: dh } }); expect('picked own seed on daily rejected', !r.ok, r.reason);
x = clone(L); x.adapt = 0.85; r = verifyRun({ log: x, claim: { height: dh } }); expect('slower mist on daily rejected', !r.ok, r.reason);
x = clone(L); x.end -= 240; r = verifyRun({ log: x, claim: { height: dh } }); expect('run cut short before death rejected', !r.ok, r.reason);
x = clone(L); x.taps = [...Array(400)].map((_, i) => 1000 + i * 2); r = verifyRun({ log: x, claim: { height: dh } }); expect('machine-gun tapping rejected', !r.ok, r.reason);
x = clone(L); x.v = 'tobu-sim-0'; r = verifyRun({ log: x, claim: { height: dh } }); expect('old build rejected', !r.ok, r.reason);
// 3) cost
let big = null; for (const s of [11, 12, 13, 14, 15, 16, 17, 18]) { const g = play(s, 'free', { miss: 0.03 }); if (g.P.mode === 'dead' && (!big || g.ticks > big.ticks)) big = g; }
const wire = packLog(big.log), bh = Math.round(big.P.maxH * 10) / 10; const t0 = Date.now(); const rb = verifyRun({ log: wire, claim: { height: bh } });
expect(`longest honest run, packed (${bh} m, ${(big.ticks / 120 / 60).toFixed(1)} min): ${(gzipSync(JSON.stringify(wire)).length / 1024).toFixed(0)} KB gzipped, checked in ${Date.now() - t0} ms`, rb.ok, rb.reason || '');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
