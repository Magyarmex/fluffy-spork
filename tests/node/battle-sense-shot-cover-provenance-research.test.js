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
