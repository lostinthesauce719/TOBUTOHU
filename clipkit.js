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
  // artfinal05 (Apollo: legs too big): front/mid ~1.15x original; hind femurs ~1.6x original (V kept); body unchanged from artfinal03
  LEGS.push({ s, kind: 'front', hip: [s * 0.05, -0.04, 0.22], rest: [s * 0.2, -RIDE, 0.36], a: 0.15, b: 0.19, r: [0.0184, 0.0138, 0.0138, 0.0104] });
  LEGS.push({ s, kind: 'mid', hip: [s * 0.06, -0.04, 0.12], rest: [s * 0.24, -RIDE, 0.08], a: 0.15, b: 0.19, r: [0.0184, 0.0138, 0.0138, 0.0104] });
  LEGS.push({ s, kind: 'hind', hip: [s * 0.065, 0.0, 0.07], rest: [s * 0.17, -RIDE, -0.48], a: 0.6, b: 0.55, t: 0.1, r: [0.08, 0.035, 0.022, 0.011], r3: [0.013, 0.009] });
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
  // Hero C sleek leap + BRUSH mass fix: abdomen/thorax ~1.8x thicker (cream belly reads); not skeletal
  add(new THREE.CapsuleGeometry(0.12, 0.14, 2, 8), M([0, 0.02, 0.14], [H, 0, 0], [1.1, 1, 1.0]));              // thorax massy (cream belly)
  add(new THREE.BoxGeometry(0.24, 0.07, 0.17), M([0, 0.07, 0.16], [0.06, 0, 0]));                             // pronotum saddle
  add(new THREE.BoxGeometry(0.24, 0.014, 0.05), M([0, 0.11, 0.16], [0.08, 0.55, 0]), () => sash);           // sash across pronotum
  add(new THREE.BoxGeometry(0.05, 0.01, 0.20), M([0.09, 0.02, 0.04], [0.15, -0.35, 0.2]), () => sash);      // sash trail (leap read)
  add(new THREE.ConeGeometry(0.065, 0.16, 7), M([0, -0.005, 0.34], [H + 0.5, 0, 0], [0.95, 1, 1.2]));         // head (slightly fuller)
  add(new THREE.ConeGeometry(0.115, 0.72, 8), M([0, -0.03, -0.30], [-H, 0, 0], [1.1, 1, 0.95]));             // abdomen massy + cream belly
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.032, 6, 4), M([s * 0.055, 0.038, 0.32], [0, 0, 0], [0.7, 1.1, 1.15]), () => crease); // eye (on fuller head)
    add(new THREE.CylinderGeometry(0.005, 0.01, 0.16, 4), M([s * 0.035, 0.08, 0.40], [0.7, 0, s * -0.22]), () => crease); // short antenna
  }
  // procedural wing stubs: vertex range recorded so powerups can hide/tint them (visual only)
  let wingVertStart = 0; for (const g of gs) wingVertStart += g.attributes.position.count;
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.055, 0.016, 0.88), M([s * 0.042, 0.055, -0.30], [0.04, s * 0.03, s * 0.1]), () => top); // stubs always #86AE58 (never cream belly)
  }
  let wingVertEnd = 0; for (const g of gs) wingVertEnd += g.attributes.position.count;
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
  return { geometry: geo, bones, boneDefs, tris: tris(geo), wingVertStart, wingVertCount: wingVertEnd - wingVertStart };
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
  // Walls C fluted crystalline shelf = sim 'shelf'. Flat contact top coplanar with collider; sides are vertical basalt flutes.
  ledge(THREE, b) {
    const { top, side, deep } = PAL.climb, w = b.hx, h = b.hy, l = b.hz, pts = [];
    const q = (A, B, C, D) => pts.push(A, B, C, A, C, D);
    const nFl = Math.max(4, Math.min(10, Math.round(l * 1.6))); // vertical flutes along length
    // flat contact top (exact collider top face)
    q([-w, h, l], [w, h, l], [w, h, -l], [-w, h, -l]);
    // underside keel (slightly inset)
    q([-w * 0.7, -h, -l], [w * 0.7, -h, -l], [w * 0.7, -h, l], [-w * 0.7, -h, l]);
    // fluted long sides: vertical crystal columns inset under the top lip
    for (const sx of [-1, 1]) {
      for (let i = 0; i < nFl; i++) {
        const z0 = -l + (2 * l * i) / nFl, z1 = -l + (2 * l * (i + 1)) / nFl, zm = (z0 + z1) / 2;
        const inset = 0.04 * w * (i % 2 ? 1 : 0.35); // alternate flute depth
        const xOuter = sx * w, xInner = sx * (w - inset - 0.08 * w);
        // outer face of flute
        q([xOuter, h, z0], [xOuter, -h * 0.15, z0], [xOuter, -h * 0.15, z1], [xOuter, h, z1]);
        // recessed face
        q([xInner, h * 0.85, z0], [xInner, h * 0.85, z1], [xInner, -h * 0.55, z1], [xInner, -h * 0.55, z0]);
        // facet joins (crystal edges)
        q([xOuter, h, z0], [xInner, h * 0.85, z0], [xInner, -h * 0.55, z0], [xOuter, -h * 0.15, z0]);
        q([xOuter, h, z1], [xOuter, -h * 0.15, z1], [xInner, -h * 0.55, z1], [xInner, h * 0.85, z1]);
        // tapered to keel
        q([xOuter, -h * 0.15, z0], [sx * w * 0.7, -h, z0], [sx * w * 0.7, -h, z1], [xOuter, -h * 0.15, z1]);
      }
    }
    // end caps (faceted)
    for (const zz of [l, -l]) {
      q([-w, h, zz], [w, h, zz], [w * 0.7, -h, zz], [-w * 0.7, -h, zz]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    const out = paint(THREE, fixWinding(THREE, g), (n, c) => {
      if (n.y > 0.55) return top;
      if (n.y < -0.35) return deep;
      // long-side flutes: light/dark alternate within slate (luma 60–91)
      const fluteI = Math.max(0, Math.min(nFl - 1, Math.floor(((c.z + l) / Math.max(2 * l, 1e-6)) * nFl)));
      return (fluteI % 2) === 0 ? side : deep;
    }); out.translate(b.x, b.y, b.z); return out;
  },
  // Walls C fluted crystalline wall = sim 'wall'. Ridges sit on the flat collider plane; grooves inset into the rock.
  wall(THREE, b, side) {
    const { face, side: sd, deep, top } = PAL.climb, t0 = b.hx * 2, h = b.hy, l = b.hz, pts = [];
    const inner = -side * b.hx; // contact plane (ridge tops)
    const nFl = Math.max(6, Math.min(16, Math.round(l * 2.4)));
    const Z = (u) => -l + 2 * l * u, q = (A, B, C, D) => pts.push(A, B, C, A, C, D), bev = Math.min(0.22, h * 0.04);
    const groove = Math.min(t0 * 0.45, b.hx * 0.7); // how deep grooves go into the wall
    for (let i = 0; i < nFl; i++) {
      const u0 = i / nFl, u1 = (i + 1) / nFl, um = (u0 + u1) / 2;
      const z0 = Z(u0), z1 = Z(u1), zm = Z(um);
      const isRidge = (i % 2) === 0;
      // alternate ridge (at contact plane) and groove (inset)
      const xFace = isRidge ? inner : (inner + side * groove);
      const xBack = inner + side * (t0 * (0.7 + 0.25 * ((i % 3) / 2)));
      // contact / groove face
      q([xFace, -h, z0], [xFace, -h, z1], [xFace, h - bev, z1], [xFace, h - bev, z0]);
      // back face
      q([xBack, -h, z0], [xBack, h - bev, z0], [xBack, h - bev, z1], [xBack, -h, z1]);
      // vertical crystal facets between ridge and groove
      if (!isRidge) {
        // side walls of the groove (visible from chase cam)
        q([inner, -h, z0], [xFace, -h, z0], [xFace, h - bev, z0], [inner, h - bev, z0]);
        q([xFace, -h, z1], [inner, -h, z1], [inner, h - bev, z1], [xFace, h - bev, z1]);
      }
      // outer column sides
      q([xFace, -h, z0], [xBack, -h, z0], [xBack, h - bev, z0], [xFace, h - bev, z0]);
      q([xBack, -h, z1], [xFace, -h, z1], [xFace, h - bev, z1], [xBack, h - bev, z1]);
      // faceted crystalline top
      const xMid = (xFace + xBack) / 2;
      q([xFace, h - bev, z0], [xFace, h - bev, z1], [xMid, h, z1], [xMid, h, z0]);
      q([xMid, h, z0], [xMid, h, z1], [xBack, h - bev, z1], [xBack, h - bev, z0]);
      // bottom
      q([xFace, -h, z0], [xBack, -h, z0], [xBack, -h, z1], [xFace, -h, z1]);
    }
    // end caps
    for (const [u, zz] of [[0, -l], [1, l]]) {
      const xBack = inner + side * t0 * 0.85;
      q([inner, -h, zz], [xBack, -h, zz], [xBack, h - bev, zz], [inner, h - bev, zz]);
      pts.push([inner, h - bev, zz], [xBack, h - bev, zz], [(inner + xBack) / 2, h, zz]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    const out = paint(THREE, fixWinding(THREE, g), (n, c) => {
      // BRUSH: per-flute light→dark within slate luma 60–91 so ridges read in chase cam
      const fluteI = Math.max(0, Math.min(nFl - 1, Math.floor(((c.z + l) / Math.max(2 * l, 1e-6)) * nFl)));
      const ridge = (fluteI % 2) === 0;
      if (n.y > 0.5) return top;   // #4A5D80 luma 91
      if (n.y < -0.5) return deep; // #2F3D58 luma 60
      // ridge columns light (face/top 86–91), groove columns dark (side/deep 60–73)
      if (ridge) return Math.abs(n.x) > 0.65 ? face : top;
      return Math.abs(n.x) > 0.65 ? deep : sd;
    });
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
  // hemi = soft hemisphere light [sky, ground] (visual only; no red/orange). Climbables stay global.
  spring: { y0: 0,   sky: [0x4A86D0, 0xB4D8FA], fog: 0xCFE6FB, fogD: 0.0038, hemi: [0xf2f8ff, 0x7a8f7a], trunk: 0x9AA2D8, tierA: 0xC4C2DC, tierB: 0xCDB4CC, pinkShare: 0.4, mtn: [0x8E98CC, 0xA4B0DA, 0xBAC6E4], fall: [0xA6BEDC, 0xB4CCE6], steam: [0xE6F0FA, 0.25], bird: 0x6F7FA0 },
  summer: { y0: 120, sky: [0x34609A, 0xA8D2F6], fog: 0xC9E2F6, fogD: 0.0042, hemi: [0xf5fbff, 0x6f7f9a], trunk: 0x7F90B8, tierA: 0x5E8C8A, tierB: 0x6E9C98, mtn: [0x7486B4, 0x8E9ECC, 0xAEBEE0], fall: [0xA6BEDC, 0xB4CCE6], steam: [0xE2EEF8, 0.35], bird: 0x6F7FA0 },
  autumn: { y0: 250, sky: [0x4C7CC0, 0xB2D2F2], fog: 0xD0E2F2, fogD: 0.0040, hemi: [0xf0f4ee, 0x7a7f6a], trunk: 0x9298C8, tierA: 0x9AA052, tierB: 0xD8B76A, mtn: [0x8A90C4, 0xA2A8D4, 0xBCC2E2], fall: [0xA6BEDC, 0xB4CCE6], steam: [0xE4ECF6, 0.40], bird: 0x6F7FA0 }, /* B gold-corrected olive/gold */
  winter: { y0: 400, sky: [0x6C9AD4, 0xC8E2FA], fog: 0xDCEBF8, fogD: 0.0048, hemi: [0xf4f8ff, 0x8a9aaa], trunk: 0x8E9CC8, tierA: 0xA6B4DC, tierB: 0xC0C6DE, snow: 0xC0C6DE, mtn: [0x9CA8D2, 0xB2BEDE, 0xBCC6E0], fall: [0xA6BEDC, 0xB4CCE6], steam: [0xEAF2FA, 0.30], bird: 0xFFFFFF },
};
export const XFADE_M = 18; // metres of smooth cross-fade centred on each season-gate / torii boundary
export const SEASON_BOUNDS = [120, 250, 400]; // torii season gates (visual only)
export function zoneMix(y) { // -> {a, b, t}: blend from zone a to b by t (0..1), smoothstepped
  const ks = Object.keys(ZONES); for (let i = ks.length - 1; i >= 0; i--) { const y0 = ZONES[ks[i]].y0;
    if (i > 0 && Math.abs(y - y0) < XFADE_M / 2) {
      let u = (y - y0 + XFADE_M / 2) / XFADE_M; u = u * u * (3 - 2 * u); // smoothstep
      return { a: ks[i - 1], b: ks[i], t: u };
    }
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
