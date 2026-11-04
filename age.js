// Neutral age screen (plan v0.4 §5.2, Apollo 2026-10-14: under-13s are limited, never blocked).
// One-time birth-year pick at first launch: no default, no hint, no retry (a reinstall resets it).
// Only the limited/not-limited answer is stored, never the birth year itself.
// Year-only answers can't tell a 13-year-old from a 12-year-old, so the year that might still be 12 counts as limited.
// Visual/menu only: nothing here touches the sim or the replay check.
const KEY = 'tobu_age_v1';
export const limitedFor = (birthYear, now = new Date()) => now.getFullYear() - birthYear <= 13;
export function yearChoices(now = new Date(), span = 100) { const y = now.getFullYear(); return Array.from({ length: span }, (_, i) => y - i); }
export function createAge(store = globalThis.localStorage) {
  let s = null; try { s = JSON.parse(store.getItem(KEY)); } catch (e) { s = null; }
  if (!s || typeof s.u13 !== 'boolean') s = null;
  return {
    get asked() { return !!s; },
    get u13() { return !!(s && s.u13); },
    // first answer wins; later calls can't change it
    answer(birthYear, now = new Date()) { if (s) return s.u13; const y = birthYear | 0; if (y < 1900 || y > now.getFullYear()) return null;
      s = { u13: limitedFor(y, now) }; try { store.setItem(KEY, JSON.stringify(s)); } catch (e) {} return s.u13; },
  };
}
