'use strict';
// Research-only production-candidate regression on the composed 49-overlay Game.
// This source overlay is NOT materialized in the published HTML.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
// Importing the composed Game fixture must not register its unrelated audio RNG test.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const root=path.resolve(__dirname,'../..');
function tank(id,x,y,ai){return {id,x,y,alive:true,hp:100,maxHp:100,cls:'twin',ai};}
function scene(){
 const g=bootGame(),helper=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
 assert.equal(typeof helper?.thirdPartyVector,'function',
  'shipping Battle Sense test seam must be loaded in composed Game');
 const observer=tank(9001,-200,0,{
  __v181ObservedShotId:9002,__v181ObservedShotAt:10,
  __v181ObservedShotAngle:0,__v181ObservedShotX:0,__v181ObservedShotY:0});
 const target=tank(9002,0,0,{});
 const third=tank(9003,0,100,{});
 observer.ai.__v181ObservedShotVictims=new WeakSet();
 g.time=10.5;
 g.tanks=[observer,target,third];
 g.__novaFairVisibleTanks=g.tanks;
 g.areHostile=()=>true;
 g.areAllies=()=>false;
 g.hasLineOfSight=()=>true;
 return {g,helper,observer,target,third,
  weight:()=>helper.thirdPartyVector(g,observer,target,{}).weight};
}
test('composed Battle Sense: moving victim into old shot cannot invent crossfire',()=>{
 const w=scene();
 try{
  assert.equal(w.weight(),0,'north-of-shot third party was not in eastbound firing lane');
  w.third.x=100;w.third.y=0;
  assert.equal(w.weight(),0,
   'later victim position must not invent an event-time witnessed duel');
  assert.equal(w.observer.ai.__v181ObservedShotX,0);
  assert.equal(w.observer.ai.__v181ObservedShotAngle,0);
  w.g.time=11.250001;
  assert.equal(w.weight(),0,'existing 1.25-second expiry must still constrain the effect');
 }finally{w.g.destroy();}
});
test('composed Battle Sense: victim departure preserves genuine witnessed firing lane',()=>{
 const w=scene();
 try{
  w.third.x=100;w.third.y=0;
  w.observer.ai.__v181ObservedShotVictims=new WeakSet([w.third]);
  assert.equal(w.weight(),.62,'eastbound shot was toward firing-time third party');
  w.third.x=0;w.third.y=100;
  assert.equal(w.weight(),.62,
   'later victim position must not erase a real event-time witnessed duel');
  w.third.x=100;w.third.y=0;
  w.g.__novaFairVisibleTanks=[w.observer,w.target];
  assert.equal(w.weight(),0,'offscreen third party must not be used for crossfire');
  w.g.__novaFairVisibleTanks=w.g.tanks;
  w.g.hasLineOfSight=()=>false;
  assert.equal(w.weight(),0,'cover must still veto the inferred crossfire');
 }finally{w.g.destroy();}
});
test('real composed projectile birth does not recognize a victim absent at firing time',()=>{
 const g=bootGame(),helper=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
 try{
  const shooter=g.player;
  const observer=g.tanks.find(t=>t!==shooter&&t.ai);
  assert.ok(shooter&&observer,'composed Game must provide a player and AI witness');
  const third=tank(9003,0,100,{});
  g.time=10;g.status='playing';g.paused=false;
  shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
  g.cam.x=0;g.cam.y=0;g.cam.zoom=1;
  observer.x=-100;observer.y=0;
  g.hasLineOfSight=()=>true;
  g.tanks=[observer,shooter];
  g.__novaFairShotWitnesses=g.tanks;
  const before=g.bullets.length;
  g.tryFire(shooter);
  assert.ok(g.bullets.length>before,'actual shipping Game must emit a projectile');
  assert.equal(observer.ai.__v181ObservedShotId,shooter.id);
  assert.equal(observer.ai.__v181ObservedShotX,0);
  assert.equal(observer.ai.__v181ObservedShotY,0);
  assert.equal(observer.ai.__v181ObservedShotAngle,0);
  assert.equal(observer.ai.__v181ObservedShotVictims,null);
  assert.equal((observer.ai.__v181ObservedShotVictims?.has(third)===true),false);
  assert.equal(observer.ai.__v181ObservedShotVictimCount,0,
   'empty witness memory must not allocate a retaining collection');
  g.tanks=[observer,shooter,third];
  g.__novaFairVisibleTanks=g.tanks;
  g.areHostile=()=>true;g.areAllies=()=>false;
  g.time=10.5;
  assert.equal(helper.thirdPartyVector(g,observer,shooter,{}).weight,0);
  third.x=100;third.y=0;
  assert.equal(helper.thirdPartyVector(g,observer,shooter,{}).weight,0,
   'victim movement must not invent a witness after a real shot birth');
 }finally{g.destroy();}
});
test('real projectile birth records event-time observer-visible third party',()=>{
 const g=bootGame(),helper=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
 try{
  const shooter=g.player,observer=g.tanks.find(t=>t!==shooter&&t.ai);
  assert.ok(shooter&&observer);
  const third=tank(9003,100,0,{});
  g.time=10;g.status='playing';g.paused=false;
  shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
  observer.x=-100;observer.y=0;
  g.tanks=[observer,shooter,third];g.__novaFairVisibleTanks=g.tanks;
  g.areHostile=()=>true;g.areAllies=()=>false;g.hasLineOfSight=()=>true;
  g.__novaFairShotWitnesses=g.tanks;
  const before=g.bullets.length;g.tryFire(shooter);
  assert.ok(g.bullets.length>before);
  assert.ok((observer.ai.__v181ObservedShotVictims?.has(third)===true),
   'observer must have seen the victim inside the actual firing-time lane');
  g.time=10.5;third.x=0;third.y=100;
  assert.equal(helper.thirdPartyVector(g,observer,shooter,{}).weight,.62,
   'moving away after firing must not erase the witnessed duel');
 }finally{g.destroy();}
});
test('a victim hidden at firing time cannot become a retroactive witness',()=>{
 const g=bootGame(),helper=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
 try{
  const shooter=g.player,observer=g.tanks.find(t=>t!==shooter&&t.ai);
  assert.ok(shooter&&observer);
  const third=tank(9003,100,0,{});
  g.time=10;g.status='playing';g.paused=false;
  shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
  observer.x=-100;observer.y=0;
  g.tanks=[observer,shooter,third];g.__novaFairVisibleTanks=g.tanks;
  g.areHostile=()=>true;g.areAllies=()=>false;
  g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===observer.x&&ay===observer.y&&bx===third.x&&by===third.y);
  g.__novaFairShotWitnesses=g.tanks;
  const before=g.bullets.length;g.tryFire(shooter);
  assert.ok(g.bullets.length>before);
  assert.equal(observer.ai.__v181ObservedShotId,shooter.id,
   'observer can see the shooter firing');
  assert.equal((observer.ai.__v181ObservedShotVictims?.has(third)===true),false,
   'occluded victim was not visible to this observer at shot birth');
  g.hasLineOfSight=()=>true;g.time=10.5;
  assert.equal(helper.thirdPartyVector(g,observer,shooter,{}).weight,0,
   'later cover removal cannot reveal historical firing-time victim knowledge');
 }finally{g.destroy();}
});
test('a victim outside observer viewport at shot time cannot appear retroactively',()=>{
 const g=bootGame(),helper=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
 try{
  const shooter=g.player,observer=g.tanks.find(t=>t!==shooter&&t.ai);
  assert.ok(shooter&&observer);
  const third=tank(9003,600,0,{});
  g.time=10;g.status='playing';g.paused=false;g.w=800;g.h=600;
  shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
  observer.x=-100;observer.y=0;
  g.tanks=[observer,shooter,third];g.__novaFairVisibleTanks=g.tanks;
  g.areHostile=()=>true;g.areAllies=()=>false;g.hasLineOfSight=()=>true;
  g.__novaFairShotWitnesses=g.tanks;
  const before=g.bullets.length;g.tryFire(shooter);
  assert.ok(g.bullets.length>before);
  assert.equal(observer.ai.__v181ObservedShotId,shooter.id);
  assert.equal((observer.ai.__v181ObservedShotVictims?.has(third)===true),false,
   'off-viewport victim must not enter event-time public witness memory');
  third.x=100;g.time=10.5;
  assert.equal(helper.thirdPartyVector(g,observer,shooter,{}).weight,0,
   'entering the viewport later cannot reveal a historical duel');
 }finally{g.destroy();}
});
test('cached candidate never bypasses trusted shot origin and bearing',()=>{
 const w=scene();
 try{
  w.third.x=100;w.third.y=0;
  w.observer.ai.__v181ObservedShotVictims=new WeakSet([w.third]);
  assert.equal(w.weight(),.62);
  w.observer.ai.__v181ObservedShotAngle=NaN;
  assert.equal(w.weight(),0,'invalid historical bearing cannot authenticate cached duel');
  w.observer.ai.__v181ObservedShotAngle=0;
  w.observer.ai.__v181ObservedShotX=NaN;
  assert.equal(w.weight(),0,'invalid historical origin cannot authenticate cached duel');
 }finally{w.g.destroy();}
});
test('missing or malformed historical victim memory fails closed rather than tracking later motion',()=>{
 const w=scene();
 try{
  w.third.x=100;w.third.y=0;
  for(const legacy of [undefined,{},'legacy',42,{has(){return true;}},new Set([w.third]),[w.third]]){
   w.observer.ai.__v181ObservedShotVictims=legacy;
   assert.equal(w.weight(),0,'untrusted legacy witness memory must not infer a new duel');
   w.third.x=0;w.third.y=100;
   assert.equal(w.weight(),0,'later movement must not change the fail-closed result');
   w.third.x=100;w.third.y=0;
  }
  w.observer.ai.__v181ObservedShotVictims=new WeakSet([w.third]);
  assert.equal(w.weight(),.62,'valid event-time candidate remains effective');
 }finally{w.g.destroy();}
});
test('two observers receive different public victim memories for the same shot',()=>{
 const g=bootGame();
 try{
  const shooter=g.player,observers=g.tanks.filter(t=>t!==shooter&&t.ai).slice(0,2);
  assert.equal(observers.length,2);
  const [a,b]=observers,third=tank(9003,100,0,{});
  g.time=10;g.status='playing';g.paused=false;
  shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
  a.x=-100;a.y=0;b.x=-150;b.y=100;
  g.tanks=[a,b,shooter,third];g.__novaFairVisibleTanks=g.tanks;
  g.areHostile=()=>true;g.areAllies=()=>false;
  g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===b.x&&ay===b.y&&bx===third.x&&by===third.y);
  g.__novaFairShotWitnesses=g.tanks;
  const before=g.bullets.length;g.tryFire(shooter);
  assert.ok(g.bullets.length>before);
  assert.equal(a.ai.__v181ObservedShotId,shooter.id);
  assert.equal(b.ai.__v181ObservedShotId,shooter.id);
  assert.ok((a.ai.__v181ObservedShotVictims?.has(third)===true),
   'observer A saw the victim in the shot lane');
  assert.equal((b.ai.__v181ObservedShotVictims?.has(third)===true),false,
   'observer B cannot inherit A\'s victim knowledge through cover');
 }finally{g.destroy();}
});
test('dead victim and replacement with reused ID cannot inherit a shot witness',()=>{
 const w=scene();
 try{
  w.third.x=100;w.third.y=0;
  w.observer.ai.__v181ObservedShotVictims=new WeakSet([w.third]);
  assert.equal(w.weight(),.62);
  w.third.alive=false;
  assert.equal(w.weight(),0,'dead victim cannot remain an active crossfire contact');
  const replacement=tank(w.third.id,100,0,{});
  w.g.tanks=[w.observer,w.target,replacement];
  w.g.__novaFairVisibleTanks=w.g.tanks;
  assert.equal(w.weight(),0,
   'new tank object with reused ID cannot inherit old event-time witness');
 }finally{w.g.destroy();}
});
test('research fixture uses canonical materialized 49-overlay composition',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const scripts=[...html.matchAll(/<script[^>]+src=["']\.\/(nova-updates\/[^"']+)["']/g)];
 assert.equal(scripts.length,49);
 assert.ok(scripts.some(x=>x[1]==='nova-updates/battle-sense-v1.8.1.js'));
});
