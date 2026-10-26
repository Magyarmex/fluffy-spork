'use strict';
// NOVA TANKS #147/#234 RESEARCH ONLY. Not wired to shipping gameplay.
// Finite axis-aligned cover + linearly moving body first-event chronology.
// Missing: drone route checkpoints, projectile interception, shells, XP, splash,
// dynamic terrain, simultaneous contacts and actual damage callbacks.
const EPS=1e-12, fps=[30,60,120,240,
 i=>[1/30,1/240,1/90][i%3],i=>[1/45,1/120,1/60,1/200][i%4]];
const check=(ok,msg)=>{if(!ok)throw Error(msg);};
const at=(p,v,t)=>({x:p.x+v.x*t,y:p.y+v.y*t});
function bodyHit(b,t,start,h){
 const p=at(b.p,b.v,start),q=at(t.p,t.v,start);
 const x=p.x-q.x,y=p.y-q.y,vx=b.v.x-t.v.x,vy=b.v.y-t.v.y,r=b.r+t.r;
 const c=x*x+y*y-r*r;if(c<0)return 0;
 const a=vx*vx+vy*vy,d=x*vx+y*vy;if(a<=1e-15||d>=0)return null;
 const disc=d*d-a*c;if(disc<=0)return null;
 const hit=c/(-d+Math.sqrt(disc));return hit>=0&&hit<h?hit:null;
}
function slab(b,c,start,h){
 const p=at(b.p,b.v,start),pad=b.r*.45;
 let lo=0,hi=h;
 for(const [axis,min,max] of [['x',c.x-c.w/2-pad,c.x+c.w/2+pad],
 ['y',c.y-c.h/2-pad,c.y+c.h/2+pad]]){
  const v=b.v[axis],x=p[axis];
  if(Math.abs(v)<1e-15){if(x<min||x>max)return null;continue;}
  const a=(min-x)/v,z=(max-x)/v;
  lo=Math.max(lo,Math.min(a,z));hi=Math.min(hi,Math.max(a,z));
  if(hi<lo)return null;
 }
 return lo<h?lo:null;
}
// Independent body reference: closest approach + bisection, not quadratic roots.
function bodyOracle(b,t){
 const x=b.p.x-t.p.x,y=b.p.y-t.p.y,vx=b.v.x-t.v.x,vy=b.v.y-t.v.y,r=b.r+t.r;
 const d=z=>(x+vx*z)**2+(y+vy*z)**2;
 if(d(0)<r*r)return 0;
 const a=vx*vx+vy*vy;if(a<=1e-15)return null;
 const closest=Math.max(0,Math.min(b.ttl,-(x*vx+y*vy)/a));
 if(d(closest)>=r*r)return null;
 let lo=0,hi=closest;
 for(let i=0;i<65;i++){const mid=(lo+hi)/2;if(d(mid)<r*r)hi=mid;else lo=mid;}
 return hi<b.ttl?hi:null;
}
// Independent cover reference: intersect the four expanded rectangle faces.
function faceOracle(b,c){
 const pad=b.r*.45,x0=c.x-c.w/2-pad,x1=c.x+c.w/2+pad,
 y0=c.y-c.h/2-pad,y1=c.y+c.h/2+pad;
 if(b.p.x>x0&&b.p.x<x1&&b.p.y>y0&&b.p.y<y1)return 0;
 const hits=[];
 if(Math.abs(b.v.x)>1e-15)for(const x of [x0,x1]){
  const t=(x-b.p.x)/b.v.x,y=b.p.y+b.v.y*t;
  if(t>=0&&t<b.ttl&&y>=y0-1e-10&&y<=y1+1e-10)hits.push(t);
 }
 if(Math.abs(b.v.y)>1e-15)for(const y of [y0,y1]){
  const t=(y-b.p.y)/b.v.y,x=b.p.x+b.v.x*t;
  if(t>=0&&t<b.ttl&&x>=x0-1e-10&&x<=x1+1e-10)hits.push(t);
 }
 return hits.length?Math.min(...hits):null;
}
const order=(a,b)=>a.time-b.time||String(a.id).localeCompare(String(b.id));
function apply(s,e,w){
 s.events.push(e);
 if(e.kind==='body'){
  s.hit.add(e.id);s.hits++;if(s.hits>s.pen)s.stop=true;
 }else{
  const c=w.covers.find(c=>c.id===e.id);
  if(c.destructible&&s.dmg>=c.hp&&s.pen>=2){
   s.pen-=2;s.dmg*=.62;s.breached.add(e.id);
   if(s.hits>s.pen)s.stop=true;
  }else s.stop=true;
 }
}
const state=w=>({events:[],hit:new Set(),breached:new Set(),hits:0,pen:w.pen,dmg:w.dmg,stop:false});
function oracle(w){
 const all=[];
 for(const t of w.targets){const h=bodyOracle(w,t);if(h!==null)all.push({id:t.id,time:h,kind:'body'});}
 for(const c of w.covers){const h=faceOracle(w,c);if(h!==null)all.push({id:c.id,time:h,kind:'cover'});}
 all.sort(order);
 const s=state(w);for(const e of all){if(s.stop)break;apply(s,e,w);}return s.events;
}
function frames(w,schedule){
 const s=state(w);let start=0,n=0;
 while(start<w.ttl-EPS&&!s.stop){
  const dt=typeof schedule==='number'?1/schedule:schedule(n++);
  const end=Math.min(w.ttl,start+dt);let now=start,iterations=0;
  while(now<end-EPS&&!s.stop){
   check(++iterations<=w.targets.length+w.covers.length+2,'no-progress event loop');
   const h=end-now,candidates=[];
   for(const t of w.targets){if(s.hit.has(t.id))continue;
    const x=bodyHit(w,t,now,h);if(x!==null)candidates.push({id:t.id,time:now+x,kind:'body'});
   }
   for(const c of w.covers){if(s.breached.has(c.id))continue;
    const x=slab(w,c,now,h);if(x!==null)candidates.push({id:c.id,time:now+x,kind:'cover'});
   }
   if(!candidates.length)break;
   candidates.sort(order);const e=candidates[0];apply(s,e,w);
   now=Math.max(now+EPS,e.time+EPS);
  }
  start=end;
 }
 return s.events;
}
const same=(a,b)=>a.length===b.length&&a.every((e,i)=>
 e.id===b[i].id&&e.kind===b[i].kind&&Math.abs(e.time-b[i].time)<2e-8);
function validate(w,ids){
 const expected=oracle(w);
 if(ids)check(JSON.stringify(expected.map(e=>e.id))===JSON.stringify(ids),
  'deterministic expected '+JSON.stringify(ids)+' got '+JSON.stringify(expected));
 for(const f of fps)check(same(expected,frames(w,f)),'frame disagreement '+JSON.stringify({w,expected,fps:f}));
 return expected;
}
const base=()=>({p:{x:0,y:0},v:{x:1000,y:0},r:3,ttl:.15,pen:3,dmg:30,targets:[],covers:[]});
const tank=(id,x,y=0,vx=0,vy=0)=>({id,p:{x,y},v:{x:vx,y:vy},r:8});
const cover=(id,x,y=0,hp=Infinity,destructible=false)=>({id,x,y,w:10,h:40,hp,destructible});
let cases=0;
{const w=base();w.targets=[tank('front',30),tank('rear',90)];w.covers=[cover('wall',65)];
 validate(w,['front','wall']);cases++;}
{const w=base();w.targets=[tank('rear',90)];w.covers=[cover('breach',30,0,20,true),cover('wall',120)];
 validate(w,['breach','rear','wall']);cases++;}
{const w=base();w.targets=[tank('rear',90)];w.covers=[cover('cover',30,0,40,true)];
 validate(w,['cover']);cases++;}
{const w=base();w.pen=1;w.targets=[tank('rear',90)];w.covers=[cover('cover',30,0,10,true)];
 validate(w,['cover']);cases++;}
{const w=base();w.targets=[tank('rear',90)];w.covers=[cover('offaxis',30,90)];
 validate(w,['rear']);cases++;}
{const w=base();w.targets=[tank('moving',70,30,0,-400),tank('rear',110)];
 w.covers=[cover('wall',95)];const ids=validate(w).map(e=>e.id);
 check(ids.includes('moving')&&!ids.includes('rear'),'moving body before wall');cases++;}
{const w=base();w.pen=2;w.targets=[tank('first',65),tank('second',95)];
 w.covers=[cover('breach',30,0,20,true)];validate(w,['breach','first']);cases++;}
{const w=base();w.covers=[cover('first',30,0,10,true),cover('second',70,0,10,true)];
 w.targets=[tank('behind',110)];validate(w,['first','second']);cases++;}
{const w=base();w.v.y=200;w.covers=[{...cover('diagonal',60,12),h:10}];
 w.targets=[tank('behind',95,19)];validate(w,['diagonal']);cases++;}
{const w=base();w.v.y=200;w.covers=[{...cover('gap',60,70),h:10}];
 w.targets=[tank('reachable',95,19)];validate(w,['reachable']);cases++;}
let seed=20261026;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const stats={deterministic:cases,worlds:0,comparisons:0,events:0,excludedNearTies:0,disagreements:0,ties:{zeroZero:0,nonzero:0,bodyBody:0,coverCover:0,bodyCover:0}};
for(let n=0;n<20000;n++){
 const ttl=.01+rand()*.22,speed=400+rand()*4500,pen=Math.floor(rand()*7);
 const w={p:{x:0,y:0},v:{x:speed,y:(rand()-.5)*350},r:2+rand()*4,
  ttl,pen,dmg:12+rand()*58,targets:[],covers:[]};
 for(let i=0;i<5;i++){
  const t=ttl*rand()*1.25;
  w.targets.push({id:'T'+i,p:{x:speed*t+(rand()-.5)*35,y:(rand()-.5)*70},
   v:{x:(rand()-.5)*250,y:(rand()-.5)*250},r:5+rand()*13});
 }
 for(let i=0;i<3;i++){
  const t=ttl*rand()*1.25,destructible=rand()<.72;
  w.covers.push({id:'C'+i,x:speed*t,y:(rand()-.5)*85,w:8+rand()*25,
   h:12+rand()*70,destructible,hp:destructible?8+rand()*65:Infinity});
 }
 const times=[];
 for(const t of w.targets){const x=bodyOracle(w,t);if(x!==null)times.push({at:x,kind:'body'});}
 for(const c of w.covers){const x=faceOracle(w,c);if(x!==null)times.push({at:x,kind:'cover'});}
 times.sort((a,b)=>a.at-b.at);
 const tied=times.slice(1).map((e,i)=>[times[i],e]).filter(([a,b])=>b.at-a.at<1e-8);
 if(tied.length){
  stats.excludedNearTies++;
  for(const [a,b] of tied){
   if(a.at===0&&b.at===0)stats.ties.zeroZero++;else stats.ties.nonzero++;
   if(a.kind===b.kind)stats.ties[a.kind==='body'?'bodyBody':'coverCover']++;
   else stats.ties.bodyCover++;
  }
  continue;
 }
 const expected=oracle(w);stats.worlds++;stats.events+=expected.length;
 for(const f of fps){stats.comparisons++;if(!same(expected,frames(w,f))){
  stats.disagreements++;if(stats.disagreements<=2)console.error('mismatch',JSON.stringify({w,expected}));
 }}
}
console.log(JSON.stringify(stats,null,2));
check(stats.disagreements===0,'finite-cover frame partition mismatch');
