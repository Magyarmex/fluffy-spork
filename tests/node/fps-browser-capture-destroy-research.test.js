'use strict';
// A fixed-step research owner must not outlive the actual Game it observes.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {BrowserInputCapture}=require('../research/fixed-step-browser-capture.cjs');
function target(){
 const listeners=new Map();return {
  addEventListener(k,fn){if(!listeners.has(k))listeners.set(k,new Set());listeners.get(k).add(fn)},
  removeEventListener(k,fn){listeners.get(k)?.delete(fn)},
  counts(){return Object.fromEntries([...listeners].filter(([,v])=>v.size).map(([k,v])=>[k,v.size]))}
 };
}
function setup(){
 const game=bootGame(),input=game.input,win=game.__testWindow,doc=win.document;
 input.detach();const w=target(),d=target(),c=Object.assign(target(),{
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
 Object.assign(win,{addEventListener:w.addEventListener,removeEventListener:w.removeEventListener});
 Object.assign(doc,{addEventListener:d.addEventListener,removeEventListener:d.removeEventListener});
 input.attach(c);
 const t=new ChronologicalInput(input),b=new BrowserEventTimeline(t,{now:()=>1000,timeOrigin:1793560000000});
 const owner=new BrowserInputCapture(input,c,t,b,{window:win,document:doc,game});
 return {game,input,owner,w,d,c};
}
test('Game.destroy automatically tears down chronological listeners and held controls',()=>{
 const h=setup();
 h.input.move.active=true;h.input.firing=true;h.input.abilityQueued=true;
 h.game.destroy();
 assert.equal(h.owner.active,false);
 assert.deepEqual(h.w.counts(),{});assert.deepEqual(h.d.counts(),{});
 assert.deepEqual(h.c.counts(),{});
 assert.equal(h.input.move.active,false);assert.equal(h.input.firing,false);
 assert.equal(h.input.abilityQueued,false);
});
test('manual capture teardown restores prototype Game.destroy before normal destruction',()=>{
 const h=setup(),original=h.owner.originalDestroy;
 h.owner.detach();
 assert.equal(h.game.destroy,original);
 assert.equal(Object.prototype.hasOwnProperty.call(h.game,'destroy'),false);
 h.game.destroy();
 assert.deepEqual(h.w.counts(),{});assert.deepEqual(h.d.counts(),{});
 assert.deepEqual(h.c.counts(),{});
});
