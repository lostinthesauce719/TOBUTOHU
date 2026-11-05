// Enchantment look #1 (BRUSH, approved by Apollo "#1 for enhancements"): soft seasonal aura + seasonal trail.
// VISUAL ONLY: reads hero/sim state through fx.slot, never writes P or the sim. Exactly 2 draws:
// aura = 1 billboard quad, trail = 1 InstancedMesh of single-sided camera-facing petals (shader billboard).
import * as THREE from './vendor/three.module.min.js';
import { zoneMix } from './clipkit.js';
// no red/orange: spring white/pink petals, summer olive leaves, autumn olive/pale gold, winter snow
const SEASON = {
  spring: { aura: 0xF4EEFF, a: 0.30, cols: [0xFFFFFF, 0xF2C6DA, 0xF7DCE8] },
  summer: { aura: 0xEEF6E4, a: 0.36, cols: [0x86AE58, 0x9DBA6A, 0xB8CC84] },
  autumn: { aura: 0xF6F0DC, a: 0.30, cols: [0x9AA052, 0xD8C47A, 0xE6D79A] },
  winter: { aura: 0xF2F8FF, a: 0.42, cols: [0xFFFFFF, 0xE8F0FA, 0xD4E2F4] },
};
const N = 28, HIST = 64;
function auraTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.75)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function installEnch1(scene, P, hero) {
  const box = new THREE.Box3().setFromObject(hero.mesh), sz = box.getSize(new THREE.Vector3());
  const bodyLen = Math.max(0.6, Math.min(3, Math.max(sz.x, sz.z) || 1.2));
  // aura: ~1.05 body lengths, additive-free normal blend so it never blows out the pale skies
  const aMat = new THREE.SpriteMaterial({ map: auraTex(), color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, fog: false });
  const aura = new THREE.Sprite(aMat); aura.scale.setScalar(bodyLen * 1.05 * 2); aura.renderOrder = -1; aura.userData.layer = 'play'; scene.add(aura);
  // trail petals: one diamond/petal quad, billboarded in the vertex shader so FrontSide always faces the camera
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, -0.55, 0, 0, 0, -1, 0, 0.55, 0, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const tMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide,
    uniforms: { uA: { value: 0.9 } },
    vertexShader: `attribute vec4 iD; varying vec3 vC; varying float vA;
      void main(){ vC = instanceColor; vA = iD.w;
        vec4 mv = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
        float c = cos(iD.z), s = sin(iD.z); vec2 p = position.xy * iD.xy; p = vec2(c*p.x - s*p.y, s*p.x + c*p.y);
        mv.xy += p; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uA; varying vec3 vC; varying float vA; void main(){ if(vA<0.01) discard; gl_FragColor = vec4(vC, vA*uA); }`,
  });
  const trail = new THREE.InstancedMesh(g, tMat, N); trail.frustumCulled = false; trail.userData.layer = 'play';
  const iD = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); g.setAttribute('iD', iD);
  trail.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); scene.add(trail);
  const hist = []; const m = new THREE.Matrix4(), col = new THREE.Color(), cB = new THREE.Color();
  const hash = i => { const x = Math.sin(i * 127.1 + 31.7) * 43758.5453; return x - Math.floor(x); };
  let acc = 0, life = 0;
  hero.fx.slot = (fx) => {
    const p = hero.root.position, zm = zoneMix(P.pos.y) || { a: 'spring', b: 'spring', t: 0 };
    const A = SEASON[zm.a], B = SEASON[zm.b], t = zm.t;
    // aura: base season opacity (lowered for bright spring/autumn skies), lifts slightly with speed/kick
    aura.position.set(p.x, p.y + 0.15, p.z);
    aMat.color.set(A.aura).lerp(cB.set(B.aura), t);
    aMat.opacity = (A.a + (B.a - A.a) * t) * (0.8 + 0.25 * fx.trail + 0.15 * fx.spark);
    // history of past positions (render-time, never fed back)
    acc += 1; if (acc >= 1) { acc = 0; hist.unshift([p.x, p.y + 0.1, p.z]); if (hist.length > HIST) hist.pop(); }
    life += ((fx.state === 'air' || fx.speed > 4 ? 1 : 0) - life) * 0.08;
    for (let i = 0; i < N; i++) {
      const k = Math.min(hist.length - 1, 1 + Math.round(i * 1.4)), h = hist[k] || [p.x, p.y, p.z], f = i / N;
      const sp = (0.15 + 0.5 * f) * bodyLen, r1 = hash(i), r2 = hash(i + 50), r3 = hash(i + 99);
      m.makeTranslation(h[0] + (r1 - 0.5) * sp, h[1] + (r2 - 0.5) * sp - f * f * 0.6, h[2] + (r3 - 0.5) * sp); trail.setMatrixAt(i, m);
      const s = bodyLen * (0.045 + 0.035 * r2) * (1 - 0.5 * f), rot = r1 * 6.283 + P.t * (1.5 + r3 * 2) * (r1 > 0.5 ? 1 : -1);
      const winter = (zm.b === 'winter' ? t : 0) + (zm.a === 'winter' ? 1 - t : 0);
      iD.setXYZW(i, s * (1 - 0.3 * winter), s * (1 - 0.6 * winter), rot, hist.length > k ? life * (1 - f) : 0);
      col.set(A.cols[i % 3]).lerp(cB.set(B.cols[i % 3]), t); trail.setColorAt(i, col);
    }
    trail.instanceMatrix.needsUpdate = true; trail.instanceColor.needsUpdate = true; iD.needsUpdate = true;
    trail.visible = life > 0.02;
  };
  return { aura, trail };
}
