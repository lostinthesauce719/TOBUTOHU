import * as C from './config.mjs';
import { createSim } from './sim.mjs';
import { createGestureTracker, createInputQueue } from './controls.mjs';
import { createRenderer } from './render.mjs';
import { createScoreboard, scoreFromHeight } from './scoring.mjs';

const canvas = document.getElementById('view');
const hudH = document.getElementById('hud-h');
const hudV = document.getElementById('hud-v');
const hudScore = document.getElementById('hud-score');
const hudCatch = document.getElementById('hud-catch');
const screens = {
  start: document.getElementById('screen-start'),
  catch: document.getElementById('screen-catch'),
  ready: document.getElementById('screen-ready'),
  results: document.getElementById('screen-results'),
};

const params = new URLSearchParams(location.search);
const requestedSeed = Number(params.get('seed'));
const gestures = createGestureTracker();
const inputs = createInputQueue();
const board = createScoreboard();
const renderer = createRenderer(canvas);

let sim = null;
let acc = 0;
let last = performance.now();
let recorded = false;
let uiMode = 'start';

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
  recorded = false;
  acc = 0;
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
  for (const row of rows.slice(-10).reverse()) {
    const li = document.createElement('li');
    li.textContent = `${row.score} m · seed ${row.seed}`;
    el.appendChild(li);
  }
}

function presentResults() {
  if (!sim) return;
  const snap = sim.snapshot();
  if (!recorded) {
    board.recordRun({
      maxH: snap.maxH,
      seed: snap.seed,
      catchUsed: snap.catchUsed,
      at: Date.now(),
    });
    recorded = true;
  }
  const line = document.getElementById('results-line');
  const kind = snap.catchUsed ? 'Catch-assisted' : 'Clean';
  line.textContent = `${snap.score} m · ${kind} · seed ${snap.seed}`;
  const lists = board.getBoard();
  fillList(document.getElementById('board-clean'), lists.clean);
  fillList(document.getElementById('board-assisted'), lists.assisted);
  show('results');
}

function syncScreens() {
  if (!sim) return;
  if (sim.mode === 'catch' && uiMode !== 'catch') show('catch');
  else if (sim.mode === 'ready' && uiMode !== 'ready') show('ready');
  else if (sim.mode === 'results' && uiMode !== 'results') presentResults();
}

function frame(now) {
  const wall = Math.min(0.05, (now - last) / 1000);
  last = now;
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
  if (uiMode === 'play') inputs.pushKey(e.code);
  if (e.code === 'Space' && uiMode === 'play') e.preventDefault();
});
window.addEventListener('resize', () => renderer.resize());

document.getElementById('btn-climb').addEventListener('click', startRun);
document.getElementById('btn-again').addEventListener('click', startRun);
document.getElementById('btn-home').addEventListener('click', () => show('start'));
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

requestAnimationFrame(frame);
