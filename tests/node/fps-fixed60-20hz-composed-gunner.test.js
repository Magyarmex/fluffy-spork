'use strict';
// #799 / #648: source-executed 20Hz overload gate for the *actual* composed Game.
// This is deterministic scheduler research, not a phone CPU or latency claim.
// Compare whole-Game state; a shot-count-only test misses projectile chronology.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=
  require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const TICKS=360;
function run(cls,seed,cap,targeted,bursty=false,backlogExtraTicks=2){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);p.x=1000;p.y=1000;p.vx=0;p.vy=0;
  p.stats.reload=cls==='minigun'?1:3;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);g.__novaTerrain=[];
  const shape=g.shapes.find(s=>s.type==='square')||g.shapes[0];
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
  let damage=0;
  if(targeted){
   assert.ok(shape);
   const victim={...shape,kind:'shape',type:'square',id:987654,
    x:p.x+175,y:p.y,r:24,hp:1000000,maxHp:1000000,
    vx:0,vy:0,born:0,wanderT:Infinity,dead:false};
   g.shapes=[victim];
   if(g.shapeById)g.shapeById.set(victim.id,victim);
   const originalDamage=g.damageShape;
   g.damageShape=function(s,...args){
    const before=s.hp,result=originalDamage.call(this,s,...args);
    if(s===victim)damage+=Math.max(0,before-s.hp);
    return result;
   };
  }
  g.status='playing';g.paused=false;g.input.autofire=false;
  g.input.mouseActive=false;g.input.aim.active=true;
  g.input.aim.dx=40;g.input.aim.dy=0;g.input.firing=true;
  g.input.moveVec=()=>({x:0,y:0});
  let volleys=0;const originalFire=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length,result=originalFire.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return result;
  };
  let owner=null,callback=null,now=1000,peakLagMs=0;
  try{
   if(cap===0){for(let i=0;i<TICKS;i++)g.update(1/60);}
   else{
    const timeline=new ChronologicalInput(g.input);
    const bridge={timeline,startMs:1000};
    owner=new FixedStepRafOwner(g,timeline,bridge,{
     now:()=>now,request:fn=>(callback=fn,1),
     cancel:()=>{callback=null},render:()=>{},maxSteps:cap,backlogExtraTicks
    });
    owner.start();
    g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
    g.input.firing=true;
    for(let frame=1;frame<=120;frame++){
     // 95ms/5ms alternating gaps retain the same six-second wall clock.
     now=1000+(bursty==='clustered' ?
      Math.floor((frame-1)/4)*200+[87,184,192,200][(frame-1)%4] :
      bursty===true ? Math.floor(frame/2)*100+(frame%2?95:0) :
      typeof bursty==='number' ? Math.floor(frame/2)*100+(frame%2?50+bursty:0) : frame*50);
     const fn=callback;assert.equal(typeof fn,'function');
     callback=null;fn(now);peakLagMs=Math.max(peakLagMs,owner.lagMs);
    }
   }
   assert.ok(volleys>0);
   if(targeted)assert.ok(damage>0);
   return {state:{volleys,damage:+damage.toFixed(5),
    hash:digest(physical(g)),draws:draws(),heat:p.__v17Heat||0,
    spin:p.fireSpin||0,fireCd:p.fireCd},
    scheduler:owner?{ticks:owner.ticks,droppedMs:owner.droppedMs,
     droppedFrames:owner.droppedFrames,lagMs:owner.lagMs,peakLagMs}:null};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}
test('20Hz whole-Game three-step recovery restores 60Hz Gunner physics; two steps cannot',()=>{
 for(const cls of ['minigun','needlestorm'])
  for(const targeted of [false,true]){
   const baseline=run(cls,1517800,0,targeted);
   const capped=run(cls,1517800,2,targeted);
   assert.ok(capped.scheduler.ticks<TICKS,
    'two ticks per 50ms frame cannot advance six seconds of 60Hz physics');
   for(const cap of [3,4]){
    const recovered=run(cls,1517800,cap,targeted);
    assert.equal(recovered.scheduler.ticks,TICKS,
     '20Hz needs three 60Hz ticks per frame');
    assert.equal(recovered.scheduler.droppedMs,0);
    assert.equal(recovered.scheduler.droppedFrames,0);
    assert.deepEqual(recovered.state,baseline.state,
     cls+' target='+targeted+' cap='+cap);
   }
  }
});

test('bursty 20Hz presentation needs a four-step budget to avoid dropping Gunner time',()=>{
 for(const cls of ['minigun','needlestorm']){
  const baseline=run(cls,1517802,0,false);
  const three=run(cls,1517802,3,false,true);
  assert.ok(three.scheduler.droppedMs>0 || three.scheduler.ticks<TICKS,
   '95ms bursts exceed the three-step backlog budget');
  const four=run(cls,1517802,4,false,true);
  assert.equal(four.scheduler.ticks,TICKS);
  assert.equal(four.scheduler.droppedMs,0);
  assert.deepEqual(four.state,baseline.state,
   cls+' bursty 20Hz must preserve the 60Hz combat state');
 }
});

test('paired 20Hz frame jitter preserves complete Gunner state when four ticks are affordable',()=>{
 for(const cls of ['minigun','needlestorm']){
  const reference=run(cls,1517810,0,true);
  for(const jitter of [-10,-7,-3,3,7,10]){
   const recovered=run(cls,1517810,4,true,jitter);
   assert.equal(recovered.scheduler.ticks,TICKS);
   assert.equal(recovered.scheduler.droppedMs,0);
   assert.deepEqual(recovered.state,reference.state,
    cls+' paired 20Hz jitter '+jitter+'ms');
  }
 }
});

test('four-step budget cannot promise fairness under clustered sub-100ms frame gaps',()=>{
 const baseline=run('minigun',1517800,0,false);
 const clustered=run('minigun',1517800,4,false,'clustered');
 assert.ok(clustered.scheduler.droppedMs>0,
  '87ms/97ms clustered frames overflow even the four-step bounded backlog');
 assert.ok(clustered.scheduler.ticks<TICKS);
 assert.notDeepEqual(clustered.state,baseline.state,
  'same average 20Hz is not enough to guarantee combat chronology');
});

test('opt-in backlog headroom recovers clustered combat chronology but increases phase lag',()=>{
 for(const cls of ['minigun','needlestorm']){
  const baseline=run(cls,1517800,0,true);
  const defaultBudget=run(cls,1517800,4,true,'clustered',2);
  const expanded=run(cls,1517800,4,true,'clustered',4);
  assert.ok(defaultBudget.scheduler.droppedMs>0);
  assert.equal(expanded.scheduler.ticks,TICKS);
  assert.equal(expanded.scheduler.droppedMs,0);
  assert.deepEqual(expanded.state,baseline.state);
  assert.ok(expanded.scheduler.peakLagMs>defaultBudget.scheduler.peakLagMs,
   'recovered chronology carries a real queued-time/latency tradeoff');
 }
});

test('experimental backlog headroom rejects unsafe or noninteger budgets',()=>{
 for(const extra of [0,1,5,Infinity,NaN,2.5,'4'])
  assert.throws(()=>run('minigun',1517800,4,false,false,extra),
   /invalid fixed-step RAF owner/);
});
