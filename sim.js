// sim.js — the whole Tobu run: course generation, physics, breakables, mist, Catch.
// Pure JS: no DOM, no Three.js, no clock. The game and the replay server run this exact file.
// Determinism rules (keep them when porting to Godot):
//  * fixed DT = 1/120, input applied only at tick boundaries
//  * only + - * / Math.sqrt Math.abs Math.min Math.max Math.round Math.imul in physics (all IEEE-exact on every engine;
//    no sin/cos/exp/pow/hypot, which can differ by 1 ulp between V8, JavaScriptCore and Godot)
//  * every random number comes from the seed; rendering, camera, decor and frame rate never touch this state
export const SIM_VERSION = 'tobu-sim-5'; // 5: telegraphed summer lightning (seeded, lethal column knocks the climber off) ;; was 4: // 4: the Catch screen has no countdown; waiting is not simulated, No thanks ends the log in catch mode
export const DT = 1 / 120;
export function mul(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export const T={runSpeed:12,lateral:7,groundAccel:60,airAccel:16,gravity:32,jumpVy:12.5,coyote:0.10,jumpBuffer:0.12,
 wallRayLen:1.0,wallMinSpeed:5,wallMaxNormalY:0.3,wallEntryVy:4.5,wallGravStart:0.12,wallGravEnd:1.0,wallMaxTime:1.4,wallStick:4,
 wallJumpOut:7.5,wallJumpUp:11,wallJumpKeep:1.0,sameWallCooldown:0.35};
export const MIST={start:-10,delay:3,ease:2,zoneFrom:[0,120,250,400],mps:[0.75,0.8,0.85,0.85],trail:40, // SEASONS 2026-10-17 01:12
 rampFrom:600,rampPer50:0.02,cap:1.05,lateCap:[[600,0.84],[700,0.75],[800,0.67],[900,0.59]]}; // lateCap = 75% of perfect bot's measured climb rate per band (mist off, breakables on), applied after adaptation // late ramp; cap must stay <=75% of the perfect bot's late-course climb rate (LAUNCH)
export const BRK={share:[0.10,0.20,0.30,0.40],noneBelow:50,wall:[0.75,0.6,0.55,0.55],shelf:[0.8,0.55,0.5,0.5],long:[0,0.3,0.4,0.5],
 rampPer100:0.05,maxShare:0.6}; // breaks bite from Summer; long = 8-10 m shelf, last 2 m solid
// late ramp: chimney kick gap drifts from 2.9 m to 3.5-3.8 m between 600 and 900 m; height per kick drops 1.7 -> 0.9 m
// LATE: SEASONS late-v2-2026-10-17 (/workspace/tobu/late_gap_table.json). Past 600 m: kick gaps 2.9-3.1 m, mist flat 0.85 m/s, breakable share by band.
export const LATE={from:600,mist:0.85,bands:[[600,[2.9,3.1],0.45,0.5],[700,[2.9,3.1],0.50,0.5],[800,[2.9,3.1],0.55,0.5],[900,[2.9,3.1],0.60,0.5]],wall:0.55,shelf:0.5};
export const lateBand=y=>{let b=null;for(const r of LATE.bands)if(y>=r[0])b=r;return b};
export const RAMP={from:600,span:300,gap0:2.9,gapLo:3.5,gapHi:3.8,risePerKick0:1.7,risePerKick1:0.9};
// Summer lightning (SEASONS course spec 10-18 + D_kit summer_spec §4, mid tuning): from the end of summer's 30 m ramp to the band end.
// Ring warns 1.0 s, strike 0.25 s, afterglow 0.5 s (safe), every ~8 s, 1.2 m column. Lane comes from a seeded table, never the player's position.
export const LIGHTNING={from:150,to:250,warn:1.0,strike:0.25,after:0.5,every:8,jit:0.3,r:1.2,colH:8,lanes:[-2.6,0,2.6],ahead:[8,30],knockVy:-6,knockVz:4};
export const ZONES=[{n:'Spring cedar',h:0},{n:'Summer cliffs',h:120},{n:'Autumn steam',h:250},{n:'Winter ice',h:400}];
export const zoneIdx=h=>{let i=0;for(let k=0;k<ZONES.length;k++)if(h>=ZONES[k].h)i=k;return i};
export const ADAPT_MIN=0.85, ADAPT_MAX=1.15;
const clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
export const qSteer=v=>Math.round(clamp(v,-1,1)*127); // steer is sent and simulated as an int -127..127

// opt: {seed, board:'free'|'daily'|'weekly'|'alltime', adapt (per-run, skill-only; forced 1 on daily/weekly), nobrk, nomist, miss (bot only), hooks:{add,remove,crack}}
export function createSim(opt={}){
 const SEED=(opt.seed>>>0), H=opt.hooks||{}, board=opt.board||'free';
 const ADAPT=(board==='daily'||board==='weekly')?1:clamp(opt.adapt??1,ADAPT_MIN,ADAPT_MAX);
 const rC=mul(SEED^0xA11CE), rB=mul(SEED^0xB4EA), rM=mul(SEED^0x3155), rL=mul(SEED^0x11E7);
 const boxes=[],mods=[];let nid=1;
 const P={pos:{x:0,y:1,z:-3},vel:{x:0,y:0,z:0},r:0.4,state:'air',coyote:0,buffer:0,wallN:{x:0,y:0,z:0},wallSide:0,wallT:0,lastWall:null,lastWallT:9,lastShelf:null,kickPlan:null,
  maxH:0,t:0,caught:0,mode:'play',catchAt:0,stats:{wallruns:0,walljumps:0,catch:0,dead_at:null,cracks:0,breaks:0,late:0,strikes:0,struck:0}};
 const strikes=[];let nextStrike=null,sid=1;
 const mist={v:MIST.start}, ZT={};
 const log={v:SIM_VERSION,seed:SEED,board,adapt:ADAPT,taps:[],steer:[],end:0};let n=0,lastQ=0;

 function box(x,y,z,w,h,d,kind){const b={id:nid++,x,y,z,hx:w/2,hy:h/2,hz:d/2,kind,grp:null,brk:false,crackAt:null,gone:false};boxes.push(b);H.add&&H.add(b);return b;}
 function brkP(y){if(y<BRK.noneBelow||opt.nobrk)return 0;const lb=lateBand(y);return lb?lb[2]:BRK.share[zoneIdx(y)];}
 const rampF=y=>y<=RAMP.from?0:Math.min(1,(y-RAMP.from)/RAMP.span);
 function mkBrk(b){b.brk=true;const z=zoneIdx(b.y);b.dl=b.y>=LATE.from?(b.kind==='wall'?LATE.wall:LATE.shelf):(b.kind==='wall'?BRK.wall[z]:BRK.shelf[z]);return b;}
 function touch(b){if(!b||!b.brk||b.crackAt!=null)return;b.crackAt=P.t;P.stats.cracks++;H.crack&&H.crack(b);}
 function drop(i){const b=boxes[i];boxes.splice(i,1);b.gone=true;H.remove&&H.remove(b);}
 function updBreaks(){for(let i=boxes.length-1;i>=0;i--){const b=boxes[i];if(b.crackAt==null)continue;if(P.t-b.crackAt>=b.dl){drop(i);P.stats.breaks++;}}}

 // ---------- endless seeded course ----------
 const G={z:0,y:0,n:0};
 function shelf(len){const p=G.n>0?brkP(G.y):0;
  if(p>0&&rB()<p){const zi=zoneIdx(G.y);
   if(rB()<(lateBand(G.y)?lateBand(G.y)[3]:BRK.long[zi])){len=8+rB()*2;const f=Math.min(len-2,((G.y>=LATE.from?LATE.shelf:BRK.shelf[zi])-0.05)*T.runSpeed), // breakable part short enough to run across before it breaks; rest solid
    a=mkBrk(box(0,G.y-0.5,G.z-f/2,8,1,f,'shelf')),b=box(0,G.y-0.5,G.z-f-(len-f)/2,8,1,len-f,'shelf');
    for(const q of[a,b]){q.top=G.y;q.z0=G.z;q.z1=G.z-len;q.cz=G.z-f-(len-f)/2;}a.long=true;G.z-=len;return b;}}
  if(len>=10&&p>0&&rB()<0.5){const f=len*0.5,a=mkBrk(box(0,G.y-0.5,G.z-f/2,8,1,f,'shelf')),b=box(0,G.y-0.5,G.z-f-(len-f)/2,8,1,len-f,'shelf');
   for(const q of[a,b]){q.top=G.y;q.z0=G.z;q.z1=G.z-len;q.cz=G.z-f-1.5;}G.z-=len;return b;}
  const b=box(0,G.y-0.5,G.z-len/2,8,1,len,'shelf');b.top=G.y;b.z0=G.z;b.z1=G.z-len;b.cz=G.z-2;G.z-=len;return b;}
 function genModule(){const lastShelf=shelf(G.n===0?30:8+rC()*8);const zEdge=G.z,y0=G.y;G.n++;
  const r=rC(),h=G.y,hard=Math.min(1,h/250);let m;
  if(r<0.30-0.1*hard){const gap=3+rC()*3,rise=0.4+rC()*1.1;G.z-=gap;G.y+=rise;m={type:'step',edge:zEdge,gap,rise};}
  else if(r<0.72){const s=rC()<0.5?-1:1,isB=rB()<brkP(y0),dlW=y0>=LATE.from?LATE.wall:BRK.wall[zoneIdx(y0)];let gap=9+rC()*5,rise=1+rC()*2;
   if(isB&&gap>(dlW-0.15)*T.runSpeed){const g2=(dlW-0.15)*T.runSpeed;rise*=g2/gap;gap=g2;} // a breakable wall must be crossable with a clean kick before it breaks
   const Hh=rise+7,w=box(s*4.6,y0-2+Hh/2,zEdge-gap/2,0.6,Hh,gap+6,'wall');w.grp=w.id;if(isB)mkBrk(w);G.z-=gap;G.y+=rise;m={type:'wallrun',edge:zEdge,side:s,walls:[w],gap,rise,y0};}
  else{const s0=rC()<0.5?-1:1,k=3+(rC()*2|0)+(hard>0.5?1:0),L=10.5*k+2,lb=lateBand(y0),f=0,kg=lb?lb[1][0]+rC()*(lb[1][1]-lb[1][0]):RAMP.gap0,
    hw=kg/2+0.3,rise=lerp(RAMP.risePerKick0,RAMP.risePerKick1,f)*k,Hh=rise+10,walls=[];
   for(const s of[s0,-s0]){let z=zEdge-1,gid=null;for(let i=0;i<k;i++){const len=i===0?12.5:10.5;const w=box(s*hw,y0-3+Hh/2,z-len/2,0.6,Hh,len,'wall');
    gid=gid??w.id;w.grp=gid;if(rB()<brkP(y0))mkBrk(w);walls.push(w);z-=len;}}
   const gap=L+2;G.z=zEdge-gap;G.y+=rise;m={type:'chimney',edge:zEdge,side:s0,walls,gap,rise,k,kickGap:kg};}
  m.shelf=lastShelf;m.z0=lastShelf.z0;m.z1=G.z;m.y0=y0;mods.push(m);H.module&&H.module(m);}
 function ensureCourse(){while(G.z>P.pos.z-220)genModule();
  for(let i=boxes.length-1;i>=0;i--){const b=boxes[i];if(b.z-b.hz>P.pos.z+70)drop(i);}
  while(mods.length>40&&mods[0].z1>P.pos.z+70)mods.shift();}

 // ---------- collision: sphere vs axis-aligned boxes ----------
 function collide(){let g=null;const p=P.pos,v=P.vel;for(const b of boxes){const lx=p.x-b.x,ly=p.y-b.y,lz=p.z-b.z;
   let nx=lx-clamp(lx,-b.hx,b.hx),ny=ly-clamp(ly,-b.hy,b.hy),nz=lz-clamp(lz,-b.hz,b.hz);const d=Math.sqrt(nx*nx+ny*ny+nz*nz);if(d>=P.r||d===0)continue;
   nx/=d;ny/=d;nz/=d;const push=P.r-d;p.x+=nx*push;p.y+=ny*push;p.z+=nz*push;
   const vn=v.x*nx+v.y*ny+v.z*nz;if(vn<0){v.x-=nx*vn;v.y-=ny*vn;v.z-=nz*vn;}if(ny>0.7)g=b;}return g;}
 // side rays in -X and +X against wall faces (replaces Three's Raycaster so the server needs no 3D library)
 function probeWall(){let best=null;const p=P.pos,far=P.r+T.wallRayLen;
  for(const s of[-1,1])for(const b of boxes){if(b.kind!=='wall'||b.gone||Math.abs(b.z-p.z)>=b.hz+2)continue;
   if(p.y<b.y-b.hy||p.y>b.y+b.hy||p.z<b.z-b.hz||p.z>b.z+b.hz)continue;const d=(b.x-s*b.hx-p.x)*s;if(d<0||d>far)continue;
   if(!best||d<best.d)best={d,nx:-s,side:s,b};}return best;}
 const grp=b=>b?(b.grp??b.id):null;

 function step(dt,side){const p=P.pos,v=P.vel,N=P.wallN;P.t+=dt;P.lastWallT+=dt;P.buffer-=dt;P.coyote-=dt;
  if(P.state==='wall'){P.wallT+=dt;const w=probeWall();
   if(!w||grp(w.b)!==grp(P.lastWall)||P.wallT>T.wallMaxTime){P.state='air';P.lastWallT=0;}
   else{if(w.b!==P.lastWall){P.lastWall=w.b;touch(w.b);}N.x=w.nx;N.y=0;N.z=0;const vn=v.x*N.x;v.x-=N.x*vn;v.x-=N.x*T.wallStick*dt;
    const k=Math.min(1,P.wallT/T.wallMaxTime);v.y-=T.gravity*lerp(T.wallGravStart,T.wallGravEnd,k*k)*dt;
    if(-v.z<T.runSpeed)v.z-=T.airAccel*dt;
    if(P.buffer>0){P.buffer=0;P.state='air';P.lastWallT=0;P.stats.walljumps++;v.x+=N.x*T.wallJumpOut;v.y=T.wallJumpUp;}}}
  if(P.state!=='wall'){const accel=P.state==='ground'?T.groundAccel:T.airAccel;
   const dx=side*T.lateral-v.x,dz=-T.runSpeed-v.z,dl=Math.sqrt(dx*dx+dz*dz),m=Math.min(dl,accel*dt);
   if(dl>0){v.x+=dx/dl*m;v.z+=dz/dl*m;}v.y-=T.gravity*dt;
   if(P.state==='air'){const w=probeWall();
    if(w&&v.y<7&&-v.z>T.wallMinSpeed&&(grp(w.b)!==grp(P.lastWall)||P.lastWallT>T.sameWallCooldown)){
     P.state='wall';P.wallT=0;P.kickPlan=null;N.x=w.nx;N.y=0;N.z=0;P.wallSide=w.side;P.lastWall=w.b;P.stats.wallruns++;touch(w.b);
     v.x=0;v.y=Math.max(v.y,T.wallEntryVy);}}
   if((P.state==='ground'||P.coyote>0)&&P.buffer>0){P.buffer=0;P.coyote=0;v.y=T.jumpVy;P.state='air';}}
  p.x+=v.x*dt;p.y+=v.y*dt;p.z+=v.z*dt;const g=collide();
  P.stand=g;if(g&&P.state!=='wall'){if(P.state!=='ground')P.lastWall=null;P.state='ground';P.coyote=T.coyote;if(g.kind==='shelf'&&!g.brk)P.lastShelf=g;}
  else if(P.state==='ground'&&!g)P.state='air';if(P.state==='wall'&&g)P.state='ground';
  if(g)touch(g);updBreaks();
  P.maxH=Math.max(P.maxH,p.y);
  // rising bottom: speed by the highest zone reached x per-run skill factor; never trails more than 40 m
  const sp=P.maxH>=LATE.from?LATE.mist:MIST.mps[zoneIdx(P.maxH)]*ADAPT; // late mist is flat 0.85 m/s: never below (KAMI), never above 75% of the perfect bot (LAUNCH)
  if(P.t>MIST.delay){const u=Math.min(1,(P.t-MIST.delay)/MIST.ease);mist.v+=sp*u*u*(3-2*u)*dt;}
  if(opt.nomist)mist.v=P.maxH-30;else mist.v=Math.max(mist.v,P.maxH-MIST.trail);
  for(const z of ZONES)if(P.maxH>=z.h&&!(z.n in ZT))ZT[z.n]=Math.round(P.t*10)/10;
  updLightning();
  if(p.y<mist.v){if(!P.caught){P.mode='catch';P.catchAt=P.t;P.stats.catch++;}else die();}}
 // lightning: one column per strike on a shelf ahead (seeded lane), lethal only during the strike; a hit knocks the climber off (loses grip, falls)
 function updLightning(){const L=LIGHTNING;
  for(let i=strikes.length-1;i>=0;i--){const k=strikes[i],a=P.t-k.t0;
   if(a>=L.warn&&a<L.warn+L.strike&&!k.hit){const dx=P.pos.x-k.x,dz=P.pos.z-k.z;if(dx*dx+dz*dz<L.r*L.r&&P.pos.y>=k.y-0.2&&P.pos.y<=k.y+L.colH){k.hit=true;P.stats.struck++;
     P.state='air';P.buffer=0;P.coyote=0;P.kickPlan=null;P.vel.y=Math.min(P.vel.y,L.knockVy);P.vel.z=L.knockVz;}}
   if(a>=L.warn+L.strike+L.after)strikes.splice(i,1);}
  const inBand=P.maxH>=L.from&&P.maxH<L.to;if(!inBand){nextStrike=null;return;}
  if(nextStrike===null)nextStrike=P.t+2;if(P.t<nextStrike)return;
  let c=null;for(const b of boxes){if(b.kind!=='shelf'||b.gone||b.brk||b.long||b.top==null||b.hz*2<6)continue;const d=P.pos.z-b.z;if(d<L.ahead[0]||d>L.ahead[1])continue;if(!c||b.z>c.z)c=b;}
  if(!c){nextStrike=P.t+0.5;return;}
  const x=L.lanes[(rL()*L.lanes.length)|0],z=c.z+(rL()-0.5)*(c.hz*2-3);strikes.push({id:sid++,x,y:c.top,z,t0:P.t,hit:false});P.stats.strikes++;
  nextStrike=P.t+L.every*(1-L.jit/2+L.jit*rL());}
 function die(){P.mode='dead';P.stats.dead_at=Math.round(P.maxH*10)/10;}
 function doCatch(){P.caught=1;P.mode='play';const s=P.lastShelf; // back on your last solid shelf, mist 6 m below it. Free in ranked.
  const top=s?s.top:Math.max(0,P.maxH-6);P.pos.x=0;P.pos.y=top+1.2;if(s)P.pos.z=s.cz;P.vel.x=0;P.vel.y=0;P.vel.z=-T.runSpeed*0.5;P.state='air';
  mist.v=Math.min(mist.v,top-6);}
 function press(){if(P.mode==='catch'){doCatch();return}/* the 0.5 s accidental-tap guard is on the client's Catch button */if(P.mode==='dead')return;P.buffer=T.jumpBuffer;}

 // one fixed step. inp={press:bool, steer:-1..1}. Records exactly what it simulated.
 function tick(inp={}){if(P.mode==='dead')return;if(P.mode==='catch'&&!inp.press)return; // the world is frozen on the Catch screen: no countdown (locked menus), no ticks logged while the player decides
 const q=qSteer(inp.steer||0);
  if(inp.press)log.taps.push(n);if(q!==lastQ){log.steer.push([n,q]);lastQ=q;}n++;log.end=n;
  if(inp.press)press();
  if(P.mode==='play'){step(DT,q/127);ensureCourse();}
}
 // No thanks: the run ends where it stands. Not an input; a log that ends on the Catch screen replays as declined.
 function decline(){if(P.mode==='catch')die();}

 // ---------- test bot: reads only nearby geometry, taps at most 10x/s like a fast thumb ----------
 const modAt=z=>{for(const m of mods)if(z<=m.z0&&z>m.z1)return m;return null};
 let bWant=false,bLast=-99;
 function botInput(){if(P.mode==='catch')return{press:true,steer:0};
  const m=modAt(P.pos.z);let jump=false,tx=0;if(!m)return{press:false,steer:0};const onShelf=P.pos.z>m.edge;
  if(m.type==='step'){if(P.state==='ground'&&P.pos.z-m.edge<1.4&&onShelf)jump=true;}
  else if(m.type==='wallrun'){const w=m.walls[0];tx=m.side*3.7;
   if(P.state==='ground'&&onShelf&&P.pos.z-m.edge<1.4)jump=true;
   if(P.state==='wall'){tx=m.side*4;const dist=P.pos.z-m.z1;const cb=P.lastWall;const ta=dist/T.runSpeed,ya=P.pos.y+T.wallJumpUp*ta-0.5*T.gravity*ta*ta,reach=ya>=m.y0+m.rise+0.3; /* bot: only take the early kick if it still clears the next shelf */ if(dist<7.5||(P.wallT>0.5&&dist<11&&reach)||P.vel.y<-3||P.wallT>1.2||(cb&&cb.crackAt!=null&&P.t-cb.crackAt>cb.dl-0.12))jump=true;}
   if(P.state==='air'&&P.lastWall===w)tx=0;}
  else{if(P.state==='ground'&&onShelf){tx=m.side*0.8;if(P.pos.z-m.edge<1.4)jump=true;}
   else if(P.state==='wall'){const cb=P.lastWall;if(P.wallT>0.15&&(P.vel.y<1.5||P.wallT>0.5||(cb&&cb.crackAt!=null&&P.t-cb.crackAt>cb.dl-0.12)))jump=true;if(P.pos.z<m.z1+6&&P.pos.y<m.y0+m.rise+0.5)jump=true;}
   else tx=P.lastWall?-Math.sign(P.lastWall.x)*0.8:m.side*0.8;}
  if(P.state==='wall'&&jump&&opt.miss>0){if(P.kickPlan==null){const late=rM()<opt.miss;P.kickPlan=P.wallT+(late?0.3:0);if(late)P.stats.late++;}jump=P.wallT>=P.kickPlan;}
  if(P.state!=='wall')for(const k of strikes){const a=P.t-k.t0;if(a>LIGHTNING.warn+LIGHTNING.strike)continue;const dz=P.pos.z-k.z;if(dz<-1.5||dz>14)continue;if(Math.abs(tx-k.x)<LIGHTNING.r+0.9)tx=k.x+(k.x>0?-1:k.x<0?1:(m.side||1))*2.6;} // bot sees the ring like a player would
  let pr=false;if(jump&&(!bWant||n-bLast>=12)){pr=true;bLast=n;}bWant=jump;
  return{press:pr,steer:clamp((tx-P.pos.x)/1.5,-1,1)};}

 ensureCourse();
 return{P,boxes,mods,mist,ZT,strikes,log,tick,decline,botInput,modAt,get ticks(){return n},get adapt(){return ADAPT}};
}

// Re-run a recorded log from scratch. Same seed + same inputs + same code => same height, on any device.
export function replay(log,{maxTicks=60*60*120}={}){
 if(!log||log.v!==SIM_VERSION)return{ok:false,reason:'version'};
 const end=log.end|0;if(end<=0||end>maxTicks)return{ok:false,reason:'length'};
 const sim=createSim({seed:log.seed,board:log.board,adapt:log.adapt});
 let ti=0,si=0,steer=0;const taps=log.taps,st=log.steer;
 for(let i=0;i<end;i++){while(si<st.length&&st[si][0]===i){steer=st[si][1]/127;si++;}
  const pr=ti<taps.length&&taps[ti]===i;if(pr)ti++;
  if(sim.P.mode==='dead')return{ok:false,reason:'inputs after death',tick:i};
  sim.tick({press:pr,steer});}
 if(ti!==taps.length||si!==st.length)return{ok:false,reason:'inputs out of order'};
 sim.decline(); // ended on the Catch screen = No thanks
 return{ok:true,dead:sim.P.mode==='dead',maxH:sim.P.maxH,height:Math.round(sim.P.maxH*10)/10,t:sim.P.t,stats:sim.P.stats,adapt:sim.adapt};
}

// Wire format: delta-packed, ~20 KB gzipped for a 15-minute run.
export function packLog(L){const taps=[],steer=[];let p=0;for(const t of L.taps){taps.push(t-p);p=t}let pt=0,pq=0;for(const[t,q]of L.steer){steer.push(t-pt,q-pq);pt=t;pq=q}return{...L,taps,steer,packed:1}}
export function unpackLog(W){if(!W||!W.packed)return W;const taps=[],steer=[];let p=0;for(const d of W.taps||[]){p+=d;taps.push(p)}let t=0,q=0;const s=W.steer||[];for(let i=0;i+1<s.length;i+=2){t+=s[i];q+=s[i+1];steer.push([t,q])}const{packed,...rest}=W;return{...rest,taps,steer}}
