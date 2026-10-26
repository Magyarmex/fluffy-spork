'use strict';
// RESEARCH ONLY: #234/#147. Geometry-only moving-body piercing chronology.
// Not wired to the canonical game. No cover, interception, damage, XP, or fragments.
const assert=require('node:assert/strict');
function firstContact(p,v,q,w,r,horizon){
 const fx=p.x-q.x,fy=p.y-q.y,dx=v.x-w.x,dy=v.y-w.y;
 const C=fx*fx+fy*fy-r*r;
 if(!Number.isFinite(C))return null;
 if(C<0)return 0;
 const A=dx*dx+dy*dy,H=fx*dx+fy*dy;
 if(!(A>1e-15)||H>=0)return null;
 const D=H*H-A*C;if(!(D>0))return null;
 const t=C/(-H+Math.sqrt(D));
 return Number.isFinite(t)&&t>=0&&t<horizon?t:null;
}
function frameEvents(world,start,dt,ledger){
 const horizon=Math.min(dt,world.ttl-start);
 if(!(horizon>0))return [];
 const p={x:world.p.x+world.v.x*start,y:world.p.y+world.v.y*start},events=[];
 for(const t of world.targets){
  if(ledger.has(t.id))continue;
  const q={x:t.p.x+t.v.x*start,y:t.p.y+t.v.y*start};
  const hit=firstContact(p,world.v,q,t.v,t.r+world.r,horizon);
  if(hit!==null)events.push({id:t.id,time:start+hit});
 }
 return events.sort((a,b)=>a.time-b.time||a.id-b.id);
}
function simulate(world,fps){
 const ledger=new Set(),events=[];
 for(let start=0;start<world.ttl-1e-12&&events.length<=world.pen;start+=1/fps){
  for(const e of frameEvents(world,start,1/fps,ledger)){
   if(events.length>world.pen)break;
   if(ledger.has(e.id))continue;
   ledger.add(e.id);events.push(e);
  }
 }
 return events;
}
// Independent reference: closest-approach projection and bisection, not
// the quadratic formula. Exact tangencies are excluded (no interior overlap).
function referenceTime(p,v,q,w,r,horizon){
 const fx=p.x-q.x,fy=p.y-q.y,dx=v.x-w.x,dy=v.y-w.y;
 const sq=t=>{const x=fx+dx*t,y=fy+dy*t;return x*x+y*y;};
 if(sq(0)<r*r)return 0;
 const A=dx*dx+dy*dy;if(!(A>1e-15))return null;
 const closest=Math.max(0,Math.min(horizon,-(fx*dx+fy*dy)/A));
 if(!(sq(closest)<r*r))return null;
 let lo=0,hi=closest;
 for(let i=0;i<70;i++){const mid=(lo+hi)*.5;if(sq(mid)<r*r)hi=mid;else lo=mid;}
 return hi<horizon?hi:null;
}
function reference(world){
 const events=[];
 for(const t of world.targets){
  const hit=referenceTime(world.p,world.v,t.p,t.v,t.r+world.r,world.ttl);
  if(hit!==null)events.push({id:t.id,time:hit});
 }
 return events.sort((a,b)=>a.time-b.time||a.id-b.id).slice(0,world.pen+1);
}
function random(seed){return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
const rand=random(20261026),fpsList=[30,60,120,240];
const stats={worlds:0,contacts:0,comparisons:0,disagreements:0,ambiguous:0};
for(let n=0;n<30000;n++){
 const ttl=.005+rand()*.28,pen=Math.floor(rand()*4),speed=200+rand()*6000;
 const world={p:{x:0,y:0},v:{x:speed,y:0},r:2+rand()*3,ttl,pen,targets:[]};
 for(let i=0;i<5;i++){
  const time=rand()*ttl*1.3;
  world.targets.push({id:i+1,p:{x:speed*time+rand()*40-20,y:rand()*46-23},
   v:{x:rand()*300-150,y:rand()*300-150},r:5+rand()*13});
 }
 const expected=reference(world);
 // Equal-time batches need separate atomic credit semantics; do not assert order.
 if(expected.some((e,i)=>i>0&&Math.abs(e.time-expected[i-1].time)<1e-8)){
  stats.ambiguous++;continue;
 }
 stats.worlds++;stats.contacts+=expected.length;
 for(const fps of fpsList){
  const actual=simulate(world,fps);stats.comparisons++;
  if(actual.length!==expected.length||
     actual.some((e,i)=>e.id!==expected[i].id||Math.abs(e.time-expected[i].time)>2e-8)){
   stats.disagreements++;
   if(stats.disagreements<=5)console.error('Mismatch',fps,{world,expected,actual});
  }
 }
}
console.log(JSON.stringify(stats,null,2));
assert.equal(stats.disagreements,0);
