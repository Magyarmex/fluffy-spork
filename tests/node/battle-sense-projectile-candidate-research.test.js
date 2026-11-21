'use strict';
// RESEARCH ONLY. Actual materialized 49-overlay Game, real projectiles and terrain.
// Does not change gameplay or establish blast/cluster/moving-target correctness.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const {projectileCandidate}=require('../research/battle-sense-projectile-candidate.cjs');
function arm({wall=false,shotgun=false,vy=0}={}){
 const g=bootGame();
 const shooter=g.player,observer=g.tanks.find(t=>t!==shooter&&t.ai);
 const victim=g.tanks.find(t=>t!==shooter&&t!==observer&&t.ai);
 assert.ok(shooter&&observer&&victim);
 g.sfx.muted=true;g.status='playing';g.paused=false;g.time=10;
 shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
 victim.x=100;victim.y=vy;victim.alive=true;
 observer.x=0;observer.y=100;
 g.tanks=[shooter,observer,victim];
 g.__novaFairShotWitnesses=g.tanks;
 g.__novaFairVisibleTanks=g.tanks;
 g.areHostile=()=>true;g.areAllies=()=>false;
 if(shotgun)g.setClass(shooter,'shotgun');
 // Isolate the exact fixture geometry from whichever random arena boot selected.
 g.__novaTerrain=[];
 delete g.__novaBattlefieldIndex;delete g.__novaPerfTerrainIndex;
 if(wall){
  g.__novaTerrain=[{id:-9003,kind:'terrain',shape:'rect',type:'wall',
   x:50,y:0,w:20,h:36,solid:true,destructible:false,hp:0}];
  delete g.__novaBattlefieldIndex;delete g.__novaPerfTerrainIndex;
 }
 const before=g.bullets.length;
 g.tryFire(shooter);
 assert.ok(g.bullets.length>before,'composed Game must emit a real projectile');
 return {g,shooter,victim,observer,before};
}
test('research: real clear lane is eligible, permanent wall blocks birth-time lane',()=>{
 const clear=arm(),blocked=arm({wall:true});
 try{
  const c=projectileCandidate(clear.g,clear.shooter,clear.victim,clear.before);
  const b=projectileCandidate(blocked.g,blocked.shooter,blocked.victim,blocked.before);
  assert.equal(c.known,true);assert.equal(c.possible,true);
  assert.equal(b.known,true);assert.equal(b.possible,false);
  assert.ok(b.terrainChecks>0,'wall must be tested against actual emitted lane');
  assert.equal(blocked.observer.ai.__v181ObservedShotVictims?.has(blocked.victim),true,
   'control: current hull-cone prototype still accepts the blocked victim');
 }finally{clear.g.destroy();blocked.g.destroy();}
});
test('research: shotgun victim outside all pellet lanes is not eligible',()=>{
 const a=arm({shotgun:true,vy:55});
 try{
  const p=projectileCandidate(a.g,a.shooter,a.victim,a.before);
  assert.equal(p.known,true);assert.equal(p.possible,false);
  assert.equal(a.observer.ai.__v181ObservedShotVictims?.has(a.victim),true,
   'control: current broad hull-cone prototype still accepts off-pellet victim');
 }finally{a.g.destroy();}
});
test('research: no new shot and unsupported splash are not silently certified',()=>{
 const a=arm();
 try{
  const absent=projectileCandidate(a.g,a.shooter,a.victim,a.g.bullets.length);
  assert.equal(absent.known,false);assert.equal(absent.possible,false);
  const b=a.g.bullets[a.before];
  b.splash=90;
  const unsupported=projectileCandidate(a.g,a.shooter,a.victim,a.before);
  assert.equal(unsupported.known,false);
  assert.equal(unsupported.possible,false);
  assert.equal(unsupported.unsupported,1);
 }finally{a.g.destroy();}
});

test('research: 13-tank candidate scan adds no observer visibility rays',()=>{
 const a=arm();
 try{
  const bots=Array.from({length:12},(_,i)=>({
   ...a.victim,id:9100+i,x:80+i*9,y:(i%3-1)*9,alive:true
  }));
  a.g.tanks=[a.shooter,...bots];
  let los=0;const old=a.g.hasLineOfSight;
  a.g.hasLineOfSight=function(){los++;return old.apply(this,arguments);};
  const outcomes=bots.map(v=>projectileCandidate(a.g,a.shooter,v,a.before));
  assert.equal(outcomes.length,12);
  assert.ok(outcomes.every(o=>o.known),
   'ordinary emitted bullets must have enough physical data for every candidate');
  assert.equal(los,0,
   'projectile geometry prototype should not repeat observer×victim LOS probes');
  console.log('NOVA_PROJECTILE_CANDIDATE_RESEARCH '+JSON.stringify({
   victims:bots.length,possible:outcomes.filter(o=>o.possible).length,
   terrainChecks:outcomes.reduce((n,o)=>n+o.terrainChecks,0),los
  }));
 }finally{a.g.destroy();}
});
