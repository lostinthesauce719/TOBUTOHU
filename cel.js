// cel.js — style D look (Art spec 2026-10-17): unlit 3-tone cel, class-ID outline pass, mist edge overlay.
// Visual only: nothing here reads or writes sim state except to draw it.
import * as THREE from './vendor/three.module.min.js';
THREE.ColorManagement.enabled = false;

// outline classes; widths in px at 1080 render width, floors in real px (spec D)
export const CLS = { none: 0, climb: 1, hazard: 2, near: 3, hero: 4, mist: 5, perf: 6 };
export function outlineTable(pal) {
  const L = pal.global.line, H = pal.global.hazard_vermilion;
  // [width@1080, floor, drop-below, colour]
  return [
    [0, 0, 0, '#000000'],                                   // none: sky, far cards, clouds, mountains
    [L.outline_climbable_px_1080, 1.5, 0, L.outline],         // climbables 3 px #1E2630
    [L.hazard_pickup_px_1080, 1.0, 0, L.outline],             // hazards and pickups 2 px
    [L.near_scenery_px_1080, 0, 0.75, L.near_scenery],        // near scenery 1.5 px, dropped below 0.75 px
    [0, 0, 0, '#000000'],                                   // hero: drawn only by its own hull
    [0, 0, 0, '#000000'],                                   // mist draws its own line
    [L.perforation_px_1080, 2.0, 0, L.perforation],           // perforation
  ];
}

const LIGHT = new THREE.Vector3(-0.5, 0.7, 0.5).normalize(); // camera-space key light, same as hero.js
// 3-tone cel: lit / base / shade by N.L steps; optional separate top-face colours (shelf tops)
export function celMat(lit, base, shade, top = null) {
  const t = top || [lit, base, shade];
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      cL: { value: new THREE.Color(lit) }, cB: { value: new THREE.Color(base) }, cS: { value: new THREE.Color(shade) },
      tL: { value: new THREE.Color(t[0]) }, tB: { value: new THREE.Color(t[1]) }, tS: { value: new THREE.Color(t[2]) },
      ld: { value: LIGHT },
    }]),
    vertexShader: `#include <fog_pars_vertex>
      varying vec3 vN; varying float vUp;
      void main(){ vec3 wn=normalize(mat3(modelMatrix)*normal); vUp=wn.y; vN=normalize(normalMatrix*normal);
        vec4 mvPosition=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <fog_pars_fragment>
      uniform vec3 cL,cB,cS,tL,tB,tS,ld; varying vec3 vN; varying float vUp;
      void main(){ float d=dot(normalize(vN),ld); bool top=vUp>0.6;
        vec3 c = d>0.57 ? (top?tL:cL) : d>-0.09 ? (top?tB:cB) : (top?tS:cS);
        gl_FragColor=vec4(c,1.);
        #include <fog_fragment>
      }`,
  });
}

// ID material: r = class, g = object id, b = view depth (m)
const idMats = new Map();
function idMat(cls, oid) {
  const k = cls * 65536 + oid; if (idMats.has(k)) return idMats.get(k);
  const m = new THREE.ShaderMaterial({
    uniforms: { v: { value: new THREE.Vector2(cls, oid) } },
    vertexShader: `varying float vz; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vz=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec2 v; varying float vz; void main(){ gl_FragColor=vec4(v.x, v.y, vz, 1.); }`,
  });
  idMats.set(k, m); return m;
}

export function createPost(R, pal) {
  const tab = outlineTable(pal), M = pal.global.mist;
  const size = new THREE.Vector2(); R.outputColorSpace = THREE.LinearSRGBColorSpace;
  const colRT = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  const idRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const W = [], F = [], D = [], LC = [];
  tab.forEach(r => { W.push(r[0]); F.push(r[1]); D.push(r[2]); LC.push(new THREE.Color(r[3])); });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      col: { value: colRT.texture }, ids: { value: idRT.texture }, res: { value: new THREE.Vector2() }, px: { value: 1 },
      W: { value: W }, F: { value: F }, D: { value: D }, LC: { value: LC },
      fade: { value: new THREE.Vector2(40, 60) },
      // mist overlay (screen space): y of the top line in px from bottom (-1e4 = off), warning 0..1
      mistY: { value: -1e4 }, warn: { value: 0 }, mistT: { value: 0 },
      mLine: { value: new THREE.Color(M.top_line) }, mBand: { value: new THREE.Color(M.band) }, mBody: { value: new THREE.Color(M.body) }, mWarn: { value: new THREE.Color(M.warning_line) },
      mLinePx: { value: M.top_line_px_1080 }, mBandPx: { value: M.band_min_px_1080 }, mWarnPx: { value: M.warning_line_px_1080 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: `uniform sampler2D col,ids; uniform vec2 res,fade; uniform float px; uniform float W[7],F[7],D[7]; uniform vec3 LC[7];
      uniform float mistY,warn,mistT,mLinePx,mBandPx,mWarnPx; uniform vec3 mLine,mBand,mBody,mWarn; varying vec2 vUv;
      float wOf(int c){ float w=W[c]*px; if(w<D[c]) return 0.; if(w>0.) w=max(w,F[c]); return w; }
      void main(){
        vec3 c=texture2D(col,vUv).rgb; vec4 me=texture2D(ids,vUv); int cls=int(me.r+.5);
        float w = cls>0 && cls<7 ? wOf(cls) : 0.;
        if(w>0.){ float hit=0.; float r=w; 
          for(int y=-4;y<=4;y++) for(int x=-4;x<=4;x++){ vec2 o=vec2(float(x),float(y)); float l=length(o); if(l>r+.01||l<.5) continue;
            vec4 q=texture2D(ids,vUv+o/res);
            bool other = abs(q.g-me.g)>.5 || abs(q.r-me.r)>.5;   // different object
            if(other && (q.b<0.001 || q.b>me.b-0.05)) hit=1.;  // line sits inside the nearer object (sky has depth 0)
          }
          float a=hit*(1.-smoothstep(fade.x,fade.y,me.b));
          c=mix(c,LC[cls],a);
        }
        // mist: scalloped edge, white line over a blue-grey band, body below; line turns vermilion inside 3 s
        if(mistY>-1e3){ vec2 p=vUv*res; float sc=4.*px*sin(p.x/(38.*px)+mistT*0.8)+2.*px*sin(p.x/(13.*px)-mistT*1.3);
          float e=mistY+sc, lw=mix(max(mLinePx*px,1.), max(mWarnPx*px,2.), warn), bw=max(mBandPx*px,8.);
          if(p.y<e){ vec3 lc=mix(mLine,mWarn,warn);
            if(p.y>e-lw) c=lc; else if(p.y>e-lw-bw) c=mBand; else c=mix(c,mBody,0.9); }
        }
        gl_FragColor=vec4(c,1.);
      }`,
  }));
  const qS = new THREE.Scene(); qS.add(quad); const qC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const U = quad.material.uniforms;
  let oid = 1; const swap = [];
  return {
    U,
    tag(obj, cls) { const id = (oid++ % 2000) + 1; obj.traverse(o => { if (o.isMesh) { o.userData.cls = cls; o.userData.oid = id; } }); },
    render(S, cam) {
      R.getDrawingBufferSize(size);
      if (colRT.width !== size.x || colRT.height !== size.y) { colRT.setSize(size.x, size.y); idRT.setSize(size.x, size.y); }
      U.res.value.copy(size); U.px.value = size.x / 1080;
      R.setRenderTarget(colRT); R.render(S, cam);
      // ID pass: swap every visible mesh to its flat ID material (no fog, no background)
      const bg = S.background, fog = S.fog; S.background = null; S.fog = null; swap.length = 0;
      const hid = []; S.traverseVisible(o => { if (o.isMesh) { if (o.material.transparent) { hid.push(o); return; } swap.push(o, o.material); o.material = idMat(o.userData.cls || 0, o.userData.oid || 0); } });
      hid.forEach(o => o.visible = false); // see-through layers (steam, waterfalls, contact patch) take no lines
      R.setClearColor(0x000000, 0); R.setRenderTarget(idRT); R.clear(); R.render(S, cam);
      for (let i = 0; i < swap.length; i += 2) swap[i].material = swap[i + 1];
      S.background = bg; S.fog = fog; hid.forEach(o => o.visible = true);
      R.setRenderTarget(null); R.render(qS, qC);
    },
  };
}
