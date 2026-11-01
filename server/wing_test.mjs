// node server/wing_test.mjs — wing boost + coins + dual-version replay
import { createSim, replay, packLog, unpackLog, SIM_VERSION, WING, T } from '../sim.js';
import * as sim5 from '../sim_v5.js';
import * as sim6 from '../sim_v6.js';
import { verifyRun, seedFor, periodKey } from './verify.mjs';
import { createWallet } from '../wallet.js';
import { ECONOMY } from '../economy.js';

let pass = 0, fail = 0;
const expect = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

expect('SIM_VERSION is tobu-sim-7', SIM_VERSION === 'tobu-sim-7');
expect('frozen v6 still tobu-sim-6', sim6.SIM_VERSION === 'tobu-sim-6');
expect('frozen v5 still tobu-sim-5', sim5.SIM_VERSION === 'tobu-sim-5');

// boosted jump
{
  const a = createSim({ seed: 3, wings0: 'autumn', nomist: true });
  const b = createSim({ seed: 3, nomist: true });
  for (const s of [a, b]) { s.P.state = 'ground'; s.P.coyote = 0.1; s.P.vel.y = 0; s.tick({ press: true, steer: 0 }); }
  expect('wing jump mul', Math.abs(a.P.vel.y - T.jumpVy * WING.jumpMul) < 1e-9, `vy=${a.P.vel.y}`);
  expect('base jump unchanged', Math.abs(b.P.vel.y - T.jumpVy) < 1e-9);
  expect('consumes a wing jump', a.P.wingJumps === WING.jumps - 1);
}

// glide lowers gravity briefly
{
  const s = createSim({ seed: 5, wings0: 'spring', nomist: true });
  s.P.state = 'ground'; s.P.coyote = 0.1; s.P.vel.y = 0;
  s.tick({ press: true, steer: 0 });
  const vy0 = s.P.vel.y;
  s.tick({ press: false, steer: 0 });
  const drop = vy0 - s.P.vel.y;
  const plain = createSim({ seed: 5, nomist: true });
  plain.P.state = 'ground'; plain.P.coyote = 0.1; plain.P.vel.y = 0;
  plain.tick({ press: true, steer: 0 }); const p0 = plain.P.vel.y; plain.tick({ press: false, steer: 0 });
  const dropPlain = p0 - plain.P.vel.y;
  expect('glide reduces gravity drop', drop < dropPlain - 0.01, `boostDrop=${drop.toFixed(3)} plain=${dropPlain.toFixed(3)}`);
}

// deterministic replay with wings0
{
  const sim = createSim({ seed: 7, board: 'free', wings0: 'summer', miss: 0.2 });
  let ticks = 0;
  while (sim.P.mode !== 'dead' && ticks++ < 25 * 60 * 120) sim.tick(sim.botInput());
  const h = Math.round(sim.P.maxH * 10) / 10;
  const r = replay(sim.log);
  expect('wing run replays', r.ok && r.dead && Math.abs(r.height - h) < 0.05, JSON.stringify({ok:r.ok,dead:r.dead,height:r.height,h}));
  expect('powered flag', sim.powered === true && r.powered === true);
  const wire = packLog(sim.log);
  const r2 = replay(unpackLog(wire));
  expect('packed wing log replays', r2.ok && Math.abs(r2.height - h) < 0.05);
}

// ranked: lane wing pickups do not grant boost
{
  const s = createSim({ seed: 11, board: 'daily', nomist: true });
  const w = s.wingPickups[0];
  s.P.pos.x = w.x; s.P.pos.y = w.y; s.tick({ press: false, steer: 0 });
  expect('ranked lane wing no boost', w.taken && !s.P.wings && !s.powered);
}

// coins accumulate from seeded pickups (forced proximity)
{
  const s = createSim({ seed: 9, nomist: true });
  const c0 = s.coinPickups[0];
  s.P.pos.x = c0.x; s.P.pos.y = c0.y; s.P.pos.z = 0; s.P.state = 'air';
  s.tick({ press: false, steer: 0 });
  expect('coin collected', c0.taken && s.P.coinsRun >= 1, `coins=${s.P.coinsRun}`);
}

// wing lane pickup activates boost
{
  const s = createSim({ seed: 11, nomist: true });
  const w = s.wingPickups[0];
  s.P.pos.x = w.x; s.P.pos.y = w.y; s.P.state = 'air';
  s.tick({ press: false, steer: 0 });
  expect('wing pickup activates', w.taken && s.P.wings === w.season && s.wingLive(), `wings=${s.P.wings}`);
}

// wallet buy / equip
{
  const mem = {}; const st = { getItem: k => mem[k] ?? null, setItem: (k, v) => mem[k] = v };
  const W = createWallet(st);
  W.debugSet({ coins: 100, gems: 20 });
  expect('buy spring coins', W.buy('spring', 'coins', 0) === 'ok' && W.coins === 100 - ECONOMY.wings.coinPrice.spring);
  expect('equip owned', W.equip('spring') === 'equipped' && W.active === 'spring');
  expect('funds fail', W.buy('winter', 'coins', 400) === 'funds');
  expect('gem buy summer', W.buy('summer', 'gems', 120) === 'ok' && W.owns('summer'));
  expect('iap stub', W.stubBuyGems('gems20').reason === 'stub');
  expect('ranked policy tag', ECONOMY.ranked.policy === 'tag-same-board');
}

// verify accepts sim-7; rejects unknown; still accepts frozen v5/v6
{
  const sim = createSim({ seed: 2, miss: 0.25 });
  let t = 0; while (sim.P.mode !== 'dead' && t++ < 20 * 60 * 120) sim.tick(sim.botInput());
  const h = Math.round(sim.P.maxH * 10) / 10;
  const ok = verifyRun({ log: sim.log, claim: { height: h, powered: !!sim.powered, wings: sim.log.wings0 ? [sim.log.wings0] : [] } });
  expect('verify sim-7 honest', ok.ok, JSON.stringify(ok));
  const bad = { ...sim.log, v: 'tobu-sim-0' };
  expect('unknown version rejected', !verifyRun({ log: bad, claim: { height: h } }).ok);
}

// v6 log still verifiable via frozen module
{
  const s6 = sim6.createSim({ seed: 4, miss: 0.3 });
  let t = 0; while (s6.P.mode !== 'dead' && t++ < 20 * 60 * 120) s6.tick(s6.botInput());
  const h = Math.round(s6.P.maxH * 10) / 10;
  const r = sim6.replay(s6.log);
  expect('v6 frozen replay', r.ok && Math.abs(r.height - h) < 0.05, JSON.stringify(r));
  const v = verifyRun({ log: s6.log, claim: { height: h } });
  expect('verify accepts tobu-sim-6', v.ok, JSON.stringify(v));
}

// v5 log still verifiable via frozen module (direct replay)
{
  const s5 = sim5.createSim({ seed: 4, miss: 0.3 });
  let t = 0; while (s5.P.mode !== 'dead' && t++ < 20 * 60 * 120) s5.tick(s5.botInput());
  const h = Math.round(s5.P.maxH * 10) / 10;
  const r = sim5.replay(s5.log);
  expect('v5 frozen replay', r.ok && Math.abs(r.height - h) < 0.05, JSON.stringify(r));
  // through verify once we wire dual-version
  const v = verifyRun({ log: s5.log, claim: { height: h } });
  expect('verify accepts tobu-sim-5', v.ok, JSON.stringify(v));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
