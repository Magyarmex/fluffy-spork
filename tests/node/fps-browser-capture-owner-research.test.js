'use strict';
// Real 49-overlay Input with a fake dispatching DOM: no production input edits.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {BrowserInputCapture}=require('../research/fixed-step-browser-capture.cjs');
function target(){
 const map=new Map();return {
  addEventListener(k,fn){if(!map.has(k))map.set(k,new Set());map.get(k).add(fn)},
  removeEventListener(k,fn){map.get(k)?.delete(fn)},
  dispatch(e){for(const fn of [...(map.get(e.type)||[])])fn(e)},
  counts(){return Object.fromEntries([...map].filter(([,s])=>s.size).map(([k,s])=>[k,s.size]).sort())}
 };
}
function setup(){
 const game=bootGame(),input=game.input,win=game.__testWindow,doc=win.document;
 // Boot fixture uses no-op DOM; install dispatching targets before reattach.
 input.detach();const w=target(),d=target(),c=Object.assign(target(),{
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
 Object.assign(win,{addEventListener:w.addEventListener,removeEventListener:w.removeEventListener});
 Object.assign(doc,{addEventListener:d.addEventListener,removeEventListener:d.removeEventListener});
 input.attach(c);
 const baseline={win:w.counts(),doc:d.counts(),canvas:c.counts()};
 let now=1000;const timeline=new ChronologicalInput(input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const owner=new BrowserInputCapture(input,c,timeline,bridge,{window:win,document:doc});
 const fire=(place,type,stamp=now,extra={})=>{
  now=Math.max(now,stamp);
  place.dispatch({type,timeStamp:stamp,target:c,pointerId:1,pointerType:'mouse',
    clientX:600,clientY:220,button:0,buttons:1,preventDefault(){},...extra});
 };
 return {game,input,owner,timeline,bridge,win:w,doc:d,canvas:c,baseline,fire,
  now:v=>{now=v;},close(){owner.detach();input.detach();game.destroy()}};
 }

test('native primary mouse press and release are deferred; secondary-primary chord works',()=>{
 const h=setup();try{
  h.fire(h.canvas,'pointerdown',1010,{button:2,buttons:2});
  h.fire(h.canvas,'mousedown',1011,{button:2,buttons:2});
  h.fire(h.canvas,'mousedown',1012,{button:0,buttons:3});
  assert.equal(h.input.firing,false);
  assert.equal(h.timeline.events.length,2,'non-primary native edge is ignored');
  h.timeline.consumeThrough(.013);assert.equal(h.input.firing,true);
  h.fire(h.win,'mouseup',1020,{button:0,buttons:2});
  assert.equal(h.input.firing,true);
  h.timeline.consumeThrough(.021);assert.equal(h.input.firing,false);
 }finally{h.close()}
});
test('real pointer+compat mouse primary events are harmless when replayed twice',()=>{
 const h=setup();try{
  h.fire(h.canvas,'pointerdown',1010,{button:0,buttons:1});
  h.fire(h.canvas,'mousedown',1011,{button:0,buttons:1});
  assert.equal(h.input.firing,false);
  h.timeline.consumeThrough(.012);assert.equal(h.input.firing,true);
  h.fire(h.win,'pointerup',1020,{button:0,buttons:0});
  h.fire(h.win,'mouseup',1021,{button:0,buttons:0});
  h.timeline.consumeThrough(.022);assert.equal(h.input.firing,false);
 }finally{h.close()}
});
test('touch, keyboard, UI exclusion and native mouse stay chronological',()=>{
 const h=setup();try{
  h.fire(h.canvas,'pointerdown',1010,{pointerType:'touch',pointerId:11,clientX:100});
  h.fire(h.win,'keydown',1012,{key:'w'});
  h.fire(h.canvas,'mousedown',1013,{button:0,buttons:1});
  h.fire(h.win,'keydown',1014,{key:'e',target:{tagName:'INPUT',closest:()=>({})}});
  assert.equal(h.input.move.active,false);assert.equal(h.input.keyboard.up,false);
  h.timeline.consumeThrough(.015);
  assert.equal(h.input.move.active,true);assert.equal(h.input.keyboard.up,true);
  assert.equal(h.input.firing,false,'compatibility mouse must not steal touch');
  assert.equal(h.input.abilityQueued,false,'focused UI cannot trigger ability');
  h.fire(h.win,'pointerup',1020,{pointerType:'touch',pointerId:11});
  h.fire(h.win,'keyup',1021,{key:'w'});
  h.timeline.consumeThrough(.022);
  assert.equal(h.input.move.active,false);assert.equal(h.input.keyboard.up,false);
 }finally{h.close()}
});
test('blur and hidden-tab reset are immediate fail-closed releases',()=>{
 const h=setup();try{
  h.fire(h.canvas,'pointerdown',1010,{pointerType:'touch',pointerId:11,clientX:100});
  h.timeline.consumeThrough(.012);assert.equal(h.input.move.active,true);
  h.fire(h.win,'keydown',1020,{key:'e'});
  h.fire(h.win,'blur',1021);
  assert.equal(h.input.move.active,false);assert.equal(h.input.abilityQueued,false);
  assert.equal(h.timeline.events.length,0);
  h.fire(h.canvas,'pointerdown',1030,{pointerType:'touch',pointerId:12,clientX:100});
  h.timeline.consumeThrough(.031);assert.equal(h.input.move.active,true);
  h.game.__testWindow.document.hidden=true;
  h.fire(h.doc,'visibilitychange',1040);
  assert.equal(h.input.move.active,false);
  h.fire(h.canvas,'pointerdown',1050,{pointerType:'touch',pointerId:13,clientX:100});
  h.timeline.consumeThrough(.051);assert.equal(h.input.move.active,false,
    'hidden tab cannot rearm movement');
  h.game.__testWindow.document.hidden=false;
  h.fire(h.canvas,'pointerdown',1060,{pointerType:'touch',pointerId:14,clientX:100});
  h.timeline.consumeThrough(.061);assert.equal(h.input.move.active,true);
 }finally{h.close()}
});
test('twenty capture/detach cycles restore production listeners without leaks',()=>{
 const h=setup();try{
  const captured={win:h.win.counts(),doc:h.doc.counts(),canvas:h.canvas.counts()};
  for(let i=0;i<20;i++){
   h.owner.detach();
   assert.deepEqual(h.win.counts(),h.baseline.win);
   assert.deepEqual(h.doc.counts(),h.baseline.doc);
   assert.deepEqual(h.canvas.counts(),h.baseline.canvas);
   h.owner=new BrowserInputCapture(h.input,h.canvas,h.timeline,h.bridge,
     {window:h.game.__testWindow,document:h.game.__testWindow.document});
   assert.deepEqual(h.win.counts(),captured.win);
   assert.deepEqual(h.doc.counts(),captured.doc);
   assert.deepEqual(h.canvas.counts(),captured.canvas);
  }
 }finally{h.close()}
});

test('real fixed-step Game stays physically identical under native mouse, touch and keyboard input at 30/60/120Hz',()=>{
 const {FixedStepPresentation}=require('../research/fixed-step-dom-input.cjs');
 const {digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
 const trace=[
  [.01,'canvas','pointerdown',{pointerType:'mouse',button:2,buttons:2}],
  [.02,'canvas','mousedown',{button:0,buttons:3}],
  [.06,'window','mouseup',{button:0,buttons:2}],
  [.12,'window','keydown',{key:'w'}],
  [.22,'canvas','pointerdown',{pointerType:'touch',pointerId:11,clientX:100}],
  [.31,'window','pointermove',{pointerType:'touch',pointerId:11,clientX:135}],
  [.43,'window','pointerup',{pointerType:'touch',pointerId:11,clientX:135}],
  [.55,'window','keyup',{key:'w'}],
  [.75,'window','keydown',{key:'e'}],
  [.76,'window','keyup',{key:'e'}],
  [1.1,'window','blur',{}]
 ];
 function run(seed,hz){return withSeed(seed,draws=>{
  const h=setup();h.game.sfx.muted=true;h.input.autofire=false;
  const driver=new FixedStepPresentation(h.game,h.timeline,{maxSteps:2});
  let i=0;for(let frame=1;frame<=2*hz;frame++){
   const at=frame/hz;h.now(1000+at*1000);
   while(i<trace.length&&trace[i][0]<=at+1e-9){
    const [t,place,type,data]=trace[i++];
    h.fire(place==='canvas'?h.canvas:h.win,type,1000+t*1000,data);
   }
   driver.frame(at);
  }
  const result={state:digest(physical(h.game)),draws:draws(),
   ticks:driver.ticks,applied:h.timeline.applied,dropped:driver.droppedTicks};
  h.close();return result;
 });}
 for(const seed of [1517800,1517802,1517810]){
  const baseline=run(seed,60);
  assert.equal(baseline.ticks,120);assert.equal(baseline.dropped,0);
  for(const hz of [30,120])assert.deepEqual(run(seed,hz),baseline,`seed=${seed},hz=${hz}`);
 }
});
