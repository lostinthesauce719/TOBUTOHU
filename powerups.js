// Tobu power-ups (BRUSH clipstyle 2026-10-31). VISUAL ONLY — never writes sim state.
// Seeded pickup spawns, wings on the skinned hero, frosted shop helpers.
import * as THREE from './vendor/three.module.min.js';
import { mul } from './sim.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_META = {
  spring: { label: 'Wings · Spring', blurb: 'Extend jump with paper wings', unlockH: 0 },
  summer: { label: 'Wings · Summer', blurb: 'Mint glide through the cliffs', unlockH: 120 },
  autumn: { label: 'Wings · Autumn', blurb: 'Gold-tinted glide', unlockH: 250 },
  winter: { label: 'Wings · Winter', blurb: 'Unlocks at height 400 m', unlockH: 400 },
};
// Shop layout: 'rows' = four seasonal cards (board); 'tint' = one season-tinted wing (future).
export const SHOP_MODE = 'rows';

const PICK_SCALE = 0.6;
const MAX_GLOW = 2;
const COLLECT_R = 1.8;
const WING_SZ = 0.85;
const FLAP_FPS = 12;
const BL = 1.1;

function loadTex(loader, url) {
  return new Promise((res, rej) => loader.load(url, t => {
    t.colorSpace = THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    res(t);
  }, undefined, rej));
}

export async function createPowerups(scene, seed, hero) {
  const loader = new THREE.TextureLoader();
  const rP = mul(((seed >>> 0) ^ 0x504F5733) >>> 0); // "POW3" visual-only stream

  const pickMaps = {};
  const wingOpen = {}, wingFold = {}, wingFlap = {};
  await Promise.all(SEASONS.map(async s => {
    pickMaps[s] = await loadTex(loader, `./art/powerups/pickups/${s}_256.png`);
    wingOpen[s] = await loadTex(loader, `./art/powerups/wings/${s}_open.png`);
    wingFold[s] = await loadTex(loader, `./art/powerups/wings/${s}_folded.png`);
    const ft = await loadTex(loader, `./art/powerups/wings/${s}_flap_sheet.png`);
    // clone per-wing offsets so L/R can share season without fighting
    wingFlap[s] = ft;
  }));

  const pickRoot = new THREE.Group();
  pickRoot.userData.layer = 'play';
  scene.add(pickRoot);

  const pickMat = (map, opacity = 1) => new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide, opacity,
  });

  const pool = [], glowPool = [];
  for (let i = 0; i < MAX_GLOW; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pickMat(pickMaps.spring));
    m.visible = false; m.frustumCulled = false; m.renderOrder = 2; m.userData.layer = 'play';
    pickRoot.add(m); pool.push(m);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pickMat(pickMaps.spring, 0.35));
    g.visible = false; g.frustumCulled = false; g.renderOrder = 1; g.userData.layer = 'play';
    pickRoot.add(g); glowPool.push(g);
  }

  // Seeded spawn table by height. x on near-lane cedar shelf band (~10–16), not centre lane.
  // z is resolved live from the climber so pickups sit ahead on the path (course z drifts with seed).
  const spawns = [];
  let y = 10 + rP() * 10;
  while (y < 520) {
    const side = rP() < 0.5 ? -1 : 1;
    const xMag = 2.6 + rP() * 1.6; // on near-lane ledge edge (visible in chase)
    const ahead = 3 + rP() * 5; // metres ahead of climber along -z
    const si = Math.min(3, (y / 120) | 0);
    let season = SEASONS[si];
    const roll = rP();
    if (roll < 0.1 && si > 0) season = SEASONS[si - 1];
    else if (roll < 0.2 && si < 3) season = SEASONS[si + 1];
    spawns.push({ x: side * xMag, y, ahead, season, taken: false, id: spawns.length });
    y += 26 + rP() * 16;
  }

  // ---- wings attached to hero.root (behind thorax) ----
  const wingG = new THREE.Group();
  wingG.userData.layer = 'play';
  hero.root.add(wingG);

  function mkWing(side) {
    // each wing gets its own flap texture clone so UV offsets stay independent if needed
    const mat = new THREE.MeshBasicMaterial({
      map: wingFold.spring, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WING_SZ, WING_SZ), mat);
    mesh.position.set(side * 0.055 * BL, 0.05 * BL, -0.14 * BL);
    mesh.rotation.y = side * 0.4;
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    mesh.userData.layer = 'play';
    mesh.userData.side = side;
    wingG.add(mesh);
    return mesh;
  }
  const wingL = mkWing(-1), wingR = mkWing(1);
  wingR.scale.x = -1;

  // per-season flap clones (offset mutated each frame)
  const flapL = {}, flapR = {};
  for (const s of SEASONS) {
    flapL[s] = wingFlap[s].clone(); flapL[s].repeat.set(1 / 8, 1);
    flapR[s] = wingFlap[s].clone(); flapR[s].repeat.set(1 / 8, 1);
  }

  const storeKey = 'tobu_powerups_v1';
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { return {}; }
  }
  function saveStore(o) { try { localStorage.setItem(storeKey, JSON.stringify(o)); } catch {} }
  let store = loadStore();
  let active = store.active || null;
  let boostT = 0;
  let flapPhase = 0;
  let mode = 'folded';

  function setWingMaps(season, kind, frame) {
    const L = wingL.material, R = wingR.material;
    if (kind === 'flap') {
      const tL = flapL[season], tR = flapR[season];
      const u = (frame % 8) / 8;
      tL.offset.x = u; tR.offset.x = u;
      L.map = tL; R.map = tR;
    } else if (kind === 'open') {
      L.map = wingOpen[season]; R.map = wingOpen[season];
    } else {
      L.map = wingFold[season]; R.map = wingFold[season];
    }
    L.needsUpdate = true; R.needsUpdate = true;
  }

  function equip(season) {
    if (!season || !SEASONS.includes(season)) {
      active = null; store.active = null; saveStore(store); wingG.visible = false; return;
    }
    active = season;
    store.active = season;
    if (!store.owned) store.owned = {};
    store.owned[season] = 1;
    saveStore(store);
    boostT = 4.5;
    mode = 'flap';
    wingG.visible = true;
  }

  let poseLock = null; // capture: keep open|folded|flap regardless of motion
  function forceWings(season, pose) {
    active = season;
    mode = pose || 'open';
    poseLock = mode;
    boostT = (pose === 'folded') ? 0 : 99;
    setWingMaps(season, pose === 'flap' ? 'flap' : pose === 'open' ? 'open' : 'folded', 0);
    wingG.visible = true;
  }

  const _camQ = new THREE.Quaternion();
  const cand = [];

  function update(dt, P, cam) {
    _camQ.copy(cam.quaternion);
    const px = P.pos.x, py = P.pos.y, pz = P.pos.z;

    cand.length = 0;
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      if (s.taken) continue;
      const dy = s.y - py;
      if (dy < -6 || dy > 22) continue;
      // live z: sit ahead of climber on the path at this height band
      const wx = s.x, wy = s.y, wz = pz - s.ahead;
      const dx = wx - px, dz = wz - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      cand.push({ i, d2, wx, wy, wz });
    }
    cand.sort((a, b) => a.d2 - b.d2);

    for (const m of pool) m.visible = false;
    for (const m of glowPool) m.visible = false;

    let shown = 0;
    for (const c of cand) {
      if (shown >= MAX_GLOW) break;
      const s = spawns[c.i];
      const mesh = pool[shown], glow = glowPool[shown];
      mesh.material.map = pickMaps[s.season];
      mesh.material.needsUpdate = true;
      glow.material.map = pickMaps[s.season];
      glow.material.needsUpdate = true;
      const bob = Math.sin(P.t * 2.2 + s.id) * 0.08;
      const pulse = 0.85 + 0.15 * Math.sin(P.t * (Math.PI * 2 / 1.6) + s.id);
      mesh.position.set(c.wx, c.wy + bob, c.wz);
      mesh.scale.setScalar(PICK_SCALE * pulse);
      mesh.quaternion.copy(_camQ);
      mesh.material.opacity = pulse;
      mesh.visible = true;
      glow.position.copy(mesh.position);
      glow.quaternion.copy(_camQ);
      glow.scale.setScalar(PICK_SCALE * 1.55);
      glow.material.opacity = 0.32 * pulse;
      glow.visible = true;
      if (c.d2 < COLLECT_R * COLLECT_R && P.mode === 'play') {
        s.taken = true;
        mesh.visible = false; glow.visible = false;
        equip(s.season);
      }
      shown++;
    }

    if (!active) {
      wingG.visible = false;
    } else {
      wingG.visible = true;
      const speed = Math.hypot(P.vel.x, P.vel.z, Math.min(Math.abs(P.vel.y), 8));
      const airborne = P.state === 'air';
      boostT = Math.max(0, boostT - dt);
      let want;
      if (poseLock) want = poseLock;
      else if (boostT > 0 || (airborne && speed > 2)) want = 'flap';
      else if (airborne || speed > 4) want = 'open';
      else want = 'folded';
      mode = want;
      if (want === 'flap') {
        flapPhase += dt * FLAP_FPS;
        setWingMaps(active, 'flap', flapPhase | 0);
        wingL.rotation.z = -0.18; wingR.rotation.z = 0.18;
      } else if (want === 'open') {
        setWingMaps(active, 'open', 0);
        wingL.rotation.z = -0.1; wingR.rotation.z = 0.1;
      } else {
        setWingMaps(active, 'folded', 0);
        wingL.rotation.z = 0.06; wingR.rotation.z = -0.06;
      }
    }
  }

  function getShopState(bestH) {
    const owned = store.owned || {};
    const rows = SEASONS.map(s => {
      const meta = SEASON_META[s];
      let state;
      if (owned[s]) state = (active === s) ? 'active' : 'owned';
      else if ((bestH | 0) >= meta.unlockH) state = 'available';
      else state = 'locked';
      return { season: s, ...meta, state, cost: 'TBD' };
    });
    return { mode: SHOP_MODE, active, rows, owned };
  }

  // TBD cost model: available tap does not invent currency; owned/active can equip.
  function setActiveFromShop(season) {
    const row = getShopState(1e9).rows.find(r => r.season === season);
    if (!row || row.state === 'locked') return 'locked';
    if (row.state === 'available') return 'tbd';
    equip(season);
    return 'equipped';
  }

  function grant(season) {
    if (!store.owned) store.owned = {};
    store.owned[season] = 1;
    saveStore(store);
    equip(season);
  }

  function demoShop() {
    store = { owned: { summer: 1 }, active: 'summer' };
    saveStore(store);
    active = 'summer';
  }

  let forcePick = null; // 'all' | season | null — capture helper keeps pickups near climber
  function setForcePick(v) { forcePick = v; if (v) for (const s of spawns) s.taken = false; }

  const _update = update;
  function update2(dt, P, cam) {
    if (forcePick) {
      let n = 0;
      for (const s of spawns) {
        if (forcePick !== 'all' && s.season !== forcePick) continue;
        if (n >= MAX_GLOW) { break; }
        s.taken = false;
        s.y = P.pos.y + 1.2 + n * 0.35;
        s.ahead = 2.2 + n * 0.9;
        s.x = (n % 2 ? 1 : -1) * (2.8 + n * 0.55);
        n++;
      }
    }
    _update(dt, P, cam);
  }

  return {
    update: update2, equip, forceWings, grant, demoShop, getShopState, setActiveFromShop, setForcePick,
    get active() { return active; },
    get mode() { return mode; },
    spawns, wingG, pickRoot,
  };
}
