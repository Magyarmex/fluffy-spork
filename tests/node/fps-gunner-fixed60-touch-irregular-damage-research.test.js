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
 if(mode==='uniform30')return Array(180).fill(1000/30);
 if(mode==='alternating20_60')return Array.from({length:90},()=>[50,1000/60]).flat();
 if(mode==='alternating60_20')return Array.from({length:90},()=>[1000/60,50]).flat();
 if(mode==='clustered55_11')return Array.from({length:45},()=>
  [55,55,1000/15-55,1000/15-55]).flat();
 // Real Chromium can quantize an ideal 83.333/16.667ms gate to this shape.
 // The four-frame group still totals 133.333ms (mean 30Hz), without stalls.
 if(mode==='quantized83_16')return Array.from({length:45},()=>
  [83.4,16.6,16.6,1000/7.5-83.4-16.6-16.6]).flat();
 // A 0.05ms shift moves the backlog overflow boundary without changing
 // total wall time, mean presentation FPS or the input event chronology.
 if(mode==='quantized83_16_shifted')return Array.from({length:45},()=>
  [83.45,16.6,16.6,1000/7.5-83.45-16.6-16.6]).flat();
 if(mode==='quantized83_16_reversed')return Array.from({length:45},()=>
  [16.6,16.6,1000/7.5-83.4-16.6-16.6,83.4]).flat();
 // Deliberately adversarial mean-30Hz active pattern: both bounded budgets
 // can discard time even though every gap is strictly below 100ms.
 if(mode==='adversarial30')return Array.from({length:45},()=>{
  const a=6.9267489,b=95.49032479,c=30.76815672;
  return [a,b,c,1000/7.5-a-b-c];
 }).flat();
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
function trial(seed,cls,reload,mode,offsetMs,expectedTicks=360,maxSteps=2,backlogExtraTicks=2){
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
   },maxSteps,backlogExtraTicks
  });
  // Per-frame update count and input sampling lag are research gates.
  // render() above is a NO-OP callback timing witness, not Canvas/GPU paint.
  const stepsByFrame={zero:0,one:0,two:0,three:0,four:0};
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
    assert.ok(steps>=0&&steps<=maxSteps,'bounded per-render simulation work');
    stepsByFrame[['zero','one','two','three','four'][steps]]++;
   }
   assert.ok(Math.abs(elapsed-DURATION_MS)<1e-6);
   assert.equal(index,edges.length,'all input edges delivered');
   if(expectedTicks!=='research-drop')
    assert.equal(owner.droppedFrames,0,'ordinary jitter must not drop frames');
   if(expectedTicks!=='research-drop')
    assert.equal(owner.droppedMs,0,'ordinary jitter must not discard simulation');
   if(expectedTicks==='research-drop')assert.ok(owner.ticks>0&&owner.ticks<=360);
   else if(expectedTicks===null)assert.ok([359,360].includes(owner.ticks),
    'reversed final 50ms frame may leave one tick queued, never more');
   else assert.equal(owner.ticks,expectedTicks,'same six seconds of 60Hz Game updates');
   assert.equal(timeline.applied,edges.length,'all captured input edges replayed');
   assert.equal(bridge.lateClamps,0,'normal RAF jitter must not replay input late');
   assert.equal(bridge.reorderedClamps,0,'normal RAF jitter must not reorder touch');
   assert.equal(bridge.staleClamps,0,'normal RAF jitter must not drop touch');
   assert.equal(inputLagsMs.length,edges.length,'every touch edge has sampled timing');
   assert.equal(renderCallbackLagsMs.length,edges.length,'every sampled touch edge reaches the stubbed render callback');
   assert.ok(renderCallbackLagsMs.every(x=>x>=-0.001&&Number.isFinite(x)));
   assert.ok(inputLagsMs.every(x=>x>=-0.001&&Number.isFinite(x)));
   assert.equal(stepsByFrame.one+stepsByFrame.two*2+
    stepsByFrame.three*3+stepsByFrame.four*4,owner.ticks);
   assert.equal(Object.values(stepsByFrame).reduce((a,b)=>a+b,0),schedule(mode).length);
   assert.ok(volleys>0,'touch gesture must actually fire');
   assert.ok(hits>0&&damage>0,'actual player-owned projectile hits required');
   return {seed,cls,reload,mode,offsetMs,ticks:owner.ticks,
    backlogMs:+owner.lagMs.toFixed(5),droppedMs:owner.droppedMs,
    droppedFrames:owner.droppedFrames,
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

// Research-only falsifier: equal six-second wall time at 30Hz average does
// not guarantee identical chronology under a two-tick-per-RAF budget. A
// 50ms presentation gap needs three 60Hz ticks; the next short frame must
// repay that debt without dropping, clamping or reordering held touch input.
test('fixed60 research challenges Gunner touch damage at mean 30Hz and 20/60Hz bursts',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]])
  for(const seed of [1517800,1517802])
   for(const offset of [7,12]){
    const reference=trial(seed,cls,reload,'uniform60',offset);
    for(const mode of ['uniform30','alternating20_60','alternating60_20']){
     const actual=trial(seed,cls,reload,mode,offset,
      mode==='alternating60_20'?null:360);
     if(mode==='alternating60_20'&&actual.ticks===359){
      // The final 50ms RAF cannot perform all three owed ticks with a
      // two-step budget. That tick is QUEUED, not silently dropped.
      assert.equal(actual.droppedMs,0);
      assert.ok(actual.backlogMs>0);
      rows.push({cls,seed,offset,mode,ticks:actual.ticks,
       backlogMs:actual.backlogMs,unfinishedAtCaptureBoundary:true});
      continue;
     }
     assert.equal(actual.ticks,reference.ticks,'30Hz presentation lost simulation ticks');
     assert.equal(actual.damage,reference.damage,'real Gunner damage diverged at mean 30Hz');
     assert.equal(actual.volleys,reference.volleys,'Gunner volley chronology diverged');
     assert.equal(actual.hits,reference.hits,'Gunner collision count diverged');
     assert.deepEqual(actual.births,reference.births,'projectile birth chronology diverged');
     rows.push({cls,seed,offset,mode,damage:actual.damage,
      maxInputSampleLagMs:actual.maxInputSampleLagMs,
      maxRenderCallbackLagMs:actual.maxRenderCallbackLagMs,
      stepsByFrame:actual.stepsByFrame,unfinishedAtCaptureBoundary:false});
    }
   }
 console.log('GUNNER_FIXED60_MEAN30_TOUCH_DAMAGE '+JSON.stringify(rows));
 assert.equal(rows.length,24);
});

// This is a NEGATIVE CONTROL, not a desired gameplay golden. A repeated
// 55/55/11.667/11.667ms presentation averages 30Hz, never stalls >100ms,
// yet can exceed the research owner's two-step + four-tick backlog budget.
// Capture real player-owned damage to expose the practical cost of time loss.
test('fixed60 research detects clustered 30Hz dropped combat time rather than claiming universal parity',()=>{
 const baseline=trial(1517800,'minigun',1,'uniform60',12);
 const clustered=trial(1517800,'minigun',1,'clustered55_11',12,'research-drop');
 assert.equal(clustered.applied,baseline.applied,'touch events must remain delivered');
 if(clustered.droppedMs>0){
  assert.ok(clustered.ticks<baseline.ticks,
   'dropped time must be visible as fewer actual Game updates');
  assert.ok(clustered.droppedFrames>0);
 }else{
  // A future safe owner that preserves all ticks should satisfy the
  // original damage/volley chronology instead of being rejected for fixing it.
  assert.equal(clustered.ticks,baseline.ticks);
  assert.equal(clustered.damage,baseline.damage);
  assert.equal(clustered.volleys,baseline.volleys);
 }
 console.log('GUNNER_FIXED60_CLUSTERED30_FALSIFIER '+JSON.stringify({
  baseline:{ticks:baseline.ticks,damage:baseline.damage,volleys:baseline.volleys},
  clustered:{ticks:clustered.ticks,damage:clustered.damage,
   volleys:clustered.volleys,droppedMs:clustered.droppedMs,
   droppedFrames:clustered.droppedFrames,backlogMs:clustered.backlogMs}}));
});

// Research alternatives only: either allow one extra queued tick (more
// simulation-phase latency) or permit three updates in a rendered frame
// (more CPU burst risk). Neither policy is approved for production.
test('fixed60 research compares bounded clustered30 recovery budgets with real Gunner damage',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  const baseline=trial(1517800,cls,reload,'uniform60',12);
  for(const [maxSteps,backlogExtraTicks] of [[2,3],[3,2]]){
   const candidate=trial(1517800,cls,reload,'clustered55_11',12,
    360,maxSteps,backlogExtraTicks);
   assert.equal(candidate.droppedMs,0);
   assert.equal(candidate.damage,baseline.damage,
    'bounded recovery must preserve actual player-owned damage');
   assert.equal(candidate.volleys,baseline.volleys);
   assert.equal(candidate.hits,baseline.hits);
   assert.deepEqual(candidate.births,baseline.births);
   rows.push({cls,maxSteps,backlogExtraTicks,damage:candidate.damage,
    stepsByFrame:candidate.stepsByFrame,
    meanRenderCallbackLagMs:candidate.meanRenderCallbackLagMs});
  }
 }
 console.log('GUNNER_FIXED60_CLUSTERED30_RECOVERY '+JSON.stringify(rows));
 assert.equal(rows.length,4);
});

// Research-only real-damage follow-up to #895/#896: a browser-quantized
// 30Hz pattern can cross a whole-tick backlog threshold despite unchanged
// mean FPS. Do not freeze dropped ticks as a desired outcome. Each candidate
// uses the actual composed Game, projectile collisions and chronological touch.
test('quantized mean-30Hz RAF measures actual Gunner damage across bounded budgets',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  const reference=trial(1517800,cls,reload,'uniform60',12);
  for(const [maxSteps,extra] of [[2,2],[3,2],[3,3],[4,2]]){
   const result=trial(1517800,cls,reload,'quantized83_16',12,
    'research-drop',maxSteps,extra);
   assert.ok(result.ticks<=reference.ticks,'quantized gate cannot invent updates');
   assert.equal(result.applied,reference.applied,'all chronological touch edges must arrive');
   if(result.droppedMs===0&&result.ticks===reference.ticks){
    assert.equal(result.damage,reference.damage,'no-loss policy must preserve applied damage');
    assert.equal(result.volleys,reference.volleys,'no-loss policy must preserve volley cadence');
    assert.deepEqual(result.births,reference.births,'no-loss policy must preserve projectile chronology');
   }
   rows.push({cls,maxSteps,extra,ticks:result.ticks,
    droppedMs:result.droppedMs,damage:result.damage,
    volleys:result.volleys,hits:result.hits,
    maxRenderCallbackLagMs:result.maxRenderCallbackLagMs,
    stepsByFrame:result.stepsByFrame});
  }
 }
 assert.equal(rows.length,8);
 console.log('GUNNER_FIXED60_QUANTIZED30_REAL_DAMAGE '+JSON.stringify(rows));
});

// #799: adversarial, actual-Game comparison of two bounded recovery budgets.
// Identical touch history, world seed and elapsed time are required; avoid
// treating a recovered isolated schedule as general production readiness.
test('quantized 30Hz recovery budgets cross-check real damage and touch chronology across phase and sub-ms jitter',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm']){
  const reload=cls==='minigun'?1:3;
  for(const seed of [1517800,1517802])for(const offset of [7,12]){
   const reference=trial(seed,cls,reload,'uniform60',offset);
   for(const mode of ['quantized83_16','quantized83_16_shifted','quantized83_16_reversed','adversarial30']){
    const candidates=[];
    for(const [maxSteps,extra] of [[3,3],[4,2]]){
     const result=trial(seed,cls,reload,mode,offset,'research-drop',maxSteps,extra);
     assert.equal(result.applied,reference.applied,'touch event count changed');
     // A phase-reversed trace ends immediately after its long frame. Unpaid
     // ticks may remain queued, not dropped: account for both explicitly.
     assert.ok(Math.abs(result.ticks*(1000/60)+result.droppedMs+result.backlogMs-DURATION_MS)<0.002,
      'wall time must equal executed, discarded and queued simulation time');
     assert.ok(Number.isFinite(result.maxInputSampleLagMs)&&result.maxInputSampleLagMs>=0,
      'missing chronological touch sampling measurement');
     assert.ok(Number.isFinite(result.maxRenderCallbackLagMs)&&result.maxRenderCallbackLagMs>=0,
      'missing touch-to-render callback measurement');
     assert.ok(result.stepsByFrame.four===0||maxSteps===4,'three-step budget performed four updates');
     if(result.droppedMs===0&&result.ticks===360){
      assert.equal(result.damage,reference.damage,'recovered damage differs from uniform 60Hz');
      assert.equal(result.volleys,reference.volleys,'recovered volley count differs');
      assert.equal(result.hits,reference.hits,'recovered hit count differs');
      assert.deepEqual(result.births,reference.births,'recovered projectile births differ');
     }
     candidates.push({maxSteps,extra,ticks:result.ticks,droppedMs:result.droppedMs,
      damage:result.damage,volleys:result.volleys,
      maxInputSampleLagMs:result.maxInputSampleLagMs,
      maxRenderCallbackLagMs:result.maxRenderCallbackLagMs,
      threeStepFrames:result.stepsByFrame.three,fourStepFrames:result.stepsByFrame.four});
    }
    rows.push({cls,seed,offset,mode,candidates});
   }
  }
 }
 assert.equal(rows.length,32);
 console.log('GUNNER_FIXED60_QUANTIZED_BUDGET_CROSSCHECK '+JSON.stringify(rows));
});
