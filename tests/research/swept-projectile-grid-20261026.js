'use strict';
// Research-only swept-AABB candidate index; NOT wired into NOVA TANKS.
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const CELL=180,MAX_CELLS=128;
function box(p,dt){
 if(!p||![p.x,p.y,p.vx,p.vy,p.r].every(Number.isFinite)||p.r<0)return null;
 const ttl=Number.isFinite(p.ttl)?Math.max(0,p.ttl):dt;
 const t=Math.min(dt,ttl),ex=p.x+p.vx*t,ey=p.y+p.vy*t;
 if(!Number.isFinite(ex)||!Number.isFinite(ey))return null;
 return {x0:Math.min(p.x,ex)-p.r,x1:Math.max(p.x,ex)+p.r,
         y0:Math.min(p.y,ey)-p.r,y1:Math.max(p.y,ey)+p.r};
}
function overlap(a,b){return a.x0<=b.x1&&b.x0<=a.x1&&a.y0<=b.y1&&b.y0<=a.y1;}
function span(b){const x0=Math.floor(b.x0/CELL),x1=Math.floor(b.x1/CELL),
 y0=Math.floor(b.y0/CELL),y1=Math.floor(b.y1/CELL);
 return {x0,x1,y0,y1,count:(x1-x0+1)*(y1-y0+1)};}
function indexProjectiles(ps,dt){
 const cells=new Map(),globals=[],valid=[];
 for(let i=0;i<ps.length;i++){
  const b=box(ps[i],dt);if(!b){globals.push(i);continue;}
  valid[i]=b;const s=span(b);
  if(!Number.isFinite(s.count)||s.count>MAX_CELLS){globals.push(i);continue;}
  for(let x=s.x0;x<=s.x1;x++)for(let y=s.y0;y<=s.y1;y++){
   const key=x+','+y;let a=cells.get(key);if(!a)cells.set(key,a=[]);a.push(i);
  }
 }
 return {cells,globals,valid,ps,dt};
}
function query(ix,p){
 const b=box(p,ix.dt),out=new Set();
 if(!b)return ix.ps.map((_,i)=>i);
 const s=span(b);
 if(!Number.isFinite(s.count)||s.count>MAX_CELLS)return ix.ps.map((_,i)=>i).filter(i=>!ix.valid[i]||overlap(b,ix.valid[i]));
 for(const i of ix.globals)out.add(i);
 for(let x=s.x0;x<=s.x1;x++)for(let y=s.y0;y<=s.y1;y++){
  for(const i of ix.cells.get(x+','+y)||[])out.add(i);
 }
 return [...out].filter(i=>!ix.valid[i]||overlap(b,ix.valid[i]));
}
function oracle(ps,p,dt){const b=box(p,dt);return ps.map((v,i)=>({i,b:box(v,dt)}))
 .filter(x=>!b||!x.b||overlap(b,x.b)).map(x=>x.i);}
let seed=3742026;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function projectile(){const far=rand()<.01,vel=far?1e6:7000;
 return {x:(rand()-.5)*4600,y:(rand()-.5)*4600,vx:(rand()-.5)*vel,
 vy:(rand()-.5)*vel,r:1+rand()*15,ttl:.001+rand()*.8};}
let worlds=0,queries=0,misses=0,extras=0,metamorphic=0;
for(let w=0;w<4000;w++){
 const n=10+Math.floor(rand()*280),ps=Array.from({length:n},projectile),dt=.001+rand()*.08;
 const ix=indexProjectiles(ps,dt);worlds++;
 for(let q=0;q<5;q++){
  const p=projectile(),expected=oracle(ps,p,dt),actual=query(ix,p),set=new Set(actual);
  for(const i of expected)if(!set.has(i))misses++;
  extras+=actual.filter(i=>!expected.includes(i)).length;
  queries++;
  if(q===0){const tx=360,ty=-540,translated=ps.map(p=>({...p,x:p.x+tx,y:p.y+ty}));
   const shifted=query(indexProjectiles(translated,dt),{...p,x:p.x+tx,y:p.y+ty});
   assert.deepEqual(shifted.sort((a,b)=>a-b),actual.sort((a,b)=>a-b));metamorphic++;}
 }
}
assert.equal(misses,0,'conservative index must never omit an overlapping swept AABB');
assert.equal(extras,0,'swept-AABB postfilter must match the oracle exactly');
const n=1000,ps=Array.from({length:n},(_,i)=>({x:900+(i%40)*4,y:900+Math.floor(i/40)*4,
 vx:0,vy:0,r:3,ttl:2}));const qps=Array.from({length:5},(_,i)=>({x:0,y:i*160,vx:6000,vy:0,r:3,ttl:.01}));
const dt=.35/30,ix=indexProjectiles(ps,dt);let found=0;
let t0=performance.now();for(let i=0;i<10000;i++)for(const q of qps)found+=query(ix,q).length;
let indexMs=performance.now()-t0;t0=performance.now();for(let i=0;i<10000;i++)for(const q of qps)found+=oracle(ps,q,dt).length;
let bruteMs=performance.now()-t0;
const frames=1000;let built=0;
t0=performance.now();for(let f=0;f<frames;f++){const frameIndex=indexProjectiles(ps,dt);for(const q of qps)built+=query(frameIndex,q).length;}
const buildAndQueryMs=performance.now()-t0;
t0=performance.now();for(let f=0;f<frames;f++)for(const q of qps)built+=oracle(ps,q,dt).length;
const frameBruteMs=performance.now()-t0;
const result={kind:'research-only swept AABB broadphase',worlds,queries,metamorphic,
 false_negatives:misses,false_positives:extras,background_projectiles:n,independent_queries:qps.length,
 candidate_count:query(ix,qps[0]).length,benchmark:{index_ms:indexMs,brute_ms:bruteMs,
 speedup:bruteMs/indexMs,frame_build_plus_five_queries_ms:buildAndQueryMs,frame_brute_five_queries_ms:frameBruteMs,frame_speedup:frameBruteMs/buildAndQueryMs},note:'Synthetic candidate discovery only. No gameplay chronology, side effects or phone FPS proven.'};
console.log(JSON.stringify(result,null,2));
