// Tobu power-ups visuals (BRUSH clipstyle). Reads sim wing/coin state — never writes sim.
// Shop buy/equip goes through wallet.js; prices from economy.js.
import * as THREE from './vendor/three.module.min.js';
import { ECONOMY } from './economy.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
export const SEASON_META = {
  spring: { label: 'Wings', blurb: 'Boosted jump + short glide', unlockH: 0 },
  summer: { label: 'Wings', blurb: 'Mint glide through the cliffs', unlockH: 120 },
  autumn: { label: 'Wings', blurb: 'Gold-tinted glide', unlockH: 250 },
  winter: { label: 'Wings', blurb: 'Unlocks at height 400 m', unlockH: 400 },
};
export const SHOP_MODE = 'rows'; // four seasonal rows (colour by season)

const BL = 1.1;
const OPEN_SPAN = 1.6 * BL;
const OPEN_H = 0.95 * BL;
const FOLD_LEN = 0.7 * BL;
const FOLD_W = 0.28 * BL;
const PICK_SCALE = 0.9;
const MAX_GLOW = 2;
const FLAP_FPS = 12;
const SHADOW = 0x1C2438;
const COIN_SCALE = 0.55;

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

export async function createPowerups(scene, seed, hero, sim, wallet) {
  const loader = new THREE.TextureLoader();
  const pickMaps = {};
  const wingOpen = {}, wingFold = {}, wingFlap = {};
  await Promise.all(SEASONS.map(async s => {
    pickMaps[s] = await loadTex(loader, `./art/powerups/pickups/${s}_256.png`);
    wingOpen[s] = await loadTex(loader, `./art/powerups/wings/${s}_open.png`);
    wingFold[s] = await loadTex(loader, `./art/powerups/wings/${s}_folded.png`);
    wingFlap[s] = await loadTex(loader, `./art/powerups/wings/${s}_flap_sheet.png`);
  }));

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

  // Coin meshes (simple gold disc — visual only; sim owns collection)
  const coinRoot = new THREE.Group();
  coinRoot.userData.layer = 'play';
  scene.add(coinRoot);
  const coinGeo = new THREE.CircleGeometry(0.5, 20);
  const coinMat = new THREE.MeshBasicMaterial({
    color: 0xE8CF8E, transparent: true, opacity: 0.95, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  const coinPool = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(coinGeo, coinMat.clone());
    m.visible = false; m.frustumCulled = false; m.renderOrder = 2; m.userData.layer = 'play';
    coinRoot.add(m); coinPool.push(m);
  }

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
    for (const mesh of [wingL, wingR]) {
      const side = mesh.userData.side;
      const sh = mesh.userData.shadow;
      if (kind === 'folded') {
        mesh.scale.set(FOLD_W * (side < 0 ? 1 : -1), FOLD_LEN, 1);
        mesh.position.set(side * 0.04 * BL, 0.02 * BL, -0.22 * BL);
        mesh.rotation.set(0.08, side * 0.08, side * 0.05);
        sh.scale.set(1.05, 1.05, 1);
        sh.material.opacity = 0.22;
      } else {
        const half = OPEN_SPAN * 0.5;
        mesh.scale.set(half * (side < 0 ? 1 : -1), OPEN_H, 1);
        mesh.position.set(side * 0.06 * BL, 0.10 * BL, -0.10 * BL);
        mesh.rotation.set(-0.25, side * 0.85, side * 0.15);
        sh.scale.set(1.08, 1.08, 1);
        sh.material.opacity = 0.30;
      }
    }
  }
  layoutWings('folded');

  let flapPhase = 0;
  let mode = 'folded';
  let poseLock = null;
  let forcePick = null;
  let forceActive = null; // shot override

  function setWingMaps(season, kind, frame) {
    const L = wingL.material, R = wingR.material;
    const sL = wingL.userData.shadow.material, sR = wingR.userData.shadow.material;
    L.opacity = 1; R.opacity = 1;
    if (kind === 'flap') {
      const tL = flapL[season], tR = flapR[season];
      const u = (frame % 8) / 8;
      tL.offset.x = u; tR.offset.x = u;
      L.map = tL; R.map = tR; sL.map = tL; sR.map = tR;
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
    if (hero.setStubWings) hero.setStubWings(true);
  }

  function forceWings(season, pose) {
    forceActive = season;
    mode = pose || 'open';
    poseLock = mode;
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
    const spawns = (sim && sim.wingPickups) || [];
    const coins = (sim && sim.coinPickups) || [];

    // --- wing pickups from sim ---
    cand.length = 0;
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      if (s.taken && !forcePick) continue;
      if (forcePick && forcePick !== 'all' && s.season !== forcePick) continue;
      const dy = s.y - py;
      if (dy < -5 || dy > 18) continue;
      const wx = forcePick ? ((i % 2 ? 1 : -1) * (0.7 + (cand.length) * 0.35)) : s.x;
      const wy = forcePick ? (py + 1.6 + cand.length * 0.4) : s.y;
      const ahead = forcePick ? (1.8 + cand.length * 0.7) : s.ahead;
      const wz = pz - ahead;
      const dx = wx - px, dz = wz - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      cand.push({ i, d2, wx, wy, wz, season: s.season, id: s.id });
    }
    cand.sort((a, b) => a.d2 - b.d2);

    for (const m of pool) m.visible = false;
    let shown = 0;
    const activeWing = forceActive || (P.wings || null);
    const maxShow = (py >= 330 && activeWing) ? 1 : MAX_GLOW;
    for (const c of cand) {
      if (shown >= maxShow) break;
      const mesh = pool[shown];
      mesh.material.map = pickMaps[c.season];
      mesh.material.needsUpdate = true;
      const bob = Math.sin(P.t * 1.8 + c.id) * 0.10;
      mesh.position.set(c.wx, c.wy + bob, c.wz);
      mesh.scale.setScalar(PICK_SCALE);
      mesh.quaternion.copy(_camQ);
      mesh.material.opacity = 1;
      mesh.visible = true;
      shown++;
    }

    // --- coins ---
    for (const m of coinPool) m.visible = false;
    let ci = 0;
    for (const c of coins) {
      if (c.taken) continue;
      const dy = c.y - py;
      if (dy < -4 || dy > 14) continue;
      if (ci >= coinPool.length) break;
      const mesh = coinPool[ci++];
      const bob = Math.sin(P.t * 2.4 + c.id) * 0.08;
      mesh.position.set(c.x, c.y + bob, pz - c.ahead);
      mesh.scale.setScalar(COIN_SCALE);
      mesh.quaternion.copy(_camQ);
      mesh.visible = true;
    }

    // --- wings follow sim (or shot lock) ---
    const season = forceActive || P.wings;
    if (!season) {
      wingG.visible = false;
      applyStub();
      mode = 'folded';
    } else {
      wingG.visible = true;
      applyStub();
      const speed = Math.hypot(P.vel.x, P.vel.z, Math.min(Math.abs(P.vel.y), 8));
      const airborne = P.state === 'air';
      const boosting = !!(sim && sim.wingLive && sim.wingLive());
      let want;
      if (poseLock) want = poseLock;
      else if (boosting || (airborne && speed > 2)) want = 'flap';
      else if (airborne || speed > 4) want = 'open';
      else want = 'folded';
      mode = want;
      layoutWings(want === 'folded' ? 'folded' : 'open');
      if (want === 'flap') {
        flapPhase += dt * FLAP_FPS;
        setWingMaps(season, 'flap', flapPhase | 0);
        wingL.rotation.z += -0.12 * Math.sin(flapPhase * 0.8);
        wingR.rotation.z += 0.12 * Math.sin(flapPhase * 0.8);
      } else if (want === 'open') {
        setWingMaps(season, 'open', 0);
      } else {
        setWingMaps(season, 'folded', 0);
      }
    }
  }

  function getShopState(bestH) {
    const owned = wallet ? wallet.owned : {};
    const active = wallet ? wallet.active : null;
    const rows = SEASONS.map(s => {
      const meta = SEASON_META[s];
      let state;
      if (owned[s]) state = (active === s) ? 'active' : 'owned';
      else if ((bestH | 0) >= meta.unlockH) state = 'available';
      else state = 'locked';
      return {
        season: s, ...meta, state,
        coinCost: ECONOMY.wings.coinPrice[s],
        gemCost: ECONOMY.wings.gemPrice[s],
      };
    });
    return {
      mode: SHOP_MODE,
      active,
      rows,
      owned,
      coins: wallet ? wallet.coins : 0,
      gems: wallet ? wallet.gems : 0,
      gemPacks: ECONOMY.gems.packs,
      rankedPolicy: ECONOMY.ranked,
    };
  }

  function setActiveFromShop(season) {
    if (!wallet) return 'bad';
    const row = getShopState(1e9).rows.find(r => r.season === season);
    if (!row || row.state === 'locked') return 'locked';
    if (row.state === 'available') return 'buy'; // need buy() with pay method
    return wallet.equip(season);
  }

  function buy(season, pay, bestH) {
    if (!wallet) return 'bad';
    return wallet.buy(season, pay, bestH);
  }

  function grant(season) {
    if (wallet) wallet.grant(season);
  }

  function demoShop() {
    if (!wallet) return;
    wallet.debugSet({ coins: 500, gems: 25 });
    wallet.grant('summer');
  }

  function setForcePick(v) { forcePick = v; }

  applyStub();
  wingG.visible = false;

  return {
    update, forceWings, grant, demoShop, getShopState, setActiveFromShop, buy, setForcePick,
    get active() { return forceActive || (sim && sim.P && sim.P.wings) || (wallet && wallet.active) || null; },
    get mode() { return mode; },
    spawns: (sim && sim.wingPickups) || [],
    wingG, pickRoot, coinRoot,
  };
}
