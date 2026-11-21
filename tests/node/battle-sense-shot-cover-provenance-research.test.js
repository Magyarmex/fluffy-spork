'use strict';
// RESEARCH ONLY: characterize an unsafe inference in PR #1085.
// These assertions describe the current candidate, NOT desired production behavior.
// Never merge as gameplay acceptance goldens; invert when projectile-path provenance is implemented.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
function unit(id,x,y,ai){return {id,x,y,alive:true,hp:100,maxHp:100,cls:'twin',ai};}
function fireScenario(blockShotLane){
 const g=bootGame();
 const shooter=g.player,observer=g.tanks.find(t=>t!==shooter&&t.ai);
 assert.ok(shooter&&observer);
 const victim=unit(9003,100,0,{});
 g.time=10;g.status='playing';g.paused=false;
 shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
 observer.x=-100;observer.y=0;
 g.tanks=[observer,shooter,victim];
 g.__novaFairVisibleTanks=g.tanks;
 g.__novaFairShotWitnesses=g.tanks;
 g.areHostile=()=>true;g.areAllies=()=>false;
 let shotLaneQueries=0;
 g.hasLineOfSight=(ax,ay,bx,by)=>{
  if(ax===shooter.x&&ay===shooter.y&&bx===victim.x&&by===victim.y){
   shotLaneQueries++;
   return !blockShotLane;
  }
  return true; // Both observer contacts remain publicly visible.
 };
 const before=g.bullets.length;
 g.tryFire(shooter);
 assert.ok(g.bullets.length>before,'real composed Game must emit a projectile');
 const witnessed=observer.ai.__v181ObservedShotVictims?.has(victim)===true;
 const birthQueries=shotLaneQueries;
 // Cover later disappears: current LOS cannot establish whether the old shot was blocked.
 g.hasLineOfSight=()=>true;
 g.time=10.5;
 const weight=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__.thirdPartyVector(g,observer,shooter,{}).weight;
 return {g,witnessed,weight,birthQueries};
}
test('research characterization: shooter-to-victim wall is absent from event-time witness gate',()=>{
 const clear=fireScenario(false),blocked=fireScenario(true);
 try{
  assert.equal(clear.witnessed,true,'unblocked control should witness an eastbound shot');
  assert.equal(clear.weight,.62);
  assert.equal(blocked.witnessed,true,
   'KNOWN CANDIDATE DEFECT: blocked shot is still recorded as a victim witness');
  assert.equal(blocked.weight,.62,
   'KNOWN CANDIDATE DEFECT: historically blocked shot induces crossfire after cover clears');
  assert.equal(blocked.birthQueries,0,
   'candidate never checks shooter-to-victim physical reachability at shot birth');
 }finally{clear.g.destroy();blocked.g.destroy();}
});

test('research characterization: real Battlefield wall blocks shot lane but not observer contacts',()=>{
 const g=bootGame();
 try{
  const shooter=g.player,observer=g.tanks.find(t=>t!==shooter&&t.ai);
  assert.ok(shooter&&observer);
  const victim=unit(9003,100,0,{});
  g.time=10;g.status='playing';g.paused=false;
  shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
  observer.x=0;observer.y=100;
  g.tanks=[observer,shooter,victim];
  g.__novaFairVisibleTanks=g.tanks;
  g.__novaFairShotWitnesses=g.tanks;
  g.areHostile=()=>true;g.areAllies=()=>false;
  // Real Battlefield rect: shot travels through x=50,y=0; the
  // observer-to-victim diagonal crosses x=50,y=50 above the wall.
  const wall={id:-9003,kind:'terrain',shape:'rect',type:'wall',
   x:50,y:0,w:20,h:36,solid:true,destructible:false,hp:0};
  g.__novaTerrain=[wall];
  delete g.__novaBattlefieldIndex;
  delete g.__novaPerfTerrainIndex;
  assert.equal(g.hasLineOfSight(shooter.x,shooter.y,victim.x,victim.y,2),false,
   'actual Battlefield geometry must occlude the shot corridor');
  assert.equal(g.hasLineOfSight(observer.x,observer.y,shooter.x,shooter.y,2),true);
  assert.equal(g.hasLineOfSight(observer.x,observer.y,victim.x,victim.y,2),true,
   'the observer legitimately sees both combatants around the wall');
  assert.ok(g.firstTerrainHit(0,0,100,0,2),
   'physical swept projectile segment must intersect the same permanent wall');
  const before=g.bullets.length;
  g.tryFire(shooter);
  assert.ok(g.bullets.length>before,'composed Game must emit a real projectile');
  assert.equal(observer.ai.__v181ObservedShotVictims?.has(victim),true,
   'KNOWN CANDIDATE DEFECT: event-time witness ignores physical shot obstruction');
  wall.solid=false;
  assert.equal(g.hasLineOfSight(0,0,100,0,2),true,
   'removing cover should make the current corridor clear');
  g.time=10.5;
  assert.equal(g.__testWindow.__NOVA_BATTLE_SENSE_TEST__
   .thirdPartyVector(g,observer,shooter,{}).weight,.62,
   'KNOWN CANDIDATE DEFECT: a historically obstructed shot creates later crossfire');
 }finally{g.destroy();}
});

test('research characterization: shotgun hull cone can witness a lane with no pellet',()=>{
 const g=bootGame();
 try{
  const shooter=g.player,observer=g.tanks.find(t=>t!==shooter&&t.ai);
  assert.ok(shooter&&observer);
  g.setClass(shooter,'shotgun');
  const victim=unit(9003,100,55,{});
  g.time=10;g.status='playing';g.paused=false;
  shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
  observer.x=0;observer.y=100;
  g.tanks=[observer,shooter,victim];
  g.__novaFairVisibleTanks=g.tanks;
  g.__novaFairShotWitnesses=g.tanks;
  g.areHostile=()=>true;g.areAllies=()=>false;
  g.hasLineOfSight=()=>true;
  const before=g.bullets.length;
  g.tryFire(shooter);
  const pellets=g.bullets.slice(before).filter(b=>b&&
   Number.isFinite(b.vx)&&Number.isFinite(b.vy)&&Math.hypot(b.vx,b.vy)>1);
  assert.ok(pellets.length>=3,'real shotgun must emit a multi-pellet volley');
  const toward=Math.atan2(victim.y-shooter.y,victim.x-shooter.x);
  const nearest=Math.min(...pellets.map(b=>
   Math.abs(Math.atan2(Math.sin(Math.atan2(b.vy,b.vx)-toward),
                      Math.cos(Math.atan2(b.vy,b.vx)-toward)))));
  assert.ok(nearest>.15,
   'fixture must place the victim outside every real pellet direction');
  assert.equal(observer.ai.__v181ObservedShotVictims?.has(victim),true,
   'KNOWN CANDIDATE DEFECT: a hull-cone candidate lacks projectile-bearing provenance');
 }finally{g.destroy();}
});
