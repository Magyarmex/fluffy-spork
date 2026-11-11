'use strict';
// #641 Research only: active foreground scheduling gaps must not resurrect
// a short shot whose physical release is no longer a fresh command.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
function run({maxAge=100,age=50,clockFailure=false,releaseClockFailure=false,cancel=false,kind='touch'}={}){
 return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  g.status='playing';g.paused=false;g.player.fireCd=0;
  let clock=1000,throwNow=false,shots=0;
  const owner=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document,
   maxIntentAgeMs:maxAge,nowMs:()=>{if(throwNow)throw Error('clock unavailable');return clock;}});
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
  ['clock rewind',{maxAge:100,age:-1}]
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
