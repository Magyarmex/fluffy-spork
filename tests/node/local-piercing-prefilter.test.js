'use strict';
// Differential safety gates for the actual shipping Battlefield local-corridor
// prefilter. These do not replace full materialized gameplay tests.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/battlefield-v1.6.0.js'),'utf8');
const start=source.indexOf(' function localStationaryPiercingPlan(');
const end=source.indexOf('\n var oldUpdateBullets=',start);
assert.ok(start>=0&&end>start,'production local prefilter must be present');
const plan=new Function('CLASSES','ISOLATED_RECOVERY_SCAN_CAP',
 source.slice(start,end)+'\nreturn localStationaryPiercingPlan;')(
 {scout:{size:15}},1200);

function shot(y,ttl=.01){return {x:0,y,vx:6000,vy:0,r:3,ttl,
 pen:1,hits:0,dead:false,shell:false,beam:false,splash:false};}
function distant(i){return {x:900+(i%40)*4,y:900+Math.floor(i/40)*4,
 vx:0,vy:0,r:2,ttl:2,pen:0,hits:0,dead:false};}
function world(shots,remote,shapes=120){return {time:1,
 bullets:[...shots,...Array.from({length:remote},(_,i)=>distant(i))],
 tanks:[],shapes:Array.from({length:shapes},()=>({})),drones:[]};}
function near(b,o,dt,live){
 const t=live?dt:b.ttl,ex=b.x+b.vx*t,ey=b.y+b.vy*t,
  minx=Math.min(b.x,ex),maxx=Math.max(b.x,ex),
  miny=Math.min(b.y,ey),maxy=Math.max(b.y,ey),
  ox=o.x,oy=o.y,tx=ox+(o.vx||0)*dt,ty=oy+(o.vy||0)*dt,
  pad=(o.r||2)+b.r+2;
 if(![ox,oy,tx,ty,pad].every(Number.isFinite))return true;
 return Math.max(ox,tx)+pad>=minx&&Math.min(ox,tx)-pad<=maxx&&
  Math.max(oy,ty)+pad>=miny&&Math.min(oy,ty)-pad<=maxy;
}
let seed=3752026;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;
 return seed/4294967296;}
function moving(){const bad=rand()<.003;
 return {x:bad?NaN:(rand()-.5)*2000,y:(rand()-.5)*2000,
 vx:(rand()-.5)*14000,vy:(rand()-.5)*14000,r:1+rand()*12,
 ttl:2,pen:0,hits:0,dead:false};}

test('seeded corridor prefilter never discards a real legacy veto candidate',()=>{
 let comparisons=0;
 for(let w=0;w<12000;w++){
  const dt=.001+rand()*.07,live=rand()<.5,
   shots=[shot(0,live?dt+.1:dt*.8),shot(160,live?dt+.1:dt*.8)],
   bullets=[...shots,...Array.from({length:3+Math.floor(rand()*65)},moving)],
   g={time:1,bullets,tanks:[],shapes:[],drones:[]},
   result=plan(g,dt,live);
  assert.ok(result,'bounded valid two-shot worlds must have a local plan');
  for(const b of shots){
   const candidates=new Set(result.get(b));
   assert.ok(candidates,'each eligible shot must be in the plan');
   for(const o of bullets){
    if(o===b||o.dead)continue;
    comparisons++;
    if(near(b,o,dt,live))
     assert.ok(candidates.has(o),'never discard a possible earlier projectile contact');
   }
  }
 }
 assert.ok(comparisons>100000);
});

test('local budget ignores remote density but fails closed above scan cap',()=>{
 const shots=Array.from({length:5},(_,i)=>shot(i*160)),dt=.35/30;
 const dense=world(shots,960),p=plan(dense,dt,false);
 assert.ok(p&&p.size===5,'all five independent shots should qualify');
 for(const b of shots)assert.equal(p.get(b).length,0);
 assert.equal(plan(world(shots,3000),dt,false),null,
  'over-budget density must defer every shot, not the first N');
});

test('interceptor and invalid motion stay in conservative candidate lists',()=>{
 const shots=[shot(0),shot(160)],g=world(shots,50,0);
 const intercept={x:10,y:0,vx:0,vy:0,r:3,ttl:2,pen:0};
 const invalid={x:NaN,y:0,vx:0,vy:0,r:3,ttl:2,pen:0};
 g.bullets.push(intercept,invalid);
 const p=plan(g,.35/30,false);
 assert.ok(p);
 assert.ok(p.get(shots[0]).includes(intercept));
 for(const b of shots)assert.ok(p.get(b).includes(invalid),
  'unknown motion must never be filtered as distant');
});

test('shared hulls cannot receive array-order-dependent batch attribution',()=>{
 const shots=[shot(0),shot(10)],g=world(shots,50,120);
 g.tanks=[{id:10,x:40,y:5,cls:'scout',alive:true,hp:100},
  {id:11,x:65,y:5,cls:'scout',alive:true,hp:100}];
 assert.equal(plan(g,.35/30,false),null);
 g.bullets.reverse();
 assert.equal(plan(g,.35/30,false),null);
});

test('candidate identity is invariant under bullet-array permutation',()=>{
 const shots=[shot(0),shot(160)],g=world(shots,50,0);
 g.bullets.push({x:10,y:0,vx:0,vy:0,r:3,ttl:2,pen:0});
 const a=plan(g,.35/30,false);
 assert.ok(a);
 const before=shots.map(b=>new Set(a.get(b)));
 g.bullets.reverse();
 const b=plan(g,.35/30,false);
 assert.ok(b);
 shots.forEach((s,i)=>assert.deepEqual(new Set(b.get(s)),before[i]));
});


/* Run 376: remote piercing projectiles must not consume optional proof
 * budget when they cannot possibly touch enough stationary hulls.
 * They must STILL be considered as interception veto candidates. */
test('remote penetrating shots do not starve five physically eligible corridors',()=>{
 const local=Array.from({length:5},(_,i)=>shot(i*160));
 const remote=Array.from({length:5},(_,i)=>shot(1150+i*160));
 const g=world([...local,...remote],50,120);
 for(let i=0;i<5;i++){
  g.tanks.push({id:2*i+2,x:40,y:i*160,cls:'scout',alive:true,hp:100},
               {id:2*i+3,x:65,y:i*160,cls:'scout',alive:true,hp:100});
 }
 const dt=.35/30;
 const planA=plan(g,dt,false);
 assert.ok(planA,'unrelated piercing shots must not reject the valid batch');
 assert.equal(planA.size,5);
 for(const b of local)assert.ok(planA.has(b));
 for(const b of remote)assert.equal(planA.has(b),false);
 g.bullets.reverse();
 const planB=plan(g,dt,false);
 assert.ok(planB,'reversing array order must not change batch eligibility');
 assert.deepEqual(new Set(planB.keys()),new Set(local));
});

test('one valid corridor survives multiple irrelevant expiring piercing shots',()=>{
 const local=shot(0);
 const remote=Array.from({length:7},(_,i)=>shot(1000+i*120));
 const g=world([local,...remote],50,120);
 g.tanks=[{id:2,x:40,y:0,cls:'scout',alive:true,hp:100},
          {id:3,x:65,y:0,cls:'scout',alive:true,hp:100}];
 const p=plan(g,.35/30,false);
 assert.ok(p,'single useful proof must survive unrelated expiring shots');
 assert.deepEqual([...p.keys()],[local]);
});

test('non-targeted piercing shots remain possible local interceptors',()=>{
 const local=shot(0);
 const crossing={...shot(-100,.2),x:10,vx:0,vy:20000,pen:1};
 const g=world([local,crossing,...Array.from({length:4},(_,i)=>shot(1000+i*160))],50,120);
 g.tanks=[{id:2,x:40,y:0,cls:'scout',alive:true,hp:100},
          {id:3,x:65,y:0,cls:'scout',alive:true,hp:100}];
 const p=plan(g,.35/30,false);
 assert.ok(p,'remote shots without eligible hulls must not starve the local proof');
 assert.ok(p.get(local).includes(crossing),
  'a projectile without eligible hulls can still intercept another shot');
});


test('one-hull piercing shot still vetoes a shared two-hull shortcut',()=>{
 const full=shot(0),partial={...shot(0),vx:3000};
 const g=world([full,partial,...Array.from({length:5},(_,i)=>shot(1000+i*160))],50,120);
 g.tanks=[{id:2,x:40,y:0,cls:'scout',alive:true,hp:100},
          {id:3,x:65,y:0,cls:'scout',alive:true,hp:100}];
 assert.equal(plan(g,.35/30,false),null,
  'an ineligible one-hit shot can still kill or weaken the shared first hull');
 g.bullets.reverse();
 assert.equal(plan(g,.35/30,false),null,'array order cannot bypass shared attribution');
});
