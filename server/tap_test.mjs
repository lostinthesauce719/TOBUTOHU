// node server/tap_test.mjs — tap-to-jump buffer / no air-spam (tobu-sim-7)
import { createSim, replay, SIM_VERSION, T, DT, WING } from '../sim.js';
import * as sim6 from '../sim_v6.js';
import * as sim5 from '../sim_v5.js';
import { verifyRun } from './verify.mjs';

let pass = 0, fail = 0;
const expect = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };

expect('SIM_VERSION is tobu-sim-7', SIM_VERSION === 'tobu-sim-7');
expect('jumpBuffer ~100-150ms', T.jumpBuffer >= 0.10 && T.jumpBuffer <= 0.15, `buf=${T.jumpBuffer}`);
expect('frozen v6 still tobu-sim-6', sim6.SIM_VERSION === 'tobu-sim-6');
expect('frozen v5 still tobu-sim-5', sim5.SIM_VERSION === 'tobu-sim-5');
expect('v6 buffer was 0.12', sim6.T.jumpBuffer === 0.12);

// ground tap → immediate jump
{
  const s = createSim({ seed: 1, nomist: true });
  s.P.state = 'ground'; s.P.coyote = 0.1; s.P.vel.y = 0; s.P.pos.y = 1;
  s.tick({ press: true, steer: 0 });
  expect('ground tap jumps', s.P.state === 'air' && s.P.vel.y > 10, `state=${s.P.state} vy=${s.P.vel.y}`);
  expect('tap recorded in log', s.log.taps.length === 1 && s.log.taps[0] === 0);
}

// wall tap → wall jump
{
  const s = createSim({ seed: 1, nomist: true });
  // place near a wallrun module wall
  let found = false;
  for (let i = 0; i < 800 && !found; i++) s.tick({ press: false, steer: 0 });
  // force wall state with a real wall probe target
  const wall = s.boxes.find(b => b.kind === 'wall' && !b.gone);
  expect('has a wall box', !!wall);
  if (wall) {
    s.P.mode = 'play';
    s.P.state = 'wall'; s.P.wallT = 0.2; s.P.lastWall = wall; s.P.wallSide = wall.x > 0 ? 1 : -1;
    s.P.wallN.x = wall.x > 0 ? -1 : 1; s.P.wallN.y = 0; s.P.wallN.z = 0;
    s.P.pos.x = wall.x - s.P.wallN.x * (wall.hx + s.P.r - 0.05);
    s.P.pos.y = wall.y; s.P.pos.z = wall.z;
    s.P.vel.x = 0; s.P.vel.y = 2; s.P.vel.z = -T.runSpeed;
    const j0 = s.P.stats.walljumps;
    s.tick({ press: true, steer: 0 });
    expect('wall tap wall-jumps', s.P.state === 'air' && s.P.stats.walljumps === j0 + 1 && s.P.vel.y > 8,
      `state=${s.P.state} wj=${s.P.stats.walljumps} vy=${s.P.vel.y}`);
  }
}

// buffer: tap slightly before landing still fires
{
  const s = createSim({ seed: 2, nomist: true });
  s.P.state = 'air'; s.P.coyote = 0; s.P.vel.y = -1; s.P.pos.y = 3; s.P.buffer = 0;
  s.tick({ press: true, steer: 0 }); // sets buffer while airborne
  expect('air tap arms buffer', s.P.buffer > 0 && s.P.vel.y < 0, `buf=${s.P.buffer} vy=${s.P.vel.y}`);
  // land within buffer window
  const ticks = Math.floor(T.jumpBuffer / DT) - 2; // still inside window
  for (let i = 0; i < ticks; i++) {
    s.P.state = 'air'; s.P.coyote = 0; // stay air until last moment
    if (i === ticks - 1) { s.P.state = 'ground'; s.P.coyote = T.coyote; s.P.vel.y = 0; }
    s.tick({ press: false, steer: 0 });
  }
  expect('buffered tap fires on land', s.P.state === 'air' && s.P.vel.y > 10, `state=${s.P.state} vy=${s.P.vel.y} buf=${s.P.buffer}`);
}

// buffer expires: tap too early does not jump on later land
{
  const s = createSim({ seed: 2, nomist: true });
  s.P.state = 'air'; s.P.coyote = 0; s.P.vel.y = -1;
  s.tick({ press: true, steer: 0 });
  const wait = Math.ceil(T.jumpBuffer / DT) + 3;
  for (let i = 0; i < wait; i++) { s.P.state = 'air'; s.P.coyote = 0; s.tick({ press: false, steer: 0 }); }
  expect('buffer expired', s.P.buffer <= 0, `buf=${s.P.buffer}`);
  s.P.state = 'ground'; s.P.coyote = T.coyote; s.P.vel.y = 0;
  const vyBefore = s.P.vel.y;
  s.tick({ press: false, steer: 0 });
  expect('expired buffer no jump', s.P.state === 'ground' && Math.abs(s.P.vel.y - vyBefore) < 1e-6,
    `state=${s.P.state} vy=${s.P.vel.y}`);
}

// no air-spam: rapid taps mid-air without coyote/wings don't create upward hops
{
  const s = createSim({ seed: 3, nomist: true });
  // Lift clear of shelves/walls so collide never re-grounds during the spam window.
  s.P.pos.x = 0; s.P.pos.y = 80; s.P.pos.z = -3;
  s.P.state = 'air'; s.P.coyote = 0; s.P.vel.x = 0; s.P.vel.y = -2; s.P.vel.z = 0;
  s.P.wings = null; s.P.wingJumps = 0; s.P.wingUntil = 0; s.P.glideUntil = 0; s.P.lastWall = null;
  // Clear geometry so probeWall/collide can't create a contact jump.
  s.boxes.length = 0;
  const vys = [];
  for (let i = 0; i < 30; i++) {
    s.tick({ press: true, steer: 0 });
    vys.push(s.P.vel.y);
  }
  expect('air spam stays falling', vys.every(v => v < 0), `maxVy=${Math.max(...vys)} state=${s.P.state}`);
  expect('many taps logged', s.log.taps.length === 30);
}

// one jump consumes buffer — second press same tick frame not needed; after jump need new contact
{
  const s = createSim({ seed: 4, nomist: true });
  s.P.state = 'ground'; s.P.coyote = 0.1; s.P.vel.y = 0;
  s.tick({ press: true, steer: 0 });
  const vy1 = s.P.vel.y;
  expect('first jump', vy1 > 10);
  // still air; press again — should only arm buffer, not stack extra jumpVy
  s.tick({ press: true, steer: 0 });
  expect('second air press no extra hop', s.P.vel.y < vy1, `vy1=${vy1} vy2=${s.P.vel.y}`);
}

// wing boost still multiplies contact jumps only
{
  const a = createSim({ seed: 3, wings0: 'autumn', nomist: true });
  a.P.state = 'ground'; a.P.coyote = 0.1; a.P.vel.y = 0;
  a.tick({ press: true, steer: 0 });
  expect('wing contact jump boosted', Math.abs(a.P.vel.y - T.jumpVy * WING.jumpMul) < 1e-9, `vy=${a.P.vel.y}`);
}

// dual-version verify: v6 + v7 honest runs
{
  const s7 = createSim({ seed: 8, miss: 0.2 });
  let t = 0; while (s7.P.mode !== 'dead' && t++ < 20 * 60 * 120) s7.tick(s7.botInput());
  const h7 = Math.round(s7.P.maxH * 10) / 10;
  const v7 = verifyRun({ log: s7.log, claim: { height: h7 } });
  expect('verify sim-7', v7.ok, JSON.stringify(v7));

  const s6 = sim6.createSim({ seed: 8, miss: 0.2 });
  t = 0; while (s6.P.mode !== 'dead' && t++ < 20 * 60 * 120) s6.tick(s6.botInput());
  const h6 = Math.round(s6.P.maxH * 10) / 10;
  const v6 = verifyRun({ log: s6.log, claim: { height: h6 } });
  expect('verify frozen sim-6', v6.ok, JSON.stringify(v6));

  const s5 = sim5.createSim({ seed: 4, miss: 0.3 });
  t = 0; while (s5.P.mode !== 'dead' && t++ < 20 * 60 * 120) s5.tick(s5.botInput());
  const h5 = Math.round(s5.P.maxH * 10) / 10;
  expect('verify frozen sim-5', verifyRun({ log: s5.log, claim: { height: h5 } }).ok);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
