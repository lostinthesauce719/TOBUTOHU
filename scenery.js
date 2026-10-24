// Tobu scenery (BRUSH scenery_spec.md 2026-10-23). VISUAL ONLY: reads camera, climber height, sim time and the run seed;
// never writes sim state. No colliders. No Math.random / wall clock: everything comes from seed + height + sim time.
// Layers: 3 mountain rings (180/260/360), far cedars (80-150), 2 waterfalls (50-90), steam/mist floor (below the lane),
// instanced birds (|x|>=22, lane+15..30). Zones spring/summer/autumn/winter with 15 m cross-fades via CPU colour lerp
// (same geometry every zone). Storm band 150-250 m darkens scenery. Draws: mountains 1 + far cedars 1 + falls 1 + steam 1 + birds 1 = 5.
import * as THREE from './vendor/three.module.min.js';
import { ZONES, zoneMix, cedarZone, mountains, waterfall, waterfallMat, bird } from './clipkit.js';

const ZK = Object.keys(ZONES);
function mul(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = (s, i) => mul((s * 2654435761 ^ i * 40503) >>> 0)();
export const stormK = h => THREE.MathUtils.smoothstep(h, 140, 160) * (1 - THREE.MathUtils.smoothstep(h, 240, 260));

// one geometry per layer, a colour array per zone; recolour = lerp(zoneA, zoneB, t) * storm
function zoned(build) { const per = {}; let geo = null;
  for (const z of ZK) { const g = build(z); if (!geo) geo = g; per[z] = Float32Array.from(g.getAttribute('color').array); }
  return { geo, per }; }

export function createScenery(S, seed, reduceMotion) {
  const root = new THREE.Group(); root.userData.scenery = 1; S.add(root);
  const layers = [];
  const basic = (o = {}) => new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, ...o });
  // mountains: fog off (they sit past the linear fog far plane); colours are already the spec's atmospheric tints
  { // all 3 mountain rings merged into ONE mesh (saves 2 draws); per-vertex fog weight keeps far rings paler
    const fw = []; const z = zoned(zn => { const gs = [0, 1, 2].map(L => mountains(THREE, zn, L, 3 + (seed % 997))); if (!fw.length) gs.forEach((g, L) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const hk = THREE.MathUtils.clamp(1 - (p.getY(i) + 30) / [70, 110, 160][L], 0, 1); fw.push(Math.min(0.85, 0.28 + L * 0.17 + 0.3 * hk)); } }); return mergeAll(gs); });
    const m = new THREE.Mesh(z.geo, basic()); m.frustumCulled = false; root.add(m); layers.push({ m, ...z, fogV: fw, par: 0.88, haze: 1 }); }
  // far cedars 80-150 from the lane, both sides, merged into one mesh; base well below the lane so trunks run out of frame
  { const r = mul(seed ^ 0xCEDA); const pos = [];
    for (let i = 0; i < 26; i++) { const s = i % 2 ? 1 : -1; pos.push([s * (80 + r() * 70), -70 - r() * 20, 40 - i * 9 - r() * 6, 60 + r() * 40, 3 + r() * 2, (r() * 1e6) | 0]); }
    const z = zoned(zn => { const gs = pos.map(([x, y, zz, H, R, sd]) => { const g = cedarZone(THREE, zn, H, R, sd); g.translate(x, y, zz); return g; });
      return mergeAll(gs); });
    const m = new THREE.Mesh(z.geo, basic()); m.frustumCulled = false; root.add(m); layers.push({ m, ...z, fog: 0.3, par: 0.6 }); }
  // waterfalls: at most 2, x 50-90, opaque fogged shader (one draw); placement re-seeded per 120 m band
  const wfMat = waterfallMat(THREE, 'spring'); wfMat.fog = false;
  const wf = new THREE.Mesh(new THREE.BufferGeometry(), wfMat); wf.frustumCulled = false; root.add(wf); let wfBand = -1;
  // steam/mist: flattened icosahedra merged, below the lane only (mist floor 40 below + waterfall feet)
  const stMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false,
    uniforms: { color: { value: new THREE.Color(0xffffff) }, opacity: { value: 0.25 } },
    vertexShader: `attribute vec2 corner; attribute float rad; varying vec2 vC; void main(){ vC=corner;
      vec4 mv=modelViewMatrix*vec4(position,1.); mv.xy+=corner*rad*vec2(1.,0.55); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; varying vec2 vC; void main(){ float r=length(vC); float a=opacity*(1.-smoothstep(0.35,1.,r)); if(a<0.003) discard; gl_FragColor=vec4(color,a); }` });
  Object.defineProperty(stMat, 'color', { get: () => stMat.uniforms.color.value });
  const steam = new THREE.Mesh(new THREE.BufferGeometry(), stMat); steam.frustumCulled = false; root.add(steam);
  // birds: one InstancedMesh
  const NB = 9, birds = new THREE.InstancedMesh(bird(THREE), new THREE.MeshBasicMaterial({ color: 0x6F7FA0, side: THREE.DoubleSide, fog: false }), NB);
  birds.frustumCulled = false; S.add(birds);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
  const _v = new THREE.Vector3(), _a = new THREE.Color(), _b = new THREE.Color(), fogC = new THREE.Color(), horC = new THREE.Color(), tint = new THREE.Color();
  const ph1 = hash(seed, 1) * 6.283, ph2 = hash(seed, 2) * 6.283;
  let lastKey = '';

  function rebuildBand(band) { // deterministic from seed + band; rebuilt only when the climber crosses a 120 m band
    const r = mul(seed * 31 + band * 7919); const fg = [], sg = [];
    const n = r() < 0.35 ? 1 : 2;
    for (let i = 0; i < n; i++) { const s = i === 0 ? (r() < 0.5 ? -1 : 1) : -fgSide, w = 6 + r() * 4, h = 60 + r() * 30; var fgSide = s;
      const x = s * (50 + r() * 40), y = 35 + r() * 15, z = -60 - r() * 60;
      const g = waterfall(THREE, w, h); g.rotateY(-s * 0.5); g.translate(x, y, z); fg.push(g);
      for (let k = 0; k < 6; k++) sg.push([x + (r() - 0.5) * w * 1.6, y - h - 2 + r() * 3, z + (r() - 0.5) * 6, 4 + r() * 4]); }
    for (let k = 0; k < 14; k++) sg.push([(k % 2 ? 1 : -1) * (6 + r() * 45), -40 - r() * 8, 10 - k * 13, 16 + r() * 12]);
    wf.geometry.dispose(); wf.geometry = mergeAll(fg, true); steam.geometry.dispose(); steam.geometry = puffs(sg);
  }

  return { root, birds,
    update(cam, h, t, fog, sky) {
      const zm = zoneMix(Math.max(0, h)), A = ZONES[zm.a], B = ZONES[zm.b], st = stormK(h), dark = 1 - 0.26 * st;
      // atmosphere: lerp sky + fog colour by zone (env cycle replacement until env.js lands)
      if (sky) { horC.setHex(A.sky[1]).lerp(_b.setHex(B.sky[1]), zm.t).multiply(tint); sky.material.uniforms.top.value.setHex(A.sky[0]).lerp(_b.setHex(B.sky[0]), zm.t).multiplyScalar(1 - 0.38 * st);
        sky.material.uniforms.hor.value.setHex(A.sky[1]).lerp(_b.setHex(B.sky[1]), zm.t).multiplyScalar(1 - 0.2 * st).multiply(tint); sky.material.uniforms.top.value.multiply(tint); } else horC.copy(fog);
      // slow seeded drift: +-4% warm/cool, periods ~95 s and ~61 s, smooth (no snaps)
      const wd = 0.04 * (0.7 * Math.sin(t * 0.066 + ph1) + 0.3 * Math.sin(t * 0.103 + ph2)); tint.setRGB(1 + wd, 1 + wd * 0.25, 1 - wd);
      if (sky) sky.material.uniforms.cloudK.value = 0.05 * Math.sin(t * 0.041 + ph2) + 0.03 * Math.sin(t * 0.017 + ph1);
      fog.setHex(A.fog).lerp(_b.setHex(B.fog), zm.t).multiplyScalar(1 - 0.08 * st).multiply(tint); fogC.copy(fog);
      if (sky) sky.material.uniforms.fogC.value.copy(fog);
      // the backdrop follows the camera (x pinned to the lane), with height parallax per layer
      root.position.set(0, cam.position.y, cam.position.z);
      for (const L of layers) L.m.position.y = -h * (1 - L.par) * 0.25;
      const key = zm.a + zm.b + zm.t.toFixed(3) + st.toFixed(3) + wd.toFixed(4);
      if (key !== lastKey) { lastKey = key;
        const fc = fogC.toArray(), hc = horC.toArray(); for (const L of layers) { const c = L.m.geometry.getAttribute('color'), a = L.per[zm.a], b = L.per[zm.b], o = c.array;
          for (let i = 0; i < o.length; i++) { const f = (L.haze ? hc : fc)[i % 3], k = L.fogV ? L.fogV[(i / 3) | 0] : L.fog; o[i] = ((a[i] + (b[i] - a[i]) * zm.t) * dark) * (1 - k) + f * k; }
          for (let i = 0; i < o.length; i += 3) { const y = 0.299 * o[i] + 0.587 * o[i + 1] + 0.114 * o[i + 2]; if (y > 0.78) { const q = 0.78 / y; o[i] *= q; o[i + 1] *= q; o[i + 2] *= q; } } // solid scenery luma <= 199 (spec band)
          c.needsUpdate = true; }
        wfMat.uniforms.a.value.setHex(A.fall[0]).lerp(_b.setHex(B.fall[0]), zm.t).multiplyScalar(dark);
        wfMat.uniforms.b.value.setHex(A.fall[1]).lerp(_b.setHex(B.fall[1]), zm.t).multiplyScalar(dark);
        stMat.color.setHex(A.steam[0]).lerp(_b.setHex(B.steam[0]), zm.t); stMat.uniforms.opacity.value = (A.steam[1] + (B.steam[1] - A.steam[1]) * zm.t) * (1 - 0.3 * st);
        birds.material.color.setHex(A.bird).lerp(_b.setHex(B.bird), zm.t); }
      const band = Math.floor(Math.max(0, h) / 120); if (band !== wfBand) { wfBand = band; rebuildBand(band); }
      const winter = zm.b === 'winter' && zm.t > 0.5 || zm.a === 'winter';
      wfMat.uniforms.t.value = t * (reduceMotion ? 0.25 : 1) * (winter ? 0.5 : 1);
      // birds: deterministic paths from seed + 20 s window + sim time; |x| >= 22, lane +15..30, 4-7 u/s along -z; storm thins them
      const W = 12, w = Math.floor(t / W), ph = t - w * W, nZone = zm.b === 'autumn' ? 9 : zm.b === 'spring' ? 7 : 5, nOn = Math.round(nZone * (1 - 0.5 * st));
      // flock rides alongside 60 units ahead, drifting back at 4-7 u/s relative and despawns behind the camera
      const r = mul(seed * 131 + w * 977), side = r() < 0.5 ? -1 : 1, x0 = side * (23 + r() * 5), y0 = h + 15 + r() * 7, sp = 4 + r() * 3, show = r() < 0.75;
      const tb = reduceMotion ? 3 : ph; let vis = 0; cam.updateMatrixWorld();
      for (let i = 0; i < NB; i++) { const on = show && i < nOn; const row = Math.ceil(i / 2), lr = i % 2 ? 1 : -1;
        _p.set(x0 + lr * row * 1.6 * side, y0 - row * 0.9, cam.position.z - 80 + tb * sp * 0.85 + row * 1.2);
        if (Math.abs(_p.x) < 22) _p.x = Math.sign(_p.x || side) * 22;
        const sc = on ? 1.2 + hash(seed + w, i) * 0.6 : 0, bob = reduceMotion ? 1 : 1 + 0.1 * Math.sin((t + i * 0.13) * Math.PI * 6);
        if (on) { _v.copy(_p).project(cam); if (Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1 && _v.z < 1) vis++; }
        _e.set(0, 0, 0); _q.setFromEuler(_e); _s.set(sc, sc * bob, sc); _m.compose(_p, _q, _s); birds.setMatrixAt(i, _m); }
      birds.instanceMatrix.needsUpdate = true; this.birdsInView = vis; 
    } };
}

function mergeAll(gs, uvs) { // non-indexed merge of position (+normal, +color or +uv)
  gs = gs.map(g => g.index ? g.toNonIndexed() : g); let n = 0; for (const g of gs) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry(), names = ['position', 'normal', ...(uvs ? ['uv'] : gs[0] && gs[0].attributes.color ? ['color'] : [])];
  for (const nm of names) { const sz = gs[0].attributes[nm].itemSize, A = new Float32Array(n * sz); let o = 0; for (const g of gs) { A.set(g.attributes[nm].array, o); o += g.attributes[nm].array.length; } out.setAttribute(nm, new THREE.BufferAttribute(A, sz)); }
  return out;
}

function puffs(list) { // merged camera-facing quads: centre position + corner + radius (soft round puffs, no facets)
  const n = list.length, P = new Float32Array(n * 18), C = new Float32Array(n * 12), Rr = new Float32Array(n * 6);
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
  list.forEach(([x, y, z, r], i) => cs.forEach(([u, v], j) => { const k = i * 6 + j; P.set([x, y, z], k * 3); C.set([u, v], k * 2); Rr[k] = r; }));
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('corner', new THREE.BufferAttribute(C, 2)); g.setAttribute('rad', new THREE.BufferAttribute(Rr, 1)); return g;
}
