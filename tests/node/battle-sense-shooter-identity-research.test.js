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

test('research: a replacement shooter also inherits an observed reload-punish window',()=>{
 const g=bootGame();
 try{
  const shooter=g.player,observer=g.tanks.find(t=>t!==shooter&&t.ai);
  assert.ok(shooter&&observer);
  g.hasLineOfSight=()=>true;
  g.time=10.2;
  shooter.x=0;shooter.y=0;shooter.cls='twin';
  observer.x=-100;observer.y=0;
  observer.ai.__v181ObservedShotId=shooter.id;
  observer.ai.__v181ObservedShotAt=10;
  const classes={CLASSES:{twin:{bullet:{reload:1.2}}}};
  const sense=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
  assert.ok(sense.witnessedOpening(g,classes,observer,shooter,10.2)>0,
   'control: the original shooter exposes a legitimate recent reload opening');
  const replacement={...shooter,id:shooter.id,alive:true};
  assert.notEqual(replacement,shooter);
  assert.ok(sense.witnessedOpening(g,classes,observer,replacement,10.2)>0,
   'KNOWN DEFECT: new shooter object inherits the old shooter reload window');
  assert.equal(sense.witnessedOpening(g,classes,observer,
   {...replacement,id:shooter.id+50000},10.2),0,
   'negative control: different ID cannot inherit the observed opening');
 }finally{g.destroy();}
});

test('real engine control: redeploy allocates fresh tank IDs instead of recycling them',()=>{
 const g=bootGame();
 try{
  const priorIds=new Set(g.tanks.map(t=>t.id));
  const beforeNextId=g.nextId;
  assert.ok(priorIds.size>0);
  g.sfx.muted=true;
  g.sfx.startMusic=()=>{};
  g.redeploy();
  assert.ok(g.tanks.length>0);
  assert.ok(g.nextId>beforeNextId,'redeploy must allocate new entities');
  assert.ok(g.tanks.every(t=>!priorIds.has(t.id)),
   'actual ordinary redeploy must not recycle a previous tank ID');
 }finally{g.destroy();}
});
