'use strict';
/* #799 research-only pilot. A bounded, whole-Game 60Hz accumulator is
 * driven by irregular presentation frames, with real Game.update calls.
 * It does NOT modify Game.start, rendering, input ownership, or production.
 * Equal simulated time and shot counts are correctness evidence, not
 * proof of CPU feasibility, touch latency, or natural-match balance. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const STEP=1/60, EPS=1e-9, SECONDS=4;
function frames(mode){
 if(mode==='uniform60')return Array.from({length:240},()=>STEP);
 if(mode==='uniform30')return Array.from({length:120},()=>1/30);
 if(mode==='uniform120')return Array.from({length:480},()=>1/120);
 if(mode==='alternating60p15')return Array.from({length:240},(_,i)=>(i%2?0.85:1.15)*STEP);
 if(mode==='alternating40_120')return Array.from({length:120},()=>[1/40,1/120]).flat();
 if(mode==='uniform20')return Array.from({length:80},()=>1/20);
 if(mode==='overload10')return Array.from({length:40},()=>0.1);
 if(mode==='single100msStall')return [0.1,...Array.from({length:234},()=>STEP)];
 throw Error('unknown presentation schedule');
}
function run(seed,cls,reload,mode,maxSteps=3,inputPolicy='held',nativePresentation=false){
 assert.ok(['held','firstFrameTap'].includes(inputPolicy));
 return withSeed(seed,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  const p=g.player;
  g.sfx.muted=true;
  g.setClass(p,cls);
  Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
  p.stats.reload=reload;p.fireCd=0;
  g.tanks=[p];
  g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;
  g.input.autofire=false;g.input.mouseActive=false;
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  g.input.moveVec=()=>({x:0,y:0});
  g.input.firing=true;
  let volleys=0;
  const fire=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length;
   const result=fire.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return result;
  };
  const initial=g.time;
  let wall=0,acc=0,updates=0,maxUsed=0,backloggedFrames=0,peakDebt=0;
  let peakStepBudget=0,zeroUpdateFrames=0,frameIndex=0;
  try{
   for(const frame of frames(mode)){
    g.input.firing=inputPolicy==='held'||frameIndex===0;
    frameIndex++;
    wall+=frame;acc+=frame;
    let used=0;
    if(nativePresentation){
     g.update(frame);updates++;used=1;acc=0;
    }else while(acc+EPS>=STEP&&used<maxSteps){
     g.update(STEP);
     acc-=STEP;
     if(Math.abs(acc)<EPS)acc=0;
     used++;updates++;
    }
    maxUsed=Math.max(maxUsed,used);
    if(used===0)zeroUpdateFrames++;
    peakStepBudget=Math.max(peakStepBudget,used/maxSteps);
    if(acc+EPS>=STEP)backloggedFrames++;
    peakDebt=Math.max(peakDebt,acc);
   }
   assert.ok(Math.abs(wall-SECONDS)<1e-7,'identical wall-clock duration');
   assert.ok(acc>=-EPS,'accumulator must not run into negative time');
   assert.ok(Math.abs(g.time-initial-(nativePresentation?wall:updates*STEP))<1e-6,
    'Game clock matches its actual variable or fixed update chronology');
   assert.ok(updates<=(nativePresentation?480:240),'bounded pilot never invents simulated time');
   return {seed,cls,reload,mode,maxSteps,inputPolicy,nativePresentation,updates,volleys,
    spin:+(p.fireSpin||0).toFixed(6),heat:+(p.__v17Heat||0).toFixed(6),
    simulated:+(g.time-initial).toFixed(6),
    remainingDebt:+acc.toFixed(6),maxUsed,backloggedFrames,
    peakDebt:+peakDebt.toFixed(6),peakStepBudget,zeroUpdateFrames};
  }finally{g.destroy();}
 });
}
test('bounded whole-Game fixed60 preserves held rotary fire across ordinary presentation jitter',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3],['needlestorm',5]]){
  for(const seed of [1517800,1517802]){
   const baseline=run(seed,cls,reload,'uniform60');
   assert.equal(baseline.updates,240);
   for(const mode of ['uniform30','uniform120','alternating60p15','alternating40_120','uniform20']){
    const row=run(seed,cls,reload,mode);
    assert.deepEqual(run(seed,cls,reload,mode),row,'same schedule and seed reproduce');
    assert.equal(row.updates,240,'ordinary presentation schedule must repay all 60Hz ticks');
    assert.equal(row.simulated,4);
    assert.equal(row.volleys,baseline.volleys,'same Game tick history must preserve volleys');
    assert.equal(row.spin,baseline.spin,'same Game tick history must preserve spin');
    assert.equal(row.heat,baseline.heat,'same Game tick history must preserve heat');
    assert.ok(row.maxUsed<=3,'strict per-frame update budget');
    assert.equal(row.backloggedFrames,0,'no ordinary frame should leave whole ticks behind');
    if(mode==='uniform120')assert.equal(row.zeroUpdateFrames,240,
     '120Hz rendering would repeat the same simulation pose on half its frames without interpolation');
    rows.push({cls,reload,seed,mode,volleys:row.volleys,updates:row.updates,maxUsed:row.maxUsed});
   }
  }
 }
 assert.equal(rows.length,30);
 console.log('GUNNER_FIXED60_WHOLE_GAME_PRESENTATION_PILOT '+JSON.stringify(rows));
});
test('fixed60 without input-edge buffering can lose a one-frame 120Hz tap',()=>{
 const native=run(1517800,'minigun',1,'uniform120',3,'firstFrameTap',true);
 const fixed=run(1517800,'minigun',1,'uniform120',3,'firstFrameTap');
 assert.equal(native.updates,480,'current variable-step 120Hz can sample every presentation');
 assert.equal(native.volleys,1,'a legal first-frame press fires in current 120Hz Game');
 assert.equal(fixed.updates,240);
 assert.equal(fixed.volleys,0,'unbuffered fixed60 misses a press released before its first tick');
 assert.equal(fixed.zeroUpdateFrames,240);
 console.log('GUNNER_FIXED60_SHORT_TAP_FALSIFIER '+JSON.stringify({native,fixed}));
});
test('bounded whole-Game scheduler recovers one 100ms stall without changing the 60Hz weapon timeline',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',5]]){
  const baseline=run(1517800,cls,reload,'uniform60');
  const stalled=run(1517800,cls,reload,'single100msStall');
  assert.equal(stalled.updates,240,'one stall must not permanently lose game time');
  assert.equal(stalled.volleys,baseline.volleys);
  assert.equal(stalled.spin,baseline.spin);
  assert.equal(stalled.heat,baseline.heat);
  assert.ok(stalled.backloggedFrames>0,'stalled presentation must expose temporary debt');
  assert.ok(stalled.peakDebt>=0.05-1e-7,'100ms frame exceeds the three-tick budget');
  assert.ok(Math.abs(stalled.remainingDebt)<1e-7,'debt must be cleared after recovery');
  assert.equal(stalled.maxUsed,3);
  rows.push({cls,reload,stalled});
 }
 console.log('GUNNER_FIXED60_SINGLE_STALL_RECOVERY '+JSON.stringify(rows));
});
test('bounded fixed60 refuses to claim parity when 10Hz frames exceed the update budget',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',5]]){
  const baseline=run(1517800,cls,reload,'uniform60');
  const overloaded=run(1517800,cls,reload,'overload10');
  assert.equal(overloaded.updates,120,'three ticks maximum for each of forty frames');
  assert.equal(overloaded.maxUsed,3);
  assert.ok(overloaded.backloggedFrames>0);
  assert.ok(overloaded.remainingDebt>1.9,'unrepaid world time must remain explicit');
  assert.ok(overloaded.simulated<baseline.simulated);
  rows.push({cls,reload,baselineVolleys:baseline.volleys,overloaded});
 }
 console.log('GUNNER_FIXED60_BUDGET_OVERLOAD '+JSON.stringify(rows));
});
