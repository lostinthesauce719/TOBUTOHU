import {
  SWIPE_MIN_PX, SWIPE_MAX_MS, SWIPE_RATIO, TAP_MAX_MS, TAP_MAX_PX,
} from './config.mjs';

export function recognizeGesture({ dx, dy, dtMs, travel }) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const dist = travel != null ? travel : Math.hypot(dx, dy);
  if (dtMs <= SWIPE_MAX_MS && ax >= SWIPE_MIN_PX && ax >= SWIPE_RATIO * ay) {
    return { type: 'swipe', dir: dx > 0 ? 1 : -1 };
  }
  if (dtMs <= TAP_MAX_MS && dist < TAP_MAX_PX) {
    return { type: 'tap' };
  }
  return { type: 'none' };
}

export function createGestureTracker() {
  let startX = 0, startY = 0, startT = 0, lastX = 0, lastY = 0;
  let tracking = false;
  let consumed = false;
  let path = 0;

  function pointerDown(x, y, t) {
    tracking = true;
    consumed = false;
    startX = lastX = x;
    startY = lastY = y;
    startT = t;
    path = 0;
  }

  function pointerMove(x, y, t) {
    if (!tracking || consumed) return null;
    path += Math.hypot(x - lastX, y - lastY);
    lastX = x;
    lastY = y;
    const dx = x - startX;
    const dy = y - startY;
    const dtMs = t - startT;
    const g = recognizeGesture({ dx, dy, dtMs, travel: Math.hypot(dx, dy) });
    if (g.type === 'swipe') {
      consumed = true;
      return g;
    }
    return null;
  }

  function pointerUp(x, y, t) {
    if (!tracking) return null;
    tracking = false;
    if (consumed) return null;
    path += Math.hypot(x - lastX, y - lastY);
    const dx = x - startX;
    const dy = y - startY;
    const dtMs = t - startT;
    const g = recognizeGesture({ dx, dy, dtMs, travel: Math.max(path, Math.hypot(dx, dy)) });
    consumed = true;
    return g.type === 'none' ? null : g;
  }

  function cancel() {
    tracking = false;
    consumed = true;
  }

  return { pointerDown, pointerMove, pointerUp, cancel, recognizeGesture };
}

export function createInputQueue() {
  let laneDir = 0;
  let jump = false;

  function pushSwipe(dir) {
    if (dir === -1 || dir === 1) laneDir = dir;
  }
  function pushJump() { jump = true; }
  function pushKey(code) {
    if (code === 'ArrowLeft' || code === 'KeyA') pushSwipe(-1);
    else if (code === 'ArrowRight' || code === 'KeyD') pushSwipe(1);
    else if (code === 'Space' || code === 'ArrowUp') pushJump();
  }
  function consume() {
    const out = { laneDir, jump };
    laneDir = 0;
    jump = false;
    return out;
  }
  function peek() { return { laneDir, jump }; }
  function applyGesture(g) {
    if (!g) return;
    if (g.type === 'swipe') pushSwipe(g.dir);
    else if (g.type === 'tap') pushJump();
  }
  return { pushSwipe, pushJump, pushKey, consume, peek, applyGesture };
}
