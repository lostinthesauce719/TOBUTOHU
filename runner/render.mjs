import * as THREE from '../vendor/three.module.min.js';
import * as C from './config.mjs';

const COL = {
  bg: 0x1c1f1d,
  fog: 0x2a2e2b,
  track: 0x4e534c,
  lane: 0x6a7068,
  laneLine: 0x8c9288,
  solid: 0x8a8d84,
  root: 0x7a7d74,
  pad: 0x9aa090,
  padHot: 0xc4c4b0,
  hopper: 0x7d8c68,
  hopperEye: 0x2a2e2a,
  warn: 0xd8d6c8,
  vermilion: 0xe34234,
  mist: 0x6b716c,
};

function worldOnTrack(x, s, lift = 0) {
  return new THREE.Vector3(x, s * C.SIN_PITCH + lift, s * C.COS_PITCH);
}

function makeHopper() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: COL.hopper });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.42, 4, 8), mat);
  body.rotation.z = Math.PI / 2;
  body.rotation.y = 0.15;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat);
  head.position.set(0.32, 0.12, 0);
  g.add(head);
  const eyeM = new THREE.MeshLambertMaterial({ color: COL.hopperEye });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), eyeM);
    eye.position.set(0.42, 0.16, side * 0.08);
    g.add(eye);
  }
  const thigh = new THREE.MeshLambertMaterial({ color: 0x6a7858 });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), thigh);
    leg.position.set(-0.05, -0.22, side * 0.2);
    leg.rotation.z = 0.5;
    g.add(leg);
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2));
  renderer.setClearColor(COL.bg, 1);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(COL.fog, 18, 70);
  scene.add(new THREE.AmbientLight(0xc8ccc4, 0.7));
  const sun = new THREE.DirectionalLight(0xe8eadf, 0.65);
  sun.position.set(-6, 14, 8);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(C.CAMERA_FOV, 1, 0.1, 200);
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const camPosT = new THREE.Vector3();
  const camLookT = new THREE.Vector3();
  let camInit = false;

  const track = new THREE.Group();
  scene.add(track);
  const laneMats = [0, 1, 2].map(() => new THREE.MeshLambertMaterial({ color: COL.lane }));
  const laneMeshes = [0, 1, 2].map((i) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 80), laneMats[i]);
    mesh.position.x = C.laneX(i);
    track.add(mesh);
    return mesh;
  });
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 0.03, 80),
    new THREE.MeshLambertMaterial({ color: COL.track }),
  );
  rail.position.y = -0.04;
  track.add(rail);

  const hazardRoot = new THREE.Group();
  scene.add(hazardRoot);
  const hazardPool = [];

  const hopper = makeHopper();
  scene.add(hopper);

  const warnRoot = new THREE.Group();
  scene.add(warnRoot);

  const mist = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 24),
    new THREE.MeshBasicMaterial({ color: COL.mist, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  mist.rotation.x = -Math.PI / 2 + C.PITCH;
  scene.add(mist);

  function resize() {
    const w = canvas.clientWidth || canvas.width || 360;
    const h = canvas.clientHeight || canvas.height || 640;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    let dist = C.CAMERA_BEHIND;
    let fov = C.CAMERA_FOV;
    const needed = 6.2;
    const hfov = 2 * Math.atan(Math.tan((fov * Math.PI / 180) / 2) * camera.aspect);
    const visible = 2 * Math.tan(hfov / 2) * (dist + 4);
    if (visible < needed) dist = (needed / (2 * Math.tan(hfov / 2))) - 4;
    camera.userData.behind = Math.max(dist, C.CAMERA_BEHIND);
    camera.updateProjectionMatrix();
  }
  resize();

  function poseOnTrack(obj, x, s, lift = 0) {
    const p = worldOnTrack(x, s, lift);
    obj.position.copy(p);
    obj.rotation.set(0, 0, 0);
    obj.rotateX(-C.PITCH);
  }

  function syncHazards(sim, s0, s1) {
    const list = sim.course.obstaclesInRange(s0, s1);
    while (hazardPool.length < list.length) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: COL.solid }));
      const mark = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 1.02), new THREE.MeshBasicMaterial({ color: COL.vermilion }));
      g.add(body);
      g.add(mark);
      hazardRoot.add(g);
      hazardPool.push({ g, body, mark });
    }
    for (let i = 0; i < hazardPool.length; i++) {
      const slot = hazardPool[i];
      const obs = list[i];
      if (!obs || obs.disabled || obs.type === 'gust') {
        slot.g.visible = false;
        continue;
      }
      slot.g.visible = true;
      const w = obs.x1 - obs.x0;
      const d = obs.s1 - obs.s0;
      let ht = obs.type === 'root' ? C.ROOT_HEIGHT : obs.type === 'pad' ? 0.12 : C.SOLID_HEIGHT;
      if (obs.type === 'pad' && obs.collapsed) ht = 0.08;
      slot.body.scale.set(w, ht, d);
      slot.body.material.color.setHex(
        obs.type === 'root' ? COL.root : obs.type === 'pad' ? (obs.contactedTick != null ? COL.padHot : COL.pad) : COL.solid,
      );
      const lethal = obs.type === 'solid' || obs.type === 'root' || (obs.type === 'pad' && obs.collapsed);
      slot.mark.visible = lethal;
      slot.mark.scale.set(w, 1, d);
      const sMid = (obs.s0 + obs.s1) / 2;
      const xMid = (obs.x0 + obs.x1) / 2;
      poseOnTrack(slot.g, xMid, sMid, ht / 2);
      slot.mark.position.set(0, ht / 2 + 0.02, 0);
    }
  }

  function syncWarnings(sim) {
    while (warnRoot.children.length) warnRoot.remove(warnRoot.children[0]);
    for (const w of sim.warnings()) {
      const o = w.obs;
      if (o.type === 'gust') {
        const gem = new THREE.Mesh(
          new THREE.ConeGeometry(0.25, 0.6, 4),
          new THREE.MeshBasicMaterial({ color: COL.warn }),
        );
        gem.rotation.z = o.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        poseOnTrack(gem, C.laneX(o.lane), o.s, 1.2);
        warnRoot.add(gem);
        continue;
      }
      const chev = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.5, 3),
        new THREE.MeshBasicMaterial({ color: COL.warn }),
      );
      chev.rotation.x = Math.PI;
      poseOnTrack(chev, C.laneX(o.lane), Math.max(o.contactS, o.s0), 2.1);
      warnRoot.add(chev);
    }
  }

  function targetCamera(s) {
    const behind = camera.userData.behind || C.CAMERA_BEHIND;
    const camS = s - behind;
    camPosT.set(
      0,
      camS * C.SIN_PITCH + C.CAMERA_ABOVE * C.COS_PITCH,
      camS * C.COS_PITCH - C.CAMERA_ABOVE * C.SIN_PITCH,
    );
    const lookS = s + C.CAMERA_LOOK_AHEAD;
    camLookT.set(0, lookS * C.SIN_PITCH, lookS * C.COS_PITCH);
  }

  function draw(sim, alpha = 0, dt = 1 / 60) {
    const snap = sim.snapshot();
    const a = sim.actor;
    const s = a.s;
    const x = a.x;
    const lift = a.lift;
    poseOnTrack(hopper, x, s, 0.35 + lift);
    hopper.rotation.y = 0;

    const laneLen = 90;
    const laneS = s + 20;
    poseOnTrack(track, 0, laneS, 0);
    for (const m of laneMeshes) m.scale.z = 1;

    syncHazards(sim, s - 6, s + 48);
    syncWarnings(sim);

    const mistS = snap.bottom / C.SIN_PITCH;
    poseOnTrack(mist, 0, mistS, 0.02);

    targetCamera(s);
    if (!camInit) {
      camPos.copy(camPosT);
      camLook.copy(camLookT);
      camInit = true;
    } else {
      const k = 1 - Math.exp(-Math.max(dt, 0) / C.CAMERA_DAMP);
      camPos.lerp(camPosT, k);
      camLook.lerp(camLookT, k);
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
  }

  return { draw, resize, dispose, camera, scene };
}
