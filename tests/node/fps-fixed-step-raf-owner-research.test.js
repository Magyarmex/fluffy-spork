'use strict';
// Opt-in RAF research uses the actual 49-overlay Game and its Input, but does
// not modify the production Game.start loop. Not a mobile device benchmark.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput,STEP}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner,STEP_MS}=require('../research/fixed-step-raf-owner.cjs');
function setup(game,{render=null,maxSteps=2}={}){
 let now=1000,next=0,active=new Map(),cancelled=[];
 const timeline=new ChronologicalInput(game.input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 game.sfx.startMusic=()=>{};
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
  now:()=>now,request:fn=>{active.set(++next,fn);return next;},
  cancel:id=>{cancelled.push(id);active.delete(id);},maxSteps,
  render:(g,w,h,alpha)=>{assert.ok(alpha>=0&&alpha<=1);if(render)render(g,w,h);}
 });
 owner.start();
 function frame(ms){now=1000+ms;const [id,fn]=[...active].at(-1);active.delete(id);fn(now);}
 function capture(kind,at,data={}){
  const e={type:kind,timeStamp:1000+at,target:{tagName:'CANVAS',closest:()=>null},
   pointerId:11,pointerType:'touch',clientX:100,clientY:200,
   button:0,buttons:1,...data};
  return bridge.capture(e);
 }
 return {owner,timeline,bridge,frame,capture,setNow:ms=>{now=1000+ms;},
  active,cancelled,close(){owner.stop();game.destroy()}};
}
const trace=[
 [0,'keydown',{key:'w'}],[120,'pointerdown',{pointerId:11,pointerType:'touch',clientX:100}],
 [180,'pointermove',{pointerId:11,pointerType:'touch',clientX:155}],
 [270,'pointerdown',{pointerId:22,pointerType:'touch',clientX:600}],
 [360,'pointermove',{pointerId:22,pointerType:'touch',clientX:650}],
 [580,'keyup',{key:'w'}],[730,'pointerup',{pointerId:11,pointerType:'touch'}],
 [910,'pointerup',{pointerId:22,pointerType:'touch'}],
 [1140,'keydown',{key:'d'}],[1410,'keyup',{key:'d'}]
];
function arm(seed,hz,maxSteps=2,intervals=null){return withSeed(seed,draws=>{
 const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
 const h=setup(g,{maxSteps});let index=0;try{
  let jitterElapsed=0;
  for(let f=1;f<=2*hz;f++){
   if(intervals)jitterElapsed+=intervals[f-1];
   const at=intervals?jitterElapsed:f*1000/hz;h.setNow(at);
   while(index<trace.length&&trace[index][0]<=at+1e-7){
    const [t,kind,data]=trace[index++];assert.equal(h.capture(kind,t,data),true);
   }
   h.frame(at);
  }
  return {hash:digest(physical(g)),draws:draws(),ticks:h.owner.ticks,
   dropped:h.owner.droppedFrames,applied:h.timeline.applied};
 }finally{h.close()}
});}
test('real Game chronological input and physical states agree at 30/60/120/240Hz',()=>{
 for(const seed of [1517800,1517802,1517810]){
  const results=[30,60,120,240].map(hz=>arm(seed,hz));
  assert.equal(results[0].ticks,120);
  assert.ok(results.every(r=>r.ticks===120&&r.dropped===0&&r.applied===trace.length));
  assert.ok(results.every(r=>r.hash===results[0].hash&&r.draws===results[0].draws),
   `cross-refresh gameplay changed for seed ${seed}: ${JSON.stringify(results)}`);
 }
});
test('30Hz owner advances two complete 60Hz steps, not one coarse step',()=>{
 const g=bootGame(),h=setup(g),dts=[];g.sfx.muted=true;
 const update=g.update;g.update=function(dt){dts.push(dt);return update.call(this,dt)};
 try{
  h.frame(1000/30);assert.equal(dts.length,2);
  for(const dt of dts)assert.equal(dt,STEP);
  assert.equal(h.owner.lastSteps,2);assert.ok(Math.abs(h.owner.simAtSec-1/30)<1e-8);
 }finally{h.close()}
});
test('actual Tempest firing cadence at 30Hz presentation matches native 60Hz',()=>{
 function run(seed,hz,mode,cls){return withSeed(seed,()=>{
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  g.setClass(g.player,cls);g.tanks=[g.player];g.tankById=new Map([[g.player.id,g.player]]);
  g.shapes=[];g.drones=[];g.powerups=[];
  g.input.aim.active=true;g.input.aim.dx=40;g.input.firing=true;
  let volleys=0;const original=g.tryFire;
  g.tryFire=function(t){const before=this.bullets.length;const result=original.apply(this,arguments);
   if(t===g.player&&this.bullets.length>before)volleys++;return result;};
  if(mode==='native')for(let i=0;i<6*hz;i++)g.update(1/hz);
  else{
   const h=setup(g);g.input.aim.active=true;g.input.aim.dx=40;g.input.firing=true;
   try{for(let i=1;i<=6*hz;i++)h.frame(i*1000/hz);}
   finally{h.owner.stop()}
  }
  const result={volleys,hash:digest(physical(g)),
   weapon:{heat:g.player.__v17Heat,stability:g.player.__v17Stability,
    fireCd:g.player.fireCd,overheatT:g.player.overheatT,
    shotIndex:g.player.__v17ShotIndex}};
  g.destroy();return result;
 });}
 for(const cls of ['tempest','minigun','needlestorm'])for(const seed of [1517800,1517810]){
  const fixed30=run(seed,30,'fixed',cls),native60=run(seed,60,'native',cls),
   native30=run(seed,30,'native',cls);
  assert.deepEqual(fixed30,native60,`${cls} must preserve 60Hz weapon/physical parity`);
  if(cls==='tempest')assert.ok(native30.volleys<fixed30.volleys*.8,
   'must reproduce material 30Hz Tempest deficit');
  if(cls==='minigun')assert.notEqual(native30.weapon.heat,fixed30.weapon.heat,
   'must reproduce 30Hz heat imbalance even when shot counts agree');
 }
});
test('evolution pause within first 30Hz frame blocks the second update',()=>{
 const g=bootGame(),h=setup(g);let calls=0;
 const update=g.update;g.update=function(dt){calls++;update.call(this,dt);if(calls===1)this.paused=true;};
 try{
  h.frame(1000/30);assert.equal(calls,1);assert.equal(h.owner.lastSteps,1);
  h.frame(2000/30);assert.equal(calls,1);assert.equal(h.owner.ticks,1);
  g.paused=false;h.frame(3000/30);assert.equal(calls,1,'resume cannot fast-forward');
  h.frame(4000/30);assert.equal(calls,3,'normal two-step operation resumes');
 }finally{h.close()}
});
test('long stalls are bounded and clear held input before resuming',()=>{
 const g=bootGame(),h=setup(g);try{
  h.setNow(10);h.capture('keydown',10,{key:'w'});h.frame(1000/60);
  assert.equal(g.input.keyboard.up,true);
  h.frame(1016.667);
  assert.equal(h.owner.lastSteps,2);
  assert.ok(h.owner.droppedMs>900&&h.owner.droppedFrames===1);
  assert.equal(g.input.keyboard.up,false,'stale held movement must not survive stall');
  assert.equal(h.timeline.events.length,0);
  assert.ok(h.owner.ticks<=3);
 }finally{h.close()}
});
test('stop is idempotent and cancels scheduled RAF without altering Game.start',()=>{
 const g=bootGame(),original=g.start,h=setup(g);
 assert.equal(g.start,original);assert.equal(h.active.size,1);
 h.owner.stop();h.owner.stop();assert.equal(h.active.size,0);
 assert.equal(h.cancelled.length,1);assert.equal(h.timeline.events.length,0);
 g.destroy();
});
test('Game.destroy automatically stops opt-in RAF and restores original lifecycle',()=>{
 const g=bootGame(),original=g.destroy,h=setup(g);
 assert.notEqual(g.destroy,original);
 g.destroy();
 assert.equal(g.destroy,original);
 assert.equal(h.active.size,0);
 assert.equal(h.cancelled.length,1);
 assert.equal(h.owner.started,false);
});
test('cannot run research RAF alongside the production animation owner',()=>{
 const g=bootGame();g.raf=42;
 const timeline=new ChronologicalInput(g.input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>1000});
 const owner=new FixedStepRafOwner(g,timeline,bridge,{
  now:()=>1000,request:()=>1,cancel:()=>{},render:()=>{}});
 assert.throws(()=>owner.start(),/production RAF already owns/);
 assert.equal(owner.started,false);
 g.raf=0;g.destroy();
});
test('variable sub-30ms frame jitter does not change physical simulation chronology',()=>{
 function run(seed,pattern){return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;const h=setup(g);
  try{
   let t=0;for(const delta of pattern){t+=delta;h.frame(t);}
   return {hash:digest(physical(g)),draws:draws(),ticks:h.owner.ticks,
    dropped:h.owner.droppedFrames};
  }finally{h.close()}
 });}
 const baseline=Array(360).fill(1000/60);
 const jitter=Array.from({length:180},()=>[20,1000/30-20]).flat();
 for(const seed of [1517800,1517810]){
  const a=run(seed,baseline),b=run(seed,jitter);
  assert.deepEqual(b,a,'jitter may change draw times but not simulation state');
  assert.equal(a.ticks,360);assert.equal(a.dropped,0);
 }
});
test('fresh input after a bounded long stall is accepted without reviving old controls',()=>{
 const g=bootGame(),h=setup(g);try{
  h.setNow(10);h.capture('keydown',10,{key:'w'});h.frame(1000/60);
  assert.equal(g.input.keyboard.up,true);
  h.frame(1016.667);assert.equal(g.input.keyboard.up,false);
  h.setNow(1025);assert.equal(h.capture('keydown',1025,{key:'d'}),true);
  h.frame(1033.334);
  assert.equal(g.input.keyboard.up,false);assert.equal(g.input.keyboard.right,true);
 }finally{h.close()}
});
test('Game.destroy during the first substep cancels remaining simulation and drawing',()=>{
 const g=bootGame();let calls=0,renders=0;
 const h=setup(g,{render:()=>renders++});
 g.update=function(){calls++;this.destroy();};
 h.frame(1000/30);
 assert.equal(calls,1,'never update a destroyed game twice');
 assert.equal(renders,0,'never draw a destroyed game');
 assert.equal(h.active.size,0,'no orphaned requestAnimationFrame');
 assert.equal(h.owner.started,false);
});
test('actual composed renderer is simulation-pure across presentation rates',()=>{
 function run(seed,hz){return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;
  const render=g.__testWindow.__novaMakeRequire('')('game/render').render;
  const h=setup(g,{render});try{
   for(let i=1;i<=2*hz;i++)h.frame(i*1000/hz);
   return {hash:digest(physical(g)),draws:draws(),ticks:h.owner.ticks};
  }finally{h.close()}
 });}
 for(const seed of [1517800,1517810]){
  const a=[30,60,120].map(hz=>run(seed,hz));
  assert.ok(a.every(r=>r.hash===a[0].hash&&r.draws===a[0].draws&&r.ticks===120),
   `render cadence changed physical world: ${JSON.stringify(a)}`);
 }
});
test('browser pilot composes real Input listeners, chronological RAF, and destroy cleanup',()=>{
 const {createFixedStepBrowserPilot}=require('../research/fixed-step-raf-owner.cjs');
 const g=bootGame(),win=g.__testWindow,doc=win.document;
 function emitter(){const listeners=new Map();return {
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
  dispatch(e){for(const fn of [...(listeners.get(e.type)||[])])fn(e)},
  count(){return [...listeners.values()].reduce((n,set)=>n+set.size,0)}
 };}
 const w=emitter(),d=emitter(),c=emitter();
 Object.assign(win,{addEventListener:w.addEventListener,removeEventListener:w.removeEventListener});
 Object.assign(doc,{addEventListener:d.addEventListener,removeEventListener:d.removeEventListener});
 Object.assign(g.canvas,{addEventListener:c.addEventListener,removeEventListener:c.removeEventListener});
 g.input.detach();g.input.attach(g.canvas);
 let now=1000,callback=null,draws=0;
 g.sfx.startMusic=()=>{};
 const pilot=createFixedStepBrowserPilot(g,{window:win,document:doc,
  clock:{now:()=>now,timeOrigin:1793560000000},
  request:fn=>{callback=fn;return 7},cancel:()=>{callback=null},
  render:()=>draws++});
 pilot.start();
 const evt=(type,at,extra={})=>({type,timeStamp:1000+at,
  target:g.canvas,pointerType:'mouse',pointerId:1,button:0,buttons:1,
  clientX:640,clientY:200,preventDefault(){},...extra});
 now=1010;c.dispatch(evt('pointerdown',10));
 assert.equal(g.input.firing,false,'browser event cannot mutate gameplay before tick');
 now=1033.333333333;callback(now);
 assert.equal(pilot.owner.lastSteps,2);
 assert.equal(g.input.firing,true);
 assert.equal(draws,1);
 now=1040;w.dispatch(evt('pointerup',40,{buttons:0}));
 assert.equal(g.input.firing,true,'release remains chronological');
 now=1050;callback(now);assert.equal(g.input.firing,false);
 w.dispatch(evt('blur',50));assert.equal(g.input.firing,false);
 g.destroy();
 assert.equal(callback,null,'game destroy must cancel research RAF');
 assert.equal(w.count(),0);assert.equal(d.count(),0);assert.equal(c.count(),0);
 assert.equal(pilot.owner.started,false);
});
test('fresh post-resume input before the first RAF is preserved, paused input is discarded',()=>{
 const g=bootGame(),original=g.setPaused,h=setup(g);try{
  h.frame(1000/60);
  h.setNow(20);g.setPaused(true);
  h.setNow(25);h.capture('keydown',25,{key:'w'});
  h.frame(1000/30);h.frame(50);
  assert.equal(g.input.keyboard.up,false);
  h.setNow(51);g.setPaused(false);
  h.setNow(52);h.capture('keydown',52,{key:'d'});
  h.frame(1000/15);
  assert.equal(g.input.keyboard.up,false,'paused key must not replay');
  assert.equal(g.input.keyboard.right,false,'fresh input waits for next simulation tick');
  h.frame(1000/12);
  assert.equal(g.input.keyboard.right,true,'post-resume input must survive first RAF');
 }finally{h.close()}
 assert.equal(g.setPaused,original,'pause owner must restore lifecycle');
});
test('duplicate browser-pilot start and restart after detach fail closed',()=>{
 const {createFixedStepBrowserPilot}=require('../research/fixed-step-raf-owner.cjs');
 const g=bootGame(),win=g.__testWindow,doc=win.document;
 const listeners=new Map();const add=(type,fn)=>{
  if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);
 };const remove=(type,fn)=>listeners.get(type)?.delete(fn);
 Object.assign(win,{addEventListener:add,removeEventListener:remove});
 Object.assign(doc,{addEventListener:add,removeEventListener:remove});
 Object.assign(g.canvas,{addEventListener:add,removeEventListener:remove});
 g.input.detach();g.input.attach(g.canvas);
 let now=1000,callback=null;g.sfx.startMusic=()=>{};
 const pilot=createFixedStepBrowserPilot(g,{window:win,document:doc,
  clock:{now:()=>now},request:fn=>(callback=fn,1),
  cancel:()=>{callback=null},render:()=>{}});
 pilot.start();
 assert.throws(()=>pilot.start(),/already (started|running)/);
 assert.equal(pilot.owner.started,true);
 assert.equal(pilot.capture.active,true,'duplicate start must not detach input');
 now=1017;callback(now);
 pilot.stop();
 assert.equal(pilot.capture.active,false);
 assert.throws(()=>pilot.start(),/capture detached/);
 assert.equal(pilot.owner.started,false);
 assert.ok([...listeners.values()].every(s=>s.size===0)||g.input.canvas===g.canvas,
  'stopped pilot restores production input listeners');
 g.destroy();
});

test('30Hz presentation jitter must not silently discard healthy simulation time',()=>{
  const g=bootGame(),h=setup(g);try{
    let at=0;
    for(let i=0;i<90;i++){
      at+=34;h.frame(at);
      at+=1000/15-34;h.frame(at);
    }
    assert.equal(h.owner.ticks,360,'6 seconds of 30Hz jitter must advance 360 fixed ticks');
    assert.equal(h.owner.droppedFrames,0,'ordinary sub-millisecond jitter is not a stall');
    assert.ok(Math.abs(h.owner.simAtSec-6)<1e-7);
  }finally{h.close()}
});
test('real 49-overlay Game stays physically identical under 30Hz jitter and 60Hz presentation',()=>{
 function run(seed,intervals){return withSeed(seed,draws=>{
  const g=bootGame(),h=setup(g);g.sfx.muted=true;let at=0,index=0;
  try{
   for(const delta of intervals){
    at+=delta;h.setNow(at);
    while(index<trace.length && trace[index][0]<=at+1e-7){
     const [t,kind,data]=trace[index++];assert.equal(h.capture(kind,t,data),true);
    }
    h.frame(at);
   }
   return {hash:digest(physical(g)),draws:draws(),ticks:h.owner.ticks,
    dropped:h.owner.droppedFrames,applied:h.timeline.applied};
  }finally{h.close()}
 });}
 const baseline=Array(360).fill(1000/60);
 const jitter=Array.from({length:90},()=>[34,1000/15-34]).flat();
 for(const seed of [1517800,1517802,1517810]){
  const a=run(seed,baseline),b=run(seed,jitter);
  assert.equal(a.ticks,360);assert.equal(a.dropped,0);
  assert.deepEqual(b,a,`ordinary 30Hz jitter changed real gameplay at seed ${seed}`);
 }
});
test('sustained 25Hz overload remains bounded without losing genuine held controls',()=>{
 const g=bootGame(),h=setup(g);try{
  h.setNow(5);h.capture('keydown',5,{key:'w'});
  for(let i=1;i<=125;i++)h.frame(i*40);
  assert.ok(h.owner.ticks<=250,'never exceed the two-step per-frame CPU budget');
  assert.ok(h.owner.droppedFrames>0,'overload must be measured, not silently accumulated');
  assert.ok(h.owner.droppedMs>0);
  assert.ok(h.owner.lagMs<=(h.owner.maxSteps+2)*STEP_MS+1e-6);
  assert.equal(g.input.keyboard.up,true,'genuinely held movement must survive bounded overload');
  h.setNow(5005);h.capture('keyup',5005,{key:'w'});h.frame(5040);
  assert.equal(g.input.keyboard.up,false,'a genuine release must still stop movement');
 }finally{h.close()}
});
test('stall accounting includes unsimulated fractional lag from before the stall',()=>{
 const g=bootGame(),h=setup(g);try{
  h.frame(8);assert.equal(h.owner.ticks,0);
  h.frame(1008);
  const accounted=h.owner.ticks*STEP_MS+h.owner.lagMs+h.owner.droppedMs;
  assert.ok(Math.abs(accounted-1008)<1e-5,
   `elapsed 1008ms must equal simulated + queued + discarded time; got ${accounted}`);
 }finally{h.close()}
});
test('bounded overload must not erase a fresh input occurring after skipped time',()=>{
 const g=bootGame(),h=setup(g);try{
  for(let i=1;i<=5;i++)h.frame(i*40);
  h.setNow(210);h.capture('keydown',210,{key:'d'});
  h.frame(240);
  assert.ok(h.owner.droppedFrames>0,'exercise the bounded backlog-drop branch');
  assert.equal(g.input.keyboard.right,true,'a fresh keydown after the skipped tick must survive');
 }finally{h.close()}
});
test('a short burst of slow 30Hz frames can be repaid by faster frames without losing ticks',()=>{
 const g=bootGame(),h=setup(g);try{
  let at=0;
  for(const delta of [...Array(5).fill(40),...Array(5).fill(80/3)]){
   at+=delta;h.frame(at);
  }
  assert.equal(h.owner.ticks,20);
  assert.equal(h.owner.droppedFrames,0,'temporary 30Hz jitter must not be classified as overload');
 }finally{h.close()}
});

test('opt-in three-step recovery prevents extended 30Hz jitter bursts without altering 60Hz gameplay',()=>{
 function run(seed,intervals,maxSteps){return withSeed(seed,draws=>{
  const g=bootGame(),h=setup(g,{maxSteps});g.sfx.muted=true;let at=0;
  try{for(const delta of intervals){at+=delta;h.frame(at)}
   return {hash:digest(physical(g)),draws:draws(),ticks:h.owner.ticks,
    dropped:h.owner.droppedFrames};
  }finally{h.close()}
 });}
 const pattern=Array.from({length:5},()=>[...Array(12).fill(40),...Array(12).fill(80/3)]).flat();
 const baseline=Array(240).fill(1000/60);
 for(const seed of [1517800,1517810]){
  const expected=run(seed,baseline,2),recovered=run(seed,pattern,3),limited=run(seed,pattern,2);
  assert.equal(recovered.ticks,240);assert.equal(recovered.dropped,0);
  assert.deepEqual(recovered,expected,'three-step recovery must match the real 60Hz world');
  assert.ok(limited.dropped>0,'two-step CPU cap cannot fully repay prolonged 30Hz jitter');
 }
});

test('bounded RAF conserves elapsed time across randomized jitter, overload and long stalls',()=>{
 for(const maxSteps of [1,2,3,4])for(let seed=1;seed<=20;seed++){
  let x=seed>>>0,now=1000,sampled=-Infinity;
  const rand=()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296};
  const game={input:{},sfx:{startMusic(){}},update(){},destroy(){},w:100,h:100,paused:false};
  const timeline={input:game.input,reset(){},consumeThrough(t){
   assert.ok(t>=sampled-1e-8,'input chronology must never move backward');sampled=t;
  }};
  const bridge={timeline,startMs:1000};
  const owner=new FixedStepRafOwner(game,timeline,bridge,{now:()=>now,
   request:()=>1,cancel:()=>{},render:()=>{},maxSteps});
  owner.start();
  for(let i=0;i<120;i++){
   now+=rand()<.04?200+200*rand():Math.max(1,1000/30+(rand()-.5)*30);
   owner.advance(now);
   const accounted=owner.ticks*STEP_MS+owner.lagMs+owner.droppedMs;
   assert.ok(Math.abs(accounted-(now-1000))<1e-5,
    `lost simulation time at maxSteps=${maxSteps} seed=${seed} frame=${i}`);
  }
  owner.stop();
 }
});

test('150ms suspension clears stale held input even with four-step opt-in budget',()=>{
 const g=bootGame(),h=setup(g,{maxSteps:4});try{
  h.setNow(10);h.capture('keydown',10,{key:'w'});h.frame(1000/60);
  assert.equal(g.input.keyboard.up,true);
  h.frame(1000/60+150);
  assert.equal(g.input.keyboard.up,false,'a 150ms suspension must not replay old movement');
  assert.equal(h.owner.droppedFrames,1);
 }finally{h.close()}
});

test('render-triggered game destruction must not draw minimap afterward',()=>{
 const g=bootGame();let renders=0,minimapAfterDestroy=0,destroyed=false;
 const originalDrawMinimap=g.drawMinimap;
 g.drawMinimap=function(...args){
  if(destroyed)minimapAfterDestroy++;
  return originalDrawMinimap.apply(this,args);
 };
 const h=setup(g,{render:()=>{renders++;destroyed=true;g.destroy()}});
 h.frame(1000/60);
 assert.equal(renders,1,'exercise synchronous destruction during render');
 assert.equal(h.owner.started,false);
 assert.equal(h.active.size,0,'destroy must cancel the next RAF');
 assert.equal(minimapAfterDestroy,0,'never touch minimap after game teardown');
});

test('20Hz four-step RAF preserves real touch-stick and keyboard trace against 60Hz',()=>{
 // Existing 30/60/120/240Hz trace includes two touch pointer owners,
 // pointer movement, releases, and WASD. Verify it also survives the
 // slower presentation cadence without dropping or reordering input.
 for(const seed of [1517800,1517802,1517810]){
  const baseline=arm(seed,60);
  const twenty=arm(seed,20,4);
  const jitter=arm(seed,20,4,Array.from({length:20},()=>[48,52]).flat());
  for(const candidate of [twenty,jitter]){
   assert.equal(candidate.ticks,120);
   assert.equal(candidate.dropped,0);
   assert.equal(candidate.applied,trace.length);
   assert.deepEqual(candidate,baseline,
    '20Hz touch-stick replay must preserve the real 60Hz world and RNG');
  }
 }
});
