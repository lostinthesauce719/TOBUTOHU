// Tobu look reset (KAMI/Apollo 2026-10-22): flat smooth shading + thin white world-space grid, soft hemisphere + key light
// computed in the shader (no shadow maps on the environment), cyan gradient sky with clouds, pale-blue distance fog,
// and one screen-space overlay pass for the mist edge and speed lines. VISUAL ONLY: reads sim state, never writes it.
import * as THREE from './vendor/three.module.min.js';

export const KEY = new THREE.Vector3(0.35, 0.85, 0.4).normalize();   // soft key, world space
export const LOOK = { skyTop: 0x4367A0, skyHor: 0xA5C8FB, fog: 0xD2EBFE, cloud: 0xDBE5FD, fogNear: 10, fogFar: 120,
  hemiSky: 0xf2f8ff, hemiGround: 0x6f7f9a, grid: 0xffffff };

const lib = THREE.UniformsLib.fog;
const VS = `#include <fog_pars_vertex>
  varying vec3 vW; varying vec3 vWN; varying vec3 vO; varying vec3 vON; varying vec3 vC;
  void main(){ vC=vec3(1.); mat4 mM=modelMatrix;
    #ifdef USE_INSTANCING
    mM=modelMatrix*instanceMatrix;
    #endif
   
    #ifdef USE_COLOR
    vC=color;
    #endif
    vWN=normalize(mat3(mM)*normal); vW=(mM*vec4(position,1.)).xyz; vO=position; vON=normal;
    vec4 mvPosition=viewMatrix*vec4(vW,1.); gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
  }`;
const SHADE = `
  uniform vec3 base, hS, hG, key, gC; uniform float cell, gA, gW, gridPx;
  vec3 shade(vec3 c, vec3 n){ float h=n.y*0.5+0.5; vec3 amb=mix(hG,hS,h); float k=max(dot(n,key),0.);
    return c*min(mix(0.8,1.0,h)+0.2*k,1.04); }
  // thin anti-aliased world grid on the face's two in-plane axes
  float grid(vec3 w, vec3 n){ vec3 a=abs(n); vec2 p = a.x>0.5 ? w.zy : a.y>0.5 ? w.xz : w.xy; p/=cell;
    vec2 f=abs(fract(p-0.5)-0.5)/fwidth(p); float l=1.-clamp(min(f.x,f.y)-gridPx+0.5,0.,1.);
    return l; }
  float checker(vec3 w, vec3 n){ vec3 a=abs(n); vec2 p = a.x>0.5 ? w.zy : a.y>0.5 ? w.xz : w.xy; p=floor(p/cell); return mod(p.x+p.y,2.); }`;

// flat smooth-shaded grid material: one shared instance per colour
const cache = new Map();
export function gridMat(color, o = {}) {
  // gAV = grid alpha on vertical faces (Walls C: 0 so flutes read); tops/floors keep gA (~0.7).
  const k = color + '|' + JSON.stringify(o); if (cache.has(k)) return cache.get(k);
  const gA = o.gA ?? 0.7, gAV = o.gAV ?? gA;
  const m = new THREE.ShaderMaterial({ fog: true, vertexColors: !!o.vc,
    uniforms: THREE.UniformsUtils.merge([lib, { base: { value: new THREE.Color(color) }, hS: { value: new THREE.Color(LOOK.hemiSky) },
      hG: { value: new THREE.Color(LOOK.hemiGround) }, key: { value: KEY }, gC: { value: new THREE.Color(LOOK.grid) },
      cell: { value: o.cell || 1 }, gA: { value: gA }, gAV: { value: gAV }, gW: { value: o.gW || 1.1 } }]),
    vertexShader: VS,
    fragmentShader: `#include <fog_pars_fragment>
      ${SHADE} uniform float gAV; varying vec3 vW; varying vec3 vWN; varying vec3 vC;
      void main(){ vec3 n=normalize(vWN); vec3 c=shade(base*vC,n)*(1.-0.05*checker(vW,n));
        float ga=mix(gAV,gA,smoothstep(0.35,0.7,abs(n.y))); /* tops keep grid; vertical rock faces soft/off */
        c=mix(c,gC,grid(vW,n)*ga);
        gl_FragColor=vec4(c,1.);
        #include <fog_fragment>
      }` });
  m.uniforms.gridPx = gridU.px; cache.set(k, m); return m;
}

// breakables: same grid look, warm tint, plus a dark dashed perforation across the card's tear line and along the long
// edges; on crack the dash splits into a pale widening tear (tearK 0..1). Lines never under perfU.minPx.
// grid spec (clipstyle v2): 2 px line at 1080 width, never under 1 px; white 70%, drawn on top of the shading
export const gridU = { px: { value: 1 } };
export const perfU = { minPx: { value: 6 } };
// Walls-C-adjacent breakable card: slate face/side/underside (luma ≤95), dark dashes, pale tear + lip. Never vermilion.
export function perfMat(color, half, perf = '#140F0A', tear = '#EEF2E0', o = {}) {
  const topC = o.top || '#4A5D80', faceC = o.face || color || '#46587A', sideC = o.side || '#3A4A68', deepC = o.deep || '#2F3D58';
  const lipC = o.lip || '#D6DCC6';
  const m = new THREE.ShaderMaterial({ fog: true, 
    uniforms: THREE.UniformsUtils.merge([lib, { base: { value: new THREE.Color(faceC) }, hS: { value: new THREE.Color(LOOK.hemiSky) },
      hG: { value: new THREE.Color(LOOK.hemiGround) }, key: { value: KEY }, gC: { value: new THREE.Color(LOOK.grid) },
      cell: { value: 1 }, gA: { value: 0.0 }, gW: { value: 1.1 }, // no white lattice on breakable cards
      pC: { value: new THREE.Color(perf) }, tC: { value: new THREE.Color(tear) }, lip: { value: new THREE.Color(lipC) },
      topCol: { value: new THREE.Color(topC) }, sideCol: { value: new THREE.Color(sideC) }, deepCol: { value: new THREE.Color(deepC) },
      hx: { value: new THREE.Vector3(...half) }, tearK: { value: -1 } }]),
    vertexShader: VS,
    fragmentShader: `#include <fog_pars_fragment>
      ${SHADE} uniform vec3 pC,tC,lip,topCol,sideCol,deepCol,hx; uniform float tearK,minPx; varying vec3 vW; varying vec3 vWN; varying vec3 vO; varying vec3 vON;
      float hash(float x){ return fract(sin(x*127.1)*43758.5453); }
      void main(){ vec3 n=normalize(vWN);
        // face / top / side / underside from climbable slate (luma ≤95)
        vec3 baseC = abs(n.y)>0.55 ? (n.y>0. ? topCol : deepCol) : (abs(n.y)<0.25 ? base : sideCol);
        vec3 c=shade(baseC,n);
        vec3 a=abs(vON); vec2 p2 = a.x>0.5 ? vO.yz : a.y>0.5 ? vO.xz : vO.xy; vec2 h2 = a.x>0.5 ? hx.yz : a.y>0.5 ? hx.xz : hx.xy;
        bool lx=h2.x>=h2.y; float pL=lx?p2.x:p2.y, pS=lx?p2.y:p2.x, hS2=lx?h2.y:h2.x;
        float fwL=fwidth(pL), fwS=fwidth(pS), hwL=max(0.03,fwL*minPx*0.5), hwS=max(0.03,fwS*minPx*0.5);
        // dash 17/gap 10 ≈ 0.63 duty on 0.27 cell (~8 cm / 4.5 cm world at shelf scale)
        float dash=step(mod(pS,0.27),0.17), dashL=step(mod(pL,0.27),0.17);
        float k=0.; float ins=min(0.14,hS2*0.35);
        if(hS2>0.2 && abs(abs(pS)-(hS2-ins))<hwS) k=dashL; // long-edge perforations
        if(abs(pL)<hwL) k=max(k,dash); // tear-line dashes across card
        if(tearK>=0.){ float g=mix(0.02,0.06,clamp(tearK/0.85,0.,1.))+(hash(floor(pS/0.04))-0.5)*0.02;
          if(abs(pL)<g) { c=tC; k=0.; } else if(abs(pL)<g+hwL*1.2) { c=lip; k=0.; } }
        c=mix(c,pC,k);
        // hard luma cap ≤95 (Rec.601) on card body; dashes/tear already set
        { float L=dot(c,vec3(0.299,0.587,0.114)); if(L>0.3725 && k<0.5) c*=0.3725/L; }
        gl_FragColor=vec4(c,1.);
        #include <fog_fragment>
      }` });
  m.uniforms.minPx = perfU.minPx; m.uniforms.gridPx = gridU.px; return m;
}

// sky dome: vertical cyan gradient + soft procedural clouds; follows the camera, no fog, drawn first
export function makeSky() {
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(LOOK.skyTop) }, hor: { value: new THREE.Color(LOOK.skyHor) }, fogC: { value: new THREE.Color(LOOK.fog) }, cloudK: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD=position; gl_Position=(projectionMatrix*modelViewMatrix*vec4(position,1.)).xyww; }`,
    fragmentShader: `uniform vec3 top,hor,fogC; uniform float cloudK; varying vec3 vD;
      float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
      float fbm(vec2 p){ float s=0.,a=.5; for(int i=0;i<5;i++){ s+=a*n2(p); p*=2.03; a*=.5; } return s; }
      void main(){ vec3 d=normalize(vD); float y=d.y;
        vec3 c=mix(hor,top,pow(clamp(y,0.,1.),0.55));
        vec2 uv=d.xz/max(y+0.18,0.05)*1.4; float cl=smoothstep(0.52-cloudK,0.78-cloudK,fbm(uv+vec2(3.1,1.7))); /* cloudK: slow seeded density drift (scenery.js) */
        cl*=smoothstep(-0.05,0.12,y)*(1.-smoothstep(0.55,0.9,y));
        c=mix(c,vec3(0.86,0.9,0.99),cl*0.95);
        c=mix(c,fogC,1.-smoothstep(-0.05,0.16,y));   // horizon melts into the fog
        gl_FragColor=vec4(c,1.); }` });
  const s = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), m); s.renderOrder = -10; s.frustumCulled = false; s.userData.sky = 1; return s;
}

// screen overlay: mist edge (scalloped line over band over body) + white speed lines. One draw, alpha blended on top.
export function createPost(R, pal) {
  const M = pal.global.mist, size = new THREE.Vector2(); R.outputColorSpace = THREE.LinearSRGBColorSpace;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, transparent: true,
    uniforms: { res: { value: new THREE.Vector2() }, px: { value: 1 }, mistY: { value: -1e4 }, warn: { value: 0 }, mistT: { value: 0 },
      mLine: { value: new THREE.Color(M.top_line) }, mBand: { value: new THREE.Color(M.band) }, mBody: { value: new THREE.Color(M.body) }, mWarn: { value: new THREE.Color(M.warning_line) },
      mLinePx: { value: M.top_line_px_1080 }, mBandPx: { value: M.band_min_px_1080 }, mWarnPx: { value: M.warning_line_px_1080 },
      spd: { value: 0 }, sT: { value: 0 }, sC: { value: new THREE.Vector2(0.5, 0.55) },
      // lightning columns (screen px): ends a->b, radius px at each end, state x=phase(0 off,1 warn,2 strike,3 after) y=progress z=flash w=glow alpha
      cA: { value: [new THREE.Vector4(), new THREE.Vector4()] }, cRad: { value: [new THREE.Vector2(), new THREE.Vector2()] }, cSt: { value: [new THREE.Vector4(), new THREE.Vector4()] }, edgePx: { value: 6 },
      // grasshopper enchantments (0 draws — same overlay): sash ribbon, launch/Catch motes, soft rim
      hUV: { value: new THREE.Vector2(0.5, 0.55) }, hTrail: { value: 0 }, hSpark: { value: 0 }, hRim: { value: 0 }, hCatch: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: `uniform vec2 res,sC,hUV; uniform float px,mistY,warn,mistT,mLinePx,mBandPx,mWarnPx,spd,sT,hTrail,hSpark,hRim,hCatch,edgePx; uniform vec3 mLine,mBand,mBody,mWarn; varying vec2 vUv; uniform vec4 cA[2]; uniform vec2 cRad[2]; uniform vec4 cSt[2];
      vec4 over(vec4 o, vec3 c, float a){ return vec4(mix(o.rgb,c,a/max(a+o.a*(1.-a),1e-4)), a+o.a*(1.-a)); }
      float h1(float x){ return fract(sin(x*91.7)*43758.5453); }
      void main(){ vec2 p=vUv*res; vec4 o=vec4(0.);
        // speed lines: thin radial streaks from just above centre, only toward the edges, flicker per angular bucket
        if(spd>0.001){ vec2 d=(vUv-sC)*vec2(res.x/res.y,1.); float r=length(d), a=atan(d.y,d.x);
          float N=110., b=floor((a+3.1416)/6.2832*N), fb=fract((a+3.1416)/6.2832*N);
          float on=step(0.62,h1(b+floor(sT*14.+h1(b)*7.)*13.)); float w=0.08+0.06*h1(b*3.1);
          float line=1.-smoothstep(0.,w,abs(fb-0.5)*2.-0.0); line=step(abs(fb-0.5),w*0.5);
          float rr=smoothstep(0.28,0.55,r)*(1.-smoothstep(0.95,1.2,r));
          float s=on*line*rr*spd*0.9; o=vec4(1.,1.,1.,s); }
        // ---- enchantments (softened for Hero C chase readability: slim abdomen + sash) ----
        { vec2 hv=hUV*res; float asp=res.x/res.y;
          // soft rim: tighter + lower alpha so silhouette reads
          if(hRim>0.01){ float d=length((p-hv)/res.y); float g=smoothstep(0.10,0.02,d)*hRim*0.28;
            o=over(o,vec3(0.431,0.604,0.259),g); /* #6E9A42 */
            float g2=smoothstep(0.055,0.012,d)*hRim*0.12; o=over(o,vec3(0.93,0.94,0.78),g2); }
          // sash ribbon: fewer quieter gold streaks
          if(hTrail>0.02){ for(int i=0;i<5;i++){ float fi=float(i);
            vec2 tp=hv+vec2((h1(fi*3.1+floor(sT*10.))-0.5)*18.*px, -(6.+fi*10.)*px);
            float td=length(p-tp); float tw=(3.8-fi*0.3)*px; float ta=smoothstep(tw,0.,td)*hTrail*(0.55-fi*0.06);
            o=over(o,vec3(1.0,0.824,0.247),ta); /* #FFD23F */ } }
          // launch / Catch motes: fewer, softer
          float spk=max(hSpark,hCatch);
          if(spk>0.02){ for(int i=0;i<7;i++){ float fi=float(i); float ang=fi*0.897+sT*2.0; float rad=(12.+fi*7.)*px*spk;
            vec2 mp=hv+vec2(cos(ang)*rad*asp,sin(ang)*rad*(0.65+0.35*h1(fi)));
            float md=length(p-mp); float ma=smoothstep(3.2*px,0.,md)*spk*0.55;
            vec3 mc=mix(vec3(1.0,0.824,0.247),vec3(0.525,0.682,0.345),step(0.5,h1(fi*7.3)));
            o=over(o,mc,ma); } }
        }
        // lightning (D_kit summer §4): vermilion edge lines >= 2 px at 360, ink both sides, bolt core/glow, local column flash only
        for(int i=0;i<2;i++){ vec4 st=cSt[i]; if(st.x<0.5) continue; vec2 a=cA[i].xy, b=cA[i].zw; vec2 ab=b-a; float L=length(ab); if(L<1.) continue; vec2 t=ab/L, nrm=vec2(-t.y,t.x);
          float u=dot(p-a,t), v=dot(p-a,nrm); if(u<-40.||u>L+40.) continue; float uc=clamp(u/L,0.,1.); float R=mix(cRad[i].x,cRad[i].y,uc);
          if(u>=0.&&u<=L){
            if(st.z>0.5 && abs(v)<R) o=over(o,vec3(0.749,0.847,0.894),0.5);                           // the flash: a tint inside the column only
            if(st.x<2.5){ float e=abs(abs(v)-R); float ink=edgePx*0.5+2.*px; float filled=step(uc,st.y)+step(1.5,st.x); float dash=step(mod(u,26.*px),12.*px);
              float on=max(min(filled,1.),dash*0.999); if(e<ink && on>0.) o=over(o, e<edgePx*0.5? vec3(0.769,0.282,0.204) : vec3(0.118,0.149,0.188), 1.); }
            if(st.x>1.5){ float fr=floor(sT/0.12); float q=uc*9.; float j0=floor(q); float h0=fract(sin((j0+fr*17.)*91.7)*43758.5)-0.5, h1=fract(sin((j0+1.+fr*17.)*91.7)*43758.5)-0.5; float w=mix(h0,h1,fract(q))*R*0.9*(1.-0.6*uc*uc); /* jagged bolt, frames A/B swap every 0.12 s */
              float d=abs(v-w); float ga=st.w;
              if(d<13.*px) o=over(o,vec3(0.749,0.847,0.894),0.45*ga*(1.-d/(13.*px)));
              if(st.x<2.5){ if(d<3.*px+2.*px) o=over(o,vec3(0.118,0.149,0.188),1.); if(d<3.*px) o=over(o,vec3(0.957,0.969,0.976),1.); } } }
        }
        if(mistY>-1e3){ float sc=4.*px*sin(p.x/(38.*px)+mistT*0.8)+2.*px*sin(p.x/(13.*px)-mistT*1.3);
          float e=mistY+sc, lw=mix(max(mLinePx*px,1.),max(mWarnPx*px,2.),warn), bw=max(mBandPx*px,8.);
          if(p.y<e){ vec3 lc=mix(mLine,mWarn,warn); if(p.y>e-lw) o=vec4(lc,1.); else if(p.y>e-lw-bw) o=vec4(mBand,1.); else o=vec4(mBody,0.92); } }
        gl_FragColor=o; }` }));
  const qS = new THREE.Scene(); qS.add(quad); const qC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); const U = quad.material.uniforms;
  return { U, tag() {}, render(S, cam) { R.getDrawingBufferSize(size); U.res.value.copy(size); U.px.value = size.x / 1080;
    R.info.autoReset = false; R.info.reset(); R.autoClear = true; R.render(S, cam); U.draws = R.info.render.calls; R.autoClear = false; R.render(qS, qC); R.autoClear = true; } };
}
