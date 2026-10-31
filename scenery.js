// Tobu scenery (BRUSH scenery_spec.md + seasons weather). VISUAL ONLY: reads camera, climber height, sim time and the
// run seed; never writes sim state. No colliders. No Math.random / wall clock.
// Kamishibai layers (render-only): far=sky+mountains, mtn=mountains-only, mid=cedars/falls/steam/birds, play=climbables+hero+mist,
// fg=near-camera weather framing. Draws: mountains(1)+cedars(1)+falls(1)+steam(1)+birds(1)+weather(1)=6.
// Weather is ONE InstancedMesh shared by all seasons; zoneMix cross-fades which particles show.
// Parallax is camera-driven only; never writes sim state.
import * as THREE from './vendor/three.module.min.js';
import { ZONES, zoneMix, cedarZone, mountains, waterfall, waterfallMat, bird } from './clipkit.js';

const ZK = Object.keys(ZONES);
function mul(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = (s, i) => mul((s * 2654435761 ^ i * 40503) >>> 0)();
export const stormK = h => THREE.MathUtils.smoothstep(h, 140, 160) * (1 - THREE.MathUtils.smoothstep(h, 240, 260));

function zoned(build) { const per = {}; let geo = null;
  for (const z of ZK) { const g = build(z); if (!geo) geo = g; per[z] = Float32Array.from(g.getAttribute('color').array); }
  return { geo, per }; }

export function createScenery(S, seed, reduceMotion) {
  const root = new THREE.Group(); root.userData.scenery = 1; S.add(root);
  const layers = [];
  const basic = (o = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, ...o });
  let farCedar = null;
  // mountains: 3 rings merged; per-vertex haze toward horizon
  { const fw = []; const z = zoned(zn => { const gs = [0, 1, 2].map(L => mountains(THREE, zn, L, 3 + (seed % 997))); if (!fw.length) gs.forEach((g, L) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const hk = THREE.MathUtils.clamp(1 - (p.getY(i) + 30) / [70, 110, 160][L], 0, 1); fw.push(Math.min(0.85, 0.28 + L * 0.17 + 0.3 * hk)); } }); return mergeAll(gs); });
    const m = new THREE.Mesh(z.geo, basic()); m.frustumCulled = false; m.userData.layer = 'far'; root.add(m); layers.push({ m, ...z, fogV: fw, par: 0.92, haze: 1, layer: 'far' }); }
  // far cedars 80-150 — Scenery B denser packing (more columns, tighter spacing)
  { const r = mul(seed ^ 0xCEDA); const pos = [];
    for (let i = 0; i < 64; i++) { const s = i % 2 ? 1 : -1; pos.push([s * (72 + r() * 70), -70 - r() * 22, 52 - i * 4.4 - r() * 3, 55 + r() * 50, 2.6 + r() * 2.4, (r() * 1e6) | 0]); }
    const z = zoned(zn => mergeAll(pos.map(([x, y, zz, H, R, sd]) => { const g = cedarZone(THREE, zn, H, R, sd); g.translate(x, y, zz); return g; })));
    farCedar = new THREE.Mesh(z.geo, basic()); farCedar.frustumCulled = false; farCedar.userData.layer = 'mid'; root.add(farCedar); layers.push({ m: farCedar, ...z, fog: 0.15, par: 0.55, layer: 'mid' }); }
  // waterfalls
  const wfMat = waterfallMat(THREE, 'spring'); wfMat.fog = false;
  const wf = new THREE.Mesh(new THREE.BufferGeometry(), wfMat); wf.frustumCulled = false; wf.userData.layer = 'mid'; root.add(wf); let wfBand = -1;
  // steam / seasonal mist (below lane only)
  const stMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
    uniforms: { color: { value: new THREE.Color(0xffffff) }, opacity: { value: 0.25 } },
    vertexShader: `attribute vec2 corner; attribute float rad; varying vec2 vC; void main(){ vC=corner;
      vec4 mv=modelViewMatrix*vec4(position,1.); mv.xy+=corner*rad*vec2(1.,0.55); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; varying vec2 vC; void main(){ float r=length(vC); float a=opacity*(1.-smoothstep(0.35,1.,r)); if(a<0.003) discard; gl_FragColor=vec4(color,a); }` });
  Object.defineProperty(stMat, 'color', { get: () => stMat.uniforms.color.value });
  const steam = new THREE.Mesh(new THREE.BufferGeometry(), stMat); steam.frustumCulled = false; steam.userData.layer = 'mid'; root.add(steam);
  // birds
  const NB = 9, birds = new THREE.InstancedMesh(bird(THREE), new THREE.MeshBasicMaterial({ color: 0x6F7FA0, side: THREE.DoubleSide, fog: false }), NB);
  birds.frustumCulled = false; birds.userData.layer = 'mid'; S.add(birds);
  // ---- seasonal weather: ONE shared InstancedMesh (soft billboard quads) ----
  // kinds by hash slot: drizzle / petal-leaf-snow / mote-firefly / flake. Scales to 0 when that season's weight is 0.
  const NW = reduceMotion ? 96 : 220;
  const wxGeo = new THREE.PlaneGeometry(1, 1);
  const wxMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide,
    vertexColors: true,
    vertexShader: `varying vec2 vUv; varying vec3 vC; void main(){ vUv=uv; vC=instanceColor; vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; }`, /* instanceColor provided by Three when InstancedMesh.instanceColor is set */
    fragmentShader: `varying vec2 vUv; varying vec3 vC; void main(){ vec2 p=vUv*2.-1.; float r=length(p); float a=1.55*(1.-smoothstep(0.0,0.92,r)); a=clamp(a,0.,1.); if(a<0.03) discard; gl_FragColor=vec4(vC,a); }` });
  const weather = new THREE.InstancedMesh(wxGeo, wxMat, NW); weather.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NW * 3), 3);
  weather.frustumCulled = false; weather.renderOrder = 2; weather.userData.layer = 'fg'; S.add(weather);
  // per-particle seed state (fixed at create)
  const px = new Float32Array(NW), py = new Float32Array(NW), pz = new Float32Array(NW), pph = new Float32Array(NW), pk = new Uint8Array(NW), psp = new Float32Array(NW);
  { const r = mul(seed ^ 0xA7E471); for (let i = 0; i < NW; i++) {
      pk[i] = (r() * 4) | 0; pph[i] = r() * 6.283; psp[i] = 0.8 + r() * 1.6;
      const side = r() < 0.5 ? -1 : 1;
      // near-camera, mostly AHEAD (cam looks toward -z): |x| 19-28 outside lane, pz in [-48,-6]
      px[i] = side * (19 + r() * 9); py[i] = (r() - 0.25) * 18; pz[i] = -48 + r() * 42; } }

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  const _v = new THREE.Vector3(), _a = new THREE.Color(), _b = new THREE.Color(), fogC = new THREE.Color(), horC = new THREE.Color(), tint = new THREE.Color();
  const col = new THREE.Color();
  const ph1 = hash(seed, 1) * 6.283, ph2 = hash(seed, 2) * 6.283;
  let lastKey = '';

  function rebuildBand(band) {
    const r = mul(seed * 31 + band * 7919); const fg = [], sg = [];
    const n = r() < 0.35 ? 1 : 2; let fgSide = 1;
    for (let i = 0; i < n; i++) { const s = i === 0 ? (r() < 0.5 ? -1 : 1) : -fgSide; fgSide = s; const w = 6 + r() * 4, h = 60 + r() * 30;
      const x = s * (50 + r() * 40), y = 35 + r() * 15, z = -60 - r() * 60;
      const g = waterfall(THREE, w, h); g.rotateY(-s * 0.5); g.translate(x, y, z); fg.push(g);
      for (let k = 0; k < 6; k++) sg.push([x + (r() - 0.5) * w * 1.6, y - h - 2 + r() * 3, z + (r() - 0.5) * 6, 4 + r() * 4]); }
    for (let k = 0; k < 14; k++) sg.push([(k % 2 ? 1 : -1) * (6 + r() * 45), -40 - r() * 8, 10 - k * 13, 16 + r() * 12]);
    // winter breath puffs (extra soft spheres just below lane, rebuilt per band)
    for (let k = 0; k < 6; k++) sg.push([(k % 2 ? 1 : -1) * (20 + r() * 25), -8 - r() * 6, -10 - k * 10, 5 + r() * 4]);
    wf.geometry.dispose(); wf.geometry = mergeAll(fg, true); steam.geometry.dispose(); steam.geometry = puffs(sg);
  }

  // season palette accents (no red/orange/vermilion): olive / pale gold / cream / cool blue
  const C_DRIZZLE = 0x9EB8D8, C_PETAL = 0xFFF8EC, C_PETAL2 = 0xF0DCE8, C_POLLEN = 0xE0ECA0;
  const C_FIREFLY = 0xD4C878, C_LEAF = 0x7A8A4A, C_LEAF2 = 0xD4C070, C_SNOW = 0xF4FAFF, C_SNOW2 = 0xFFFFFF;

  root.userData.layer = 'mid'; // container; children carry real tags
  return { root, birds, weather, layers,
    // capture helper: 'far'|'mid'|'fg' visibility on scenery-owned meshes (play tagged in index)
    applyLayer(name) {
      const all = !name || name === 'all';
      const mtn = name === 'mtn'; // mountains-only (far ring with haze); sky toggled by index
      for (const L of layers) {
        if (mtn) L.m.visible = !!(L.haze); // mountains have haze:1; far cedars do not
        else L.m.visible = all || L.layer === name;
      }
      wf.visible = all || name === 'mid'; steam.visible = all || name === 'mid';
      birds.visible = all || name === 'mid'; weather.visible = all || name === 'fg';
    },
    update(cam, h, t, fog, sky) {
      const zm = zoneMix(Math.max(0, h)), A = ZONES[zm.a], B = ZONES[zm.b], st = stormK(h), dark = 1 - 0.26 * st;
      const Wgt = { spring: 0, summer: 0, autumn: 0, winter: 0 }; Wgt[zm.a] += 1 - zm.t; Wgt[zm.b] += zm.t;
      // summer→autumn crossfade was overbright: peak mid-fade dampener
      const xfSA = (zm.a === 'summer' && zm.b === 'autumn') ? 4 * zm.t * (1 - zm.t) : 0;
      // slow seeded drift
      const wd = 0.04 * (0.7 * Math.sin(t * 0.066 + ph1) + 0.3 * Math.sin(t * 0.103 + ph2)); tint.setRGB(1 + wd, 1 + wd * 0.25, 1 - wd);
      // seasonal tint bias on top of drift (fresh green spring, clear autumn, cold winter, bright summer)
      tint.r *= 1 - 0.03 * Wgt.spring + 0.02 * Wgt.summer - 0.02 * Wgt.winter;
      tint.g *= 1 + 0.04 * Wgt.spring + 0.01 * Wgt.summer - 0.01 * Wgt.autumn;
      tint.b *= 1 - 0.02 * Wgt.spring - 0.03 * Wgt.autumn + 0.05 * Wgt.winter;
      if (sky) { horC.setHex(A.sky[1]).lerp(_b.setHex(B.sky[1]), zm.t).multiply(tint);
        sky.material.uniforms.top.value.setHex(A.sky[0]).lerp(_b.setHex(B.sky[0]), zm.t).multiplyScalar(1 - 0.38 * st).multiply(tint);
        sky.material.uniforms.hor.value.setHex(A.sky[1]).lerp(_b.setHex(B.sky[1]), zm.t).multiplyScalar(1 - 0.2 * st).multiply(tint);
        // summer bright haze / spring morning softness / winter cloudier
        sky.material.uniforms.cloudK.value = 0.05 * Math.sin(t * 0.041 + ph2) + 0.03 * Math.sin(t * 0.017 + ph1)
          + 0.06 * Wgt.summer - 0.03 * Wgt.autumn + 0.04 * Wgt.winter; }
      else horC.copy(fog);
      fog.setHex(A.fog).lerp(_b.setHex(B.fog), zm.t).multiplyScalar(1 - 0.08 * st).multiply(tint);
      if (Wgt.autumn > 0.2) fog.lerp(_b.setHex(0xD8DCC0), 0.12 * Wgt.autumn); // low clear autumn light, olive cast
      if (Wgt.spring > 0.2) fog.lerp(_b.setHex(0xD8EBD8), 0.1 * Wgt.spring);
      if (Wgt.winter > 0.2) fog.lerp(_b.setHex(0xC8D8F0), 0.12 * Wgt.winter);
      fogC.copy(fog);
      if (sky) sky.material.uniforms.fogC.value.copy(fog);
      // fog density feel via near/far (visual only): spring soft mist, summer haze, autumn clear, winter dense cold
      const fNear = 10 + 4 * Wgt.autumn - 2 * Wgt.spring - 3 * Wgt.winter, fFar = 120 - 15 * Wgt.winter - 10 * Wgt.summer + 20 * Wgt.autumn;
      if (fog.isColor) { /* fog is Color; near/far live on scene fog — set via side channel */ this.fogNear = fNear; this.fogFar = Math.max(80, fFar); }

      // kamishibai parallax: root tracks camera; each layer lags by (1-par) on y/x (render-only)
      root.position.set(0, cam.position.y, cam.position.z);
      const cx = cam.position.x;
      for (const L of layers) {
        L.m.position.y = -h * (1 - L.par) * 0.28;
        L.m.position.x = -cx * (1 - L.par) * 0.22; // lateral depth cue
      }
      // mid props (falls/steam) share mid parallax
      wf.position.x = -cx * (1 - 0.5) * 0.18; steam.position.x = -cx * (1 - 0.45) * 0.2;
      // autumn cedar sway (gusty wind); reduce motion nearly still
      if (farCedar) { const wind = Wgt.autumn * (reduceMotion ? 0.003 : 0.018) * Math.sin(t * 1.35 + ph1);
        farCedar.rotation.z = wind; farCedar.rotation.x = wind * 0.35; }

      const key = zm.a + zm.b + zm.t.toFixed(3) + st.toFixed(3) + wd.toFixed(4) + xfSA.toFixed(3);
      if (key !== lastKey) { lastKey = key;
        const hazeMul = 1 - 0.35 * xfSA; // pull mountain haze back during 246 m fade
        const fc = fogC.toArray(), hc = horC.toArray(), lumaCap = 0.78 - 0.1 * xfSA; // tighter cap at summer→autumn
        for (const L of layers) { const c = L.m.geometry.getAttribute('color'), a = L.per[zm.a], b = L.per[zm.b], o = c.array;
          for (let i = 0; i < o.length; i++) { const f = (L.haze ? hc : fc)[i % 3], k = (L.fogV ? L.fogV[(i / 3) | 0] : L.fog) * (L.haze ? hazeMul : 1);
            o[i] = ((a[i] + (b[i] - a[i]) * zm.t) * dark) * (1 - k) + f * k; }
          for (let i = 0; i < o.length; i += 3) { const y = 0.299 * o[i] + 0.587 * o[i + 1] + 0.114 * o[i + 2]; if (y > lumaCap) { const q = lumaCap / y; o[i] *= q; o[i + 1] *= q; o[i + 2] *= q; } }
          c.needsUpdate = true; }
        wfMat.uniforms.a.value.setHex(A.fall[0]).lerp(_b.setHex(B.fall[0]), zm.t).multiplyScalar(dark);
        wfMat.uniforms.b.value.setHex(A.fall[1]).lerp(_b.setHex(B.fall[1]), zm.t).multiplyScalar(dark);
        // steam: spring soft morning mist+, autumn lower, winter breath-like, dampened in storm and at 246 m fade
        const stOp = (A.steam[1] + (B.steam[1] - A.steam[1]) * zm.t)
          * (1 + 0.35 * Wgt.spring + 0.1 * Wgt.winter - 0.25 * Wgt.autumn) * (1 - 0.3 * st) * (1 - 0.5 * xfSA);
        stMat.color.setHex(A.steam[0]).lerp(_b.setHex(B.steam[0]), zm.t);
        if (Wgt.spring > 0.4) stMat.color.lerp(_b.setHex(0xE8F4E8), 0.15 * Wgt.spring); // soft green morning mist
        if (Wgt.winter > 0.4) stMat.color.lerp(_b.setHex(0xEAF2FA), 0.25 * Wgt.winter);
        stMat.uniforms.opacity.value = Math.min(0.55, stOp);
        birds.material.color.setHex(A.bird).lerp(_b.setHex(B.bird), zm.t); }
      const band = Math.floor(Math.max(0, h) / 120); if (band !== wfBand) { wfBand = band; rebuildBand(band); }
      const winter = zm.b === 'winter' && zm.t > 0.5 || zm.a === 'winter';
      wfMat.uniforms.t.value = t * (reduceMotion ? 0.25 : 1) * (winter ? 0.5 : 1);

      // birds
      const Wb = 12, wb = Math.floor(t / Wb), phb = t - wb * Wb, nZone = zm.b === 'autumn' ? 9 : zm.b === 'spring' ? 7 : 5, nOn = Math.round(nZone * (1 - 0.5 * st));
      const rb = mul(seed * 131 + wb * 977), side = rb() < 0.5 ? -1 : 1, x0 = side * (23 + rb() * 5), y0 = h + 15 + rb() * 7, sp = 4 + rb() * 3, show = rb() < 0.75;
      const tb = reduceMotion ? 3 : phb; let vis = 0; cam.updateMatrixWorld();
      for (let i = 0; i < NB; i++) { const on = show && i < nOn; const row = Math.ceil(i / 2), lr = i % 2 ? 1 : -1;
        _p.set(x0 + lr * row * 1.6 * side, y0 - row * 0.9, cam.position.z - 80 + tb * sp * 0.85 + row * 1.2);
        if (Math.abs(_p.x) < 22) _p.x = Math.sign(_p.x || side) * 22;
        const sc = on ? 1.2 + hash(seed + wb, i) * 0.6 : 0, bob = reduceMotion ? 1 : 1 + 0.1 * Math.sin((t + i * 0.13) * Math.PI * 6);
        if (on) { _v.copy(_p).project(cam); if (Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1 && _v.z < 1) vis++; }
        _e.set(0, 0, 0); _q.setFromEuler(_e); _s.set(sc, sc * bob, sc); _m.compose(_p, _q, _s); birds.setMatrixAt(i, _m); }
      birds.instanceMatrix.needsUpdate = true; this.birdsInView = vis;

      // ---- weather particles (1 draw) ----
      const rm = reduceMotion ? 0.35 : 1, gust = Wgt.autumn * (0.55 + 0.45 * Math.sin(t * 0.9 + ph2));
      // billboard toward camera so thin planes stay readable (tumble is roll-only)
      const _bill = new THREE.Quaternion().copy(cam.quaternion);
      for (let i = 0; i < NW; i++) {
        const kind = pk[i], ph = pph[i], life = (t * psp[i] * rm + ph * 10);
        // which season owns this particle slot
        let wgt = 0, sx = 0.35, sy = 0.35, hex = C_SNOW;
        if (kind === 0) { // drizzle streaks — spring (thinned in other seasons)
          wgt = Wgt.spring; hex = C_DRIZZLE; sx = 0.28; sy = 2.8 + 0.6 * Math.sin(ph);
          _p.set(px[i] + Math.sin(life * 0.4) * 0.4, cam.position.y + ((py[i] + life * 4) % 30) - 12, cam.position.z + pz[i]);
          _e.set(0, 0, -0.15); }
        else if (kind === 1) { // petal / pollen / leaf / snow — multiplexed by strongest season
          if (Wgt.spring >= Wgt.summer && Wgt.spring >= Wgt.autumn && Wgt.spring >= Wgt.winter) {
            wgt = Wgt.spring; hex = (i & 1) ? C_PETAL : C_PETAL2; sx = sy = 0.85 + 0.3 * Math.sin(ph * 3);
            _p.set(px[i] + Math.sin(life * 0.7 + ph) * 2.5, cam.position.y + ((py[i] - life * 1.1) % 26 + 26) % 26 - 10, cam.position.z + pz[i] + Math.cos(life * 0.5) * 1.5);
            _e.set(life * 0.6, life * 0.4, ph); }
          else if (Wgt.summer >= Wgt.autumn && Wgt.summer >= Wgt.winter) {
            wgt = Wgt.summer * (1 - 0.7 * st); hex = C_POLLEN; sx = sy = 0.7 + 0.25 * Math.sin(life * 2 + ph);
            _p.set(px[i] + Math.sin(life * 0.3 + ph) * 3, cam.position.y + py[i] * 0.6 + Math.sin(life * 0.8) * 2, cam.position.z + pz[i] + Math.sin(life * 0.2) * 2);
            _e.set(0, 0, 0); }
          else if (Wgt.autumn >= Wgt.winter) {
            wgt = Wgt.autumn; hex = (i & 1) ? C_LEAF : C_LEAF2; sx = 1.1; sy = 0.7;
            // gusty: angled fall, strong -x drift
            _p.set(px[i] + ((life * (2.5 + 3 * gust)) % 50) - 25, cam.position.y + ((py[i] - life * (1.4 + gust)) % 28 + 28) % 28 - 12, cam.position.z + pz[i]);
            _e.set(0.4, 0, -0.6 - 0.5 * gust + Math.sin(life) * 0.3); }
          else {
            wgt = Wgt.winter; hex = (i & 1) ? C_SNOW : C_SNOW2; sx = sy = 0.7 + 0.2 * Math.sin(ph * 2);
            _p.set(px[i] + Math.sin(life * 0.5 + ph) * 1.8, cam.position.y + ((py[i] - life * 1.6) % 28 + 28) % 28 - 12, cam.position.z + pz[i]);
            _e.set(0, life * 0.3, ph); } }
        else if (kind === 2) { // fireflies (summer) / gust debris (autumn) / breath mote (winter) / spring mist speck
          if (Wgt.summer > 0.25) {
            wgt = Wgt.summer * (1 - 0.8 * st); hex = C_FIREFLY; const pulse = 0.55 + 0.45 * Math.sin(life * 3.2 + ph);
            sx = sy = (0.45 + 0.25 * pulse) * (0.8 + 0.2 * Math.sin(ph)); col.setHex(hex); col.multiplyScalar(0.7 + 0.5 * pulse);
            _p.set(px[i] * 0.7, cam.position.y + 2 + (py[i] % 14) + Math.sin(life * 0.9 + ph) * 1.5, cam.position.z + pz[i] * 0.7);
            _e.set(0, 0, 0); weather.setColorAt(i, col);
            const sc = wgt * rm * 4.2; _q.copy(_bill); _s.set(sx * sc, sy * sc, 1);
            if (Math.abs(_p.x) < 20) _p.x = Math.sign(_p.x || 1) * 20;
            _m.compose(_p, _q, _s); weather.setMatrixAt(i, _m); continue; }
          else if (Wgt.autumn > 0.25) {
            wgt = Wgt.autumn; hex = C_LEAF2; sx = 0.9; sy = 0.55;
            _p.set(px[i] + ((life * 4) % 40) - 20, cam.position.y + ((py[i] - life * 2) % 24 + 24) % 24 - 10, cam.position.z + pz[i]);
            _e.set(0.3, 0, -0.9); }
          else if (Wgt.winter > 0.25) {
            wgt = Wgt.winter; hex = C_SNOW; sx = sy = 1.1 + 0.35 * Math.sin(life + ph);
            _p.set(px[i] * 0.5, cam.position.y - 2 + Math.sin(life * 0.4) * 1.5, cam.position.z + ((pz[i] + life * 0.3) % 40) - 20);
            _e.set(0, 0, 0); }
          else { wgt = Wgt.spring; hex = C_PETAL; sx = sy = 0.55;
            _p.set(px[i], cam.position.y + ((py[i] - life * 0.6) % 20 + 20) % 20 - 8, cam.position.z + pz[i]); _e.set(0, life, 0); } }
        else { // kind 3: snow-heavy / spring drizzle side / summer haze speck / autumn leaf
          if (Wgt.winter > 0.2) { wgt = Wgt.winter; hex = C_SNOW2; sx = sy = 0.75;
            _p.set(px[i] + Math.cos(life * 0.4) * 2, cam.position.y + ((py[i] - life * 2.2) % 30 + 30) % 30 - 14, cam.position.z + pz[i]); _e.set(0, 0, ph); }
          else if (Wgt.spring > 0.2) { wgt = Wgt.spring; hex = C_DRIZZLE; sx = 0.22; sy = 2.4;
            _p.set(px[i], cam.position.y + ((py[i] + life * 5) % 28) - 12, cam.position.z + pz[i]); _e.set(0, 0, -0.2); }
          else if (Wgt.autumn > 0.2) { wgt = Wgt.autumn; hex = C_LEAF; sx = 1.0; sy = 0.6;
            _p.set(px[i] + ((life * 3) % 45) - 22, cam.position.y + ((py[i] - life * 1.8) % 26 + 26) % 26 - 11, cam.position.z + pz[i]); _e.set(0.5, 0, -0.7); }
          else { wgt = Wgt.summer * (1 - st); hex = C_POLLEN; sx = sy = 0.5;
            _p.set(px[i] + Math.sin(life * 0.25) * 4, cam.position.y + py[i] * 0.5, cam.position.z + pz[i]); _e.set(0, 0, 0); } }
        let sc = Math.max(0, wgt) * rm * (0.95 + 0.25 * Math.sin(ph * 5)) * 3.6; // denser / still-readable
        // near-camera particles get a further boost (z close to cam)
        const zd = Math.abs(_p.z - cam.position.z); if (zd < 30) sc *= 1.85;
        if (Math.abs(_p.x) < 20) _p.x = Math.sign(_p.x || 1) * 20;
        // keep weather out of the play-lane volume in front of the hero (x within 18 and z ahead of climber by <8)
        if (Math.abs(_p.x) < 18 && _p.z < cam.position.z - 5 && _p.z > cam.position.z - 14) _p.x = Math.sign(_p.x || 1) * 20;
        col.setHex(hex); weather.setColorAt(i, col);
        _q.copy(_bill);
        { const roll = _e.z || 0; if (roll) { _e.set(0, 0, roll); _q.multiply(new THREE.Quaternion().setFromEuler(_e)); } }
        _s.set(sx * sc, sy * sc, 1); _m.compose(_p, _q, _s); weather.setMatrixAt(i, _m);
      }
      weather.instanceMatrix.needsUpdate = true; if (weather.instanceColor) weather.instanceColor.needsUpdate = true; this.wxOn = (Wgt.spring + Wgt.summer + Wgt.autumn + Wgt.winter) > 0 ? NW : 0;
    } };
}

function mergeAll(gs, uvs) {
  gs = gs.map(g => g.index ? g.toNonIndexed() : g); let n = 0; for (const g of gs) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry(), names = ['position', 'normal', ...(uvs ? ['uv'] : gs[0] && gs[0].attributes.color ? ['color'] : [])];
  for (const nm of names) { const sz = gs[0].attributes[nm].itemSize, A = new Float32Array(n * sz); let o = 0; for (const g of gs) { A.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; } out.setAttribute(nm, new THREE.BufferAttribute(A, sz)); }
  return out;
}

function puffs(list) {
  const n = list.length, P = new Float32Array(n * 18), C = new Float32Array(n * 12), Rr = new Float32Array(n * 6);
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  list.forEach(([x, y, z, r], i) => cs.forEach(([u, v], j) => { const k = i * 6 + j; P.set([x, y, z], k * 3); C.set([u, v], k * 2); Rr[k] = r; }));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('corner', new THREE.BufferAttribute(C, 2)); g.setAttribute('rad', new THREE.BufferAttribute(Rr, 1)); return g;
}
