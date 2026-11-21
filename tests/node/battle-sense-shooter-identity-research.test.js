'use strict';
// RESEARCH ONLY: characterize shooter-ID reuse in event-time Battle Sense.
// This is a known-defect witness, NOT a desired gameplay acceptance criterion.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');

test('research: replacing a witnessed shooter with the same ID retains a stale crossfire memory',()=>{
 const g=bootGame();
 try{
  const shooter=g.player;
  const [observer,victim]=g.tanks.filter(t=>t!==shooter&&t.ai).slice(0,2);
  assert.ok(shooter&&observer&&victim);
  g.status='playing';g.paused=false;g.time=10;
  shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
  observer.x=-100;observer.y=0;victim.x=100;victim.y=0;
  g.tanks=[observer,shooter,victim];
  g.__novaFairVisibleTanks=g.tanks;
  g.__novaFairShotWitnesses=g.tanks;
  g.areHostile=()=>true;g.areAllies=()=>false;
  g.hasLineOfSight=()=>true;
  const before=g.bullets.length;
  g.tryFire(shooter);
  assert.ok(g.bullets.length>before,'the source game must create a projectile');
  assert.equal(observer.ai.__v181ObservedShotVictims?.has(victim),true,
   'control: witness recorded the original victim');
  g.time=10.5;
  const sense=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
  const initial=sense.thirdPartyVector(g,observer,shooter,{}).weight;
  assert.equal(initial,.62,'control: the real original shooter produces crossfire');
  // A new object inherits the numerical ID but never fired the witnessed shot.
  const replacement={...shooter,id:shooter.id,x:0,y:0,alive:true};
  assert.notEqual(replacement,shooter);
  g.tanks=[observer,replacement,victim];
  g.__novaFairVisibleTanks=g.tanks;
  g.__novaFairShotWitnesses=g.tanks;
  const stale=sense.thirdPartyVector(g,observer,replacement,{}).weight;
  const distinctId={...replacement,id:shooter.id+50000};
  assert.equal(sense.thirdPartyVector(g,observer,distinctId,{}).weight,0,
   'negative control: unrelated numerical ID must not inherit the shot');
  const replacedVictim={...victim,id:victim.id};
  g.tanks=[observer,replacement,replacedVictim];
  g.__novaFairVisibleTanks=g.tanks;
  assert.equal(sense.thirdPartyVector(g,observer,replacement,{}).weight,0,
   'negative control: weak victim identity must reject replacement victim');
  assert.equal(stale,.62,
   'KNOWN PROTOTYPE DEFECT: ID reuse impersonates a witnessed shooter');
 }finally{g.destroy();}
});
