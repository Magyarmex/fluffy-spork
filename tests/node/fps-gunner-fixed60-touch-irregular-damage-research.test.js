'use strict';
// #799 RESEARCH ONLY: real composed-game damage with identical browser-shaped
// touch edges, replayed through the opt-in whole-Game fixed60 RAF owner.
// The result is evidence, not permission to enable the owner in production.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const DURATION_MS=6000;
function schedule(mode){
 if(mode==='uniform60')return Array(360).fill(1000/60);
 if(mode==='alternating40_120')return Array.from({length:180},()=>[25,1000/120]).flat();
 if(mode==='alternating120_40')return Array.from({length:180},()=>[1000/120,25]).flat();
 throw Error('unknown frame schedule');
}
function touchEvents(offsetMs){
 const events=[];
 for(let cycle=0;cycle<8;cycle++){
  const start=cycle*800+offsetMs;
  if(start<DURATION_MS){
   events.push({at:start,kind:'pointerdown',x:640});
   events.push({at:start+1,kind:'pointermove',x:680});
  }
  const end=start+500;
  if(end<DURATION_MS)events.push({at:end,kind:'pointerup',x:680});
 }
 return events.sort((a,b)=>a.at-b.at);
}
function trial(seed,cls,reload,mode,offsetMs){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);p.stats.reload=reload;
  const target=g.tanks.find(t=>t!==p);
  assert.ok(target,'real Game must supply hostile target');
  Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
  g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
  Object.assign(target,{cls:'scout',isPlayer:true,alive:true,
   x:200,y:0,vx:0,vy:0,hp:1000000,maxHp:1000000,
   gene:null,perk:null,spawnShieldT:0,shieldT:0,bulwarkT:0,tauntT:0,cloakT:0});
  g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
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
  let now=1000,callback=null,volleys=0,hits=0,damage=0;
  const births=[],originalFire=g.tryFire,originalDamage=g.damageTank;
  g.tryFire=function(t){
   const before=this.bullets.length,out=originalFire.apply(this,arguments);
   if(t===p&&this.bullets.length>before){
    volleys++;if(births.length<8)births.push(+this.time.toFixed(6));
   }
   return out;
  };
  g.damageTank=function(t){
   const before=t.hp,out=originalDamage.apply(this,arguments);
   if(t===target&&t.hp<before){
    assert.equal(arguments[2],p.id,'only player-owned hits count');
    hits++;damage+=before-t.hp;
   }
   return out;
  };
  // The target is a fixed-position damage dummy. Reset after EVERY simulation
  // tick, not every presented frame: reverse jitter executes two ticks before
  // one render, and frame-scoped resets would create a false damage disparity.
  const originalUpdate=g.update;
  g.update=function(dt){
   const out=originalUpdate.apply(this,arguments);
   target.x=200;target.y=0;target.vx=0;target.vy=0;
   return out;
  };
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const pendingSampledEvents=[];
  const renderCallbackLagsMs=[];
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null},
   render:()=>{
    for(const originalAt of pendingSampledEvents.splice(0))
     renderCallbackLagsMs.push(+(now-1000-originalAt*1000).toFixed(5));
   },maxSteps:2
  });
  // Per-frame update count and input sampling lag are research gates.
  // render() above is a NO-OP callback timing witness, not Canvas/GPU paint.
  const stepsByFrame={zero:0,one:0,two:0};
  const inputLagsMs=[];
  for(const kind of ['pd','pm','pu']){
   const original=g.input[kind];
   g.input[kind]=function(evt){
    if(Number.isFinite(evt.__novaSampleAt)&&Number.isFinite(evt.__novaOriginalAt)){
     inputLagsMs.push(+(1000*(evt.__novaSampleAt-evt.__novaOriginalAt)).toFixed(5));
     pendingSampledEvents.push(evt.__novaOriginalAt);
    }
    return original.apply(this,arguments);
   };
  }
  let elapsed=0,index=0;
  const edges=touchEvents(offsetMs);
  try{
   owner.start();
   for(const frame of schedule(mode)){
    elapsed+=frame;now=1000+elapsed;
    while(index<edges.length&&edges[index].at<=elapsed+1e-6){
     const e=edges[index++];
     const evt={type:e.kind,timeStamp:1000+e.at,
      pointerId:11,pointerType:'touch',clientX:e.x,clientY:300,
      button:0,buttons:e.kind==='pointerup'?0:1,
      target:{tagName:'CANVAS',closest:()=>null}};
     assert.equal(bridge.capture(evt),true,'touch event must be captured');
    }
    const next=callback;assert.equal(typeof next,'function','RAF ownership lost');
    callback=null;next(now);
    const steps=owner.lastSteps;
    assert.ok(steps>=0&&steps<=2,'bounded per-render simulation work');
    stepsByFrame[steps===0?'zero':steps===1?'one':'two']++;
   }
   assert.ok(Math.abs(elapsed-DURATION_MS)<1e-6);
   assert.equal(index,edges.length,'all input edges delivered');
   assert.equal(owner.droppedFrames,0,'ordinary jitter must not drop frames');
   assert.equal(owner.droppedMs,0,'ordinary jitter must not discard simulation');
   assert.equal(owner.ticks,360,'same six seconds of 60Hz Game updates');
   assert.equal(timeline.applied,edges.length,'all captured input edges replayed');
   assert.equal(bridge.lateClamps,0,'normal RAF jitter must not replay input late');
   assert.equal(bridge.reorderedClamps,0,'normal RAF jitter must not reorder touch');
   assert.equal(bridge.staleClamps,0,'normal RAF jitter must not drop touch');
   assert.equal(inputLagsMs.length,edges.length,'every touch edge has sampled timing');
   assert.equal(renderCallbackLagsMs.length,edges.length,'every sampled touch edge reaches the stubbed render callback');
   assert.ok(renderCallbackLagsMs.every(x=>x>=-0.001&&Number.isFinite(x)));
   assert.ok(inputLagsMs.every(x=>x>=-0.001&&Number.isFinite(x)));
   assert.equal(stepsByFrame.one+stepsByFrame.two*2,360);
   assert.equal(stepsByFrame.zero+stepsByFrame.one+stepsByFrame.two,schedule(mode).length);
   assert.ok(volleys>0,'touch gesture must actually fire');
   assert.ok(hits>0&&damage>0,'actual player-owned projectile hits required');
   return {seed,cls,reload,mode,offsetMs,ticks:owner.ticks,
    applied:timeline.applied,volleys,hits,damage:+damage.toFixed(5),
    births,stepsByFrame,maxInputSampleLagMs:Math.max(...inputLagsMs),
    meanInputSampleLagMs:+(inputLagsMs.reduce((a,b)=>a+b,0)/inputLagsMs.length).toFixed(5),
    maxRenderCallbackLagMs:Math.max(...renderCallbackLagsMs),
    meanRenderCallbackLagMs:+(renderCallbackLagsMs.reduce((a,b)=>a+b,0)/renderCallbackLagsMs.length).toFixed(5),
    spin:+(p.fireSpin||0).toFixed(5),heat:+(p.__v17Heat||0).toFixed(5)};
  }finally{owner.stop();g.destroy();}
 });
}
test('fixed60 research measures touch-driven real Gunner damage under matched mean-60Hz jitter',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]])
  for(const seed of [1517800,1517802])
   for(const offset of [7,12]){
    const baseline=trial(seed,cls,reload,'uniform60',offset);
    assert.deepEqual(trial(seed,cls,reload,'uniform60',offset),baseline);
    for(const mode of ['alternating40_120','alternating120_40']){
     const jitter=trial(seed,cls,reload,mode,offset);
     assert.deepEqual(trial(seed,cls,reload,mode,offset),jitter);
     // This is the intended chronology invariant, unlike frame presentation
     // timing: identical touch history and 60Hz ticks must yield equal combat.
     assert.equal(jitter.damage,baseline.damage,'real hit damage changed with RAF order');
     assert.equal(jitter.volleys,baseline.volleys,'volley count changed with RAF order');
     assert.equal(jitter.hits,baseline.hits,'hit count changed with RAF order');
     assert.deepEqual(jitter.births,baseline.births,'projectile birth chronology changed');
     assert.equal(jitter.spin,baseline.spin,'Gunner spin changed with RAF order');
     assert.equal(jitter.heat,baseline.heat,'Gunner heat changed with RAF order');
     rows.push({cls,seed,offset,baseline,jitter,
      equalDamage:true,equalVolleys:true});
    }
   }
 console.log('GUNNER_FIXED60_TOUCH_DAMAGE '+JSON.stringify(rows));
 // Enforce combat chronology, not a fixed weapon balance number or an
 // unrealistically identical render-callback delay across frame schedules.
 assert.equal(rows.length,16);
});
