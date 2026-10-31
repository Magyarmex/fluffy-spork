'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const audit=require('../browser/bomber-burst-audit.js');
test('Bomber burst witness identifies actual callsites without inventing physical causes',()=>{
 assert.equal(audit.siteFromStack('Error\n at Game.updateBullets (https://host/nova-updates/battlefield-v1.6.0.js:928:17)'),'battlefield-v1.6.0.js:928');
 assert.equal(audit.siteFromStack('Error\n at Game.updateBullets (https://host/index.html:3500:12)'),'index.html:3500');
 assert.equal(audit.siteFromStack('Error\n at unrelated.js:1:2'),'unknown');
 assert.equal(audit.source('battlefield-v1.6.0.js:928'),'battlefield');
 assert.equal(audit.source('index.html:3500'),'core');
 assert.equal(audit.siteFromStack('Error\n at Object.clusterBurst (https://host/tests/browser/bomber-burst-audit.js:28:4)\n at Game.updateBullets (https://host/nova-updates/disciplines-v1.7.0.js:438:9)'),'disciplines-v1.7.0.js:438');
 assert.equal(audit.source('disciplines-v1.7.0.js:438'),'disciplines');
 assert.equal(audit.source('sniper-v1.2.0.js:12'),'other');
});
test('Bomber witness is read-only, preserves return value, child identity and consumed calls',()=>{
 const parent={ownerId:7,ttl:.1,x:10,y:20,shell:true};
 const g={time:5,bullets:[parent],clusterBurst(b){
  if(b.__novaClusterBurstConsumed)return 'already';
  b.__novaClusterBurstConsumed=true;
  this.bullets.push({id:44,ownerId:b.ownerId});
  return 'burst';
 }};
 const original=g.clusterBurst;
 const a=audit.install(g,audit.create(7),()=> 'Error\n at x (https://host/nova-updates/battlefield-v1.6.0.js:999:2)');
 assert.equal(g.clusterBurst(parent),'burst');
 assert.equal(g.clusterBurst(parent),'already');
 assert.equal(g.bullets.length,2);
 assert.equal(g.bullets[1].id,44);
 assert.equal(a.calls,2);assert.equal(a.firstBursts,1);assert.equal(a.suppressedCalls,1);
 assert.equal(a.childrenCreated,1);
 assert.deepEqual(a.byOwner,{pilot:1,other:0,unknown:0});
 assert.deepEqual(a.bySource,{battlefield:1,core:0,disciplines:0,other:0,unknown:0});
 assert.deepEqual(a.byTTL,{positive:1,expired:0,unknown:0});
 assert.equal(a.examples.length,1);
 assert.equal(g.clusterBurst({ownerId:8,ttl:-.01,x:0,y:0,shell:true}), 'burst');
 assert.equal(a.byOwner.other,1);assert.equal(a.byTTL.expired,1);
 assert.equal(a.bySource.battlefield,2);
 assert.equal(a.calls,3);assert.equal(a.firstBursts,2);
 assert.notEqual(g.clusterBurst,original);
});
test('Bomber witness does not sample RNG or change gameplay if source is unknown',()=>{
 let draws=0;const saved=Math.random;Math.random=()=>{draws++;return .5;};
 try{
  const g={bullets:[],clusterBurst(){return 42;}};
  const a=audit.install(g,audit.create(1),()=> 'Error');
  const b={ownerId:1,ttl:0,x:0,y:0};
  assert.equal(g.clusterBurst(b),42);
  assert.equal(draws,0);assert.equal(a.bySource.unknown,1);
  assert.equal(a.byTTL.expired,1);assert.equal(a.childrenCreated,0);
 }finally{Math.random=saved;}
});

test('5,000 seeded burst sequences preserve projectile state and random-stream consumption',()=>{
 function world(){
  let seed=0x9e3779b9,draws=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;draws++;return seed/4294967296;};
  const g={time:12,bullets:[],clusterBurst(b){
   if(b.__novaClusterBurstConsumed)return 'repeat';
   b.__novaClusterBurstConsumed=true;
   const child={id:this.bullets.length+1,ownerId:b.ownerId,
    vx:Math.floor(random()*1000),vy:Math.floor(random()*1000)};
   this.bullets.push(child);return 'created';
  }};
  return {g,draws:()=>draws,seed:()=>seed};
 }
 const base=world(),instrumented=world();
 const report=audit.install(instrumented.g,audit.create(1),
  ()=> 'Error\n at Game.updateBullets (https://host/index.html:3761:8)');
 for(let i=0;i<5000;i++){
  const parent={id:i,ownerId:i%3===0?1:2,ttl:i%2?.1:-.1,x:i,y:0};
  const copy={...parent};
  base.g.bullets.push(parent);instrumented.g.bullets.push(copy);
  assert.equal(instrumented.g.clusterBurst(copy),base.g.clusterBurst(parent));
  if(i%7===0)
   assert.equal(instrumented.g.clusterBurst(copy),base.g.clusterBurst(parent));
 }
 assert.equal(JSON.stringify(instrumented.g.bullets),JSON.stringify(base.g.bullets),
  'research witness must not change projectile state or ordering');
 assert.equal(instrumented.draws(),base.draws(),'no extra gameplay RNG calls');
 assert.equal(instrumented.seed(),base.seed(),'identical final gameplay RNG state');
 assert.equal(report.firstBursts,5000);
 assert.equal(report.suppressedCalls,Math.ceil(5000/7));
 assert.equal(report.bySource.core,5000);
 assert.ok(report.examples.length<=20,'bounded artifact examples');
});


test('Airburst witness counts actual birth-frame movement, abstention and mixed outcomes without changing simulation',()=>{
 function world(mode){
  const shell={id:1,ownerId:7,x:100,y:0,px:95,py:0,ttl:.5,shell:true};
  return {time:9,bullets:[shell],
   clusterBurst(parent){
    parent.__novaClusterBurstConsumed=true;
    const n=mode==='empty'?0:2;
    for(let i=0;i<n;i++)this.bullets.push({id:10+i,ownerId:7,
     x:100,y:0,px:100,py:0,ttl:.7,vx:120+i*40,vy:0});
   },
   updateBullets(dt){
    this.clusterBurst(this.bullets[0]);
    for(let i=1;i<this.bullets.length;i++){
     if(mode==='stationary'||mode==='empty'||(mode==='mixed'&&i===2))continue;
     const c=this.bullets[i];c.x+=c.vx*dt*.65;c.ttl-=dt*.65;
    }
   }};
 }
 for(const mode of ['advanced','stationary','mixed','empty']){
  const base=world(mode),g=world(mode),a=audit.create(7);
  audit.install(g,a,()=> 'Error\n at Game.updateBullets (https://host/nova-updates/disciplines-v1.7.0.js:500:12)');
  base.updateBullets(1/60);g.updateBullets(1/60);
  assert.deepEqual(g.bullets,base.bullets,mode+' must preserve actual projectiles');
  assert.equal(a.airburst.calls,1);
  assert.equal(a.airburst.sole,1);
  assert.equal(a.airburst.byOwner.pilot,1);
  assert.equal(a.airburst[mode==='empty'?'noChildren':mode],1);
  assert.equal(a.airburst.advancedChildren,mode==='advanced'?2:mode==='mixed'?1:0);
  assert.equal(a.airburst.observerErrors,0);
  assert.equal(a.airburst.gates.soleWithoutRewound,1,
   'non-Cannon synthetic parent cannot pretend to be a physical fuse crossing');
 }
});


test('Actual Three Disciplines module produces witnessed clear-corridor advances and safe abstentions',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
 const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/disciplines-v1.7.0.js'),'utf8');
 function Game(){
  this.time=10;this.bullets=[];this.__novaTerrain=[];this.tanks=[];
  this.shapes=[];this.drones=[];this.cam={};this.sfx={novaFuseBurst(){}};
 }
 Game.prototype.firstTerrainHit=()=>null;
 Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id);};
 Game.prototype.updateBullets=function(dt){
  for(const b of this.bullets){b.px=b.x;b.py=b.y;b.x+=b.vx*dt;b.y+=b.vy*dt;b.ttl-=dt;}
 };
 Game.prototype.clusterBurst=function(parent){
  if(parent.__novaClusterBurstConsumed)return;
  parent.__novaClusterBurstConsumed=true;
  for(let i=0;i<6;i++)this.bullets.push({id:100+i,ownerId:parent.ownerId,
   x:parent.x,y:parent.y,px:parent.x,py:parent.y,
   vx:100+i*15,vy:0,r:2,ttl:.7,dead:false});
 };
 for(const n of ['tryFire','useAbility','damageTank','bodyDamage','update','addRing','addText'])
  Game.prototype[n]=function(){};
 const classes={CLASSES:{bomber:{size:17,bullet:{cluster:6}},scout:{size:14}},
  lineageForClass:cls=>cls==='bomber'?'cannon':'scout'};
 const mods={'game/classes':module=>{module.exports=classes;},
  'game/engine':module=>{module.exports={Game};}};
 vm.runInNewContext(source,{window:{__novaModules:mods},console:{error(){},info(){}}});
 const module={exports:{}};
 mods['game/engine'](module,module.exports,spec=>{
  if(spec==='./classes')return classes;throw Error('unexpected dependency '+spec);
 });
 const Patched=module.exports.Game;
 function make(mode,hz){
  const g=new Patched(),dt=1/hz,speed=2000;
  g.tanks=[{id:1,cls:'bomber',alive:true,x:-500,y:-500}];
  if(mode==='near')g.shapes=[{id:50,hp:100,r:10,x:150,y:0,vx:0,vy:0}];
  if(mode==='remoteDrone')g.drones=[{id:51,ownerId:9,hp:100,
   x:900,y:900,r:6}];
  if(mode==='remoteShapeNoVelocity')g.shapes=[{id:52,hp:100,
   x:900,y:900,r:6}];
  if(mode==='fragmentTerrain')g.__novaTerrain=[{id:53,shape:'rect',
   x:152,y:0,w:1,h:2,solid:true,destructible:false}];
  g.bullets=[{id:70,ownerId:1,x:150-speed*dt*.35,y:0,vx:speed,vy:0,
   r:3,ttl:1,pen:0,hits:0,shell:true,dead:false,
   __v17Cannon:true,__v17FuseDist:150,__v17SpawnX:0,__v17SpawnY:0,
   __v17FuseArmed:true}];
  if(mode==='two')g.bullets.push({id:90,ownerId:5,x:900,y:900,
   px:900,py:900,vx:0,vy:0,r:3,ttl:1,dead:false});
  return g;
 }
 for(const hz of [30,60,120,240])for(const mode of ['clear','near','two']){
  const baseline=make(mode,hz),g=make(mode,hz),a=audit.create(1);
  audit.install(g,a,()=> 'Error\n at Game.updateBullets (https://host/nova-updates/disciplines-v1.7.0.js:500:12)');
  baseline.updateBullets(1/hz);g.updateBullets(1/hz);
  assert.deepEqual(g.bullets,baseline.bullets,
   'research observer changed '+mode+' physical game at '+hz+'Hz');
  assert.equal(a.bySource.disciplines,1);
  assert.equal(a.airburst.calls,1);
  assert.equal(a.airburst.sole,mode==='two'?0:1);
  assert.equal(a.airburst.advanced,mode==='clear'?1:0);
  assert.equal(a.airburst.stationary,mode==='clear'?0:1);
  assert.equal(a.airburst.advancedChildren,mode==='clear'?6:0);
  assert.equal(a.airburst.gates.soleCleanNoNearby,mode==='clear'?1:0);
  assert.equal(a.airburst.gates.soleCleanNearShape,mode==='near'?1:0);
  assert.equal(a.airburst.gates.soleCleanNearAny,mode==='near'?1:0);
  assert.equal(a.airburst.observerErrors,0);
 }
 for(const [mode,key] of [
  ['remoteDrone','missingDroneVelocity'],
  ['remoteShapeNoVelocity','missingShapeVelocity'],
  ['fragmentTerrain','fragmentTerrainProximity']]){
  const baseline=make(mode,60),g=make(mode,60),a=audit.create(1);
  audit.install(g,a,()=> 'Error\n at Game.updateBullets (https://host/nova-updates/disciplines-v1.7.0.js:500:12)');
  baseline.updateBullets(1/60);g.updateBullets(1/60);
  assert.deepEqual(g.bullets,baseline.bullets,
   'diagnostic must not change '+mode+' physical gameplay');
  assert.equal(a.airburst.veto.eligible,1,mode+' belongs to eligible cohort');
  assert.equal(a.airburst.veto.counts[key],1,mode+' must witness sufficient veto');
  assert.equal(a.airburst.veto.counts.noWitnessedSufficientVeto,0);
  assert.equal(a.airburst.stationary,1);
  assert.equal(a.airburst.observerErrors,0);
 }
});

test('10,000 randomized sufficient-veto witnesses never contradict the actual shipping clearance helper',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/disciplines-v1.7.0.js'),'utf8');
 const start=source.indexOf('  function advanceClearFuseChildren(');
 const end=source.indexOf('\n  var oldBullets=Game.prototype.updateBullets;',start);
 assert.ok(start>=0&&end>start,'shipping clearance owner must be present');
 const helper=new Function('C','clamp',source.slice(start,end)+
  ';return advanceClearFuseChildren;')(
  {scout:{size:14},bomber:{size:17}},
  (v,lo,hi)=>Math.max(lo,Math.min(hi,v)));
 let seed=0x1d4c31a5;
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  return seed/4294967296;};
 const dt=1/60,speed=2000,prev=150-speed*dt*.35;
 let witnessed=0,clear=0,overlaps=0;
 for(let i=0;i<10000;i++){
  const parent={x:150,y:0,px:prev,py:0,vx:speed,vy:0,r:3,ownerId:1};
  const children=Array.from({length:6},(_,k)=>({
   x:150,y:0,px:150,py:0,vx:100+k*20,vy:0,r:2,
   ttl:.7,ownerId:1,dead:false,shell:false,beam:false}));
  const g={time:1,bullets:[parent,...children],__novaTerrain:[],
   tanks:[{id:1,cls:'bomber',alive:true,x:-500,y:-500}],
   shapes:[],drones:[],firstTerrainHit(){return null;}};
  for(let k=0,n=Math.floor(rnd()*5);k<n;k++){
   const e={x:150+(rnd()-.5)*1000,y:(rnd()-.5)*1000,
    r:5+rnd()*20,hp:100,vx:(rnd()-.5)*500,vy:(rnd()-.5)*500};
   if(rnd()<.08)delete e.vx;g.shapes.push(e);
  }
  for(let k=0,n=Math.floor(rnd()*3);k<n;k++){
   const e={x:150+(rnd()-.5)*1000,y:(rnd()-.5)*1000,
    r:7,hp:100,ownerId:2,vx:(rnd()-.5)*600,vy:(rnd()-.5)*600};
   if(rnd()<.3)delete e.vx;g.drones.push(e);
  }
  for(let k=0,n=Math.floor(rnd()*3);k<n;k++){
   const e={id:2+k,cls:'scout',alive:true,
    x:150+(rnd()-.5)*1000,y:(rnd()-.5)*1000,
    vx:(rnd()-.5)*500,vy:(rnd()-.5)*500};
   if(rnd()<.05)delete e.vx;g.tanks.push(e);
  }
  if(rnd()<.25)g.__novaTerrain.push({shape:'rect',solid:true,
   x:150+(rnd()-.5)*600,y:(rnd()-.5)*600,
   w:10+rnd()*50,h:10+rnd()*50});
  const flags=audit.vetoEvidence(g,parent,dt,children);
  const any=Object.entries(flags).some(([k,v])=>
   k!=='noWitnessedSufficientVeto'&&v);
  helper(g,parent,1,dt,.35,true);
  const moved=children.every(c=>c.x!==150);
  if(any){witnessed++;assert.equal(moved,false,
   'sufficient veto must never coexist with certified advance at case '+i);}
  else clear++;
  if(Object.values(flags).filter(Boolean).length>1)overlaps++;
 }
 assert.ok(witnessed>4000&&clear>4000&&overlaps>1000,
  'randomized test must exercise both decisions and overlapping vetoes');
});
