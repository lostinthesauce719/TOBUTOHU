// skyrunner.js — BRUSH skyrunner hybrid PREVIEW. VISUAL ONLY; never writes sim.
// sky4: frustum-fit depth-tested layers, one-season stack, edge-masked near/fg,
// short gate wipe, big torii, border-only frame + live HUD, decorative pads.
import * as THREE from './vendor/three.module.min.js';
import { zoneMix, SEASON_BOUNDS, XFADE_M } from './clipkit.js';

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const LAYER_KEYS = [
  { file: 'layer_00_sky', role: 'sky', factor: 0.15, z: -150, tag: 'far', edgeMask: false },
  { file: 'layer_01_far', role: 'far', factor: 0.35, z: -120, tag: 'far', edgeMask: false },
  { file: 'layer_02_mid', role: 'mid', factor: 0.55, z: -92, tag: 'mid', edgeMask: false },
  { file: 'layer_03_mist', role: 'mist', factor: 0.70, z: -70, tag: 'mid', edgeMask: true },
  { file: 'layer_04_near', role: 'near', factor: 0.90, z: -48, tag: 'fg', edgeMask: true },
];
const BASE = './art/skyrunner';
const PAD_MAX = 3; // visible pad budget (draws); shadows off to stay ≤45

function loadTex(loader, url, { wrap = false } = {}) {
  return new Promise((res, rej) => loader.load(url, t => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.flipY = true;
    if (wrap) { t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; }
    else { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; }
    res(t);
  }, undefined, rej));
}

function basicMat(map, { opacity = 1, depthTest = true, depthWrite = true, transparent = false } = {}) {
  return new THREE.MeshBasicMaterial({
    map, transparent: transparent || opacity < 1, opacity,
    depthTest, depthWrite, fog: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

// Near/mist: keep left/right edges, clear center play lane.
function edgeMaskMat(map, opacity = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      opacity: { value: opacity },
      // uv |x-0.5| below clearR → fully clear; above edgeR → full art
      clearR: { value: 0.18 },
      edgeR: { value: 0.42 },
    },
    transparent: true, depthTest: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      uniform sampler2D map; uniform float opacity, clearR, edgeR;
      varying vec2 vUv;
      void main(){
        vec4 c = texture2D(map, vUv);
        float ax = abs(vUv.x - 0.5);
        float edge = smoothstep(clearR, edgeR, ax);
        float a = c.a * opacity * edge;
        if (a < 0.02) discard;
        gl_FragColor = vec4(c.rgb, a);
      }`,
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
  scene.background = new THREE.Color(0xC8D8EC);
  // layerRig rides the camera (pos+quat) so billboard local -Z is the view axis — kills black frustum voids.
  const layerRig = new THREE.Group();
  layerRig.userData.layer = 'far';
  root.add(layerRig);
  const worldFx = new THREE.Group(); // pads / torii / wipe in world-ish space under root
  worldFx.userData.layer = 'mid';
  root.add(worldFx);

  const manifest = await (await fetch(`${BASE}/manifest.json`)).json();
  const hitboxes = manifest.pad_hitboxes_1x || {};

  // ---- textures per season/layer (loaded once) ----
  const tex = {}; // season -> [5 textures]
  await Promise.all(SEASONS.map(async season => {
    tex[season] = [];
    for (const L of LAYER_KEYS) {
      tex[season].push(await loadTex(loader, `${BASE}/${season}/${L.file}.png`, { wrap: true }));
    }
  }));

  // ---- ONE set of 5 layer meshes; maps swap on season change ----
  const layers = LAYER_KEYS.map((L, i) => {
    const map = tex.spring[i];
    let mat;
    if (L.edgeMask) {
      mat = edgeMaskMat(map, 1);
    } else if (L.role === 'sky') {
      // Full-frame fill — no depth test so transparent holes in far/mid never flash black clear-color.
      mat = basicMat(map, { depthTest: false, depthWrite: false, transparent: false, opacity: 1 });
    } else {
      // far/mid: depth-tested paper; alphaTest punches soft edges without black voids (sky shows through).
      mat = basicMat(map, { depthTest: true, depthWrite: true, transparent: true, opacity: 1 });
      mat.alphaTest = 0.08;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.frustumCulled = false;
    m.renderOrder = L.role === 'sky' ? -40 : (-30 + i);
    m.userData.layer = L.tag;
    m.userData.factor = L.factor;
    m.userData.role = L.role;
    m.userData.z0 = L.z;
    m.userData.edgeMask = L.edgeMask;
    m.position.set(0, 0, L.z);
    layerRig.add(m);
    return m;
  });
  let activeSeason = 'spring';
  let fadeSeason = null;
  let fadeT = 0; // 0..1 during short wipe

  function applySeasonMaps(season) {
    for (let i = 0; i < layers.length; i++) {
      const m = layers[i];
      const map = tex[season][i];
      if (m.userData.edgeMask) m.material.uniforms.map.value = map;
      else { m.material.map = map; m.material.needsUpdate = true; }
    }
    activeSeason = season;
  }
  applySeasonMaps('spring');

  // ---- pads (decorative, flat on shelf tops) ----
  const padMaps = {}, padShadowMaps = {}, padMeta = {};
  await Promise.all(SEASONS.map(async season => {
    padMaps[season] = []; padShadowMaps[season] = []; padMeta[season] = [];
    for (let i = 0; i < 3; i++) {
      const rel = `pads/${season}/pad_${String(i).padStart(2, '0')}.png`;
      const t = await loadTex(loader, `${BASE}/${rel}`);
      const sh = await loadTex(loader, `${BASE}/pads/${season}/pad_${String(i).padStart(2, '0')}_shadow.png`);
      padMaps[season].push(t); padShadowMaps[season].push(sh);
      const asset = (manifest.assets || []).find(a => a.path === rel) || {};
      const hit = hitboxes[rel] || asset.hitbox || { top_y: 0, width: 80, center_x: 140 };
      padMeta[season].push({ w: asset.width || t.image.width, h: asset.height || t.image.height, hit });
    }
  }));

  const padByBox = new Map();
  const padPool = [];
  for (let i = 0; i < 24; i++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basicMat(padMaps.spring[0], { transparent: true, depthTest: true, depthWrite: false, opacity: 0.82 }));
    mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.userData.layer = 'play'; mesh.visible = false; worldFx.add(mesh);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basicMat(padShadowMaps.spring[0], { transparent: true, depthTest: true, depthWrite: false, opacity: 0.22 }));
    shadow.frustumCulled = false; shadow.renderOrder = 1; shadow.userData.layer = 'play'; shadow.visible = false; worldFx.add(shadow);
    padPool.push({ mesh, shadow, used: false });
  }
  function allocPad() { for (const p of padPool) if (!p.used) { p.used = true; return p; } return null; }

  function seasonAt(y) {
    const zm = zoneMix(Math.max(0, y));
    return zm.t < 0.5 ? zm.a : zm.b;
  }

  function placePad(b) {
    if (!b || b.kind !== 'shelf' || b.gone) return;
    if (padByBox.has(b.id)) return;
    const slot = allocPad();
    if (!slot) return;
    const season = seasonAt(b.y);
    const idx = ((b.id * 2654435761) >>> 0) % 3;
    const meta = padMeta[season][idx];
    const hit = meta.hit;
    const worldW = Math.max(6.5, (b.hx || 4) * 1.85);
    const aspect = meta.h / Math.max(1, meta.w);
    const worldH = worldW * aspect * 0.42; // flatter decorative footprint
    slot.mesh.material.map = padMaps[season][idx];
    slot.mesh.material.needsUpdate = true;
    slot.shadow.material.map = padShadowMaps[season][idx];
    slot.shadow.material.needsUpdate = true;
    const topY = (b.top != null ? b.top : (b.y + b.hy)) + 0.03;
    const topFrac = Math.max(0, Math.min(0.7, (hit.top_y || 0) / Math.max(1, meta.h)));
    slot.mesh.scale.set(worldW, worldH, 1);
    // Flat on shelf top — decorative, collider is the shelf ghost underneath.
    slot.mesh.rotation.set(-Math.PI / 2, 0, 0);
    slot.mesh.position.set(b.x, topY + 0.04, b.z);
    slot.mesh.visible = true;
    slot.shadow.scale.set(worldW * 1.05, worldH * 0.9, 1);
    slot.shadow.rotation.set(-Math.PI / 2, 0, 0);
    slot.shadow.position.set(b.x + 0.1, topY + 0.01, b.z + 0.2);
    slot.shadow.visible = false; // muted: no orphan/extra shadow discs
    padByBox.set(b.id, { slot, season, idx, b, worldW, worldH });
  }

  function removePad(b) {
    const ent = padByBox.get(b && b.id);
    if (!ent) return;
    ent.slot.mesh.visible = false; ent.slot.shadow.visible = false; ent.slot.used = false;
    padByBox.delete(b.id);
  }

  function syncPads(boxes, heroZ) {
    const live = new Set();
    const ranked = [];
    for (const b of boxes) {
      if (b.kind !== 'shelf' || b.gone) continue;
      live.add(b.id);
      ranked.push(b);
      if (!padByBox.has(b.id)) placePad(b);
      else {
        const ent = padByBox.get(b.id);
        const topY = (b.top != null ? b.top : (b.y + b.hy)) + 0.03;
        ent.slot.mesh.position.set(b.x, topY + 0.04, b.z);
        ent.slot.shadow.position.set(b.x + 0.1, topY + 0.01, b.z + 0.2);
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
    for (const [id, ent] of [...padByBox]) if (!live.has(id)) removePad(ent.b);
    // Cull distant pads for draw budget — keep PAD_MAX nearest to hero.
    if (heroZ != null && padByBox.size > PAD_MAX) {
      const arr = [...padByBox.values()].sort((a, b) => Math.abs(a.b.z - heroZ) - Math.abs(b.b.z - heroZ));
      arr.forEach((ent, i) => {
        const on = i < PAD_MAX;
        ent.slot.mesh.visible = on;
        ent.slot.shadow.visible = false;
      });
    }
  }

  // ---- torii (bigger, readable) ----
  const toriiTex = await loadTex(loader, `${BASE}/torii/torii.png`);
  const glowTex = await loadTex(loader, `${BASE}/torii/torii_glow.png`);
  const toriiGroup = new THREE.Group(); toriiGroup.userData.layer = 'mid'; worldFx.add(toriiGroup);
  const gateMeshes = SEASON_BOUNDS.map((bh) => {
    const side = bh === 250 ? -1 : 1;
    const g = new THREE.Group();
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(22, 19), basicMat(glowTex, { transparent: true, depthTest: true, depthWrite: false, opacity: 0.9 }));
    glow.material.color = new THREE.Color(0xE8C050);
    glow.position.set(0, 0, -0.3); glow.frustumCulled = false; glow.renderOrder = 3; glow.userData.layer = 'mid';
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(18, 15.5), basicMat(toriiTex, { transparent: true, depthTest: true, depthWrite: false, opacity: 1 }));
    gate.frustumCulled = false; gate.renderOrder = 4; gate.userData.layer = 'mid';
    glow.visible=false; g.add(glow); g.add(gate); // glow off: draw budget at gates
    g.position.set(side * 7.5, bh + 5, -16);
    g.rotation.y = side * 0.2;
    g.visible = false; g.userData.bh = bh; g.userData.side = side;
    toriiGroup.add(g);
    return g;
  });

  // ---- short gate wipe (edges only, low panel) ----
  const edgeTop = await loadTex(loader, `${BASE}/transitions/flat_top_edge.png`);
  const edgeBot = await loadTex(loader, `${BASE}/transitions/flat_bottom_edge.png`);
  const xfade = new THREE.Group(); xfade.userData.layer = 'mid'; worldFx.add(xfade);
  const topE = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basicMat(edgeTop, { transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
  topE.frustumCulled = false; topE.renderOrder = 8; xfade.add(topE);
  const botE = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basicMat(edgeBot, { transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
  botE.frustumCulled = false; botE.renderOrder = 8; xfade.add(botE);
  // Soft veil (no big season panel art)
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: 0xF2EDE0, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false })
  );
  veil.frustumCulled = false; veil.renderOrder = 7; xfade.add(veil);

  // ---- border-only walnut frame + live HUD ----
  const frameEl = document.createElement('div');
  frameEl.id = 'skyFrame';
  frameEl.setAttribute('aria-hidden', 'true');
  const inset = manifest.nine_slice_frame || { left: 125, right: 125, top: 225, bottom: 175 };
  Object.assign(frameEl.style, {
    position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '4',
    background: `url(${BASE}/frame/stage_frame_1080x1920.png) center / cover no-repeat`,
  });
  // Live HUD strip inside the top wood (percent of viewport approximating 9-slice top)
  const hud = document.createElement('div');
  hud.id = 'skyHud';
  Object.assign(hud.style, {
    position: 'absolute', left: '12%', right: '12%', top: '3.5%', height: '7%',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontFamily: "Nunito,'Trebuchet MS',system-ui,sans-serif", fontWeight: '900',
    color: '#F2E8CC', textShadow: '0 1px 2px #1C1408', pointerEvents: 'none',
  });
  hud.innerHTML = `<span id="skyHudH" style="font-size:clamp(14px,3.6vw,28px)">0 m</span>
    <span style="display:flex;gap:14px;font-size:clamp(12px,3vw,22px)">
      <span id="skyHudGems">0 ◆</span><span id="skyHudCoins">0 ●</span>
    </span>`;
  frameEl.appendChild(hud);
  document.body.appendChild(frameEl);

  // Hide default top-left hud while sky frame owns height readout (keep accessible via skyHud)
  const legacyHud = document.getElementById('hud');
  if (legacyHud) legacyHud.style.opacity = '0';

  function fitLayerToFrustum(m, cam) {
    const z = m.userData.z0;
    const dist = Math.max(4, Math.abs(z));
    const vFov = cam.fov * Math.PI / 180;
    // Heavy overscan: portrait + cam pitch must never reveal clear-color gutters.
    const h = 2 * Math.tan(vFov / 2) * dist * 1.9;
    const aspect = Math.max(cam.aspect || 0.5, 0.5);
    const w = h * aspect * 2.4;
    m.scale.set(w, h, 1);
    m.position.z = z;
  }

  function update(cam, h, t, boxes, heroZ, hudState) {
    // root stays at origin; layerRig tracks camera so local -Z == view axis.
    layerRig.position.copy(cam.position);
    layerRig.quaternion.copy(cam.quaternion);
    // worldFx keeps world positions for pads; only origin (no cam parent offset)
    worldFx.position.set(0, 0, 0);
    worldFx.quaternion.identity();

    const zm = zoneMix(Math.max(0, h));
    // One season opaque; short wipe (~6 m) around gates instead of double stacks.
    const gateNear = SEASON_BOUNDS.some(bh => Math.abs(h - bh) < 6);
    const want = zm.t < 0.55 ? zm.a : zm.b;
    if (want !== activeSeason && !fadeSeason) {
      fadeSeason = want;
      fadeT = 0;
    }
    if (fadeSeason) {
      fadeT = Math.min(1, fadeT + (reduceMotion ? 0.08 : 0.045));
      // Mid-wipe: swap maps once past halfway.
      if (fadeT >= 0.5 && activeSeason !== fadeSeason) applySeasonMaps(fadeSeason);
      if (fadeT >= 1) { fadeSeason = null; fadeT = 0; }
    }

    for (const m of layers) {
      const factor = m.userData.factor;
      fitLayerToFrustum(m, cam);
      m.quaternion.identity(); // facing camera via layerRig
      const map = m.userData.edgeMask ? m.material.uniforms.map.value : m.material.map;
      if (map) {
        map.offset.y = reduceMotion ? 0 : -((h * factor) * 0.002) % 1;
      }
      // Mild view-space parallax (x/y) — keep z from fitLayer
      m.position.x = -cam.position.x * (1 - factor) * 0.05;
      m.position.y = -h * (1 - factor) * 0.03;
      if (m.userData.edgeMask) {
        m.material.uniforms.opacity.value = m.userData.role === 'near' ? 0.95 : 0.75;
        m.material.uniforms.clearR.value = m.userData.role === 'near' ? 0.28 : 0.18;
        m.material.uniforms.edgeR.value = m.userData.role === 'near' ? 0.48 : 0.40;
      } else if (m.material.opacity != null) {
        m.material.opacity = 1;
      }
      // Drop mist plane (near edges + mid/far carry season); keeps draw count ≤45 at gates.
      m.visible = m.userData.role !== 'mist';
    }

    // Torii — larger window, stronger presence
    for (const g of gateMeshes) {
      const bh = g.userData.bh;
      const dist = h - bh;
      const show = h >= bh - 14 && h <= bh + 28;
      g.visible = show;
      if (show) {
        const k = 1 - Math.min(1, Math.abs(dist) / 18);
        g.position.z = -18;
        g.position.y = bh + 4.5; // world space under worldFx
        g.children.forEach(c => { if (c.material) c.material.opacity = 0.55 + 0.45 * k; });
        // Face camera roughly
        g.quaternion.copy(cam.quaternion);
        g.rotateY(g.userData.side * 0.15);
      }
    }

    // Short wipe veil + torn edges (no full season panel stack)
    const wipe = fadeSeason ? Math.sin(fadeT * Math.PI) : (gateNear ? 0.15 : 0);
    const pop = Math.min(0.55, wipe * (reduceMotion ? 0.5 : 1));
    const fillW = 2 * Math.tan(cam.fov * Math.PI / 360) * 24 * Math.max(cam.aspect, 0.5) * 1.4;
    const fillH = 2 * Math.tan(cam.fov * Math.PI / 360) * 24 * 1.3;
    veil.scale.set(fillW, fillH, 1); veil.position.set(0, 0, -24); veil.quaternion.copy(cam.quaternion);
    veil.material.opacity = 0; // muted full veil — edges-only wipe
    topE.scale.set(fillW, fillH * 0.08, 1); topE.position.set(0, fillH * 0.42, -23.5); topE.quaternion.copy(cam.quaternion);
    botE.scale.set(fillW, fillH * 0.08, 1); botE.position.set(0, -fillH * 0.42, -23.5); botE.quaternion.copy(cam.quaternion);
    topE.material.opacity = pop * 0.7; botE.material.opacity = pop * 0.7;
    xfade.visible = pop > 0.02;

    if (boxes) syncPads(boxes, heroZ);

    // Live HUD
    if (hudState) {
      const he = document.getElementById('skyHudH');
      const ge = document.getElementById('skyHudGems');
      const ce = document.getElementById('skyHudCoins');
      if (he) he.textContent = (hudState.height | 0) + ' m';
      if (ge) ge.textContent = (hudState.gems | 0) + ' ◆';
      if (ce) ce.textContent = (hudState.coins | 0) + ' ●';
    }
  }

  function applyLayer(name) {
    const all = !name || name === 'all';
    for (const m of layers) m.visible = all || m.userData.layer === name;
    toriiGroup.visible = all || name === 'mid';
    xfade.visible = (all || name === 'mid') && xfade.visible;
    for (const [, ent] of padByBox) {
      const on = all || name === 'play';
      ent.slot.mesh.visible = on; ent.slot.shadow.visible = false;
    }
    if (frameEl) frameEl.style.display = (all || name === 'fg') ? '' : 'none';
  }

  return {
    root, frameEl, inset, placePad, removePad, syncPads, update, applyLayer,
    get draws() {
      let n = layers.filter(m => m.visible).length;
      for (const [, ent] of padByBox) if (ent.slot.mesh.visible) n += 1;
      for (const g of gateMeshes) if (g.visible) n += 1;
      if (xfade.visible) n += (veil.material.opacity > 0.02 ? 3 : 2);
      return n;
    },
  };
}
