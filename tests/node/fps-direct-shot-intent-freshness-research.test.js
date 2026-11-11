'use strict';
// #641 Research only: active foreground scheduling gaps must not resurrect
// a short shot whose physical release is no longer a fresh command.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
function run({maxAge=100,age=50,clockFailure=false,cancel=false}={}){
 return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  g.status='playing';g.paused=false;g.player.fireCd=0;
  let clock=1000,throwNow=false,shots=0;
  const owner=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document,
   maxIntentAgeMs:maxAge,nowMs:()=>{if(throwNow)throw Error('clock unavailable');return clock;}});
  const i=g.input,fire=g.tryFire;
  g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
   if(t===g.player&&this.bullets.length>n)shots++;return r;};
  const event=(type,x,buttons)=>({type,pointerType:'touch',pointerId:11,button:0,buttons,
   clientX:x,clientY:200,target:{closest:()=>null}});
  try{
   i.pd(event('pointerdown',600,1));
   i.pm(event('pointermove',640,1));
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
 const fresh=run({maxAge:100,age:50});
 assert.equal(fresh.shots,1);assert.equal(fresh.intents,1);assert.equal(fresh.rejectedStale,0);
 for(const [name,opts] of [
  ['stale',{maxAge:100,age:101}],
  ['zero-age expired',{maxAge:0,age:1}],
  ['clock exception',{maxAge:100,age:50,clockFailure:true}],
  ['clock rewind',{maxAge:100,age:-40}]
 ]){
  const out=run(opts);
  assert.equal(out.shots,0,name);
  assert.equal(out.intents,0,name);
  assert.equal(out.rejectedStale,1,name);
  assert.equal(out.pending,false,name);
  assert.equal(out.leakedIntent,undefined,name);
  assert.equal(out.firing,false,name);
 }
 const exact=run({maxAge:0,age:0});
 assert.equal(exact.shots,1,'zero-age gate accepts exact release time');
 const canceled=run({maxAge:100,age:10,cancel:true});
 assert.equal(canceled.shots,0);assert.equal(canceled.rejectedStale,0);
 const ungated=run({maxAge:Infinity,age:500});
 assert.equal(ungated.shots,1,'existing opt-out research behavior is unchanged');
 console.log('DIRECT_SHOT_FRESHNESS '+JSON.stringify({fresh,exact,canceled,ungated,
  caveat:'controlled research clock, not measured browser latency or human press duration'}));
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
