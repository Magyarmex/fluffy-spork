'use strict';
// #641 Research only: active foreground scheduling gaps must not resurrect
// a short shot whose physical release is no longer a fresh command.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
function run({maxAge=100,age=50,clockFailure=false,releaseClockFailure=false,clockFault=null,cancel=false,kind='touch'}={}){
 return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  g.status='playing';g.paused=false;g.player.fireCd=0;
  let clock=1000,throwNow=false,shots=0;
  const owner=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document,
   maxIntentAgeMs:maxAge,nowMs:()=>{if(throwNow)throw Error('clock unavailable');
    if(clock>1000&&clockFault==='bigint')return 1n;
    if(clock>1000&&clockFault==='symbol')return Symbol('invalid clock');
    return clock;}});
  const i=g.input,fire=g.tryFire;
  g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
   if(t===g.player&&this.bullets.length>n)shots++;return r;};
  const event=(type,x,buttons)=>({type,pointerType:kind,pointerId:11,button:0,buttons,
   clientX:x,clientY:200,target:{closest:()=>null}});
  try{
   i.pd(event('pointerdown',600,1));
   i.pm(event('pointermove',640,1));
   throwNow=releaseClockFailure;
   i.pu(event(cancel?'pointercancel':'pointerup',640,0));
   clock+=age;throwNow=clockFailure;
   g.update(1/60);
   const out={shots,intents:owner.intents,rejectedStale:owner.rejectedStale,
    pending:!!owner.pending,aim:i.aim.active,firing:i.firing,leakedIntent:i.__novaShotIntent};
   return out;
  }finally{owner.detach();g.destroy();}
 });
}
test('direct shot intent accepts fresh wall-clock press but rejects aged and invalid clocks',()=>{
 for(const kind of ['touch','mouse']){
 const fresh=run({maxAge:100,age:50,kind});
 assert.equal(fresh.shots,1,kind);assert.equal(fresh.intents,1,kind);assert.equal(fresh.rejectedStale,0,kind);
 for(const [name,opts] of [
  ['stale',{maxAge:100,age:101}],
  ['zero-age expired',{maxAge:0,age:1}],
  ['clock exception',{maxAge:100,age:50,clockFailure:true}],
  ['release clock exception',{maxAge:100,age:50,releaseClockFailure:true}],
  ['clock rewind',{maxAge:100,age:-1}],
  ['bigint clock',{maxAge:100,age:50,clockFault:'bigint'}],
  ['symbol clock',{maxAge:100,age:50,clockFault:'symbol'}]
 ]){
  const out=run({...opts,kind});
  assert.equal(out.shots,0,name);
  assert.equal(out.intents,0,name);
  assert.equal(out.rejectedStale,1,name);
  assert.equal(out.pending,false,name);
  assert.equal(out.leakedIntent,undefined,name);
  assert.equal(out.firing,false,name);
 }
 const exact=run({maxAge:0,age:0,kind});
 assert.equal(exact.shots,1,'zero-age gate accepts exact release time');
 const canceled=run({maxAge:100,age:10,cancel:true,kind});
 assert.equal(canceled.shots,0);assert.equal(canceled.rejectedStale,0);
 const ungated=run({maxAge:Infinity,age:500,kind});
 assert.equal(ungated.shots,1,'existing opt-out research behavior is unchanged');
 console.log('DIRECT_SHOT_FRESHNESS '+JSON.stringify({kind,fresh,exact,canceled,ungated,
  caveat:'controlled research clock, not measured browser latency or human press duration'}));
 }
});
test('invalid freshness gate fails closed before installing any input wrappers',()=>{
 const g=bootGame();const win=g.__testWindow,doc=win.document;
 try{
  for(const value of [-1,NaN,'100',null]){
   assert.throws(()=>new DirectShotIntent(g,{window:win,document:doc,maxIntentAgeMs:value,nowMs:()=>0}),
    /freshness/);
  }
  assert.throws(()=>new DirectShotIntent(g,{window:win,document:doc,maxIntentAgeMs:100}),/freshness/);
 }finally{g.destroy();}
});

test('unrelated movement cancellation cannot erase pending aimed shot; matching cancellation can',()=>{
 function arm(cancelId){
  return withSeed(1517800,()=>{
   const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
   g.status='playing';g.paused=false;g.player.fireCd=0;
   const i=g.input,o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
   let shots=0;const fire=g.tryFire;
   g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
    if(t===g.player&&this.bullets.length>n)shots++;return r;};
   const e=(type,id,x,buttons)=>({type,pointerType:'touch',pointerId:id,button:0,buttons,
    clientX:x,clientY:200,target:{closest:()=>null}});
   try{
    i.pd(e('pointerdown',11,600,1));i.pm(e('pointermove',11,640,1));
    i.pu(e('pointerup',11,640,0));
    assert.ok(o.pending,'aimed press must be pending');
    i.pd(e('pointerdown',12,100,1));
    i.pu(e('pointercancel',cancelId,cancelId===11?640:100,0));
    const stillPending=!!o.pending;
    g.update(1/60);
    return {shots,stillPending,aimOwner:i.stickId.aim,moveOwner:i.stickId.move,
     leak:i.__novaShotIntent};
   }finally{o.detach();g.destroy();}
  });
 }
 const unrelated=arm(12),matching=arm(11);
 assert.equal(unrelated.stillPending,true,'left-stick cancel must not revoke unrelated shot');
 assert.equal(unrelated.shots,1);
 assert.equal(unrelated.aimOwner,-1);assert.equal(unrelated.moveOwner,-1);
 assert.equal(matching.stillPending,false,'late cancellation from same source revokes pending shot');
 assert.equal(matching.shots,0);
 assert.equal(unrelated.leak,undefined);assert.equal(matching.leak,undefined);
 console.log('DIRECT_SHOT_CANCEL_OWNERSHIP '+JSON.stringify({unrelated,matching}));
});

test('redeploy rejects pending shot and releases held prior-life aim ownership',()=>{
 for(const phase of ['pending','held']){
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  const i=g.input,o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  let shots=0;const fire=g.tryFire;
  g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
   if(t===g.player&&this.bullets.length>n)shots++;return r;};
  const e=(type,x,buttons)=>({type,pointerType:'touch',pointerId:11,button:0,buttons,
   clientX:x,clientY:200,target:{closest:()=>null}});
  try{
   i.pd(e('pointerdown',600,1));i.pm(e('pointermove',640,1));
   if(phase==='pending')i.pu(e('pointerup',640,0));
   const original=g.player;
   g.spawnPlayer();assert.notEqual(g.player,original);
   g.update(1/60);
   assert.equal(shots,0,phase+' old-life input cannot fire the replacement');
   assert.equal(o.intents,0,phase);
   assert.equal(o.pending,null,phase);
   assert.equal(o.down,null,phase);
   assert.equal(i.stickId.aim,-1,phase);
   assert.equal(i.aim.active,false,phase);
   assert.equal(i.firing,false,phase);
   assert.equal(i.__novaShotIntent,undefined,phase);
  }finally{o.detach();g.destroy();}
 }
});

test('trusted physical DOM release age, not replay time, gates short-shot recovery',()=>{
 function physicalAge({kind='touch',originalAt=.25,trusted=true,withOrigin=true,withMetadata=true}={}){
  return withSeed(1517800,()=>{
   const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
   g.status='playing';g.paused=false;g.player.fireCd=0;
   const clock=1300;
   const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document,
    maxIntentAgeMs:100,nowMs:()=>clock,...(withOrigin?{eventOriginMs:1000}:{})});
   const i=g.input,fire=g.tryFire;let shots=0;
   g.tryFire=function(t){const n=this.bullets.length,out=fire.apply(this,arguments);
    if(t===g.player&&this.bullets.length>n)shots++;return out;};
   const e=(type,x,buttons)=>({type,pointerType:kind,pointerId:11,button:0,buttons,
    clientX:x,clientY:200,target:{closest:()=>null}});
   try{
    i.pd(e('pointerdown',600,1));i.pm(e('pointermove',640,1));
    const up=e('pointerup',640,0);
    if(withMetadata){up.__novaOriginalAt=originalAt;up.__novaTimestampTrusted=trusted;}
    i.pu(up);g.update(1/60);
    return {shots,intents:o.intents,rejected:o.rejectedStale,pending:o.pending,
     leaked:i.__novaShotIntent,aim:i.aim.active,firing:i.firing};
   }finally{o.detach();g.destroy();}
  });
 }
 for(const kind of ['touch','mouse']){
  const fresh=physicalAge({kind,originalAt:.25}); // physical release 1250ms, replay 1300ms
  const stale=physicalAge({kind,originalAt:.15}); // physical release 1150ms, replay 1300ms
  const future=physicalAge({kind,originalAt:.35});
  const untrusted=physicalAge({kind,originalAt:.25,trusted:false});
  const invalid=physicalAge({kind,originalAt:NaN});
  const ambiguousStart=physicalAge({kind,originalAt:0});
  const legacy=physicalAge({kind,originalAt:.15,withOrigin:false});
  const direct=physicalAge({kind,withMetadata:false});
  assert.equal(fresh.shots,1,kind+' fresh physical release fires');
  assert.equal(stale.shots,0,kind+' stale physical release must not be refreshed at replay');
  assert.equal(future.shots,0,kind+' future occurrence must fail closed');
  assert.equal(untrusted.shots,0,kind+' untrusted replay metadata fails closed');
  assert.equal(invalid.shots,0,kind+' invalid physical timestamp fails closed');
  assert.equal(ambiguousStart.shots,0,kind+' ambiguous bridge-start timestamp fails closed');
  assert.equal(legacy.shots,1,kind+' opt-out preserves previous replay-time behavior');
  assert.equal(direct.shots,1,kind+' direct DOM release without timeline metadata stays valid');
  for(const rejected of [stale,future,untrusted,invalid,ambiguousStart]){
   assert.equal(rejected.rejected,1,kind+' rejected age accounted');
   assert.equal(rejected.pending,null,kind+' pending cleared');
   assert.equal(rejected.leaked,undefined,kind+' no synthetic input leaked');
   assert.equal(rejected.firing,false,kind+' physical firing remains released');
  }
 }
});

test('actual BrowserEventTimeline provenance rejects a late replayed release',()=>{
 const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
 const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
 function replay(releaseMs,withOrigin){
  return withSeed(1517800,()=>{
   const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
   g.status='playing';g.paused=false;g.player.fireCd=0;
   let now=1000,shots=0;
   const timeline=new ChronologicalInput(g.input);
   const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
   const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document,
    maxIntentAgeMs:100,nowMs:()=>now,...(withOrigin?{eventOriginMs:bridge.startMs}:{})});
   const fire=g.tryFire;
   g.tryFire=function(t){const n=this.bullets.length,out=fire.apply(this,arguments);
    if(t===g.player&&this.bullets.length>n)shots++;return out;};
   try{
    now=1300; // Browser delivered all three DOM edges late but under 2000ms cutoff.
    for(const [type,at,x,buttons] of [
     ['pointerdown',releaseMs-20,600,1],
     ['pointermove',releaseMs-10,640,1],
     ['pointerup',releaseMs,640,0]]){
     assert.equal(bridge.capture({type,timeStamp:at,pointerType:'touch',
      pointerId:11,button:0,buttons,clientX:x,clientY:200,
      target:{tagName:'CANVAS',closest:()=>null}}),true);
    }
    timeline.consumeThrough(.3); // Accepted occurrence metadata reaches real Input.
    assert.equal(timeline.applied,3);
    g.update(1/60);
    return {shots,intents:o.intents,rejected:o.rejectedStale,
     lateClamps:bridge.lateClamps,leak:g.input.__novaShotIntent};
   }finally{o.detach();g.destroy();}
  });
 }
 const fresh=replay(1250,true),stale=replay(1150,true),legacy=replay(1150,false),
  preStart=replay(950,true);
 assert.equal(fresh.shots,1,'50ms-old physical release is still fresh');
 assert.equal(stale.shots,0,'150ms-old physical release must not gain a new replay budget');
 assert.equal(stale.rejected,1);
 assert.equal(preStart.shots,0,'pre-start physical release must not be refreshed at bridge start');
 assert.equal(preStart.rejected,1);
 assert.equal(legacy.shots,1,'legacy replay-clock control demonstrates the failure mode');
 for(const out of [fresh,stale,legacy,preStart]){
  assert.equal(out.lateClamps,0,'test does not depend on timeline clamping');
  assert.equal(out.leak,undefined,'synthetic shot state cleaned');
 }
});
