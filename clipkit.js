// Tobu clip-style production assets (BRUSH, 2026-10-22). Procedural, loader-free, matching tobu3d's pipeline
// (three.js r1xx, BufferGeometry built in code, sRGB hexes written as-is with ColorManagement off).
// Usage: import { buildHero, kit, PAL } from './clipkit.js'; pass the THREE module in.
export const PAL = {
  hero: { body: 0x6E9A42, top: 0x86AE58, belly: 0xF2EEE0, crease: 0x1F2A1A, sash: 0xFFD23F, shadow: 0x1C2438 },
  // climbables: Rec.601 luma 45-95 before grid
  climb: { face: 0x46587A /*86*/, top: 0x4A5D80 /*91*/, side: 0x3A4A68 /*73*/, deep: 0x2F3D58 /*60*/ },
  far: { trunk: 0x969EDE, trunkS: 0x858FD1, tierA: 0xABB8EB, tierB: 0xC7D6EB },
};
const BL = 1.1, RIDE = 0.22;
// identical hip / rest / segment data to tobu3d/hero.js LEGS so the existing IK drives the bones unchanged
export const LEGS = [];
for (const s of [-1, 1]) {
  LEGS.push({ s, kind: 'front', hip: [s * 0.05, -0.04, 0.22], rest: [s * 0.2, -RIDE, 0.36], a: 0.15, b: 0.19, r: [0.016, 0.012, 0.012, 0.009] });
  LEGS.push({ s, kind: 'mid', hip: [s * 0.06, -0.04, 0.12], rest: [s * 0.24, -RIDE, 0.08], a: 0.15, b: 0.19, r: [0.016, 0.012, 0.012, 0.009] });
  LEGS.push({ s, kind: 'hind', hip: [s * 0.065, 0.0, 0.07], rest: [s * 0.17, -RIDE, -0.48], a: 0.6, b: 0.55, t: 0.1, r: [0.05, 0.022, 0.016, 0.009], r3: [0.012, 0.008] });
}
export const legName = (L, i) => `${L.kind}_${L.s < 0 ? 'L' : 'R'}_s${i}`;

function paint(THREE, g, fn) { // non-indexed, flat normals, per-face colour from fn(normal, centroid)
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3), col = new THREE.Color();
  const N = new THREE.Vector3(), Cn = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    Cn.set(0, 0, 0); for (let k = 0; k < 3; k++) Cn.add(new THREE.Vector3().fromBufferAttribute(p, i + k)); Cn.multiplyScalar(1 / 3);
    N.fromBufferAttribute(n, i); col.setHex(fn(N, Cn));
    for (let k = 0; k < 3; k++) { c[(i + k) * 3] = col.r; c[(i + k) * 3 + 1] = col.g; c[(i + k) * 3 + 2] = col.b; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function merge(THREE, gs, extra) {
  let n = 0; for (const g of gs) n += g.attributes.position.count;
  const names = ['position', 'normal', 'color', ...(extra || [])], out = new THREE.BufferGeometry();
  for (const a of names) { const sz = gs[0].attributes[a].itemSize, arr = new (a === 'skinIndex' ? Uint16Array : Float32Array)(n * sz); let o = 0;
    for (const g of gs) { arr.set(g.attributes[a].array, o); o += g.attributes[a].array.length; } out.setAttribute(a, new THREE.BufferAttribute(arr, sz)); }
  return out;
}
const tris = g => g.attributes.position.count / 3;

// ---------------- A) hero: one SkinnedMesh, one material, one draw ----------------
// Bones: 'root' (= FORGEPLAY's hero.root group transform; body parts are rigid to it) plus 14 leg-segment bones named
// <front|mid|hind>_<L|R>_s<1|2|3>, one per hero.js segment (L.s1, L.s2, L.s3). Each segment bone is authored like
// placeSeg(): origin at the segment start, +Y along the segment, length 1 (scale.y = segment length).
export function buildHero(THREE) {
  const { body, top, belly, crease, sash } = PAL.hero, gs = [];
  const bodyPaint = (n) => n.y < -0.35 ? belly : n.y > 0.45 ? top : body;
  const add = (geo, m, fn = bodyPaint, bone = 0) => { geo.applyMatrix4(m); const g = paint(THREE, geo, fn); setBone(g, bone); gs.push(g); };
  const setBone = (g, b) => { const k = g.attributes.position.count, si = new Uint16Array(k * 4), sw = new Float32Array(k * 4);
    for (let i = 0; i < k; i++) { si[i * 4] = b; sw[i * 4] = 1; } g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); };
  const M = (p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
  const H = Math.PI / 2;
  // slim but solid body (local +z head, +y back), sizes from hero.js
  add(new THREE.CapsuleGeometry(0.068, 0.12, 2, 8), M([0, 0, 0.15], [H, 0, 0], [1, 1, 0.9]));               // thorax
  add(new THREE.BoxGeometry(0.15, 0.06, 0.16), M([0, 0.06, 0.17], [0.08, 0, 0]));                             // pronotum saddle
  add(new THREE.BoxGeometry(0.152, 0.012, 0.045), M([0, 0.094, 0.17], [0.08, 0.55, 0]), () => sash);          // sash: high, diagonal across the pronotum
  add(new THREE.ConeGeometry(0.06, 0.17, 7), M([0, -0.01, 0.31], [H + 0.55, 0, 0], [0.95, 1, 1.25]));         // head
  add(new THREE.ConeGeometry(0.06, 0.62, 8), M([0, -0.015, -0.22], [-H, 0, 0], [1, 1, 0.85]));                 // abdomen
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.03, 6, 4), M([s * 0.045, 0.035, 0.29], [0, 0, 0], [0.7, 1.1, 1.2]), () => crease); // eye
    add(new THREE.CylinderGeometry(0.006, 0.011, 0.18, 4), M([s * 0.03, 0.08, 0.37], [0.75, 0, s * -0.25]), () => crease); // short antenna
    add(new THREE.BoxGeometry(0.06, 0.018, 0.7), M([s * 0.032, 0.055, -0.24], [0.05, s * 0.035, s * 0.12]), (n) => n.y > 0.3 ? top : n.y < -0.3 ? belly : crease); // folded wing, crease edges
  }
  // leg segments: unit length along +Y in bone space
  let bi = 1; const boneDefs = [{ name: 'root' }];
  for (const L of LEGS) {
    const segs = [[L.r[0], L.r[1]], [L.r[2], L.r[3]]]; if (L.t) segs.push(L.r3);
    segs.forEach(([r0, r1], i) => {
      const g = new THREE.CylinderGeometry(r1, r0, 1, L.kind === 'hind' && i === 0 ? 6 : 4, 1); g.translate(0, 0.5, 0);
      const last = i === segs.length - 1;
      const fn = L.kind === 'hind' && i === 0 ? (n) => (n.x * L.s < -0.3 ? belly : n.y > 0.3 ? top : body) : last ? () => crease : () => body; // femur cream inner face, dark gripping tarsi
      add(g, new THREE.Matrix4(), fn, bi); boneDefs.push({ name: legName(L, i + 1), leg: L, i }); bi++;
    });
  }
  // rest pose: segments laid out by IK at the rest feet (35° femur splay); vertices are stored in bind pose
  const geo = merge(THREE, gs, ['skinIndex', 'skinWeight']);
  const bones = boneDefs.map(d => { const b = new THREE.Bone(); b.name = d.name; return b; });
  const root = bones[0]; for (let i = 1; i < bones.length; i++) root.add(bones[i]);
  return { geometry: geo, bones, boneDefs, tris: tris(geo) };
}
// bind: put the authored (bone-local) geometry into rest pose and make the SkinnedMesh
export function heroMesh(THREE, material) {
  const h = buildHero(THREE);
  const mesh = new THREE.SkinnedMesh(h.geometry, material); mesh.frustumCulled = false;
  mesh.add(h.bones[0]); const sk = new THREE.Skeleton(h.bones, h.bones.map(() => new THREE.Matrix4())); // identity inverses: vertices are authored in bone space
  mesh.bind(sk, new THREE.Matrix4()); mesh.bindMode = 'detached';
  return { mesh, ...h, skeleton: sk };
}
// same maths as hero.js placeSeg(), applied to a bone instead of a mesh (bones live in the hero's world-space parent)
const _UP = { x: 0, y: 1, z: 0 };
export function placeBone(THREE, bone, a, b) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length() || 1e-4;
  bone.position.copy(a); bone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.multiplyScalar(1 / L)); bone.scale.set(1, L, 1);
}

// ---------------- B) forest kit: vertex-coloured, one shared material (tobu3d gridMat(0xffffff,{vc:1})) ----------------
// Every climbable builder takes the sim box (centre + half extents) and stays INSIDE it; contact faces are coplanar
// with the collider faces, so grip, shadows and kicks line up with the sim exactly.
export const kit = {
  // branch ledge = sim 'shelf' (8 x 1 x len). Flat top at the collider top; underside tapers like a branch.
  ledge(THREE, b) {
    const { top, side, deep } = PAL.climb, w = b.hx, h = b.hy, l = b.hz;
    const g = new THREE.BufferGeometry();
    // octagonal-ish prism along z: full-width top, chamfered upper edges, narrowed keel underneath
    const prof = [[-w, h], [w, h], [w, h * 0.2], [w * 0.62, -h], [-w * 0.62, -h], [-w, h * 0.2]];
    const pts = []; const q = (A, B, C, D) => pts.push(A, B, C, A, C, D);
    for (let i = 0; i < prof.length; i++) { const [x0, y0] = prof[i], [x1, y1] = prof[(i + 1) % prof.length];
      q([x0, y0, l], [x1, y1, l], [x1, y1, -l], [x0, y0, -l]); }
    for (const zz of [l, -l]) for (let i = 1; i < prof.length - 1; i++) { const a = [...prof[0], zz], b2 = [...prof[i], zz], c = [...prof[i + 1], zz]; zz > 0 ? pts.push(a, c, b2) : pts.push(a, b2, c); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    const out = paint(THREE, fixWinding(THREE, g), (n) => n.y > 0.5 ? top : n.y < -0.2 ? deep : side); out.translate(b.x, b.y, b.z); return out;
  },
  // curved bark wall = sim 'wall' (0.6 x H x len). Contact face (facing the run, -side) is the flat collider plane;
  // the back is a convex bark curve with vertical flutes, ends and top are bevelled.
  wall(THREE, b, side) {
    const { face, side: sd, deep, top } = PAL.climb, t = b.hx * 2, h = b.hy, l = b.hz, segs = 10, pts = [];
    const inner = -side * b.hx; // contact plane offset from centre
    const back = (u) => inner + side * t * (0.35 + 0.65 * Math.sin(Math.PI * (0.08 + 0.84 * u))) * (1 - 0.06 * (Math.round(u * segs) % 2)); // curve + flutes
    const Z = (u) => -l + 2 * l * u, q = (A, B, C, D) => pts.push(A, B, C, A, C, D), bev = Math.min(0.25, h * 0.05);
    for (let i = 0; i < segs; i++) { const u0 = i / segs, u1 = (i + 1) / segs;
      q([inner, -h, Z(u0)], [inner, -h, Z(u1)], [inner, h - bev, Z(u1)], [inner, h - bev, Z(u0)]);                  // contact face
      q([back(u0), -h, Z(u0)], [back(u0), h - bev, Z(u0)], [back(u1), h - bev, Z(u1)], [back(u1), -h, Z(u1)]);       // curved back
      const m0 = (inner + back(u0)) / 2, m1 = (inner + back(u1)) / 2;                                                   // bevelled top ridge
      q([inner, h - bev, Z(u0)], [inner, h - bev, Z(u1)], [m1, h, Z(u1)], [m0, h, Z(u0)]);
      q([m0, h, Z(u0)], [m1, h, Z(u1)], [back(u1), h - bev, Z(u1)], [back(u0), h - bev, Z(u0)]);
      q([inner, -h, Z(u0)], [back(u0), -h, Z(u0)], [back(u1), -h, Z(u1)], [inner, -h, Z(u1)]); }
    for (const [u, zz] of [[0, -l], [1, l]]) { const m = (inner + back(u)) / 2;
      q([inner, -h, zz], [back(u), -h, zz], [back(u), h - bev, zz], [inner, h - bev, zz]); pts.push([inner, h - bev, zz], [back(u), h - bev, zz], [m, h, zz]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    const out = paint(THREE, fixWinding(THREE, g), (n, c) => Math.abs(c.x - inner) < 1e-4 && Math.abs(n.x) > 0.9 ? face : n.y > 0.5 ? top : n.y < -0.5 ? deep : sd);
    out.translate(b.x, b.y, b.z); return out;
  },
  // giant cedar (decor, no collider): tapered octagonal trunk + stacked flat canopy tiers. Base at origin, height H.
  cedar(THREE, H = 60, R = 3) {
    const { trunk, trunkS, tierA, tierB } = PAL.far, gs = [];
    const tr = new THREE.CylinderGeometry(R * 0.55, R, H, 8, 1); tr.translate(0, H / 2, 0); gs.push(paint(THREE, tr, (n) => n.x + n.z > 0 ? trunk : trunkS));
    const tiers = 4; for (let i = 0; i < tiers; i++) { const k = i / tiers, rr = R * (2.6 - 1.5 * k), hh = R * 0.7;
      const c = new THREE.CylinderGeometry(rr * 0.55, rr, hh, 8, 1); c.translate(0, H * (0.6 + 0.12 * i), 0); gs.push(paint(THREE, c, (n) => n.y > 0.3 ? tierB : tierA)); }
    const tip = new THREE.ConeGeometry(R * 1.2, R * 2.4, 8); tip.translate(0, H * 0.6 + 0.12 * tiers * H + R * 0.6, 0); gs.push(paint(THREE, tip, (n) => n.y > 0.3 ? tierB : tierA));
    return merge(THREE, gs);
  },
  // torii (background decor, no collider; pale lavender so it never reads as climbable, BRUSH 2026-10-22). Origin at the centre between the post feet; span W, height Ht.
  torii(THREE, W = 10, Ht = 9) {
    const { trunk: face, trunkS: side, tierA: top } = PAL.far, deep = PAL.far.trunkS, gs = [], P = (n) => n.y > 0.5 ? top : n.y < -0.5 ? deep : Math.abs(n.z) > 0.5 ? face : side;
    const pr = W * 0.06; for (const s of [-1, 1]) { const p = new THREE.CylinderGeometry(pr * 0.85, pr, Ht, 8); p.rotateZ(-s * 0.04); p.translate(s * W * 0.38, Ht / 2, 0); gs.push(paint(THREE, p, P)); }
    const nuki = new THREE.BoxGeometry(W * 0.92, pr * 1.2, pr * 0.9); nuki.translate(0, Ht * 0.72, 0); gs.push(paint(THREE, nuki, P));
    const kasagi = new THREE.BoxGeometry(W * 1.18, pr * 1.6, pr * 1.6); kasagi.translate(0, Ht + pr * 0.2, 0); gs.push(paint(THREE, kasagi, P));
    const shim = new THREE.BoxGeometry(W * 1.08, pr * 0.9, pr * 1.3); shim.translate(0, Ht - pr * 1.15, 0); gs.push(paint(THREE, shim, P));
    const gaku = new THREE.BoxGeometry(pr * 1.2, Ht * 0.17, pr * 0.8); gaku.translate(0, Ht * 0.86, 0); gs.push(paint(THREE, gaku, P));
    return merge(THREE, gs);
  },
};
function fixWinding(THREE, g) { // make every face's normal point away from the shape centre (hand-built faces)
  const p = g.attributes.position, c = new THREE.Vector3(); g.computeBoundingBox(); g.boundingBox.getCenter(c);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(m.subVectors(d, a)); m.copy(a).add(b).add(d).multiplyScalar(1 / 3).sub(c);
    if (n.dot(m) < 0) { p.setXYZ(i + 1, d.x, d.y, d.z); p.setXYZ(i + 2, b.x, b.y, b.z); } }
  return g;
}
export const triCount = tris;

// ---------------- C) scenery (backdrop, no colliders) — see ../scenery_spec.md ----------------
// Role colours per zone. Atmosphere (sky, fog, steam) is exempt from the 105-200 scenery band; everything solid is inside it.
export const ZONES = {
  spring: { y0: 0,   sky: [0x4A86D0, 0xB4D8FA], fog: 0xCFE6FB, fogD: 0.0038, trunk: 0x9AA2D8, tierA: 0xC4C2DC, tierB: 0xCDB4CC, pinkShare: 0.4, mtn: [0x8E98CC, 0xA4B0DA, 0xBAC6E4], fall: [0xA6BEDC, 0xB4CCE6], steam: [0xE6F0FA, 0.25], bird: 0x6F7FA0 },
  summer: { y0: 120, sky: [0x34609A, 0xA8D2F6], fog: 0xC9E2F6, fogD: 0.0042, trunk: 0x7F90B8, tierA: 0x5E8C8A, tierB: 0x6E9C98, mtn: [0x7486B4, 0x8E9ECC, 0xAEBEE0], fall: [0xA6BEDC, 0xB4CCE6], steam: [0xE2EEF8, 0.35], bird: 0x6F7FA0 },
  autumn: { y0: 250, sky: [0x4C7CC0, 0xB2D2F2], fog: 0xD0E2F2, fogD: 0.0040, trunk: 0x9298C8, tierA: 0x8E9A6A, tierB: 0xC8BC86, mtn: [0x8A90C4, 0xA2A8D4, 0xBCC2E2], fall: [0xA6BEDC, 0xB4CCE6], steam: [0xE4ECF6, 0.40], bird: 0x6F7FA0 },
  winter: { y0: 400, sky: [0x6C9AD4, 0xC8E2FA], fog: 0xDCEBF8, fogD: 0.0048, trunk: 0x8E9CC8, tierA: 0xA6B4DC, tierB: 0xC0C6DE, snow: 0xC0C6DE, mtn: [0x9CA8D2, 0xB2BEDE, 0xBCC6E0], fall: [0xA6BEDC, 0xB4CCE6], steam: [0xEAF2FA, 0.30], bird: 0xFFFFFF },
};
export const XFADE_M = 15; // metres of cross-fade centred on each boundary
export function zoneMix(y) { // -> {a, b, t}: blend from zone a to b by t (0..1)
  const ks = Object.keys(ZONES); for (let i = ks.length - 1; i >= 0; i--) { const y0 = ZONES[ks[i]].y0;
    if (i > 0 && Math.abs(y - y0) < XFADE_M / 2) return { a: ks[i - 1], b: ks[i], t: (y - y0 + XFADE_M / 2) / XFADE_M };
    if (y >= y0) return { a: ks[i], b: ks[i], t: 0 }; }
}
// seasonal cedar: same silhouette as kit.cedar; tiers recoloured per zone (spring: 60% white / 40% pink per tier by hash; winter: snow caps on tier tops)
export function cedarZone(THREE, zone, H = 60, R = 3, seed = 1) {
  const z = ZONES[zone], gs = []; let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const tr = new THREE.CylinderGeometry(R * 0.55, R, H, 8, 1); tr.translate(0, H / 2, 0); gs.push(paint(THREE, tr, () => z.trunk));
  for (let i = 0; i < 4; i++) { const k = i / 4, rr = R * (2.6 - 1.5 * k), c = new THREE.CylinderGeometry(rr * 0.55, rr, R * 0.7, 8, 1);
    c.translate(0, H * (0.6 + 0.12 * i), 0); const pinkTier = zone === 'spring' && rnd() < z.pinkShare;
    gs.push(paint(THREE, c, (n) => n.y > 0.3 ? (zone === 'winter' ? z.snow : pinkTier ? z.tierB : z.tierA) : (pinkTier ? z.tierB : z.tierA))); }
  const tip = new THREE.ConeGeometry(R * 1.2, R * 2.4, 8); tip.translate(0, H * 1.08 + R * 0.6, 0); gs.push(paint(THREE, tip, (n) => zone === 'winter' && n.y > 0.3 ? z.snow : z.tierA));
  return merge(THREE, gs);
}
// mountain layer: a ring segment of flat-shaded faceted peaks (one merged geometry per layer). layer 0 near .. 2 far
export function mountains(THREE, zone, layer, seed = 3) {
  const z = ZONES[zone], dist = [180, 260, 360][layer], n = [9, 12, 15][layer], hMax = [70, 110, 160][layer], gs = []; let s = seed + layer * 97;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) { const a = -Math.PI * 0.85 + (i / (n - 1)) * Math.PI * 1.7 + (rnd() - 0.5) * 0.15, h = hMax * (0.55 + rnd() * 0.45);
    const g = new THREE.ConeGeometry(h * (0.8 + rnd() * 0.4), h, 5 + (rnd() * 2 | 0), 1); g.rotateY(rnd() * 6);
    g.translate(Math.sin(a) * dist, h / 2 - 30, -Math.cos(a) * dist);
    gs.push(paint(THREE, g, (nn) => { const lit = nn.x * 0.35 + nn.z * 0.4 > 0; const c = new THREE.Color(z.mtn[layer]); if (!lit) c.multiplyScalar(0.92); if (zone === 'winter' && nn.y > 0.55) c.setHex(z.snow); return c.getHex(); })); }
  return merge(THREE, gs);
}
// waterfall: a vertical plane; colour bands scroll down in the shader (one shared material for all falls)
export function waterfall(THREE, w = 6, h = 60) { const g = new THREE.PlaneGeometry(w, h, 1, 1); g.translate(0, -h / 2, 0); return g; }
export function waterfallMat(THREE, zone) {
  const z = ZONES[zone];
  return new THREE.ShaderMaterial({ fog: true, transparent: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { a: { value: new THREE.Color(z.fall[0]) }, b: { value: new THREE.Color(z.fall[1]) }, t: { value: 0 } }]),
    vertexShader: `#include <fog_pars_vertex>
      varying vec2 vU; void main(){ vU=uv; vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `#include <fog_pars_fragment>
      uniform vec3 a,b; uniform float t; varying vec2 vU;
      void main(){ float k=step(0.5,fract(vU.y*9.+t*0.6+floor(vU.x*3.)*0.33)); gl_FragColor=vec4(mix(a,b,k),1.);
      #include <fog_fragment>
      }` });
}
// bird: flat chevron (2 tris), ~0.9 x 0.35 units; instance it (InstancedMesh, one draw for all birds)
export function bird(THREE) { const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.45, 0.12, 0, 0, 0, 0, 0, -0.1, 0, 0, 0, 0, 0.45, 0.12, 0, 0, -0.1, 0], 3)); g.computeVertexNormals(); return g; }
