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

function run({shot=false,cls='basic',disableFire=false,releaseType='pointerup',maxSteps=3,ageGateMs=Infinity,pauseAtThird=false}={}){
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
  const actualRender=g.__testWindow.__novaMakeRequire('')('game/render').render;
  const rendered=[];
  let now=1000,callback=null;
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const pulse=shot?new ShotOnlyFirePulse(g,timeline,{maxPulseAgeMs:ageGateMs,
    nowMs:()=>now,startMs:bridge.startMs}):null;
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,maxSteps,request:fn=>(callback=fn,1),
   cancel:()=>{callback=null},render(game,w,h){
    rendered.push({atMs:now-1000,bullets:game.bullets.length});
    actualRender(game,w,h);
   }});
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
     if(pauseAtThird)g.setPaused(true);
    }
    const cb=callback;callback=null;assert.equal(typeof cb,'function');cb(now);
    if(frame===3)at150={bullets:g.bullets.length,shots:pulse?.shots||0,
      aim:g.input.aim.active,firing:g.input.firing};
    if(frame===4)at200={bullets:g.bullets.length,shots:pulse?.shots||0};
   }
   const drones=g.drones.filter(d=>d.ownerId===g.player.id).map(d=>
     [d.id,d.x,d.y,d.vx,d.vy,d.hp,d.__novaPhase]);
   const swarm=g.player.__novaSwarm;
   return {at150,at200,rendered,drones,recall:swarm?.recallUntil,active:swarm?.active,
    power:swarm?.power,nodeX:swarm?.nodeX,nodeY:swarm?.nodeY,
    ticks:owner.ticks,droppedMs:owner.droppedMs,rejectedStale:pulse?.rejectedStale||0,
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
// Rebuild cross-VM arrays in the test realm without lossy JSON serialization.
const localArrays=value=>Array.isArray(value)?Array.from(value,localArrays):value;
test('shot-only pulse never changes Controller swarm state when firing is disabled',()=>{
 for(const cls of ['carrier','warden','valkyrie']){
  const baseline=run({cls,disableFire:true});
  const recovered=run({cls,disableFire:true,shot:true});
  for(const key of ['drones','recall','active','power','nodeX','nodeY'])
   assert.deepEqual(localArrays(recovered[key]),localArrays(baseline[key]),cls+' '+key);
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

test('opt-in wall-clock gate accepts a fresh pulse and rejects a delayed shot',()=>{
 const fresh=run({shot:true,maxSteps:3,ageGateMs:40});
 const stale=run({shot:true,maxSteps:2,ageGateMs:40});
 const allowed=run({shot:true,maxSteps:2,ageGateMs:80});
 assert.equal(fresh.at150.bullets,1);
 assert.equal(fresh.rejectedStale,0);
 assert.equal(stale.at200.bullets,0,'stale recovery must not fire after release');
 assert.equal(stale.at200.shots,0);
 assert.equal(stale.rejectedStale,1);
 assert.equal(stale.aim,false);assert.equal(stale.firing,false);
 assert.equal(allowed.at200.bullets,1);
 assert.equal(allowed.rejectedStale,0);
});
test('age-gated cancellation remains shot-free and Controller commands remain unchanged',()=>{
 const canceled=run({shot:true,releaseType:'pointercancel',ageGateMs:40});
 assert.equal(canceled.at200.bullets,0);assert.equal(canceled.rejectedStale,0);
 for(const cls of ['carrier','warden','valkyrie']){
  const baseline=run({cls,disableFire:true,maxSteps:2});
  const stale=run({cls,disableFire:true,shot:true,maxSteps:2,ageGateMs:40});
  for(const key of ['drones','recall','active','power','nodeX','nodeY'])
   assert.deepEqual(localArrays(stale[key]),localArrays(baseline[key]),cls+' '+key);
  assert.equal(stale.rejectedStale,1);
 }
});

test('pause before a delayed recovery clears the pulse without a ghost shot',()=>{
 for(const ageGateMs of [40,80,Infinity]){
  const result=run({shot:true,maxSteps:2,ageGateMs,pauseAtThird:true});
  assert.equal(result.at200.bullets,0);
  assert.equal(result.at200.shots,0);
  assert.equal(result.rejectedStale,0,'pause is cancellation, not age rejection');
  assert.equal(result.firing,false);assert.equal(result.aim,false);
 }
});

test('actual composed Canvas renderer first receives a recovered projectile only on its legal frame',()=>{
 const fresh=run({shot:true,maxSteps:3,ageGateMs:40});
 const delayed=run({shot:true,maxSteps:2,ageGateMs:80});
 const rejected=run({shot:true,maxSteps:2,ageGateMs:40});
 const firstVisible=result=>result.rendered.find(frame=>frame.bullets>0)?.atMs;
 assert.equal(firstVisible(fresh),150);
 assert.equal(firstVisible(delayed),200);
 assert.equal(firstVisible(rejected),undefined);
 for(const result of [fresh,delayed,rejected]){
  assert.equal(result.rendered.length,8);
  assert.equal(result.aim,false);assert.equal(result.firing,false);
 }
});
