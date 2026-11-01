'use strict';
// Research-only feasibility gate: the complete 48-overlay Game is unchanged.
// A 30Hz renderer may execute two 60Hz simulation ticks, but it must not
// replay the latest input into a tick that ends before that event occurred.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
class Timeline {
 constructor(){this.events=[];this.index=0;this.last=-Infinity;this.state={mx:0,my:0,ax:0,ay:0,fire:false};}
 push(time,patch){
  if(!Number.isFinite(time)||time<this.last||!patch||typeof patch!=='object')throw Error('invalid event');
  // Bound *pending* events, not lifetime events. An ordinary long match
  // produces thousands of pointer samples; consumed entries must be recycled.
  if(this.index>0){this.events.splice(0,this.index);this.index=0;}
  if(this.events.length>=128)throw Error('input queue full');
  this.events.push({time,patch});this.last=time;
 }
 sample(end){
  if(!Number.isFinite(end)||end<this.lastSampled)throw Error('nonmonotonic tick');
  this.lastSampled=end;let abilities=0;
  while(this.index<this.events.length&&this.events[this.index].time<=end+1e-9){
   const p=this.events[this.index++].patch;
   if(p.ability)abilities++;
   for(const key of ['mx','my','ax','ay','fire'])if(key in p)this.state[key]=p[key];
  }
  if(this.index>=64){this.events.splice(0,this.index);this.index=0;}
  return {...this.state,abilities};
 }
 reset(){this.events=[];this.index=0;this.last=-Infinity;this.lastSampled=-Infinity;
  this.state={mx:0,my:0,ax:0,ay:0,fire:false};}
}
function events(){
 const e=[{time:0,patch:{mx:1,my:0,ax:1,ay:0,fire:true}}];
 for(let t=.02;t<3;t+=.27){const a=t*2.1;e.push({time:+t.toFixed(6),patch:{mx:Math.cos(a),my:Math.sin(a)}});}
 for(let t=.055;t<3;t+=.38){const a=t*1.6;e.push({time:+t.toFixed(6),patch:{ax:Math.cos(a),ay:Math.sin(a)}});}
 e.push({time:.39,patch:{ability:true}},{time:1.51,patch:{fire:false}},{time:2.08,patch:{fire:true}});
 return e.sort((a,b)=>a.time-b.time);
}
function run(seed,hz,mode){return withSeed(seed,draws=>{
 const g=bootGame(),p=g.player,tl=new Timeline(),trace=events();
 for(const e of trace)tl.push(e.time,e.patch);
 g.sfx.muted=true;g.input.autofire=false;g.input.mouseActive=false;
 let state={mx:0,my:0,ax:0,ay:0,fire:false};
 g.input.moveVec=()=>({x:state.mx,y:state.my});
 g.input.aimVec=()=>({x:state.ax,y:state.ay});
 const initial=digest(physical(g));let ticks=0,premature=0;
 for(let f=1;f<=3*hz;f++){
  const goal=mode==='native'?f:Math.floor(f*60/hz+1e-9);
  const frameInput=mode==='naive'?tl.sample(f/hz):null;
  while(ticks<goal){
   if(!p.alive||g.status!=='playing')break;
   if(g.paused&&g.pendingOffer)g.dismissOffer();
   const end=(ticks+1)/(mode==='native'?hz:60);
   if(frameInput&&trace.some(e=>e.time>end+1e-9&&e.time<=f/hz+1e-9))premature++;
   const input=frameInput||tl.sample(end);
   state=input;g.input.firing=input.fire;
   if(input.abilities&&(!frameInput||ticks===goal-2))g.input.abilityQueued=true;
   g.update(1/(mode==='native'?hz:60));ticks++;
  }
  if(!p.alive||g.status!=='playing')break;
 }
 return {initial,final:digest(physical(g)),draws:draws(),ticks,premature};
});}
test('timeline bounds, ordering and one-shot ability edges',()=>{
 const t=new Timeline();t.push(0,{mx:1});t.push(.02,{ability:true,fire:true});
 assert.equal(t.sample(1/60).mx,1);assert.equal(t.sample(1/60).abilities,0);
 assert.equal(t.sample(2/60).abilities,1);assert.equal(t.sample(3/60).abilities,0);
 assert.equal(t.sample(3/60).fire,true);
 assert.throws(()=>t.push(.01,{mx:0}),/invalid event/);
 assert.throws(()=>t.sample(.01),/nonmonotonic tick/);
 t.push(.2,{mx:1,fire:true,ability:true});
 t.reset();
 assert.deepEqual(t.sample(.3),{mx:0,my:0,ax:0,ay:0,fire:false,abilities:0},
  'pause, blur or redeploy must not replay stale firing or ability edges');
});
test('long-lived input queue reclaims consumed entries and preserves ability/release edges',()=>{
 const t=new Timeline();let abilities=0;
 for(let i=0;i<10000;i++){
  const at=i/120;
  t.push(at,{mx:i%2?1:-1,fire:i%7===0,ability:i%41===0});
  const sample=t.sample(at+1/240);
  abilities+=sample.abilities;
  assert.equal(sample.mx,i%2?1:-1);
  assert.equal(sample.fire,i%7===0);
  assert.ok(t.events.length<=128,'queue must remain bounded over a long match');
 }
 assert.equal(abilities,Math.ceil(10000/41));
 assert.equal(t.sample(100).abilities,0,'one-shot ability must never replay');
 const blocked=new Timeline();for(let i=0;i<128;i++)blocked.push(i/1000,{mx:1});
 assert.throws(()=>blocked.push(.129,{fire:false}),/input queue full/,
  'genuinely unconsumed backlog remains bounded');
 blocked.sample(.127);blocked.push(.129,{fire:false});
 assert.equal(blocked.sample(.129).fire,false,'release after backlog compaction survives');
});
test('timestamped fixed 60Hz Game preserves 60Hz play and cross-render physical hashes',()=>{
 for(const seed of [1517800,1517802,1517810]){
  const a=[30,60,120].map(hz=>run(seed,hz,'fixed'));
  const native60=run(seed,60,'native'),naive30=run(seed,30,'naive');
  assert.ok(a.every(x=>x.initial===a[0].initial));
  assert.ok(a.every(x=>x.final===a[0].final&&x.draws===a[0].draws&&x.ticks===a[0].ticks),
   'fixed simulation must not depend on render cadence');
  assert.equal(native60.final,a[0].final,'existing 60Hz game behavior preserved');
  assert.notEqual(naive30.final,a[0].final,'naive frame-end input replay changes physics');
  assert.ok(naive30.premature>0,'naive replay consumes events from a later tick');
 }
});

test('fixed-step catch-up stops at an actual in-frame evolution pause',()=>{
 const g=withSeed(1517800,()=>bootGame());
 g.sfx.muted=true;
 const update=g.update;
 g.update=function(dt){
  update.call(this,dt);
  if(this.time>=1/60-1e-9 && !this.pendingOffer)this.tryOffer(1);
 };
 let ticks=0;
 // One 30Hz presentation frame would normally require two 60Hz updates.
 for(let substep=0;substep<2;substep++){
  if(g.paused)break;
  g.update(1/60);ticks++;
 }
 assert.equal(ticks,1,'no second update after the offer pauses the game');
 assert.equal(g.pendingOffer,1);
 assert.equal(g.paused,true);
 assert.ok(Math.abs(g.time-1/60)<1e-9,'paused game time must not advance');
 const bad=withSeed(1517800,()=>bootGame());
 bad.sfx.muted=true;
 const badUpdate=bad.update;
 bad.update=function(dt){badUpdate.call(this,dt);if(this.time>=1/60-1e-9&&!this.pendingOffer)this.tryOffer(1);};
 bad.update(1/60);bad.update(1/60);
 assert.ok(bad.paused&&Math.abs(bad.time-2/60)<1e-9,
  'unguarded catch-up demonstrably advances the paused world');
});
