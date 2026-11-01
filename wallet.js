// Tobu wallet — coins, gems, owned wing skins. Client-side only (like saves.js).
 // Never read by sim.js. Persists beside earned saves.
import { ECONOMY, WING_SEASONS } from './economy.js';

const KEY = 'tobu_wallet_v1';

export function createWallet(store = globalThis.localStorage) {
  let s;
  try { s = JSON.parse(store.getItem(KEY)) || {}; } catch { s = {}; }
  s.coins = Math.max(0, s.coins | 0);
  s.gems = Math.max(0, s.gems | 0);
  s.owned = s.owned && typeof s.owned === 'object' ? s.owned : {};
  s.active = WING_SEASONS.includes(s.active) ? s.active : null;
  const save = () => { try { store.setItem(KEY, JSON.stringify(s)); } catch {} };

  return {
    get coins() { return s.coins; },
    get gems() { return s.gems; },
    get active() { return s.active; },
    get owned() { return { ...s.owned }; },
    snapshot() { return { coins: s.coins, gems: s.gems, owned: { ...s.owned }, active: s.active }; },

    addCoins(n) { const k = Math.max(0, n | 0); if (!k) return s.coins; s.coins += k; save(); return s.coins; },
    addGems(n) { const k = Math.max(0, n | 0); if (!k) return s.gems; s.gems += k; save(); return s.gems; },

    owns(season) { return !!s.owned[season]; },

    // Buy a seasonal wing with coins or gems. Returns 'ok' | 'owned' | 'locked' | 'funds' | 'bad'
    buy(season, pay, bestH = 0) {
      if (!WING_SEASONS.includes(season)) return 'bad';
      if (s.owned[season]) return 'owned';
      const unlockH = { spring: 0, summer: 120, autumn: 250, winter: 400 }[season];
      if ((bestH | 0) < unlockH) return 'locked';
      if (pay === 'coins') {
        const cost = ECONOMY.wings.coinPrice[season] | 0;
        if (s.coins < cost) return 'funds';
        s.coins -= cost; s.owned[season] = 1; s.active = season; save(); return 'ok';
      }
      if (pay === 'gems') {
        const cost = ECONOMY.wings.gemPrice[season] | 0;
        if (s.gems < cost) return 'funds';
        s.gems -= cost; s.owned[season] = 1; s.active = season; save(); return 'ok';
      }
      return 'bad';
    },

    equip(season) {
      if (season == null) { s.active = null; save(); return 'cleared'; }
      if (!WING_SEASONS.includes(season) || !s.owned[season]) return 'locked';
      s.active = season; save(); return 'equipped';
    },

    // Debug / shot helpers only
    grant(season) {
      if (!WING_SEASONS.includes(season)) return;
      s.owned[season] = 1; s.active = season; save();
    },
    debugSet({ coins, gems } = {}) {
      if (coins != null) s.coins = Math.max(0, coins | 0);
      if (gems != null) s.gems = Math.max(0, gems | 0);
      save();
    },

    // IAP stub — never grants. LAUNCH owns real purchases.
    stubBuyGems(packId) {
      const pack = ECONOMY.gems.packs.find(p => p.id === packId);
      if (!pack) return { ok: false, reason: 'unknown pack' };
      return { ok: false, reason: 'stub', pack, note: 'Real-money gems: UI stub only. LAUNCH owns store compliance.' };
    },
  };
}
