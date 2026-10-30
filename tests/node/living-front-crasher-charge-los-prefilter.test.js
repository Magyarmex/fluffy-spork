'use strict';
// Exercise the real shipping Living Front Instincts module, not a copied Crasher implementation.
// A spatial-hash query can return a whole bucket: only physical charge contacts
// should pay for expensive terrain line-of-sight rays.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/living-front-instincts-v1.12.0.js'),'utf8');

function world(candidates,opts={}){
 const LF={
  clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
  lerp:(a,b,t)=>a+(b-a)*t,
  d2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2,
  alive:e=>!!e&&e.hp>0,
  query:()=>candidates,
  speed:()=>105,xp:()=>10,sectorIndex:()=>0,
  sectorCenter:()=>({x:0,y:0}),neighbors:()=>[],
  TAU:Math.PI*2,ARENA:2250,BOUNTY_CAP:100,
  BEHAVIOR_PERIOD:.1,ms:()=>0,planSample(){},wrap(){},addPressure(){}
 };
 const window={__NOVA_LIVING_FRONT_INTERNAL__:LF,__novaModules:{}};
 vm.runInNewContext(source,{window,console:{error(){},info(){}}},{filename:'living-front-instincts-v1.12.0.js'});
 const cr={kind:'shape',type:'crasher',id:1,x:0,y:0,r:15,
  hp:100,maxHp:100,vx:0,vy:0,__lfPredatorState:'charge',
  __lfPredatorT:.3,__lfTargetId:-1,__lfCommitAngle:0};
 const shapes=[cr,...candidates.filter(e=>e.kind==='shape'&&e.__testRealShape)];
 let los=0,damage=0;
 const g={time:2,shapes,tanks:candidates.filter(e=>e.kind==='tank'),
  bullets:[],hasLineOfSight(ax,ay,bx,by){los++;return !opts.blocked;},
  damageShape(e,n){damage++;e.hp-=n;}};
 const st={stats:{crasherCharges:0,crasherOvershoots:0,crasherHits:0,
  crasherMisses:0},sectors:[{pressure:0,maturity:0}]};
 LF.behaviorTick(g,st,{},1/60);
 return {cr,g,st,los,damage};
}
function irrelevant(n=120){
 return Array.from({length:n},(_,i)=>({
  kind:i%3===0?'bullet':i%3===1?'tank':'shape',
  type:i%3===2?'circle':undefined,
  id:100+i,x:160+i*.1,y:95+(i%7),r:8,hp:100,alive:true
 }));
}
test('Crasher charge raycasts only the one physically contacted shape, not 120 hash-bucket bystanders',()=>{
 const square={kind:'shape',type:'square',id:2,x:12,y:0,r:12,
  hp:80,maxHp:80,vx:0,vy:0,__testRealShape:true};
 const w=world([...irrelevant(),square]);
 assert.equal(w.los,1,'only a physical charge contact should require a terrain ray');
 assert.equal(w.damage,1);
 assert.equal(square.hp,58);
 assert.equal(w.cr.__lfChargeHit,true);
});
test('distant bullets, tanks and shapes require no Crasher charge LOS ray',()=>{
 const w=world(irrelevant(180));
 assert.equal(w.los,0);
 assert.equal(w.damage,0);
 assert.equal(w.cr.__lfChargeHit,undefined);
});
test('a near hostile tank remains a valid charge contact',()=>{
 const t={kind:'tank',id:3,x:12,y:0,r:15,hp:100,alive:true};
 const w=world([...irrelevant(),t]);
 assert.equal(w.los,1);
 assert.equal(w.damage,0,'core collision owner still handles tank damage');
 assert.equal(w.cr.__lfChargeHit,true);
});
test('solid terrain still blocks a physically close neutral hit',()=>{
 const s={kind:'shape',type:'square',id:4,x:12,y:0,r:12,
  hp:80,maxHp:80,vx:0,vy:0,__testRealShape:true};
 const w=world([...irrelevant(),s],{blocked:true});
 assert.equal(w.los,1);
 assert.equal(w.damage,0);
 assert.equal(s.hp,80);
 assert.equal(w.cr.__lfChargeHit,undefined);
});
test('ineligible near bullets and Hexagons never require terrain LOS or receive damage',()=>{
 const b={kind:'bullet',id:6,x:3,y:0,r:2,dead:false};
 const h={kind:'shape',type:'hexagon',id:7,x:8,y:0,r:22,hp:100,
  maxHp:100,__testRealShape:true};
 const w=world([b,h]);
 assert.equal(w.los,0);
 assert.equal(w.damage,0);
});
test('the audited Instincts module is wired once into the real materialized game',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.equal(html.split('src="./nova-updates/living-front-instincts-v1.12.0.js"').length-1,1);
 assert.ok(html.indexOf('living-front-core-v1.12.0.js')<
  html.indexOf('living-front-instincts-v1.12.0.js'));
});

test('real Living Front core + Instincts + hash and bullet-index composition avoids unrelated Crasher rays',()=>{
 const core=fs.readFileSync(path.join(root,'nova-updates/living-front-core-v1.12.0.js'),'utf8');
 for(const blocked of [false,true]){
  const window={__novaModules:{}};
  const context={window,Math,Map,Set,WeakMap,Number,Object,Array,Date,JSON,
   performance:{now:()=>0},console:{info(){},warn(){},error(){}}};
  vm.runInNewContext(core,context,{filename:'living-front-core-v1.12.0.js'});
  vm.runInNewContext(source,context,{filename:'living-front-instincts-v1.12.0.js'});
  const LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
  const cr={kind:'shape',type:'crasher',id:1,x:0,y:0,r:15,hp:100,maxHp:100,
   vx:0,vy:0,__lfPredatorState:'charge',__lfPredatorT:.3,
   __lfTargetId:-1,__lfCommitAngle:0};
  const square={kind:'shape',type:'square',id:2,x:12,y:0,r:12,
   hp:80,maxHp:80,vx:0,vy:0};
  const far={kind:'shape',type:'circle',id:3,x:160,y:95,r:12,
   hp:80,maxHp:80,vx:0,vy:0};
  const tank={kind:'tank',id:4,x:165,y:95,r:18,hp:100,maxHp:100,alive:true};
  const shot={kind:'bullet',id:5,x:30,y:0,r:3,dead:false,vx:100,vy:0,ttl:1};
  const calls=[];
  const g={time:10,shapes:[cr,square,far],tanks:[tank],bullets:[shot],
   hash:{query(_x,_y,_r,out){out.push(cr,square,far,tank);}},
   hasLineOfSight(ax,ay,bx,by){calls.push([ax,ay,bx,by]);return !(blocked&&ax===0&&ay===0);},
   damageShape(e,n){e.hp-=n;}};
  const defs={crasher:{speed:105},square:{speed:0},circle:{speed:60}};
  const st=LF.ensure(g,defs);
  LF.behaviorTick(g,st,defs,1/60);
  assert.ok(g.__lfBulletIndex&&g.__lfBulletIndex.querySeen instanceof WeakMap);
  assert.equal(calls.filter(c=>c[0]===0&&c[1]===0).length,1,
   'only the physically touched square should trigger a Crasher-origin LOS ray');
  assert.equal(square.hp,blocked?80:58);
  assert.equal(!!cr.__lfChargeHit,!blocked);
 }
});
