import { TUNING_VERSION, GENERATOR_VERSION, SKILL_TIER, CATCH_RULE_VERSION } from './config.mjs';

const STORE_KEY = 'tobu-runner-lb-v1';

export function scoreFromHeight(maxH) {
  return Math.floor(maxH);
}

export function createScoreboard(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  let cache = { clean: [], assisted: [] };

  function load() {
    if (!store) return { clean: [], assisted: [] };
    try {
      const raw = store.getItem(STORE_KEY);
      if (!raw) return { clean: [], assisted: [] };
      const parsed = JSON.parse(raw);
      return {
        clean: Array.isArray(parsed.clean) ? parsed.clean : [],
        assisted: Array.isArray(parsed.assisted) ? parsed.assisted : [],
      };
    } catch {
      return { clean: [], assisted: [] };
    }
  }

  cache = load();

  function save() {
    if (!store) return;
    store.setItem(STORE_KEY, JSON.stringify(cache));
  }

  function bestOf(key) {
    let best = null;
    for (const e of cache[key] || []) {
      if (!best || e.score > best.score) best = e;
    }
    return best;
  }

  // Highest score first; ties keep the earlier climb first. Display-only.
  function topRuns(key, n = 10) {
    return (cache[key] || [])
      .map((e, i) => ({ e, i }))
      .sort((a, b) => (b.e.score - a.e.score) || (a.i - b.i))
      .slice(0, n)
      .map((x) => x.e);
  }

  function recordRun(run) {
    const entry = {
      score: scoreFromHeight(run.maxH ?? run.score ?? 0),
      height: run.maxH ?? run.height ?? run.score ?? 0,
      seed: run.seed,
      catchUsed: !!run.catchUsed,
      tuningVersion: run.tuningVersion || TUNING_VERSION,
      generatorVersion: run.generatorVersion || GENERATOR_VERSION,
      skillTier: run.skillTier || SKILL_TIER,
      catchRuleVersion: run.catchRuleVersion || CATCH_RULE_VERSION,
      at: run.at || 0,
    };
    const key = entry.catchUsed ? 'assisted' : 'clean';
    const prev = bestOf(key);
    cache[key] = cache[key].concat(entry);
    save();
    // A new best only when it strictly beats the previous best on the same board.
    const isBest = entry.score > 0 && (!prev || entry.score > prev.score);
    return { ...entry, board: key, isBest, previousBest: prev ? prev.score : null };
  }

  function getBoard() {
    return {
      clean: cache.clean.slice(),
      assisted: cache.assisted.slice(),
    };
  }

  function clear() {
    cache = { clean: [], assisted: [] };
    save();
  }

  function getBests() {
    const c = bestOf('clean');
    const a = bestOf('assisted');
    return { clean: c ? c.score : null, assisted: a ? a.score : null };
  }

  return { recordRun, getBoard, getBests, topRuns, clear, STORE_KEY };
}
