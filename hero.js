// Tobu hero (style D greybox): procedural grasshopper with contact-driven poses.
// VISUAL ONLY: reads the sim's player state (P) and course boxes, never writes to them,
// so replays, break timings and the server check are untouched.
import * as THREE from './vendor/three.module.min.js';
THREE.ColorManagement.enabled = false; // style D hexes are authored in sRGB and written as-is (no linear workflow)

const C = { lit: 0xA6C872, base: 0x86AE58, shade: 0x678651, sash: 0x3E5C76, sashS: 0x334A63, eye: 0x4E6A3A, line: 0x1E2A2A, rim: 0xEEF0DA, patch: 0x1E2A40 };
const BL = 1.1;               // body length in world units (matches the camera framing KAMI approved)
const RIDE = 0.22;            // thorax centre above the contact surface
const LIGHT = new THREE.Vector3(-0.5, 0.7, 0.5).normalize(); // camera-space light (BRUSH brief §3)

// ---------- cel + hull materials (brief §3) ----------
function cel(lit, base, shade) {
  return new THREE.ShaderMaterial({
    uniforms: { cL: { value: new THREE.Color(lit) }, cB: { value: new THREE.Color(base) }, cS: { value: new THREE.Color(shade) }, L: { value: LIGHT } },
    vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 cL,cB,cS,L; varying vec3 vN; void main(){ float d=dot(normalize(vN),L);
      vec3 c=mix(cS,cB,smoothstep(-0.6,0.1,d)); c=mix(c,cL,smoothstep(0.1,0.9,d)); /* look reset: smooth, no bands */ gl_FragColor=vec4(c,1.); }`,
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
const M = { body: cel(C.lit, C.base, C.shade), sash: cel(0x4a6a86, C.sash, C.sashS), eye: cel(C.eye, C.eye, 0x3d5530) };
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
  const root = new THREE.Group(); const body = buildBody(); root.add(body); scene.add(root);
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: C.patch, transparent: true, opacity: 0.35, depthWrite: false }));
  patch.scale.set(0.36, 0.72, 1); scene.add(patch);
  for (const L of LEGS) {
    L.hipV = new THREE.Vector3(...L.hip); L.restV = new THREE.Vector3(...L.rest);
    L.s1 = seg(L.kind === 'hind' ? 0.05 : 0.016, L.kind === 'hind' ? 0.022 : 0.012); L.s2 = seg(L.kind === 'hind' ? 0.016 : 0.012, 0.009);
    scene.add(L.s1, L.s2); if (L.t) { L.s3 = seg(0.012, 0.008); scene.add(L.s3); }
    L.plant = null; L.n = new THREE.Vector3(0, 1, 0); L.swing = 0; L.from = new THREE.Vector3(); L.foot = new THREE.Vector3(); L.hold = 0;
  }
  const st = { prev: 'air', q: new THREE.Quaternion(), off: new THREE.Vector3(), latch: 9, land: 9, kick: 9, fwd: new THREE.Vector3(0, 0, -1), sq: 0, turn: 0 };
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
    st.latch += dt; st.land += dt; st.kick += dt;

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
    body.scale.set(1 - 0.13 * squash * Math.abs(nl.x), 1 - 0.13 * squash * Math.abs(nl.y), 1);
    root.updateMatrixWorld(true);
    const delta = st.lastRoot ? root.position.clone().sub(st.lastRoot) : new THREE.Vector3(); st.lastRoot = root.position.clone();

    // ---- feet: plant on real contact points, step when out of stride, pin through push-off ----
    const swinging = [0, 0]; for (const L of LEGS) if (L.swing > 0) swinging[L.grp]++;
    const bodyUp = tmp2.set(0, 1, 0).applyQuaternion(st.q), bodyBack = new THREE.Vector3(0, 0, -1).applyQuaternion(st.q);
    for (const L of LEGS) {
      const hipW = world(L.hipV, new THREE.Vector3()), restW = world(L.restV, new THREE.Vector3());
      const sideW = new THREE.Vector3(L.s, 0, 0).applyQuaternion(st.q);
      let contact = false;
      const hindGrip = L.kind !== 'hind' || (state === 'ground' && st.land < 0.16) || (state === 'wall' && st.latch < 0.12); // hind legs grip on landing and latch, then ride cocked
      if (state === 'ground') contact = hindGrip;
      else if (state === 'wall') contact = sideW.x * sf.side > 0.1 && hindGrip; // wall-side legs grab; the far hind leg pushes
      L.hold -= dt;
      if (contact) {
        const goal = project(restW.clone().addScaledVector(new THREE.Vector3(P.vel.x, 0, P.vel.z), 0.012), sf);
        if (!L.plant && L.swing <= 0) { L.plant = goal.clone(); L.n.copy(sf.n); } // latch / landing: claws plant at once
        else if (L.plant && L.swing <= 0) {
          const far = L.plant.distanceTo(goal) > L.stride || hipW.distanceTo(L.plant) > (L.a + L.b + (L.t || 0)) * 0.98;
          const frozen = (state === 'wall' && st.latch < 0.08) || (state === 'ground' && st.land < 0.12);
          if (L.plant.distanceTo(goal) > 1.2) { L.plant = goal.clone(); L.n.copy(sf.n); }
          else if (far && !frozen && L.grp === st.turn) { L.swing = 1e-6; L.from.copy(L.plant); L.plant = null; swinging[L.grp]++; }
        }
        if (L.swing > 0) { L.swing += dt / 0.045; const k = Math.min(1, L.swing); L.foot.lerpVectors(L.from, goal, k).addScaledVector(sf.n, 0.07 * Math.sin(Math.PI * k));
          if (k >= 1) { L.swing = 0; L.plant = goal.clone(); L.n.copy(sf.n); } }
        if (L.plant && L.kind === 'hind' && L.hold <= 0) { const dT = delta.clone().addScaledVector(sf.n, -delta.dot(sf.n)); L.plant.add(dT); } // hind claws skid with the body while the legs absorb
        if (L.plant) L.foot.copy(L.plant);
      } else {
        if (state !== 'air' && L.hold <= 0) L.plant = null;
        // push-off: keep the planted foot pinned while the body leaves, until the leg is fully extended
        if (L.plant && L.hold > 0 && hipW.distanceTo(L.plant) < (L.a + L.b + (L.t || 0)) * 0.99) L.foot.copy(L.plant);
        else {
          L.plant = null; L.swing = 0;
          // air / far-side pose (local), blended toward a tucked or reaching shape
          const fall = state === 'air' && P.vel.y < -6;
          const loc = L.restV.clone();
          if (L.kind === 'hind') { const push = state === 'ground' ? 0.05 * Math.sin(P.t * 30 + (L.s > 0 ? Math.PI : 0)) : 0;
            loc.set(L.s * (fall ? 0.3 : state === 'ground' ? 0.11 : 0.17), fall ? -0.2 : (state === 'ground' ? -RIDE + 0.03 : -0.12), (fall ? -0.55 : -0.46) + push); }
          else loc.set(L.s * (fall ? 0.26 : 0.17), fall ? -0.12 : -0.14, L.kind === 'front' ? (fall ? 0.4 : 0.34) : 0.05);
          if (state === 'wall') loc.y += 0.05;
          world(loc, tmp); L.foot.add(delta).lerp(tmp, 1 - Math.exp(-dt / 0.04));
        }
      }
      // pose the leg: knees up and back for the hind V, out and up for the small legs
      let ankle = L.foot;
      if (L.t) { const n = L.plant ? L.n : bodyUp; ankle = L.foot.clone().addScaledVector(n, 0.05).addScaledVector(bodyBack, -0.06); }
      const gnd = state === 'ground';
      const pole = L.kind === 'hind' ? bodyUp.clone().multiplyScalar(1.0).addScaledVector(bodyBack, gnd ? 0.8 : 0.35).addScaledVector(sideW, gnd ? 0.18 : 0.7) /* on shelves and landings the knees tip back and up, staying above the back (KAMI/Art); on walls they splay ~35° */ /* femurs splay ~35° out from vertical in front/back view (Art) */ : sideW.clone().addScaledVector(bodyUp, 0.8);
      const dA = ankle.distanceTo(hipW), maxA = L.a + L.b - 1e-3;
      if (dA > maxA && L.plant) { L.plant = null; L.hold = 0; if (contact) { L.swing = 1e-6; L.from.copy(L.foot); } } // out of reach: lift and re-plant, never drag a planted claw off its spot
      if (dA > maxA) { const k = maxA / dA; const f = L.foot.clone().sub(ankle); ankle = hipW.clone().lerp(ankle, k); L.foot.copy(ankle).add(f); } // never draw a stretched leg
      const { knee } = ik(hipW, ankle, L.a, L.b, pole);
      placeSeg(L.s1, hipW, knee); placeSeg(L.s2, knee, ankle); if (L.s3) placeSeg(L.s3, ankle, L.foot);
    }

    if (swinging[st.turn] === 0) st.turn ^= 1; // tripod gait: groups take turns stepping

    // ---- contact patch on the surface under / beside the hero ----
    patch.visible = state !== 'air';
    if (state === 'ground') { patch.position.set(P.pos.x, sf.d + 0.01, P.pos.z); patch.rotation.set(-Math.PI / 2, 0, -yaw); }
    if (state === 'wall') { patch.position.set(sf.d - sf.side * 0.01, P.pos.y - 0.1, P.pos.z); patch.rotation.set(0, sf.side > 0 ? -Math.PI / 2 : Math.PI / 2, 0); }
    st.prev = state; if (state !== 'air') st.lastSf = sf;
  }
  return { legs: LEGS, update, root, parts: [root, ...LEGS.flatMap(L => [L.s1, L.s2, L.s3].filter(Boolean))] };
}
