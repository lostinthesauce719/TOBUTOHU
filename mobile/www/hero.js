// Tobu hero (style D greybox): procedural grasshopper with contact-driven poses.
// VISUAL ONLY: reads the sim's player state (P) and course boxes, never writes to them,
// so replays, break timings and the server check are untouched.
import * as THREE from './vendor/three.module.min.js';
import { heroMesh, placeBone, legName } from './clipkit.js'; // BRUSH production kit: 1 SkinnedMesh, 15 bones, 1 draw
THREE.ColorManagement.enabled = false; // style D hexes are authored in sRGB and written as-is (no linear workflow)

const C = { lit: 0x86AE58, base: 0x6E9A42, shade: 0x6E9A42, belly: 0xF2EEE0, sash: 0xFFD23F, sashS: 0xFFD23F, // BRUSH clipstyle green hero (2026-10-22)
  eye: 0x4E6A3A, line: 0x1E2A2A, rim: 0xEEF0DA, patch: 0x1E2A40 };
const BL = 1.1;               // body length in world units (matches the camera framing KAMI approved)
const RIDE = 0.22;            // thorax centre above the contact surface
const VIS = 1.28;             // render-only body scale (~with closer cam → ~8% frame width); hitbox untouched
const LIGHT = new THREE.Vector3(-0.5, 0.7, 0.5).normalize(); // camera-space light (BRUSH brief §3)

// ---------- cel + hull materials (brief §3) ----------
function cel(lit, base, shade, belly = -1) {
  return new THREE.ShaderMaterial({
    uniforms: { cL: { value: new THREE.Color(lit) }, cB: { value: new THREE.Color(base) }, cS: { value: new THREE.Color(shade) }, cU: { value: new THREE.Color(belly < 0 ? base : belly) }, uB: { value: belly < 0 ? 0 : 1 }, L: { value: LIGHT } },
    vertexShader: `varying vec3 vN; varying float vWy; void main(){ vN=normalize(normalMatrix*normal); vWy=normalize(mat3(modelMatrix)*normal).y; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 cL,cB,cS,cU,L; uniform float uB; varying vec3 vN; varying float vWy; void main(){ float d=dot(normalize(vN),L);
      vec3 c=mix(cS,cB,smoothstep(-0.6,0.1,d)); c=mix(c,cL,smoothstep(0.1,0.9,d)); /* look reset: smooth, no bands */
      if(uB>0.5 && vWy<-0.35) c=cU; /* cream belly / leg undersides */ gl_FragColor=vec4(c,1.); }`,
  });
}
const hullU = { res: { value: new THREE.Vector2(1080, 1920) } }; // real render-buffer size; widths are set per frame in real pixels
function hull(color, widthPx) {
  return new THREE.ShaderMaterial({
    uniforms: { c: { value: new THREE.Color(color) }, w: { value: widthPx }, res: hullU.res },
    side: THREE.BackSide,
    vertexShader: `uniform float w; uniform vec2 res; void main(){ vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
      vec3 n=normalMatrix*normal; vec2 d=normalize((projectionMatrix*vec4(n,0.)).xy+1e-6); p.xy+=d*(w*2./res)*p.w; gl_Position=p; }`,
    fragmentShader: `uniform vec3 c; void main(){ gl_FragColor=vec4(c,1.); }`,
  });
}
const M = { body: cel(C.lit, C.base, C.shade, C.belly), sash: new THREE.MeshBasicMaterial({ color: C.sash, fog: false }) /* exactly #FFD23F, no shading shift */, eye: cel(C.eye, C.eye, 0x3d5530) };
const H = { line: hull(C.line, 2), rim: hull(C.rim, 3.5) }; // spec D: 2 px line (floor 1) + 1.5 px rim outside it (floor 1), at 1080 width
const hullMats = [H.line, H.rim];

// mesh + its two hulls (rim drawn first, then line, then the body)
function part(geo, mat = M.body) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(geo, H.rim); rim.renderOrder = 1;
  const line = new THREE.Mesh(geo, H.line); line.renderOrder = 2;
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 3;
  g.add(m); return g; // look reset: no hull outlines (rim/line kept for BRUSH's mesh)
}

// ---------- body (brief §1–2; local +z = head, +y = back) ----------
function buildBody() {
  const b = new THREE.Group();
  const thorax = part(new THREE.CapsuleGeometry(0.068, 0.12, 4, 10)); thorax.rotation.x = Math.PI / 2; thorax.position.set(0, 0.0, 0.15); thorax.scale.set(1, 1, 0.9); b.add(thorax);
  const head = part(new THREE.ConeGeometry(0.06, 0.17, 7)); head.rotation.x = Math.PI / 2 + 0.55; head.position.set(0, -0.01, 0.31); head.scale.set(0.95, 1, 1.25); b.add(head);
  for (const s of [-1, 1]) {
    const eye = part(new THREE.SphereGeometry(0.03, 8, 6), M.eye); eye.position.set(s * 0.045, 0.035, 0.29); eye.scale.set(0.7, 1.1, 1.2); b.add(eye);
    const ant = part(new THREE.CylinderGeometry(0.008, 0.013, 0.34, 5)); ant.position.set(s * 0.03, 0.13, 0.42); ant.rotation.set(0.75, 0, s * -0.25); b.add(ant);
    const wing = part(new THREE.BoxGeometry(0.06, 0.018, 0.78)); wing.position.set(s * 0.032, 0.055, -0.27); wing.rotation.set(0.05, s * 0.035, s * 0.12); b.add(wing);
  }
  const abd = part(new THREE.ConeGeometry(0.06, 0.62, 8)); abd.rotation.x = -Math.PI / 2; abd.position.set(0, -0.015, -0.22); abd.scale.set(1, 1, 0.85); b.add(abd);
  const sash = part(new THREE.CylinderGeometry(0.078, 0.078, 0.05, 12, 1, true), M.sash); sash.rotation.x = Math.PI / 2; sash.position.set(0, 0.0, 0.2); b.add(sash);
  const tail = part(new THREE.BoxGeometry(0.012, 0.03, 0.13), M.sash); tail.position.set(0.085, -0.02, 0.15); tail.rotation.set(0.3, -0.25, 0.2); b.add(tail);
  return bake(b);
}
// look reset: bake the rigid body parts into one mesh per material (11 draws -> 3); poses only move the whole body
function bake(b) {
  b.updateMatrixWorld(true); const by = new Map();
  b.traverse(o => { if (!o.isMesh) return; const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld); (by.get(o.material) || by.set(o.material, []).get(o.material)).push(g); });
  const out = new THREE.Group();
  for (const [mat, gs] of by) { let n = 0; gs.forEach(g => n += g.attributes.position.count); const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let k = 0;
    for (const g of gs) { P.set(g.attributes.position.array, k * 3); N.set(g.attributes.normal.array, k * 3); k += g.attributes.position.count; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.add(new THREE.Mesh(geo, mat)); }
  return out;
}

// ---------- legs: world-space segments posed by 2-bone IK ----------
const UP = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion();
function seg(r0, r1) { const s = part(new THREE.CylinderGeometry(r1, r0, 1, 6)); s.matrixAutoUpdate = true; return s; }
function placeSeg(s, a, b) { const d = new THREE.Vector3().subVectors(b, a), L = d.length() || 1e-4; s.position.copy(a).addScaledVector(d, 0.5); s.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / L)); s.scale.set(1, L, 1); }
function ik(root, target, a, b, pole) { // returns knee
  const d = new THREE.Vector3().subVectors(target, root); let D = d.length(); const reach = D <= a + b - 1e-3; D = Math.min(Math.max(D, 1e-3), a + b - 1e-3); d.normalize();
  const x = (a * a - b * b + D * D) / (2 * D), h = Math.sqrt(Math.max(0, a * a - x * x));
  const p = pole.clone().addScaledVector(d, -pole.dot(d)); if (p.lengthSq() < 1e-8) p.set(0, 1, 0); p.normalize();
  return { knee: root.clone().addScaledVector(d, x).addScaledVector(p, h), reach };
}
// leg defs: hip (local), rest foot (local, on the ground plane y=-RIDE), segment lengths, tripod group
const LEGS = [];
for (const s of [-1, 1]) {
  LEGS.push({ s, kind: 'front', hip: [s * 0.05, -0.04, 0.22], rest: [s * 0.2, -RIDE, 0.36], a: 0.15, b: 0.19, grp: s < 0 ? 0 : 1, stride: 0.26 });
  LEGS.push({ s, kind: 'mid', hip: [s * 0.06, -0.04, 0.12], rest: [s * 0.24, -RIDE, 0.08], a: 0.15, b: 0.19, grp: s < 0 ? 1 : 0, stride: 0.26 });
  LEGS.push({ s, kind: 'hind', hip: [s * 0.065, 0.0, 0.07], rest: [s * 0.17, -RIDE, -0.48], a: 0.6, b: 0.55, t: 0.1, grp: s < 0 ? 0 : 1, stride: 0.22 });
}

export function createHero(scene, P, boxes) {
  const root = new THREE.Group(); const HM = heroMesh(THREE, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true })); const body = HM.mesh; body.bindMode = 'attached'; /* bones are children of the mesh: attached keeps them out of double model transforms */ root.add(body); root.userData.layer = 'play'; scene.add(root);
  // procedural wing stubs (clipkit): hide while paper wings active, else tint #86AE58
  const _wv0 = HM.wingVertStart|0, _wvn = HM.wingVertCount|0;
  const _wPos = body.geometry.attributes.position, _wCol = body.geometry.attributes.color;
  const _wPos0 = _wPos.array.slice(_wv0 * 3, (_wv0 + _wvn) * 3);
  const _wCol0 = _wCol.array.slice(_wv0 * 3, (_wv0 + _wvn) * 3);
  const _tint = new THREE.Color(0x86AE58);
  let _stubHidden = null; // null so first setStubWings(false) actually applies #86AE58 (stubs bake cream belly)
  function setStubWings(hide) {
    hide = !!hide;
    if (hide === _stubHidden) return;
    _stubHidden = hide;
    for (let i = 0; i < _wvn; i++) {
      const o = (_wv0 + i) * 3, s = i * 3;
      if (hide) { _wPos.array[o] = _wPos.array[o + 1] = _wPos.array[o + 2] = 0; }
      else {
        _wPos.array[o] = _wPos0[s]; _wPos.array[o + 1] = _wPos0[s + 1]; _wPos.array[o + 2] = _wPos0[s + 2];
        _wCol.array[o] = _tint.r; _wCol.array[o + 1] = _tint.g; _wCol.array[o + 2] = _tint.b;
      }
    }
    _wPos.needsUpdate = true; if (!hide) _wCol.needsUpdate = true;
  }
  setStubWings(true); // default: collapsed — boxes read as cream wings in chase
  const boneBy = new Map(HM.bones.map(b => [b.name, b])), _inv = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const bone = (L, i, a, b) => placeBone(THREE, boneBy.get(legName(L, i)), _a.copy(a).applyMatrix4(_inv), _b.copy(b).applyMatrix4(_inv)); // IK points (world) -> body-local
  // antennas are baked into clipkit heroMesh (1 SkinnedMesh draw) — no extra antenna props
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: C.patch, transparent: true, opacity: 0.35, depthWrite: false }));
  patch.scale.set(0.36, 0.72, 1); patch.userData.layer = 'play'; scene.add(patch);
  for (const L of LEGS) {
    L.hipV = new THREE.Vector3(...L.hip); L.restV = new THREE.Vector3(...L.rest);
    L.plant = null; L.n = new THREE.Vector3(0, 1, 0); L.swing = 0; L.from = new THREE.Vector3(); L.foot = new THREE.Vector3(); L.hold = 0;
  }
  const st = { prev: 'air', q: new THREE.Quaternion(), off: new THREE.Vector3(), latch: 9, land: 9, kick: 9, fwd: new THREE.Vector3(0, 0, -1), sq: 0, turn: 0, gait: 0, breath: 0, idleShift: 0 };
  const fx = { trail: 0, spark: 0, rim: 0.4, state: 'air', speed: 0, kick: 9, air: 0, splay: 0, tuck: 0, slot: null }; // fx.slot: enchantment hook (BRUSH designs pending Apollo approval) — fn(fx, hero) called each frame, render-only
  const mat = new THREE.Matrix4(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const world = (v, out) => out.copy(v).applyMatrix4(root.matrixWorld);

  // contact surfaces read straight from the sim (read-only)
  function surface() {
    if (P.state === 'wall' && P.lastWall) { const b = P.lastWall, s = P.wallSide; return { kind: 'wall', side: s, n: new THREE.Vector3(-s, 0, 0), d: b.x - s * b.hx }; }
    if (P.state === 'ground' && P.stand) { const g = P.stand; return { kind: 'ground', n: new THREE.Vector3(0, 1, 0), d: g.y + g.hy, box: g }; }
    return { kind: 'air' };
  }
  function project(p, sf) { // put a point onto the surface plane
    if (sf.kind === 'wall') p.x = sf.d; else p.y = sf.d; return p;
  }

  function update(dt, px, w = 1080, h = 1920) {
    hullU.res.value.set(w, h); const lw = Math.max(2 * px, 1); H.line.uniforms.w.value = lw; H.rim.uniforms.w.value = lw + Math.max(1.5 * px, 1);
    const sf = surface(), state = sf.kind;
    // ---- events from state changes (visual only) ----
    if (state === 'wall' && st.prev !== 'wall') { st.latch = 0; for (const L of LEGS) L.swing = 0; }
    if (state === 'ground' && st.prev !== 'ground') st.land = 0;
    if (st.prev !== 'air' && state === 'air' && P.vel.y > 4) { st.kick = 0; st.kickFrom = st.prev; 
      for (const L of LEGS) { if (L.kind === 'hind' && st.lastSf) { // push-off: hind claws pin where the kick started
          const hw = world(L.hipV, new THREE.Vector3()), side = new THREE.Vector3(L.s, 0, 0).applyQuaternion(st.q);
          if (st.lastSf.kind === 'ground' || side.x * st.lastSf.side > -0.1) { L.plant = project(world(L.restV, new THREE.Vector3()), st.lastSf); L.n.copy(st.lastSf.n); }
          L.hold = 0.18; } else if (L.plant) L.hold = L.kind === 'front' ? 0.2 : 0.08; } } // §8.2.4: forelegs release last (each claw stays pinned only while in reach, so it never floats)
    st.latch += dt; st.land += dt; st.kick += dt; st.air = state === 'air' ? (st.air || 0) + dt : 0;
    // legs pose weights (render-only): launch extension -> mid-air tuck by airtime; splay on land/grab
    const ext = st.kick < 0.22 ? 1 - st.kick / 0.22 : 0;
    const tuck = state === 'air' ? THREE.MathUtils.smoothstep(st.air, 0.12, 0.4) * (P.vel.y < 2 ? 1 : 0.6) : 0;
    const sinceC = state === 'wall' ? st.latch : state === 'ground' ? st.land : 9;
    const splay = sinceC < 0.3 ? Math.sin(Math.PI * Math.min(1, sinceC / 0.3))  : 0;

    // ---- orientation: yaw to travel, pitch to velocity, roll toward wall / into steer (brief §6) ----
    const hs = Math.hypot(P.vel.x, P.vel.z); if (hs > 1) st.fwd.set(P.vel.x / hs, 0, P.vel.z / hs);
    const yaw = Math.atan2(st.fwd.x, st.fwd.z);
    let pitch = state === 'air' ? THREE.MathUtils.clamp(Math.atan2(P.vel.y, Math.max(hs, 1)), -35 * Math.PI / 180, 50 * Math.PI / 180) * 0.6 : 0;
    let roll = state === 'wall' ? sf.side * 0.85 : THREE.MathUtils.clamp(-P.vel.x * 0.03, -0.35, 0.35); // ~49 deg into the wall so the claws reach it
    if (st.kick < 0.2 && st.kickFrom === 'wall') roll *= 0.5;
    const want = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, roll * (Math.cos(yaw) < 0 ? -1 : 1), 'YXZ'));
    st.q.slerp(want, 1 - Math.exp(-dt / 0.08));

    // ---- position: drop the body onto its contact surface; latch squash toward the wall ----
    const offW = new THREE.Vector3(0, -(P.r - RIDE), 0);
    if (state === 'wall') { const k = Math.min(1, st.latch / 0.08); offW.set(sf.side * (P.r - 0.12), -0.08, 0); } // belly hugs the wall; no offset that springs away from it
    if (state === 'ground' && st.land < 0.2) { const t = st.land; offW.y -= 0.055 * (t < 0.08 ? Math.sin(Math.PI / 2 * t / 0.08) : 0.5 + 0.5 * Math.cos(Math.PI * (t - 0.08) / 0.12)); } // §8.2.5: compress 0.08 s, dip 0.05 BL, ease out with no overshoot
    st.off.lerp(offW, 1 - Math.exp(-dt / (state === 'wall' && st.latch < 0.08 ? 0.015 : 0.05)));
    root.position.set(P.pos.x, P.pos.y, P.pos.z).add(st.off); root.quaternion.copy(st.q);
    const lt = st.latch, squash = state !== 'wall' ? 0 : lt < 0.08 ? Math.sin(Math.PI / 2 * lt / 0.08) : lt < 0.18 ? 0.5 + 0.5 * Math.cos(Math.PI * (lt - 0.08) / 0.1) : 0; // §8.2.1: 13% toward the wall in 0.08 s, recover 0.10 s
    const nl = sf.n ? sf.n.clone().applyQuaternion(st.q.clone().invert()) : new THREE.Vector3(0, 1, 0);
    const speed = Math.hypot(P.vel.x, P.vel.z, state === 'air' ? 0 : Math.min(Math.abs(P.vel.y), 8));
    // breathing + visual scale (render-only). Idle: clear thorax bob; moving: lighter.
    const idle = state !== 'air' && speed < 0.55;
    st.breath += dt;
    const breath = idle ? 0.035 * Math.sin(st.breath * 2.6) : 0.012 * Math.sin(st.breath * 3.1);
    const sx = VIS * (1 - 0.13 * squash * Math.abs(nl.x));
    const sy = VIS * (1 - 0.13 * squash * Math.abs(nl.y)) * (1 + breath);
    const sz = VIS * (1 + breath * 0.35);
    body.scale.set(sx, sy, sz);
    // antenna sway retired: baked into skinned mesh (saves 2 draws)
    root.updateMatrixWorld(true); _inv.copy(body.matrixWorld).invert();
    const delta = st.lastRoot ? root.position.clone().sub(st.lastRoot) : new THREE.Vector3(); st.lastRoot = root.position.clone();

    // ---- feet: speed-synced tripod gait (readable run / wall-run / jump / grab) ----
    // Bones driven: root + front_{L|R}_s{1,2} + mid_{L|R}_s{1,2} + hind_{L|R}_s{1,2,3} (15 total)
    const bodyUp = tmp2.set(0, 1, 0).applyQuaternion(st.q), bodyBack = new THREE.Vector3(0, 0, -1).applyQuaternion(st.q);
    const bodyFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(st.q);
    // gait phase advances with distance so stride rate tracks speed; idle still breathes
    st.gait = (st.gait || 0) + dt * (state === 'air' ? 0 : (0.55 + speed * 0.42));
    const swingT = Math.max(0.09, 0.16 - speed * 0.004); // longer, readable swing (~0.1–0.16 s)
    for (const L of LEGS) {
      const hipW = world(L.hipV, new THREE.Vector3()), restW = world(L.restV, new THREE.Vector3());
      const sideW = new THREE.Vector3(L.s, 0, 0).applyQuaternion(st.q);
      let contact = false;
      // hind legs now participate in the run gait (not just land/latch), so motion stays visible
      if (state === 'ground') contact = true;
      else if (state === 'wall') contact = sideW.x * sf.side > -0.05; // near-wall + far legs both animate
      L.hold -= dt;
      if (contact) {
        // phase offset: tripod (grp) + kind stagger so all six legs read as walking
        const kindOff = L.kind === 'front' ? 0 : L.kind === 'mid' ? 0.33 : 0.66;
        const ph = (st.gait + L.grp * 0.5 + kindOff) % 1; // 0..1 cycle
        const swingHalf = 0.42; // fraction of cycle spent swinging
        const wantSwing = ph < swingHalf && speed > 0.4 && !(state === 'wall' && st.latch < 0.08) && !(state === 'ground' && st.land < 0.1);
        // goal ahead of rest along travel, scaled by speed (bigger stride when fast)
        const strideLen = (L.kind === 'hind' ? 0.18 : 0.22) + Math.min(0.2, speed * 0.012);
        const ahead = new THREE.Vector3(P.vel.x, 0, P.vel.z);
        if (ahead.lengthSq() < 1e-4) ahead.copy(bodyFwd); else ahead.normalize();
        const goal = project(restW.clone().addScaledVector(ahead, strideLen * (0.5 - ph)), sf);
        // idle micro-shift when nearly still (livelier stance: occasional weight transfer)
        if (splay > 0) goal.addScaledVector(sideW, (L.kind === 'mid' ? 0.05 : 0.07) * splay).addScaledVector(bodyFwd, (L.kind === 'front' ? 0.04 : L.kind === 'hind' ? -0.04 : 0) * splay); // land / grab splay
        if (state === 'wall' && speed < 0.55) { const sw = Math.sin(P.t * 1.3 + L.grp * Math.PI + kindOff * 2); goal.y += 0.025 * sw; goal.z += 0.012 * Math.cos(P.t * 0.8 + L.s); } // clinging idle sway
        if (speed < 0.55) {
          const pulse = Math.sin(P.t * 1.7 + L.s + kindOff * 6);
          const kick = Math.sin(P.t * 0.37 + L.grp * 2.1); // occasional bigger shift
          goal.addScaledVector(sideW, 0.018 * pulse + 0.022 * Math.max(0, kick) * Math.sin(P.t * 2.4 + kindOff));
          goal.addScaledVector(bodyFwd, 0.01 * Math.sin(P.t * 0.9 + kindOff * 4));
        }
        if (wantSwing && L.swing <= 0 && L.hold <= 0) {
          L.from.copy(L.plant || L.foot.lengthSq() ? L.foot : restW); L.plant = null; L.swing = 1e-6;
        }
        if (L.swing > 0) {
          L.swing += dt / swingT; const k = Math.min(1, L.swing);
          const lift = (L.kind === 'hind' ? 0.14 : 0.09) * Math.sin(Math.PI * k);
          L.foot.lerpVectors(L.from, goal, k).addScaledVector(sf.n, lift);
          if (k >= 1) { L.swing = 0; L.plant = goal.clone(); L.n.copy(sf.n); }
        } else {
          if (!L.plant) { L.plant = goal.clone(); L.n.copy(sf.n); }
          // soft plant follow: partial skid so stance still shows load (not locked rigid)
          const dT = delta.clone().addScaledVector(sf.n, -delta.dot(sf.n));
          L.plant.addScaledVector(dT, L.kind === 'hind' ? 0.55 : 0.35);
          L.plant.lerp(goal, 1 - Math.exp(-dt / 0.18));
          L.foot.copy(L.plant);
        }
        // landing / grab: reach then plant — front legs stab toward surface for ~0.15 s
        if ((state === 'ground' && st.land < 0.15) || (state === 'wall' && st.latch < 0.12)) {
          if (L.kind === 'front') L.foot.addScaledVector(sf.n, -0.04 * (1 - (state === 'ground' ? st.land : st.latch) / 0.15));
        }
      } else {
        // airborne / far-side: tuck, or pin through kick push-off
        if (state !== 'air' && L.hold <= 0) L.plant = null;
        if (L.plant && L.hold > 0 && hipW.distanceTo(L.plant) < (L.a + L.b + (L.t || 0)) * 0.99) L.foot.copy(L.plant);
        else {
          L.plant = null; L.swing = 0;
          const fall = state === 'air' && P.vel.y < -4;
          const kickOn = st.kick < 0.22; // big hind extension on launch
          const loc = L.restV.clone(), A = new THREE.Vector3(), T = new THREE.Vector3();
          // continuous blend: cruise pose -> tuck (by airtime) -> push-off extension (fresh tap) on top
          if (L.kind === 'hind') { loc.set(L.s * 0.18, -0.1, -0.4); T.set(L.s * 0.28, -0.06, -0.26); A.set(L.s * 0.22, -0.35, -0.72); }
          else { const fr = L.kind === 'front'; loc.set(L.s * 0.17, -0.12, fr ? 0.34 : 0.05); T.set(L.s * 0.11, -0.01, fr ? 0.16 : 0.0); A.set(L.s * 0.14, -0.06, fr ? 0.38 : 0.1); }
          loc.lerp(T, Math.max(tuck, fall ? 1 : 0)).lerp(A, ext);
          if (state === 'wall') loc.y += 0.05;
          world(loc, tmp); L.foot.add(delta).lerp(tmp, 1 - Math.exp(-dt / (kickOn ? 0.025 : 0.05)));
        }
      }
      let ankle = L.foot;
      if (L.t) { const n = L.plant ? L.n : bodyUp; ankle = L.foot.clone().addScaledVector(n, 0.05).addScaledVector(bodyBack, -0.06); }
      const gnd = state === 'ground';
      const pole = L.kind === 'hind'
        ? bodyUp.clone().multiplyScalar(1.0).addScaledVector(bodyBack, gnd ? 0.8 : 0.35).addScaledVector(sideW, gnd ? 0.18 : 0.7)
        : sideW.clone().addScaledVector(bodyUp, 0.8);
      const dA = ankle.distanceTo(hipW), maxA = L.a + L.b - 1e-3;
      if (dA > maxA && L.plant) { L.plant = null; L.hold = 0; if (contact) { L.swing = 1e-6; L.from.copy(L.foot); } }
      if (dA > maxA) { const k = maxA / dA; const f = L.foot.clone().sub(ankle); ankle = hipW.clone().lerp(ankle, k); L.foot.copy(ankle).add(f); }
      const { knee } = ik(hipW, ankle, L.a, L.b, pole);
      bone(L, 1, hipW, knee); bone(L, 2, knee, ankle); if (L.t) bone(L, 3, ankle, L.foot);
    }

    // ---- contact patch ----
    patch.visible = state !== 'air';
    if (state === 'ground') { patch.position.set(P.pos.x, sf.d + 0.01, P.pos.z); patch.rotation.set(-Math.PI / 2, 0, -yaw); }
    if (state === 'wall') { patch.position.set(sf.d - sf.side * 0.01, P.pos.y - 0.1, P.pos.z); patch.rotation.set(0, sf.side > 0 ? -Math.PI / 2 : Math.PI / 2, 0); }

    // ---- enchantments (read by index → post overlay; 0 extra draws) ----
    // softer still so Hero C mass (abdomen/sash/drumstick femurs) reads in chase
    const fast = speed > 7 || (state === 'air' && Math.abs(P.vel.y) > 5);
    fx.trail = Math.max(0, Math.min(1, fx.trail + (fast ? 1 : -1) * dt * 2.4));
    if (st.kick < 0.35) fx.spark = Math.max(fx.spark, 1 - st.kick / 0.35);
    fx.spark = Math.max(0, fx.spark - dt * 1.8);
    const idleGlow = idle ? 0.05 + 0.03 * Math.sin(P.t * 2.2) : 0;
    fx.rim = Math.min(1, 0.14 + 0.18 * fx.trail + 0.22 * fx.spark + idleGlow);
    fx.state = state; fx.speed = speed; fx.kick = st.kick; fx.air = st.air; fx.splay = splay; fx.tuck = tuck;
    if (typeof fx.slot === 'function') fx.slot(fx, api);

    st.prev = state; if (state !== 'air') st.lastSf = sf;
  }
  const api = { legs: LEGS, update, root, parts: [body], mesh: body, bones: [...boneBy.keys()], fx, setStubWings };
  return api;
}
