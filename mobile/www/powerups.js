// Tobu power-ups (BRUSH clipstyle 2026-10-31, fixes powerups02). VISUAL ONLY — never writes sim state.
// Seeded lane pickups, paper wings on skinned hero, frosted shop helpers.
import * as THREE from './vendor/three.module.min.js';
import { mul } from './sim.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_META = {
  spring: { label: 'Wings · Spring', blurb: 'Extend jump with paper wings', unlockH: 0 },
  summer: { label: 'Wings · Summer', blurb: 'Mint glide through the cliffs', unlockH: 120 },
  autumn: { label: 'Wings · Autumn', blurb: 'Gold-tinted glide', unlockH: 250 },
  winter: { label: 'Wings · Winter', blurb: 'Unlocks at height 400 m', unlockH: 400 },
};
export const SHOP_MODE = 'rows';

const BL = 1.1;
const OPEN_SPAN = 1.6 * BL;   // tip-to-tip ≈ 1.6× body length
const OPEN_H = 0.95 * BL;     // chord
const FOLD_LEN = 0.7 * BL;    // along abdomen
const FOLD_W = 0.28 * BL;
const PICK_SCALE = 0.9;
const MAX_GLOW = 2;           // ≤2 pickups on screen (halo baked in PNG — no extra glow draw)
const COLLECT_R = 2.0;
const FLAP_FPS = 12;
const SHADOW = 0x1C2438;

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
  const rP = mul(((seed >>> 0) ^ 0x504F5733) >>> 0);

  const pickMaps = {};
  const wingOpen = {}, wingFold = {}, wingFlap = {};
  await Promise.all(SEASONS.map(async s => {
    pickMaps[s] = await loadTex(loader, `./art/powerups/pickups/${s}_256.png`);
    wingOpen[s] = await loadTex(loader, `./art/powerups/wings/${s}_open.png`);
    wingFold[s] = await loadTex(loader, `./art/powerups/wings/${s}_folded.png`);
    wingFlap[s] = await loadTex(loader, `./art/powerups/wings/${s}_flap_sheet.png`);
  }));

  // ---- pickups: lane / jump-arc, halo already in PNG (cream/icy) ----
  const pickRoot = new THREE.Group();
  pickRoot.userData.layer = 'play';
  scene.add(pickRoot);
  const pickMat = (map) => new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide, opacity: 1,
  });
  const pool = [];
  for (let i = 0; i < MAX_GLOW; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pickMat(pickMaps.spring));
    m.visible = false; m.frustumCulled = false; m.renderOrder = 2; m.userData.layer = 'play';
    pickRoot.add(m); pool.push(m);
  }

  // Seeded spawns in/near the climb lane at jump-arc height (~1.2–2.6 m above shelves).
  const spawns = [];
  let y = 8 + rP() * 8;
  while (y < 520) {
    const side = rP() < 0.5 ? -1 : 1;
    // lane: |x| ≈ 0.4–1.6 (reachable in chase, on jump line)
    const xMag = 0.45 + rP() * 1.15;
    const ahead = 2.0 + rP() * 3.5;
    const arc = 1.2 + rP() * 1.4; // jump-arc lift above the height band
    const si = Math.min(3, (y / 120) | 0);
    let season = SEASONS[si];
    const roll = rP();
    if (roll < 0.1 && si > 0) season = SEASONS[si - 1];
    else if (roll < 0.2 && si < 3) season = SEASONS[si + 1];
    spawns.push({ x: side * xMag, y: y + arc, ahead, season, taken: false, id: spawns.length });
    y += 24 + rP() * 14;
  }

  // ---- paper wings: open span 1.6×BL, folded 0.7×BL along abdomen ----
  const wingG = new THREE.Group();
  wingG.userData.layer = 'play';
  hero.root.add(wingG);

  function mkWing(side) {
    const mat = new THREE.MeshBasicMaterial({
      map: wingFold.spring, transparent: true, depthWrite: false, fog: true,
      side: THREE.DoubleSide, opacity: 1,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 4;
    mesh.frustumCulled = false;
    mesh.userData.layer = 'play';
    mesh.userData.side = side;
    // soft shadow: same wing PNG alpha as mask, tinted #1C2438 @ ~30% (no grey square quad)
    const shMat = new THREE.MeshBasicMaterial({
      map: wingFold.spring, color: SHADOW, transparent: true, opacity: 0.30,
      depthWrite: false, fog: true, side: THREE.DoubleSide,
    });
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shMat);
    shadow.position.set(0, -0.04, 0.01);
    shadow.renderOrder = 3;
    shadow.frustumCulled = false;
    shadow.userData.layer = 'play';
    mesh.add(shadow);
    mesh.userData.shadow = shadow;
    wingG.add(mesh);
    return mesh;
  }
  const wingL = mkWing(-1), wingR = mkWing(1);

  const flapL = {}, flapR = {};
  for (const s of SEASONS) {
    flapL[s] = wingFlap[s].clone(); flapL[s].repeat.set(1 / 8, 1);
    flapR[s] = wingFlap[s].clone(); flapR[s].repeat.set(1 / 8, 1);
  }

  function layoutWings(kind) {
    // local +z = head, +y = back (hero body space)
    for (const mesh of [wingL, wingR]) {
      const side = mesh.userData.side;
      const sh = mesh.userData.shadow;
      if (kind === 'folded') {
        // lie along abdomen, ~0.7× BL
        mesh.scale.set(FOLD_W * (side < 0 ? 1 : -1), FOLD_LEN, 1);
        mesh.position.set(side * 0.04 * BL, 0.02 * BL, -0.22 * BL);
        mesh.rotation.set(0.08, side * 0.08, side * 0.05);
        sh.scale.set(1.05, 1.05, 1);
        sh.material.opacity = 0.22;
      } else {
        // open / flap: span tip-to-tip ≈ 1.6×BL, above/behind thorax, spread for chase
        const half = OPEN_SPAN * 0.5;
        mesh.scale.set(half * (side < 0 ? 1 : -1), OPEN_H, 1);
        mesh.position.set(side * 0.06 * BL, 0.10 * BL, -0.10 * BL);
        // yaw out so both wings read in chase cam; slight pitch up
        mesh.rotation.set(-0.25, side * 0.85, side * 0.15);
        sh.scale.set(1.08, 1.08, 1);
        sh.material.opacity = 0.30;
      }
    }
  }
  layoutWings('folded');

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
  let poseLock = null;

  function setWingMaps(season, kind, frame) {
    const L = wingL.material, R = wingR.material;
    const sL = wingL.userData.shadow.material, sR = wingR.userData.shadow.material;
    L.opacity = 1; R.opacity = 1;
    if (kind === 'flap') {
      const tL = flapL[season], tR = flapR[season];
      const u = (frame % 8) / 8;
      tL.offset.x = u; tR.offset.x = u;
      L.map = tL; R.map = tR;
      sL.map = tL; sR.map = tR; // share sheet so flap offset masks shadow too
    } else if (kind === 'open') {
      L.map = wingOpen[season]; R.map = wingOpen[season];
      sL.map = wingOpen[season]; sR.map = wingOpen[season];
    } else {
      L.map = wingFold[season]; R.map = wingFold[season];
      sL.map = wingFold[season]; sR.map = wingFold[season];
    }
    L.needsUpdate = true; R.needsUpdate = true;
    sL.needsUpdate = true; sR.needsUpdate = true;
  }

  function applyStub() {
    // Always collapse procedural stubs — tinted boxes still read as cream folded wings in chase.
    // Paper wings are the only wing read when a power-up is active.
    if (hero.setStubWings) hero.setStubWings(true);
  }

  function equip(season) {
    if (!season || !SEASONS.includes(season)) {
      active = null; store.active = null; saveStore(store);
      wingG.visible = false; applyStub(); return;
    }
    active = season;
    store.active = season;
    if (!store.owned) store.owned = {};
    store.owned[season] = 1;
    saveStore(store);
    boostT = 4.5;
    mode = 'flap';
    wingG.visible = true;
    applyStub();
  }

  function forceWings(season, pose) {
    active = season;
    mode = pose || 'open';
    poseLock = mode;
    boostT = (pose === 'folded') ? 0 : 99;
    layoutWings(mode === 'folded' ? 'folded' : 'open');
    setWingMaps(season, pose === 'flap' ? 'flap' : pose === 'open' ? 'open' : 'folded', 0);
    wingG.visible = true;
    applyStub();
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
      if (dy < -5 || dy > 18) continue;
      const wx = s.x, wy = s.y, wz = pz - s.ahead;
      const dx = wx - px, dz = wz - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      cand.push({ i, d2, wx, wy, wz });
    }
    cand.sort((a, b) => a.d2 - b.d2);

    for (const m of pool) m.visible = false;
    let shown = 0;
    // Winter ice: keep ≤1 pickup with paper wings so total draws stay ≤40
    const maxShow = (py >= 330 && active) ? 1 : MAX_GLOW;
    for (const c of cand) {
      if (shown >= maxShow) break;
      const s = spawns[c.i];
      const mesh = pool[shown];
      mesh.material.map = pickMaps[s.season];
      mesh.material.needsUpdate = true;
      // gentle bob; halo is baked (cream/icy) in the PNG
      const bob = Math.sin(P.t * 1.8 + s.id) * 0.10;
      mesh.position.set(c.wx, c.wy + bob, c.wz);
      mesh.scale.setScalar(PICK_SCALE);
      mesh.quaternion.copy(_camQ);
      mesh.material.opacity = 1;
      mesh.visible = true;
      if (c.d2 < COLLECT_R * COLLECT_R && P.mode === 'play') {
        s.taken = true;
        mesh.visible = false;
        equip(s.season);
      }
      shown++;
    }

    if (!active) {
      wingG.visible = false;
      applyStub();
    } else {
      wingG.visible = true;
      applyStub();
      const speed = Math.hypot(P.vel.x, P.vel.z, Math.min(Math.abs(P.vel.y), 8));
      const airborne = P.state === 'air';
      boostT = Math.max(0, boostT - dt);
      let want;
      if (poseLock) want = poseLock;
      else if (boostT > 0 || (airborne && speed > 2)) want = 'flap';
      else if (airborne || speed > 4) want = 'open';
      else want = 'folded';
      mode = want;
      layoutWings(want === 'folded' ? 'folded' : 'open');
      if (want === 'flap') {
        flapPhase += dt * FLAP_FPS;
        setWingMaps(active, 'flap', flapPhase | 0);
        // extra flap rock
        wingL.rotation.z += -0.12 * Math.sin(flapPhase * 0.8);
        wingR.rotation.z += 0.12 * Math.sin(flapPhase * 0.8);
      } else if (want === 'open') {
        setWingMaps(active, 'open', 0);
      } else {
        setWingMaps(active, 'folded', 0);
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
    applyStub();
  }

  let forcePick = null;
  function setForcePick(v) { forcePick = v; if (v) for (const s of spawns) s.taken = false; }

  function update2(dt, P, cam) {
    if (forcePick) {
      let n = 0;
      const maxN = (P.pos.y >= 330 && active) ? 1 : MAX_GLOW; // winter+wings: 1 pickup for ≤40 draws
      for (const s of spawns) {
        if (forcePick !== 'all' && s.season !== forcePick) continue;
        if (n >= maxN) break;
        s.taken = false;
        // lane jump-arc for capture
        s.y = P.pos.y + 1.6 + n * 0.4;
        s.ahead = 1.8 + n * 0.7;
        s.x = (n % 2 ? 1 : -1) * (0.7 + n * 0.35);
        n++;
      }
    }
    update(dt, P, cam);
  }

  // restore equipped wings from local store (visual only)
  if (active) {
    wingG.visible = true;
    layoutWings('open');
    setWingMaps(active, 'open', 0);
  } else wingG.visible = false;
  applyStub();

  return {
    update: update2, equip, forceWings, grant, demoShop, getShopState, setActiveFromShop, setForcePick,
    get active() { return active; },
    get mode() { return mode; },
    spawns, wingG, pickRoot,
  };
}
