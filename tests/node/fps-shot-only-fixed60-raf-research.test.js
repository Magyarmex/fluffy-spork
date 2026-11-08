'use strict';
// Research-only: short input edges must survive the *actual* fixed60 RAF
// event bridge without accidentally prolonging Controller drone commands.
// This test is intentionally not a production rollout of either owner.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const {ShotOnlyFirePulse}=require('../research/shot-only-fire-pulse.cjs');

function run({shot=false,cls='basic',disableFire=false,releaseType='pointerup',maxSteps=3}={}){
 return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  if(cls!=='basic')g.setClass(g.player,cls);
  g.input.autofire=false;
  if(disableFire)g.tryFire=()=>{};
  // Preserve real Game movement/firing/drone owners while excluding unrelated
  // enemies and neutral collision side effects from this input experiment.
  g.tanks=[g.player];g.tankById=new Map([[g.player.id,g.player]]);
  g.shapes=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  g.status='playing';g.paused=false;
  const timeline=new ChronologicalInput(g.input);
  let now=1000,callback=null;
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const pulse=shot?new ShotOnlyFirePulse(g,timeline):null;
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,maxSteps,request:fn=>(callback=fn,1),
   cancel:()=>{callback=null},render(){}});
  const event=(type,at,x,buttons)=>bridge.capture({
   type,timeStamp:1000+at,pointerType:'touch',pointerId:22,
   clientX:x,clientY:200,button:0,buttons,
   target:{tagName:'CANVAS',closest:()=>null}});
  let at150=null,at200=null;
  try{
   owner.start();
   for(let frame=1;frame<=8;frame++){
    now=1000+frame*50;
    if(frame===3){
     assert.equal(event('pointerdown',134,600,1),true);
     assert.equal(event('pointermove',137,640,1),true);
     assert.equal(event(releaseType,140,640,0),true);
    }
    const cb=callback;callback=null;assert.equal(typeof cb,'function');cb(now);
    if(frame===3)at150={bullets:g.bullets.length,shots:pulse?.shots||0,
      aim:g.input.aim.active,firing:g.input.firing};
    if(frame===4)at200={bullets:g.bullets.length,shots:pulse?.shots||0};
   }
   const drones=g.drones.filter(d=>d.ownerId===g.player.id).map(d=>
     [d.id,d.x,d.y,d.vx,d.vy,d.hp,d.__novaPhase]);
   const swarm=g.player.__novaSwarm;
   return {at150,at200,drones,recall:swarm?.recallUntil,active:swarm?.active,
    power:swarm?.power,nodeX:swarm?.nodeX,nodeY:swarm?.nodeY,
    ticks:owner.ticks,droppedMs:owner.droppedMs,
    aim:g.input.aim.active,firing:g.input.firing};
  }finally{
   owner.stop();if(pulse)pulse.detach();g.destroy();
  }
 });
}

test('shot-only sub-tick touch pulse reaches composed Game through actual fixed60 RAF',()=>{
 const baseline=run(),recovered=run({shot:true});
 assert.equal(baseline.at150.bullets,0,'ordinary tick sampling misses released pulse');
 assert.equal(recovered.at150.bullets,1,'one intentional shot must be recovered');
 assert.equal(recovered.at150.shots,1);
 for(const result of [baseline,recovered]){
  assert.equal(result.ticks,24);assert.equal(result.droppedMs,0);
  assert.equal(result.at150.aim,false);assert.equal(result.at150.firing,false);
  assert.equal(result.aim,false);assert.equal(result.firing,false);
 }
});
test('cancelled sub-tick touch pulse never creates a ghost shot',()=>{
 const cancelled=run({shot:true,releaseType:'pointercancel'});
 assert.equal(cancelled.at150.bullets,0);
 assert.equal(cancelled.at150.shots,0);
 assert.equal(cancelled.firing,false);assert.equal(cancelled.aim,false);
});
test('shot-only pulse never changes Controller swarm state when firing is disabled',()=>{
 for(const cls of ['carrier','warden','valkyrie']){
  const baseline=run({cls,disableFire:true});
  const recovered=run({cls,disableFire:true,shot:true});
  for(const key of ['drones','recall','active','power','nodeX','nodeY'])
   assert.equal(JSON.stringify(recovered[key]),JSON.stringify(baseline[key]),cls+' '+key);
  assert.equal(recovered.at150.shots,1);
 }
});

test('overloaded two-step RAF recovers the same short shot later without phantom commands',()=>{
 const delayed=run({shot:true,maxSteps:2});
 assert.equal(delayed.at150.bullets,0,'overload must not invent an early projectile');
 assert.equal(delayed.at200.bullets,1,'short shot must survive bounded backlog');
 assert.equal(delayed.at200.shots,1);
 assert.equal(delayed.ticks,16);assert.ok(delayed.droppedMs>0);
 assert.equal(delayed.aim,false);assert.equal(delayed.firing,false);
});
