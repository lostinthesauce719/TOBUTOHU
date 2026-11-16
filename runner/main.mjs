import * as C from './config.mjs';
import { createSim } from './sim.mjs';
import { createGestureTracker, createInputQueue } from './controls.mjs';
import { createRenderer } from './render.mjs';
import { createScoreboard, scoreFromHeight } from './scoring.mjs';
import { createPauseController } from './pause.mjs';

const canvas = document.getElementById('view');
const hudH = document.getElementById('hud-h');
const hudV = document.getElementById('hud-v');
const hudScore = document.getElementById('hud-score');
const hudCatch = document.getElementById('hud-catch');
const hudSeason = document.getElementById('hud-season');
const banner = document.getElementById('season-banner');
const screens = {
  start: document.getElementById('screen-start'),
  catch: document.getElementById('screen-catch'),
  ready: document.getElementById('screen-ready'),
  results: document.getElementById('screen-results'),
  pause: document.getElementById('screen-pause'),
};
const btnPause = document.getElementById('btn-pause');
const pauseCount = document.getElementById('pause-count');

const params = new URLSearchParams(location.search);
const requestedSeed = Number(params.get('seed'));
const gestures = createGestureTracker();
const inputs = createInputQueue();
const board = createScoreboard();
const renderer = createRenderer(canvas);
const pauser = createPauseController({ getSim: () => sim, inputs, gestures });

let sim = null;
let acc = 0;
let last = performance.now();
let recorded = false;
let lastEntry = null;
let uiMode = 'start';
let seasonKey = 'spring';
let bannerUntil = 0;

function show(name) {
  uiMode = name;
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle('hidden', key !== name);
  }
}

function parseSeed() {
  if (Number.isFinite(requestedSeed) && requestedSeed !== 0) return requestedSeed | 0;
  return (Math.floor(Math.random() * 0x7fffffff) + 1) | 0;
}

function startRun() {
  sim = createSim({ seed: parseSeed() });
  pauser.reset();
  recorded = false;
  acc = 0;
  seasonKey = 'spring';
  bannerUntil = 0;
  banner.classList.add('hidden');
  show(null);
  for (const el of Object.values(screens)) el.classList.add('hidden');
  uiMode = 'play';
}

function updateHud() {
  if (!sim) return;
  const snap = sim.snapshot();
  hudH.textContent = `${Math.max(0, snap.h).toFixed(1)} m`;
  hudV.textContent = `${snap.v.toFixed(2)} m/s`;
  hudScore.textContent = String(scoreFromHeight(snap.maxH));
  // Season label is display-only: it reads the sim, never writes to it.
  const season = C.seasonAtH(Math.max(0, snap.maxH));
  hudSeason.textContent = season.name;
  if (season.key !== seasonKey) {
    seasonKey = season.key;
    banner.textContent = season.name;
    banner.classList.remove('hidden');
    bannerUntil = performance.now() + 2200;
  }
  if (bannerUntil && performance.now() > bannerUntil) {
    banner.classList.add('hidden');
    bannerUntil = 0;
  }
  hudCatch.textContent = snap.catchUsed ? 'Catch used' : (snap.catchAvailable ? 'Catch ready' : 'No Catch');
}

function fillList(el, rows) {
  el.innerHTML = '';
  if (!rows.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No climbs yet';
    el.appendChild(li);
    return;
  }
  for (const row of rows) {
    const li = document.createElement('li');
    li.textContent = `${row.score} m · seed ${row.seed}`;
    el.appendChild(li);
  }
}

function presentResults() {
  if (!sim) return;
  const snap = sim.snapshot();
  if (!recorded) {
    lastEntry = board.recordRun({
      maxH: snap.maxH,
      seed: snap.seed,
      catchUsed: snap.catchUsed,
      at: Date.now(),
    });
    recorded = true;
  }
  const line = document.getElementById('results-line');
  const kind = snap.catchUsed ? 'Catch-assisted' : 'Clean';
  line.textContent = `${snap.score} m · ${C.seasonAtH(Math.max(0, snap.maxH)).name} · ${kind} · seed ${snap.seed}`;
  const bestEl = document.getElementById('results-best');
  if (lastEntry && lastEntry.isBest) {
    bestEl.textContent = lastEntry.previousBest == null
      ? 'First ' + (lastEntry.board === 'clean' ? 'clean' : 'Catch-assisted') + ' climb on the board'
      : 'New ' + (lastEntry.board === 'clean' ? 'clean' : 'Catch-assisted') + ' best (was ' + lastEntry.previousBest + ' m)';
  } else {
    const bests = board.getBests();
    const b = snap.catchUsed ? bests.assisted : bests.clean;
    bestEl.textContent = b == null ? '' : 'Best ' + (snap.catchUsed ? 'Catch-assisted' : 'clean') + ': ' + b + ' m';
  }
  fillList(document.getElementById('board-clean'), board.topRuns('clean', 10));
  fillList(document.getElementById('board-assisted'), board.topRuns('assisted', 10));
  updateStartBest();
  show('results');
}

function updateStartBest() {
  const el = document.getElementById('start-best');
  const b = board.getBests();
  const parts = [];
  if (b.clean != null) parts.push('Best clean climb: ' + b.clean + ' m');
  if (b.assisted != null) parts.push('Catch-assisted: ' + b.assisted + ' m');
  el.textContent = parts.join(' · ');
  el.classList.toggle('hidden', parts.length === 0);
}

function syncScreens() {
  if (!sim) return;
  if (sim.mode === 'paused') {
    if (uiMode !== 'pause') show('pause');
    return;
  }
  if (sim.mode === 'play' && uiMode === 'pause') {
    for (const el of Object.values(screens)) el.classList.add('hidden');
    uiMode = 'play';
  }
  if (sim.mode === 'catch' && uiMode !== 'catch') show('catch');
  else if (sim.mode === 'ready' && uiMode !== 'ready') show('ready');
  else if (sim.mode === 'results' && uiMode !== 'results') presentResults();
}

function frame(now) {
  const wall = Math.min(0.05, (now - last) / 1000);
  last = now;
  const left = pauser.update(now);
  pauseCount.textContent = left ? 'Resuming in ' + left : '';
  document.getElementById('btn-resume').classList.toggle('hidden', pauser.counting());
  btnPause.classList.toggle('hidden', !(sim && sim.mode === 'play'));
  if (sim && sim.mode === 'play') {
    acc += wall;
    while (acc >= C.DT) {
      sim.tick(inputs.consume());
      acc -= C.DT;
    }
  } else {
    acc = 0;
  }
  if (sim) renderer.draw(sim, 0, wall);
  updateHud();
  syncScreens();
  updateStartBest();
requestAnimationFrame(frame);
}

function cssPoint(e) {
  const t = e.changedTouches ? e.changedTouches[0] : e;
  return { x: t.clientX, y: t.clientY, time: performance.now() };
}

function onDown(e) {
  if (uiMode !== 'play') return;
  const p = cssPoint(e);
  gestures.pointerDown(p.x, p.y, p.time);
}
function onMove(e) {
  if (uiMode !== 'play') return;
  const p = cssPoint(e);
  const g = gestures.pointerMove(p.x, p.y, p.time);
  if (g) inputs.applyGesture(g);
}
function onUp(e) {
  if (uiMode !== 'play') return;
  const p = cssPoint(e);
  const g = gestures.pointerUp(p.x, p.y, p.time);
  if (g) inputs.applyGesture(g);
}

canvas.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', onUp);
canvas.addEventListener('touchstart', (e) => { onDown(e); e.preventDefault(); }, { passive: false });
window.addEventListener('touchmove', (e) => { onMove(e); }, { passive: true });
window.addEventListener('touchend', onUp);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (sim && sim.mode === 'play') pauser.pause();
    else if (sim && sim.mode === 'paused' && !pauser.counting()) pauser.requestResume(performance.now());
    return;
  }
  if (uiMode === 'play') inputs.pushKey(e.code);
  if (e.code === 'Space' && uiMode === 'play') e.preventDefault();
});
window.addEventListener('resize', () => renderer.resize());
// Auto-pause when the tab or app goes to the background, so nobody loses a run to a phone call.
document.addEventListener('visibilitychange', () => { if (document.hidden) pauser.pause(); });
window.addEventListener('blur', () => pauser.pause());
window.addEventListener('pagehide', () => pauser.pause());
btnPause.addEventListener('click', () => pauser.pause());
document.getElementById('btn-resume').addEventListener('click', () => pauser.requestResume(performance.now()));
document.getElementById('btn-quit').addEventListener('click', () => { if (sim && sim.mode === 'paused') { pauser.reset(); sim.quit(); } });

document.getElementById('btn-climb').addEventListener('click', startRun);
document.getElementById('btn-again').addEventListener('click', startRun);
document.getElementById('btn-home').addEventListener('click', () => { updateStartBest(); show('start'); });
document.getElementById('btn-catch').addEventListener('click', () => { if (sim) sim.useCatch(); });
document.getElementById('btn-end').addEventListener('click', () => { if (sim) sim.declineCatch(); });
document.getElementById('btn-ready').addEventListener('click', () => {
  if (sim) {
    sim.ready();
    show(null);
    for (const el of Object.values(screens)) el.classList.add('hidden');
    uiMode = 'play';
  }
});

updateStartBest();
requestAnimationFrame(frame);
