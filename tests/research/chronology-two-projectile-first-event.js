'use strict';
// NOVA TANKS #147/#234 research ONLY: two projectile first-event chronology.
// One moving body, one finite permanent wall. No penetration, cover damage,
// shields, shells, fragments, XP, nonlinear motion, or shipping integration.
const EPS=1e-12, schedules=[30,60,120,240,
 i=>[1/30,1/240,1/90][i%3],i=>[1/45,1/120,1/60,1/200][i%4]];
const check=(v,msg)=>{if(!v)throw Error(msg);};
const at=(p,v,t)=>({x:p.x+v.x*t,y:p.y+v.y*t});
function hit(b,c,now,h){
 const p=at(b.p,b.v,now),q=at(c.p,c.v,now),x=p.x-q.x,y=p.y-q.y,
 vx=b.v.x-c.v.x,vy=b.v.y-c.v.y,r=b.r+c.r;
 const C=x*x+y*y-r*r;if(C<0)return 0;
 const A=vx*vx+vy*vy,H=x*vx+y*vy;if(A<=1e-15||H>=0)return null;
 const D=H*H-A*C;if(D<=0)return null;
 const t=C/(-H+Math.sqrt(D));return t>=0&&t<h?t:null;
}
// Independent closest-approach + bisection reference.
function hitRef(b,c,now,h){
 const p=at(b.p,b.v,now),q=at(c.p,c.v,now),x=p.x-q.x,y=p.y-q.y,
 vx=b.v.x-c.v.x,vy=b.v.y-c.v.y,r=b.r+c.r;
 const d=t=>(x+vx*t)**2+(y+vy*t)**2;
 if(d(0)<r*r)return 0;
 const A=vx*vx+vy*vy;if(A<=1e-15)return null;
 const closest=Math.max(0,Math.min(h,-(x*vx+y*vy)/A));
 if(d(closest)>=r*r)return null;
 let lo=0,hi=closest;
 for(let i=0;i<60;i++){const m=(lo+hi)/2;if(d(m)<r*r)hi=m;else lo=m;}
 return hi<h?hi:null;
}
function wall(b,w,now,h){
 const p=at(b.p,b.v,now),pad=b.r*.45;let lo=0,hi=h;
 for(const [a,min,max] of [['x',w.x-w.w/2-pad,w.x+w.w/2+pad],
 ['y',w.y-w.h/2-pad,w.y+w.h/2+pad]]){
  const v=b.v[a],x=p[a];if(Math.abs(v)<1e-15){if(x<min||x>max)return null;continue;}
  const t0=(min-x)/v,t1=(max-x)/v;
  lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));
  if(hi<lo)return null;
 }
 return lo<h?lo:null;
}
// Independent four-face ray reference for finite cover.
function wallRef(b,w,now,h){
 const p=at(b.p,b.v,now),pad=b.r*.45,
 x0=w.x-w.w/2-pad,x1=w.x+w.w/2+pad,y0=w.y-w.h/2-pad,y1=w.y+w.h/2+pad;
 if(p.x>x0&&p.x<x1&&p.y>y0&&p.y<y1)return 0;
 const times=[];
 if(Math.abs(b.v.x)>1e-15)for(const x of [x0,x1]){
  const t=(x-p.x)/b.v.x,y=p.y+b.v.y*t;
  if(t>=0&&t<h&&y>=y0-1e-10&&y<=y1+1e-10)times.push(t);
 }
 if(Math.abs(b.v.y)>1e-15)for(const y of [y0,y1]){
  const t=(y-p.y)/b.v.y,x=p.x+b.v.x*t;
  if(t>=0&&t<h&&x>=x0-1e-10&&x<=x1+1e-10)times.push(t);
 }
 return times.length?Math.min(...times):null;
}
const order=(a,b)=>a.time-b.time||a.kind.localeCompare(b.kind)||
 a.ids.join(',').localeCompare(b.ids.join(','));
function events(w,dead,now,end,reference){
 const out=[],f=reference?hitRef:hit,g=reference?wallRef:wall;
 for(const b of w.bullets){
  if(dead.has(b.id))continue;
  const expiry=b.ttl;
  if(expiry>=now-1e-12&&expiry<=end+EPS)
   out.push({kind:'ttl',ids:[b.id],time:expiry});
  const h=Math.min(end,expiry)-now;if(h<=0)continue;
  const body=f(b,w.target,now,h);
  if(body!==null)out.push({kind:'body',ids:[b.id,w.target.id],time:now+body});
  const terrain=g(b,w.wall,now,h);
  if(terrain!==null)out.push({kind:'wall',ids:[b.id],time:now+terrain});
 }
 const [a,b]=w.bullets;
 if(!dead.has(a.id)&&!dead.has(b.id)&&a.owner!==b.owner){
  const h=Math.min(end,a.ttl,b.ttl)-now;
  if(h>0){const t=f(a,b,now,h);
   if(t!==null)out.push({kind:'intercept',ids:[a.id,b.id],time:now+t});
  }
 }
 return out.sort(order);
}
function simulate(w,schedule,reference){
 const dead=new Set(),out=[];let now=0,frame=0;
 const max=Math.max(...w.bullets.map(b=>b.ttl));
 while(now<max-EPS&&dead.size<2){
  const dt=reference?max-now:(typeof schedule==='number'?1/schedule:schedule(frame++));
  const end=Math.min(max,now+dt);let cursor=now,steps=0;
  while(cursor<end-EPS&&dead.size<2){
   check(++steps<=6,'no progress');
   const cand=events(w,dead,cursor,end,reference);
   if(!cand.length)break;
   const e=cand[0];out.push(e);
   if(e.kind==='intercept'){dead.add(e.ids[0]);dead.add(e.ids[1]);}
   else dead.add(e.ids[0]);
   cursor=Math.max(cursor+EPS,e.time+EPS);
  }
  now=end;
 }
 return out;
}
const same=(a,b)=>a.length===b.length&&a.every((e,i)=>
 e.kind===b[i].kind&&e.ids.join(',')===b[i].ids.join(',')&&
 Math.abs(e.time-b[i].time)<2e-8);
const base=()=>({bullets:[
 {id:1,owner:1,p:{x:0,y:0},v:{x:1000,y:0},r:3,ttl:.15},
 {id:2,owner:2,p:{x:100,y:0},v:{x:-1000,y:0},r:3,ttl:.15}],
 target:{id:7,p:{x:500,y:0},v:{x:0,y:0},r:8},
 wall:{x:200,y:0,w:10,h:40}});
function validate(w){
 const ref=simulate(w,null,true);
 for(const f of schedules)check(same(ref,simulate(w,f,false)),
  'partition disagreement '+JSON.stringify({w,ref,fps:typeof f==='number'?f:'irregular'}));
 return ref;
}
const cases=[];
{const w=base();w.wall.x=500;check(validate(w)[0].kind==='intercept','head-on');cases.push('head-on');}
{const w=base();w.wall.x=30;const x=validate(w);
 check(x.some(e=>e.kind==='wall'&&e.ids[0]===1)&&!x.some(e=>e.kind==='intercept'),'wall-before-intercept');
 cases.push('wall-before-intercept');}
{const w=base();w.bullets[0].ttl=.005;
 check(!validate(w).some(e=>e.kind==='intercept'),'TTL-before-intercept');cases.push('TTL-before-intercept');}
{const w=base();w.bullets[1].owner=1;w.wall.x=500;
 check(!validate(w).some(e=>e.kind==='intercept'),'same-owner');cases.push('same-owner');}
{const w=base();w.wall.x=500;w.target.p={x:20,y:20};w.target.v={x:0,y:-500};
 check(validate(w).some(e=>e.kind==='body'),'moving body');cases.push('moving-body');}
let seed=20261026;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const stats={deterministic:cases.length,worlds:0,comparisons:0,events:0,disagreements:0};
for(let i=0;i<20000;i++){
 const w=base();
 for(const b of w.bullets){
  b.p.x=(rand()-.5)*250;b.p.y=(rand()-.5)*100;
  b.v.x=(rand()-.5)*6000;b.v.y=(rand()-.5)*800;
  b.ttl=.005+rand()*.24;b.r=2+rand()*5;
 }
 w.bullets[1].owner=rand()<.15?1:2;
 w.target.p={x:(rand()-.5)*300,y:(rand()-.5)*100};
 w.target.v={x:(rand()-.5)*350,y:(rand()-.5)*350};
 w.target.r=5+rand()*12;
 w.wall={x:(rand()-.5)*250,y:(rand()-.5)*100,w:8+rand()*25,h:15+rand()*75};
 const ref=simulate(w,null,true);stats.worlds++;stats.events+=ref.length;
 for(const f of schedules){
  const out=simulate(w,f,false);stats.comparisons++;
  if(!same(ref,out)){stats.disagreements++;
   if(stats.disagreements<=2)console.error('mismatch',JSON.stringify({w,ref,out}));}
 }
}
console.log(JSON.stringify(stats,null,2));
check(stats.disagreements===0,'two-projectile chronology mismatch');
