// #641/#799 Research-only shot-only pulse freshness comparison. No shipping patch.
'use strict';
// #641/#799 RESEARCH ONLY. Actual 49-overlay Game, real Input handlers,
// chronological DOM edges and bounded RAF owner. No production patch.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const {ShotOnlyFirePulse}=require('../research/shot-only-fire-pulse.cjs');
const STEP=1000/60;
const uniform=Array(120).fill(STEP);
const burst=Array.from({length:5},()=>[95,95,95,...Array(9).fill((400-285)/9)]).flat();
const pulse=[
 {at:140,type:'pointerdown',x:640,buttons:1},
 {at:141,type:'pointermove',x:680,buttons:1},
 {at:152,type:'pointerup',x:680,buttons:0}
];
function run(intervals,maxSteps,extra,pulseAgeMs=null){
 return withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,'scout');p.fireCd=0;
  Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
  g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
  const target=g.tanks.find(t=>t!==p);
  assert.ok(target,'composed Game must contain target');
  Object.assign(target,{cls:'scout',isPlayer:true,alive:true,
   x:200,y:0,vx:0,vy:0,hp:100000,maxHp:100000,
   spawnShieldT:0,shieldT:0,bulwarkT:0,tauntT:0,cloakT:0});
  g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;g.input.autofire=false;g.input.mouseActive=false;
  let now=1000,callback=null,volleys=0,hits=0,damage=0;
  const births=[],sampled=[],rendered=[];
  const originalFire=g.tryFire,originalDamage=g.damageTank,originalUpdate=g.update;
  g.tryFire=function(t){
   const n=this.bullets.length,out=originalFire.apply(this,arguments);
   if(t===p&&this.bullets.length>n){volleys++;births.push(+this.time.toFixed(6));}
   return out;
  };
  g.damageTank=function(t){
   const hp=t.hp,out=originalDamage.apply(this,arguments);
   if(t===target&&t.hp<hp){hits++;damage+=hp-t.hp;}
   return out;
  };
  g.update=function(dt){
   const out=originalUpdate.apply(this,arguments);
   target.x=200;target.y=0;target.vx=0;target.vy=0;return out;
  };
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  for(const kind of ['pd','pm','pu']){
   const old=g.input[kind];
   g.input[kind]=function(e){
    sampled.push({type:e.type,at:e.__novaOriginalAt,sample:e.__novaSampleAt});
    return old.apply(this,arguments);
   };
  }
  // The pulse must wrap Game.update before the RAF owner snapshots lifecycle hooks.
  const pulseOwner=pulseAgeMs===null?null:new ShotOnlyFirePulse(g,timeline,{
   maxPulseAgeMs:pulseAgeMs,nowMs:()=>now,startMs:1000
  });
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null},
   maxSteps,backlogExtraTicks:extra,
   render:()=>{rendered.push({wall:now-1000,volleys});}
  });
  let elapsed=0,next=0;
  try{
   owner.start();
   for(const dt of intervals){
    elapsed+=dt;now=1000+elapsed;
    while(next<pulse.length&&pulse[next].at<=elapsed+1e-6){
     const e=pulse[next++];
     assert.equal(bridge.capture({type:e.type,timeStamp:1000+e.at,
      pointerId:11,pointerType:'touch',clientX:e.x,clientY:300,
      button:0,buttons:e.buttons,target:{tagName:'CANVAS',closest:()=>null}}),true);
    }
    const cb=callback;callback=null;assert.equal(typeof cb,'function');cb(now);
   }
   assert.ok(Math.abs(elapsed-2000)<.002,'equal two-second observation');
   assert.equal(next,3,'all three DOM edges delivered');
   assert.equal(timeline.applied,3,'all three DOM edges consumed');
   assert.equal(sampled.length,3,'real Input saw all edges');
   assert.equal(bridge.lateClamps+bridge.reorderedClamps+bridge.staleClamps,0);
   assert.equal(g.input.firing,false,'released touch must not remain firing');
   assert.equal(g.input.aim.active,false,'released touch must not remain owned');
   assert.ok(Math.abs(owner.ticks*STEP+owner.droppedMs+owner.lagMs-2000)<.002,
    'executed, dropped and queued time must account for wall time');
   assert.ok(volleys<=1,'single 12ms press must not generate multiple volleys');
   return {pulseAgeMs,acceptedPulseShots:pulseOwner?.shots??0,
    rejectedStale:pulseOwner?.rejectedStale??0,
    ticks:owner.ticks,droppedMs:+owner.droppedMs.toFixed(4),
    queuedMs:+owner.lagMs.toFixed(4),volleys,hits,damage:+damage.toFixed(5),
    births,firstRenderCallbackMs:rendered.find(x=>x.volleys>0)?.wall??null,
    sampled:sampled.map(e=>({type:e.type,at:e.at,sample:e.sample}))};
  }finally{owner.stop();if(pulseOwner)pulseOwner.detach();g.destroy();}
 });
}
test('composed Scout short touch compares bounded shot-only pulse freshness under active burst',()=>{
 const baseline=run(uniform,4,4);
 assert.equal(baseline.ticks,120);
 assert.equal(baseline.droppedMs,0);
 assert.equal(baseline.volleys,1,'60Hz reference must actually fire a projectile');
 const rows=[];
 for(const [steps,extra] of [[4,3],[4,4]]){
  const actual=run(burst,steps,extra);
  assert.deepEqual(run(burst,steps,extra),actual,'deterministic composed replay');
  if(actual.droppedMs===0&&actual.ticks===baseline.ticks){
   assert.equal(actual.volleys,baseline.volleys,'complete chronology must retain shot');
   assert.deepEqual(actual.births,baseline.births,'complete chronology must retain shot timing');
  }
  rows.push({steps,extra,...actual});
 }
 // These are research alternatives, not production behavior. The same
 // physical DOM edges must not create duplicate shots or retain held aim.
 const gated=[0,100,200].map(age=>run(burst,4,4,age));
 for(const result of gated){
  assert.ok(result.volleys<=1,'one tap cannot create repeated shots');
  assert.equal(result.sampled.length,3,'all input edges still reach Game');
  assert.equal(result.ticks,110,'pulse must not change scheduler chronology');
  assert.equal(result.droppedMs,166.6667,'pulse must not change dropped time');
 }
 assert.equal(gated[0].acceptedPulseShots,0,'zero-age gate cannot accept old intent');
 assert.ok(gated[0].rejectedStale>=1,'expired pulse must be rejected');
 console.log('COMPOSED_SHOT_ONLY_FRESHNESS '+JSON.stringify({gated,
  caveat:'constructed timing, not measured human tap frequency; no physical Android or Canvas paint'}));
 console.log('COMPOSED_EIGHT_TICK_SHORT_TOUCH '+JSON.stringify({baseline,rows,
  caveat:'constructed active burst; real Game/Input, not Chromium touch-to-photon or natural-play frequency'}));
});
