// Earned saves (plan v0.4 §9.8, approved by KAMI 2026-10-18). Client-side only, never part of the sim the server checks.
// +1 for finishing the day's daily run (any height), +1 the first time a zone is reached. Cap 3.
// Never sold, never granted for an ad. Spendable in casual runs only; ranked keeps exactly one free Catch.
export const SAVE_CAP = 3;
const KEY = 'tobu_saves_v1';
// the game day resets at UTC-7 (locked)
export const dayKey = (ms = Date.now()) => new Date(ms - 7 * 3600e3).toISOString().slice(0, 10);
export function createSaves(store = globalThis.localStorage) {
  let s; try { s = JSON.parse(store.getItem(KEY)) || {}; } catch (e) { s = {}; }
  s.n = Math.max(0, Math.min(SAVE_CAP, s.n | 0)); s.zones = s.zones || []; s.daily = s.daily || '';
  const save = () => { try { store.setItem(KEY, JSON.stringify(s)); } catch (e) {} };
  const add = why => { if (s.n >= SAVE_CAP) return false; s.n++; save(); return why; };
  return {
    get n() { return s.n; },
    zone(key) { if (s.zones.includes(key)) return false; s.zones.push(key); save(); return add('zone'); },   // first reach only, even if capped
    daily(day = dayKey()) { if (s.daily === day) return false; s.daily = day; save(); return add('daily'); },
    spend(board) { if (board !== 'free' || s.n <= 0) return false; s.n--; save(); return true; },          // casual only
  };
}
