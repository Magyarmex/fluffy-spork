'use strict';
// Research only: the fixed60 candidate must preserve the actual Controller
// second-body simulation, not just Gunner cooldowns in an empty arena.
// Real composed Game, neutral ecology, AI and drones remain enabled.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=
 require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const TICKS=120;
const CLASSES=['carrier','hivemind','citadel'];

function run(cls,seed,fixed30){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);
  // Preserve the real enemies, neutral population, terrain, ecology and drones.
  p.spawnShieldT=20;
  let now=1000,callback=null,owner;
  try{
   if(fixed30){
    const timeline=new ChronologicalInput(g.input);
    const bridge={timeline,startMs:1000};
    owner=new FixedStepRafOwner(g,timeline,bridge,{
     now:()=>now,request:fn=>{callback=fn;return 1;},
     cancel:()=>{callback=null},render:()=>{},maxSteps:2
    });
    owner.start();
   }
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=-15;
   g.input.firing=true;g.input.autofire=false;
   if(fixed30){
    for(let frame=1;frame<=TICKS/2;frame++){
     now=1000+frame*1000/30;
     const next=callback;
     assert.equal(typeof next,'function','pilot RAF ownership lost');
     callback=null;next(now);
    }
    assert.equal(owner.ticks,TICKS,'fixed30 lost a simulation step');
    assert.equal(owner.droppedFrames,0,'healthy 30Hz must not drop time');
    assert.equal(owner.droppedMs,0);
   }else for(let tick=0;tick<TICKS;tick++)g.update(1/60);
   return {hash:digest(physical(g)),draws:draws(),
    droneBehaviorHash:digest(g.drones.map(d=>[d.id,d.ownerId,d.__novaPhase,
     d.__novaCommitted,d.__novaTargetId,d.__novaRepairT])),
    swarmHash:digest(p.__novaSwarm ? [p.__novaSwarm.active,
     p.__novaSwarm.power,p.__novaSwarm.nodeX,p.__novaSwarm.nodeY,
     p.__novaSwarm.angle,p.__novaSwarm.recallUntil] : []),
    droneCount:g.drones.length,
    enemyCount:g.tanks.filter(t=>t!==p&&t.alive).length,
    neutralCount:g.shapes.length,
    playerDrones:g.drones.filter(d=>d.ownerId===p.id).length,
    playerHp:p.hp,playerScore:p.score};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}

test('fixed60 30Hz presentation preserves natural Controller/drone world vs native60',()=>{
 for(const cls of CLASSES)for(const seed of [1517800,1517802]){
  const native60=run(cls,seed,false);
  const fixed30=run(cls,seed,true);
  assert.ok(native60.playerDrones>0,cls+' must exercise player-owned drones');
  assert.ok(native60.enemyCount>0,cls+' must retain real enemy tanks');
  assert.ok(native60.neutralCount>0,cls+' must retain real neutral ecology');
  assert.deepEqual(fixed30,native60,
   cls+' seed '+seed+' changed the real physical world or RNG');
 }
});
