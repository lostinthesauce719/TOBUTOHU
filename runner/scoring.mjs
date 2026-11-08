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
    cache[key] = cache[key].concat(entry);
    save();
    return entry;
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

  return { recordRun, getBoard, clear, STORE_KEY };
}
