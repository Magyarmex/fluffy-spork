'use strict';
// Research only: active three-update catch-up must preserve the actual
// Controller/Live Vector/AI/ecology world, not merely synthetic tick counts.
// No production scheduler or touch behavior is changed by this test.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=
 require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const {STEP}=require('../research/fixed-step-dom-input.cjs');
const CLASSES=['carrier','hivemind','citadel'];
const TICKS=120;
const clustered=Array.from({length:15},()=>[
 55,55,1000/15-55,1000/15-55]).flat();
function run(cls,seed,presentation){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);
  p.spawnShieldT=20;
  let now=1000,callback=null,owner=null;
  try{
   if(presentation){
    const timeline=new ChronologicalInput(g.input);
    const bridge={timeline,startMs:1000};
    owner=new FixedStepRafOwner(g,timeline,bridge,{
     now:()=>now,request:fn=>(callback=fn,1),
     cancel:()=>{callback=null},render:()=>{},maxSteps:3
    });
    owner.start();
   }
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=-15;
   g.input.firing=true;g.input.autofire=false;
   if(presentation){
    let elapsed=0;
    for(const gap of clustered){
     elapsed+=gap;now=1000+elapsed;
     const cb=callback;callback=null;
     assert.equal(typeof cb,'function','pilot lost RAF ownership');
     cb(now);
    }
    assert.ok(Math.abs(elapsed-2000)<1e-6);
    assert.equal(owner.ticks,TICKS,'clustered active presentation lost ticks');
    assert.equal(owner.droppedMs,0,'clustered active presentation discarded game time');
   }else for(let tick=0;tick<TICKS;tick++)g.update(STEP);
   return {
    hash:digest(physical(g)),draws:draws(),
    droneBehaviorHash:digest(g.drones.map(d=>[
     d.id,d.ownerId,d.__novaPhase,d.__novaCommitted,d.__novaTargetId,d.__novaRepairT])),
    swarmHash:digest(p.__novaSwarm?[p.__novaSwarm.active,
     p.__novaSwarm.power,p.__novaSwarm.nodeX,p.__novaSwarm.nodeY,
     p.__novaSwarm.angle,p.__novaSwarm.recallUntil]:[]),
    playerDrones:g.drones.filter(d=>d.ownerId===p.id).length,
    enemyCount:g.tanks.filter(t=>t!==p&&t.alive).length,
    neutralCount:g.shapes.length
   };
  }finally{if(owner)owner.stop();g.destroy();}
 });
}
test('three-step clustered30 preserves the natural Controller world and RNG versus native60',()=>{
 for(const cls of CLASSES)for(const seed of [1517800,1517802]){
  const native=run(cls,seed,false);
  const clusteredPilot=run(cls,seed,true);
  assert.ok(native.playerDrones>0,cls+' must have player-owned drones');
  assert.ok(native.enemyCount>0,cls+' must retain real enemies');
  assert.ok(native.neutralCount>0,cls+' must retain neutral ecology');
  assert.deepEqual(clusteredPilot,native,
   cls+' seed '+seed+' changed the composed physical world or RNG');
 }
});
