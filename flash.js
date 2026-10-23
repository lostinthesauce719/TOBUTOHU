// Flash limiter (LAUNCH flash safety 2026-10-18, WCAG 2.3.1). Visual only; the sim never reads it.
// - one flash per strike (strikes that land together share one flash)
// - at most `maxPerSec` flashes in any rolling 1 s window, across all strikes
// - a strike over the limit keeps its ring and edges, just no flash
// - reduce motion: no flash at all
export function createFlashLimiter({ maxPerSec = 3, windowS = 1, shareS = 0.05, reduceMotion = false } = {}) {
  const times = [], seen = new Set(); let lastT = -1e9;
  return {
    // returns true if this strike may flash now (call once when the strike lands; repeat calls are ignored)
    request(strikeId, t) {
      if (seen.has(strikeId)) return false; seen.add(strikeId); if (seen.size > 256) seen.delete(seen.values().next().value);
      if (reduceMotion) return false;
      if (t - lastT < shareS) return false; // simultaneous lanes share the flash already given
      while (times.length && t - times[0] >= windowS) times.shift();
      if (times.length >= maxPerSec) return false;
      times.push(t); lastT = t; return true;
    },
    get count() { return times.length; },
  };
}
