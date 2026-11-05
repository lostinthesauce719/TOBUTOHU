// skyrunner.js — BRUSH skyrunner_prod hybrid (A walnut frame + C paper layers).
// PREVIEW BRANCH ONLY. VISUAL ONLY: reads camera / climber height / sim time / shelf boxes.
// Never writes sim state. Pad hitboxes from the manifest align sprites to shelf tops;
// collision stays on the existing tobu-sim-7 shelf/wall boxes (honest systems).
import * as THREE from './vendor/three.module.min.js';
import { zoneMix, SEASON_BOUNDS, XFADE_M } from './clipkit.js';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const LAYER_KEYS = [
  { file: 'layer_00_sky', role: 'sky', factor: 0.15, z: -92, tag: 'far' },
  { file: 'layer_01_far', role: 'far', factor: 0.35, z: -74, tag: 'far' },
  { file: 'layer_02_mid', role: 'mid', factor: 0.55, z: -56, tag: 'mid' },
  { file: 'layer_03_mist', role: 'mist', factor: 0.70, z: -42, tag: 'mid' },
  { file: 'layer_04_near', role: 'near', factor: 0.90, z: -28, tag: 'fg' },
];
const BASE = './art/skyrunner';
// World width of a full layer plane (lane ~8 u wide; walls sit near ±4.6).
const LAYER_W = 72;
const LAYER_H = LAYER_W * (1920 / 1080);
// Shelf tops are 8 u wide; pad sprites scale so their opaque top reads across that span.
const PAD_WORLD_W = 9.2;

function loadTex(loader, url, { wrap = false, flipY = true } = {}) {
  return new Promise((res, rej) => loader.load(url, t => {
    t.colorSpace = THREE.SRGBColorSpace || THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.flipY = flipY;
    if (wrap) {
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1, 1);
    } else {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    }
    res(t);
  }, undefined, rej));
}

function matFor(map, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    map, transparent: true, opacity, depthWrite: false, depthTest: false,
    fog: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

export async function createSkyrunner(scene, opts = {}) {
  const reduceMotion = !!opts.reduceMotion;
  const loader = new THREE.TextureLoader();
  const root = new THREE.Group();
  root.userData.scenery = 1;
  root.userData.skyrunner = 1;
  root.userData.layer = 'far';
  scene.add(root);

  // ---- load manifest (hitboxes + nine-slice) ----
  const manifest = await (await fetch(`${BASE}/manifest.json`)).json();
  const hitboxes = manifest.pad_hitboxes_1x || {};

  // ---- parallax layers: one mesh per (season, layer); opacity cross-fades ----
  const layerMeshes = {}; // season -> [5 meshes]
  await Promise.all(SEASONS.map(async season => {
    const list = [];
    for (let i = 0; i < LAYER_KEYS.length; i++) {
      const L = LAYER_KEYS[i];
      const tex = await loadTex(loader, `${BASE}/${season}/${L.file}.png`, { wrap: true });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(LAYER_W, LAYER_H), matFor(tex, 0));
      m.frustumCulled = false;
      m.renderOrder = -20 + i;
      m.userData.layer = L.tag;
      m.userData.factor = L.factor;
      m.userData.role = L.role;
      m.userData.season = season;
      m.position.set(0, 0, L.z);
      root.add(m);
      list.push(m);
    }
    layerMeshes[season] = list;
  }));

  // ---- pads (shelf toppers) ----
  const padMaps = {}; // season -> [3 textures]
  const padShadowMaps = {};
  const padMeta = {}; // season -> [{w,h,hit}]
  await Promise.all(SEASONS.map(async season => {
    padMaps[season] = [];
    padShadowMaps[season] = [];
    padMeta[season] = [];
    for (let i = 0; i < 3; i++) {
      const rel = `pads/${season}/pad_${String(i).padStart(2, '0')}.png`;
      const tex = await loadTex(loader, `${BASE}/${rel}`);
      const sh = await loadTex(loader, `${BASE}/pads/${season}/pad_${String(i).padStart(2, '0')}_shadow.png`);
      padMaps[season].push(tex);
      padShadowMaps[season].push(sh);
      const asset = (manifest.assets || []).find(a => a.path === rel) || {};
      const hit = hitboxes[rel] || asset.hitbox || { top_y: 0, width: 80, center_x: 140, left: 100, right: 180 };
      padMeta[season].push({
        w: asset.width || tex.image.width,
        h: asset.height || tex.image.height,
        hit,
      });
    }
  }));

  const padByBox = new Map(); // box.id -> { mesh, shadow, season, idx }
  const PAD_POOL = 48;
  const padPool = [];
  for (let i = 0; i < PAD_POOL; i++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matFor(padMaps.spring[0]));
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    mesh.userData.layer = 'play';
    mesh.visible = false;
    root.add(mesh);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), matFor(padShadowMaps.spring[0], 0.55));
    shadow.frustumCulled = false;
    shadow.renderOrder = 0;
    shadow.userData.layer = 'play';
    shadow.visible = false;
    root.add(shadow);
    padPool.push({ mesh, shadow, used: false });
  }

  function seasonAt(y) {
    const zm = zoneMix(Math.max(0, y));
    return zm.t < 0.5 ? zm.a : zm.b;
  }

  function allocPad() {
    for (const p of padPool) if (!p.used) { p.used = true; return p; }
    return null;
  }

  function placePad(b) {
    if (!b || b.kind !== 'shelf' || b.gone) return;
    if (padByBox.has(b.id)) return;
    const slot = allocPad();
    if (!slot) return;
    const season = seasonAt(b.y);
    // Deterministic variant from box id (no Math.random).
    const idx = ((b.id * 2654435761) >>> 0) % 3;
    const meta = padMeta[season][idx];
    const hit = meta.hit;
    // Manifest hitbox.width (1x px) drives pad scale; floor keeps tiny legacy gaps playable.
    const hitW = Math.max(hit.width || 1, 40);
    const worldW = Math.max(PAD_WORLD_W, (b.hx || 4) * 2.1);
    const aspect = meta.h / meta.w;
    const worldH = worldW * aspect;
    slot.mesh.material.map = padMaps[season][idx];
    slot.mesh.material.needsUpdate = true;
    slot.shadow.material.map = padShadowMaps[season][idx];
    slot.shadow.material.needsUpdate = true;
    // Center of the pad sprite aligns to the shelf center; hitbox.center_x shifts slightly.
    const cxNorm = ((hit.center_x || meta.w / 2) - meta.w / 2) / meta.w;
    const xOff = -cxNorm * worldW * 0.15;
    const topY = (b.top != null ? b.top : (b.y + b.hy)) + 0.04;
    // hit.top_y is px from sprite top to landing surface; map into worldH.
    const topFrac = Math.max(0, Math.min(0.85, (hit.top_y || 0) / Math.max(1, meta.h)));
    slot.mesh.scale.set(worldW, worldH, 1);
    const yLift = worldH * (0.5 - topFrac);
    slot.mesh.position.set(b.x + xOff, topY + yLift, b.z);
    // Slight tilt so the paper pad reads facing the chase cam.
    slot.mesh.rotation.set(-0.55, 0, 0);
    slot.mesh.visible = true;
    slot.shadow.scale.set(worldW * 1.05, worldH * 1.05, 1);
    slot.shadow.position.set(b.x + xOff + 0.15, topY + 0.02, b.z + 0.35);
    slot.shadow.rotation.set(-Math.PI / 2, 0, 0);
    slot.shadow.visible = true;
    padByBox.set(b.id, { slot, season, idx, b, worldW, worldH, xOff, hitW, yLift });
  }

  function removePad(b) {
    const ent = padByBox.get(b && b.id);
    if (!ent) return;
    ent.slot.mesh.visible = false;
    ent.slot.shadow.visible = false;
    ent.slot.used = false;
    padByBox.delete(b.id);
  }

  function syncPads(boxes) {
    const live = new Set();
    for (const b of boxes) {
      if (b.kind !== 'shelf' || b.gone) continue;
      live.add(b.id);
      if (!padByBox.has(b.id)) placePad(b);
      else {
        // Keep pad glued to the box (breakables shake is visual-only on mesh, not box).
        const ent = padByBox.get(b.id);
        const topY = (b.top != null ? b.top : (b.y + b.hy)) + 0.04;
        ent.slot.mesh.position.set(b.x + ent.xOff, topY + (ent.yLift ?? ent.worldH * 0.28), b.z);
        ent.slot.shadow.position.set(b.x + ent.xOff + 0.15, topY + 0.02, b.z + 0.35);
        // Soft season swap when the climber has crossed a gate past this shelf.
        const want = seasonAt(b.y);
        if (want !== ent.season) {
          ent.season = want;
          ent.slot.mesh.material.map = padMaps[want][ent.idx];
          ent.slot.mesh.material.needsUpdate = true;
          ent.slot.shadow.material.map = padShadowMaps[want][ent.idx];
          ent.slot.shadow.material.needsUpdate = true;
        }
      }
    }
    for (const [id, ent] of [...padByBox]) {
      if (!live.has(id)) removePad(ent.b);
    }
  }

  // ---- torii + glow at season gates ----
  const toriiTex = await loadTex(loader, `${BASE}/torii/torii.png`);
  const glowTex = await loadTex(loader, `${BASE}/torii/torii_glow.png`);
  // Tint glow toward gold #E8C050 per INTEGRATION.md note.
  const glowMat = matFor(glowTex, 0.85);
  glowMat.color = new THREE.Color(0xE8C050);
  const toriiGroup = new THREE.Group();
  toriiGroup.userData.layer = 'mid';
  root.add(toriiGroup);
  const gateMeshes = SEASON_BOUNDS.map((bh, i) => {
    const side = bh === 250 ? -1 : 1;
    const g = new THREE.Group();
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), glowMat.clone());
    glow.position.set(0, 0, -0.2);
    glow.frustumCulled = false;
    glow.renderOrder = 3;
    glow.userData.layer = 'mid';
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(12, 10.3), matFor(toriiTex));
    gate.frustumCulled = false;
    gate.renderOrder = 4;
    gate.userData.layer = 'mid';
    g.add(glow); g.add(gate);
    g.position.set(side * 9.5, bh + 3.5, 0);
    g.rotation.y = side * 0.25;
    g.visible = false;
    g.userData.bh = bh;
    g.userData.side = side;
    toriiGroup.add(g);
    return g;
  });

  // ---- transition flats (slide + crossfade near gates) ----
  const edgeTop = await loadTex(loader, `${BASE}/transitions/flat_top_edge.png`);
  const edgeBot = await loadTex(loader, `${BASE}/transitions/flat_bottom_edge.png`);
  const panelTex = {};
  await Promise.all(SEASONS.map(async s => {
    panelTex[s] = await loadTex(loader, `${BASE}/transitions/flat_panel_${s}.png`);
  }));
  const xfade = new THREE.Group();
  xfade.userData.layer = 'mid';
  root.add(xfade);
  const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(LAYER_W * 0.95, 22), matFor(panelTex.spring, 0));
  panelMesh.frustumCulled = false;
  panelMesh.renderOrder = 5;
  panelMesh.position.z = -24;
  xfade.add(panelMesh);
  const topEdge = new THREE.Mesh(new THREE.PlaneGeometry(LAYER_W * 0.95, 4), matFor(edgeTop, 0));
  topEdge.frustumCulled = false;
  topEdge.renderOrder = 6;
  topEdge.position.set(0, 10, -23.5);
  xfade.add(topEdge);
  const botEdge = new THREE.Mesh(new THREE.PlaneGeometry(LAYER_W * 0.95, 4), matFor(edgeBot, 0));
  botEdge.frustumCulled = false;
  botEdge.renderOrder = 6;
  botEdge.position.set(0, -10, -23.5);
  xfade.add(botEdge);

  // ---- walnut stage frame (DOM HUD overlay) ----
  const frameEl = document.createElement('div');
  frameEl.id = 'skyFrame';
  frameEl.setAttribute('aria-hidden', 'true');
  Object.assign(frameEl.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '40',
    background: `url(${BASE}/frame/stage_frame_1080x1920.png) center / cover no-repeat`,
    opacity: '1',
  });
  document.body.appendChild(frameEl);

  // Soft letterbox so the clear center of the 9-slice reads on non-9:16 viewports.
  // Insets from manifest: L125 R125 T225 B175 on 1080×1920.
  const inset = manifest.nine_slice_frame || { left: 125, right: 125, top: 225, bottom: 175 };

  function update(cam, h, t, boxes) {
    // Root tracks camera so layers fill the view; Y scroll is parallax-only.
    root.position.set(cam.position.x, cam.position.y, cam.position.z);
    const zm = zoneMix(Math.max(0, h));
    const W = { spring: 0, summer: 0, autumn: 0, winter: 0 };
    W[zm.a] += 1 - zm.t; W[zm.b] += zm.t;

    for (const season of SEASONS) {
      const op = W[season];
      const list = layerMeshes[season];
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        const factor = m.userData.factor;
        // Vertical tile scroll: UV offset tracks rise × factor (near scrolls more).
        const tex = m.material.map;
        if (tex) {
          const tile = reduceMotion ? 0 : (h * factor) / LAYER_H;
          tex.offset.y = -tile;
        }
        // Lateral depth cue from camera X.
        m.position.x = -cam.position.x * (1 - factor) * 0.15;
        m.position.y = -h * (1 - factor) * 0.08;
        // Face the chase cam so the paper stack fills the portrait frame.
        m.quaternion.copy(cam.quaternion);
        m.material.opacity = op;
        m.visible = op > 0.01;
      }
    }

    // Torii: reveal as climber approaches each gate; park at climber depth.
    for (const g of gateMeshes) {
      const bh = g.userData.bh;
      const dist = h - bh;
      const show = h >= bh - XFADE_M && h <= bh + XFADE_M * 2.5;
      g.visible = show;
      if (show) {
        const k = 1 - Math.min(1, Math.abs(dist) / (XFADE_M * 1.5));
        g.position.z = -14;
        g.children.forEach(c => { if (c.material) c.material.opacity = 0.35 + 0.65 * k; });
        // Soft bob (seeded by gate height, no wall clock).
        g.position.y = bh + 3.5 + (reduceMotion ? 0 : 0.15 * Math.sin(t * 1.1 + bh * 0.01));
      }
    }

    // Transition flats: strongest inside the gate fade window.
    let gateT = 0, nextSeason = zm.b;
    for (const bh of SEASON_BOUNDS) {
      const u = (h - bh + XFADE_M / 2) / XFADE_M;
      if (u >= 0 && u <= 1) {
        const s = u * u * (3 - 2 * u);
        const peak = 4 * s * (1 - s); // mid-fade peak
        if (peak > gateT) {
          gateT = peak;
          const idx = SEASON_BOUNDS.indexOf(bh);
          nextSeason = SEASONS[Math.min(3, idx + 1)];
        }
      }
    }
    const pop = Math.min(1, gateT * 1.4);
    panelMesh.material.map = panelTex[nextSeason];
    panelMesh.material.needsUpdate = true;
    panelMesh.material.opacity = pop * 0.85;
    topEdge.material.opacity = pop;
    botEdge.material.opacity = pop;
    // Slide panel upward through the gate.
    panelMesh.position.y = (1 - pop) * -8 + pop * 2;
    panelMesh.quaternion.copy(cam.quaternion);
    topEdge.quaternion.copy(cam.quaternion);
    botEdge.quaternion.copy(cam.quaternion);
    xfade.visible = pop > 0.02;

    if (boxes) syncPads(boxes);
  }

  function applyLayer(name) {
    const all = !name || name === 'all';
    for (const season of SEASONS) for (const m of layerMeshes[season]) {
      m.visible = all || m.userData.layer === name;
    }
    toriiGroup.visible = all || name === 'mid';
    xfade.visible = all || name === 'mid';
    for (const [, ent] of padByBox) {
      const on = all || name === 'play';
      ent.slot.mesh.visible = on;
      ent.slot.shadow.visible = on;
    }
    if (frameEl) frameEl.style.display = (all || name === 'fg') ? '' : 'none';
  }

  return {
    root,
    frameEl,
    inset,
    placePad,
    removePad,
    syncPads,
    update,
    applyLayer,
    // Draw budget hint for SIM title dumps.
    get draws() {
      let n = 0;
      for (const s of SEASONS) for (const m of layerMeshes[s]) if (m.visible && m.material.opacity > 0.01) n++;
      n += padByBox.size * 2;
      for (const g of gateMeshes) if (g.visible) n += 2;
      if (xfade.visible) n += 3;
      return n;
    },
  };
}
