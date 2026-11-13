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
  boltIdle: 0x5c625a,
  boltFull: 0xe6e8dc,
  puddle: 0x9fb0b6,
  puddleLocked: 0xbcc9cd,
  branchShadow: 0x2c302c,
  log: 0x6f7366,
  highBranch: 0x858a7c,
  gustGhost: 0xcfd2c6,
  ice: 0xb8d4e3,
  drift: 0xe8ebe6,
  driftBand: 0x3a3f3b,
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
      slot.mark.material.color.setHex(COL.vermilion);
      slot.mark.scale.set(1, 1, 1);
      const w = obs.x1 - obs.x0;
      const d = obs.s1 - obs.s0;
      if (obs.type === 'bolt' || obs.type === 'puddle') {
        drawFlat(slot, obs, sim, w, d);
        continue;
      }
      if (obs.type === 'branch') {
        drawBranch(slot, obs, sim, w, d);
        continue;
      }
      if (obs.type === 'ice' || obs.type === 'drift') {
        drawWinter(slot, obs, w, d);
        continue;
      }
      slot.mark.position.set(0, 0, 0);
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

  // Graybox only. Bolt stripe fills over 1.0 s with vermilion edges, then a pale column for the strike.
  // Puddle is a pale flat strip that brightens while the swipe lock holds. Purely visual.
  function drawFlat(slot, obs, sim, w, d) {
    const a = sim.actor;
    const sMid = (obs.s0 + obs.s1) / 2;
    const xMid = (obs.x0 + obs.x1) / 2;
    if (obs.type === 'bolt') {
      const ttc = C.ticksBetween(a.s, obs.contactS);
      const fill = a.s >= obs.contactS ? 1 : Math.max(0, Math.min(1, 1 - ttc / C.BOLT_WARN_TICKS));
      const striking = a.s >= obs.contactS && a.s <= obs.s1 + C.PLAYER_DEPTH / 2;
      const ht = striking ? 3.2 : 0.05;
      slot.body.scale.set(w * (striking ? 0.5 : 1), ht, striking ? d : d * Math.max(fill, 0.02));
      slot.body.material.color.setHex(fill >= 1 ? COL.boltFull : COL.boltIdle);
      slot.body.material.color.lerp(new THREE.Color(COL.boltFull), fill);
      slot.mark.visible = true;
      slot.mark.scale.set(w * 1.12, 0.5, d * 1.12);
      poseOnTrack(slot.g, xMid, sMid, ht / 2);
      slot.mark.position.set(0, -ht / 2 + 0.005, 0);
      return;
    }
    const locked = (a.puddleLock || 0) > 0 && a.lane === obs.lane;
    slot.body.scale.set(w, 0.03, d);
    slot.body.material.color.setHex(locked ? COL.puddleLocked : COL.puddle);
    slot.mark.visible = false;
    poseOnTrack(slot.g, xMid, sMid, 0.015);
  }

  // Graybox only. A falling branch shows a growing shadow for 0.9 s, then drops in and stays:
  // a low log (jump it) or a tall branch (dodge it). The sim cell never changes; this is the tell.
  function drawBranch(slot, obs, sim, w, d) {
    const a = sim.actor;
    const sMid = (obs.s0 + obs.s1) / 2;
    const xMid = (obs.x0 + obs.x1) / 2;
    const ttc = a.s >= obs.contactS ? 0 : C.ticksBetween(a.s, obs.contactS);
    const untilLand = ttc - C.BRANCH_LANDED_LEAD_TICKS;
    if (untilLand > 0) {
      const grow = Math.max(0.05, Math.min(1, 1 - untilLand / C.BRANCH_SHADOW_TICKS));
      slot.body.scale.set(w * grow, 0.02, d * (1 + grow));
      slot.body.material.color.setHex(COL.branchShadow);
      slot.mark.visible = false;
      poseOnTrack(slot.g, xMid, sMid, 0.012);
      return;
    }
    const ht = obs.height;
    slot.body.scale.set(w, ht, d);
    slot.body.material.color.setHex(obs.low ? COL.log : COL.highBranch);
    slot.mark.visible = true;
    slot.mark.scale.set(w, 1, d);
    poseOnTrack(slot.g, xMid, sMid, ht / 2);
    slot.mark.position.set(0, ht / 2 + 0.02, 0);
  }

  // Graybox only. Ice is a pale-blue flat strip. Drifts are white mounds; a tall drift carries a dark
  // lane-edge band so low and tall read differently. Purely visual.
  function drawWinter(slot, obs, w, d) {
    const sMid = (obs.s0 + obs.s1) / 2;
    const xMid = (obs.x0 + obs.x1) / 2;
    if (obs.type === 'ice') {
      slot.body.scale.set(w, 0.03, d);
      slot.body.material.color.setHex(COL.ice);
      slot.mark.visible = false;
      poseOnTrack(slot.g, xMid, sMid, 0.015);
      return;
    }
    const ht = obs.height;
    slot.body.scale.set(w, ht, d);
    slot.body.material.color.setHex(COL.drift);
    slot.mark.visible = true;
    slot.mark.material.color.setHex(obs.low ? COL.vermilion : COL.driftBand);
    slot.mark.scale.set(w * (obs.low ? 1 : 1.08), obs.low ? 1 : 3, d * (obs.low ? 1 : 1.08));
    poseOnTrack(slot.g, xMid, sMid, ht / 2);
    slot.mark.position.set(0, obs.low ? ht / 2 + 0.02 : -ht / 2 + 0.1, 0);
  }

  function syncWarnings(sim) {
    while (warnRoot.children.length) warnRoot.remove(warnRoot.children[0]);
    for (const w of sim.warnings()) {
      const o = w.obs;
      if (o.type === 'bolt' || o.type === 'puddle' || o.type === 'branch' || o.type === 'ice') continue; // they carry their own tell
      if (o.type === 'gust') {
        const gem = new THREE.Mesh(
          new THREE.ConeGeometry(0.25, 0.6, 4),
          new THREE.MeshBasicMaterial({ color: COL.warn }),
        );
        gem.rotation.z = o.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        poseOnTrack(gem, C.laneX(o.lane), o.s, 1.2);
        warnRoot.add(gem);
        if (o.leaf) {
          // ghost lane marker: where the shove will put you
          const ghost = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.02, 3),
            new THREE.MeshBasicMaterial({ color: COL.gustGhost, transparent: true, opacity: 0.35, depthWrite: false }),
          );
          poseOnTrack(ghost, C.laneX(o.lane + o.dir), o.s + 1.5, 0.03);
          warnRoot.add(ghost);
        }
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
