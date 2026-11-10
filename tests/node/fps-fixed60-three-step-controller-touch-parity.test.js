'use strict';
// Research only: replay identical two-stick DOM occurrence times through the
// real 49-overlay Controller Game under native60 versus clustered mean30
// three-step presentation. This does not measure physical browser delivery.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=
 require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput,STEP}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const EVENTS=[
 [20,'pointerdown',11,600,200],[24,'pointermove',11,640,200],
 [30,'pointerdown',12,100,200],[35,'pointermove',12,140,200],
 [45,'pointerup',11,640,200],[80,'pointerup',12,140,200]
];
const clustered=Array.from({length:15},()=>[
 55,55,1000/15-55,1000/15-55]).flat();
function run(seed,clusteredMode){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,'carrier');p.spawnShieldT=20;
  g.input.autofire=false;
  let aimActiveTicks=0,moveActiveTicks=0,swarmActiveTicks=0,aimDeflectedTicks=0,moveDeflectedTicks=0;
  const originalUpdate=g.update;
  g.update=function(dt){
   if(this.input.aim.active)aimActiveTicks++;
   if(this.input.move.active)moveActiveTicks++;
   if(Math.hypot(this.input.aim.dx,this.input.aim.dy)>=9)aimDeflectedTicks++;
   if(Math.hypot(this.input.move.dx,this.input.move.dy)>=9)moveDeflectedTicks++;
   const out=originalUpdate.call(this,dt);
   if(p.__novaSwarm?.active)swarmActiveTicks++;
   return out;
  };
  const timeline=new ChronologicalInput(g.input);
  let now=1000,cb=null,owner=null,next=0;
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  function deliver(elapsed){
   while(next<EVENTS.length&&EVENTS[next][0]<=elapsed+1e-7){
    const [at,type,pointerId,clientX,clientY]=EVENTS[next++];
    assert.equal(bridge.capture({type,timeStamp:1000+at,
     pointerId,pointerType:'touch',clientX,clientY,
     button:0,buttons:type==='pointerup'?0:1,
     target:{tagName:'CANVAS',closest:()=>null}}),true);
   }
  }
  try{
   if(clusteredMode){
    owner=new FixedStepRafOwner(g,timeline,bridge,{
     now:()=>now,request:fn=>(cb=fn,1),cancel:()=>{cb=null},
     render(){},maxSteps:3
    });
    owner.start();
    let elapsed=0;
    for(const gap of clustered){
     elapsed+=gap;now=1000+elapsed;deliver(elapsed);
     const fn=cb;cb=null;assert.equal(typeof fn,'function');fn(now);
    }
    assert.equal(owner.ticks,120);
    assert.equal(owner.droppedMs,0);
   }else{
    timeline.consumeThrough(0);
    for(let tick=1;tick<=120;tick++){
     const elapsed=tick*1000/60;
     now=1000+elapsed;
     deliver(elapsed);
     timeline.consumeThrough(tick*STEP);
     g.update(STEP);
    }
   }
   assert.equal(next,EVENTS.length);
   assert.equal(bridge.lateClamps+bridge.reorderedClamps+bridge.staleClamps,0);
   assert.equal(timeline.applied,EVENTS.length);
   assert.equal(g.input.stickId.aim,-1);
   assert.equal(g.input.stickId.move,-1);
   assert.equal(g.input.aim.active,false);
   assert.equal(g.input.move.active,false);
   return {hash:digest(physical(g)),draws:draws(),
    drones:digest(g.drones.map(d=>[
     d.id,d.ownerId,d.__novaPhase,d.__novaCommitted,d.__novaTargetId])),
    swarm:digest(p.__novaSwarm?[p.__novaSwarm.active,p.__novaSwarm.power,
     p.__novaSwarm.nodeX,p.__novaSwarm.nodeY,p.__novaSwarm.angle]:[]),
    score:p.score,bullets:g.bullets.length,
    aimActiveTicks,moveActiveTicks,swarmActiveTicks,aimDeflectedTicks,moveDeflectedTicks};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}
test('real Controller two-stick press/move/release chronology matches native60 in three-step cluster',()=>{
 for(const seed of [1517800,1517802]){
  const reference=run(seed,false);
  const pilot=run(seed,true);
  assert.ok(reference.aimActiveTicks>0,'real aim input must reach Game.update');
  assert.ok(reference.moveActiveTicks>0,'real movement input must reach Game.update');
  assert.ok(reference.swarmActiveTicks>0,'Controller command must activate in the actual Game');
  assert.ok(reference.aimDeflectedTicks>0,'real right-stick drag must reach the Game');
  assert.ok(reference.moveDeflectedTicks>0,'real left-stick drag must reach the Game');
  assert.deepEqual(pilot,reference,
   'clustered three-step presentation changed actual Controller physical state');
 }
});
