'use strict';
// Research-only: compare the first projectile submitted to the REAL composed
// Canvas renderer under equal-mean, different-phase presentation schedules.
// This is neither a physical touch-to-photon measurement nor a production
// fixed-step rollout. The opt-in pulse remains excluded from shipping HTML.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const {ShotOnlyFirePulse}=require('../research/shot-only-fire-pulse.cjs');

const uniform=Array(24).fill(1000/60);
const clustered=Array.from({length:8},()=>[1000/30,1000/120,1000/120]).flat();
// Mean 30Hz, no individual interval >100ms. The 55ms pair delays a
// 134-140ms right-stick gesture until the 188.33ms presentation callback.
const clustered30=Array.from({length:6},()=>[55,55,1000/15-55,1000/15-55]).flat();

function run(gaps,{maxSteps=2,release='pointerup',pulseEnabled=true,maxPulseAgeMs=40}={}){
 return withSeed(1517800,()=>{
  const g=bootGame();
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.tanks=[g.player];g.tankById=new Map([[g.player.id,g.player]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  g.spawnDrone=()=>null;g.player.droneRespawnT=Infinity;
  g.status='playing';g.paused=false;g.input.autofire=false;
  const timeline=new ChronologicalInput(g.input);
  let now=1000,callback=null,elapsed=0,next=0;
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const pulse=pulseEnabled?new ShotOnlyFirePulse(g,timeline,{
    maxPulseAgeMs,nowMs:()=>now,startMs:bridge.startMs}):null;
  const renderActual=g.__testWindow.__novaMakeRequire('')('game/render').render;
  const renders=[];
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
    now:()=>now,maxSteps,request:fn=>(callback=fn,1),
    cancel:()=>{callback=null},render(game,w,h){
      renders.push({atMs:elapsed,bullets:game.bullets.length,
        firing:game.input.firing,aim:game.input.aim.active,
        ticks:owner.ticks,lagMs:owner.lagMs});
      renderActual(game,w,h);
    }});
  const events=[
    {atMs:134,type:'pointerdown',x:600,buttons:1},
    {atMs:137,type:'pointermove',x:640,buttons:1},
    {atMs:140,type:release,x:640,buttons:0}
  ];
  let firstDelivery=null;
  try{
    owner.start();
    for(const gap of gaps){
      elapsed+=gap;now=1000+elapsed;
      while(next<events.length&&events[next].atMs<=elapsed+1e-7){
        const e=events[next++];
        if(firstDelivery===null)firstDelivery=elapsed;
        assert.equal(bridge.capture({type:e.type,timeStamp:1000+e.atMs,
          pointerType:'touch',pointerId:22,clientX:e.x,clientY:200,
          button:0,buttons:e.buttons,
          target:{tagName:'CANVAS',closest:()=>null}}),true);
      }
      const cb=callback;callback=null;
      assert.equal(typeof cb,'function');cb(now);
    }
    assert.equal(next,events.length,'all browser events must be delivered');
    return {firstDelivery,firstVisible:renders.find(r=>r.bullets>0)?.atMs,
      renders,shots:pulse?.shots||0,rejected:pulse?.rejectedStale||0,
      ticks:owner.ticks,droppedMs:owner.droppedMs,
      aim:g.input.aim.active,firing:g.input.firing};
  }finally{
    owner.stop();if(pulse)pulse.detach();g.destroy();
  }
 });
}

test('equal-mean clustered presentation submits one recovered shot to real Canvas without duplicate or command hold',()=>{
 for(const gaps of [uniform,clustered]){
  for(const maxSteps of [2,3]){
   const result=run(gaps,{maxSteps});
   assert.equal(result.renders.length,24);
   assert.equal(result.shots,1);
   assert.equal(result.rejected,0);
   assert.equal(result.aim,false);
   assert.equal(result.firing,false);
   assert.equal(result.droppedMs,0);
   assert.equal(result.ticks,24);
   assert.ok(result.firstVisible>=result.firstDelivery,
     'the renderer cannot receive a projectile before its browser event');
   assert.ok(result.firstVisible<=result.firstDelivery+1000/30+1e-6,
     'healthy 60Hz-mean presentation must show the accepted shot promptly');
   assert.ok(result.renders.some(r=>r.bullets>0),
     'the actual Canvas render path must receive the projectile');
  }
 }
});
test('cancellation remains shot-free under both schedules and step budgets',()=>{
 for(const gaps of [uniform,clustered]){
  for(const maxSteps of [2,3]){
   const result=run(gaps,{maxSteps,release:'pointercancel'});
   assert.equal(result.shots,0);
   assert.equal(result.firstVisible,undefined);
   assert.equal(result.aim,false);
   assert.equal(result.firing,false);
   assert.equal(result.droppedMs,0);
  }
 }
});
test('without the opt-in pulse, a released sub-tick touch cannot invent a shot',()=>{
 for(const gaps of [uniform,clustered]){
  const result=run(gaps,{pulseEnabled:false});
  assert.equal(result.shots,0);
  assert.equal(result.firstVisible,undefined);
  assert.equal(result.aim,false);
  assert.equal(result.firing,false);
 }
});

// Research falsifier: a mean-30Hz presentation gap can make a physically
// legitimate tap older than the 40ms freshness budget before the browser
// callback is allowed to run. Raising the budget restores that shot but also
// accepts an older intention. Neither policy is a production recommendation.
test('clustered mean30 exposes freshness-versus-shot recovery tradeoff in real composed Canvas',()=>{
 const strict=run(clustered30,{maxPulseAgeMs:40});
 const permissive=run(clustered30,{maxPulseAgeMs:80});
 assert.equal(strict.renders.length,24);
 assert.equal(permissive.renders.length,24);
 assert.equal(strict.firstDelivery,permissive.firstDelivery);
 assert.ok(strict.firstDelivery>=188 && strict.firstDelivery<=189,
   'the first available browser callback follows the 55ms burst');
 assert.equal(strict.shots,0,'expired input must not create a delayed shot');
 assert.equal(strict.rejected,1,'freshness gate must explicitly reject the old tap');
 assert.equal(strict.firstVisible,undefined);
 assert.equal(permissive.rejected,0);
 assert.equal(permissive.shots,1,'wider research freshness window recovers the shot');
 assert.ok(permissive.firstVisible>=permissive.firstDelivery);
 assert.ok(permissive.renders.some(r=>r.bullets>0),
   'the actual renderer must receive the recovered projectile');
 for(const result of [strict,permissive]){
  assert.equal(result.aim,false);
  assert.equal(result.firing,false);
 }
 console.log('CLUSTERED30_SHOT_FRESHNESS '+JSON.stringify({
  firstDelivery:strict.firstDelivery,strict:{shots:strict.shots,rejected:strict.rejected,
   ticks:strict.ticks,droppedMs:strict.droppedMs},
  permissive:{shots:permissive.shots,rejected:permissive.rejected,
   ticks:permissive.ticks,droppedMs:permissive.droppedMs,
   firstVisible:permissive.firstVisible}
 }));
});
test('clustered mean30 cancellation stays shot-free even with wider freshness',()=>{
 for(const maxPulseAgeMs of [40,80]){
  const result=run(clustered30,{maxPulseAgeMs,release:'pointercancel'});
  assert.equal(result.shots,0);
  assert.equal(result.firstVisible,undefined);
  assert.equal(result.aim,false);
  assert.equal(result.firing,false);
 }
});
