'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function setup(){
 let now=1000,id=0;
 const callbacks=new Map(),input={},updates=[];
 const game={input,raf:0,paused:false,sfx:{startMusic(){}},w:800,h:600,
  update:dt=>updates.push(dt),destroy(){},setPaused(p){this.paused=p}};
 const timeline={input,reset(){},consumeThrough(){}},bridge={timeline,startMs:1000};
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
  now:()=>now,request:fn=>(callbacks.set(++id,fn),id),
  cancel:key=>callbacks.delete(key),render(){},maxSteps:4
 });
 const deliver=ts=>{const fn=callbacks.get(id);assert.ok(fn);callbacks.delete(id);fn(ts)};
 return {game,owner,updates,deliver,now:v=>now=v};
}
test('browser frame-start timestamp slightly before start performance.now is bounded',()=>{
 const x=setup();x.now(1010);x.owner.start();
 x.deliver(1000); // 10ms earlier than activation, same presentation frame.
 assert.equal(x.owner.started,true);assert.equal(x.owner.ticks,0);
 x.deliver(1026.6666667);
 assert.equal(x.owner.started,true);assert.equal(x.owner.ticks,1);
 assert.deepEqual(x.updates,[1/60]);
 x.owner.stop();
});
test('foreground startup work may exceed 50ms without invalidating first RAF',()=>{
 const x=setup();x.now(1100);x.owner.start();
 x.deliver(1040); // 60ms of same-frame startup work, no backward simulation.
 assert.equal(x.owner.started,true);assert.equal(x.owner.ticks,0);
 x.deliver(1117);
 assert.equal(x.owner.started,true);assert.equal(x.owner.ticks,1);
 x.owner.stop();
});
test('startup skew above 250ms is rejected, not replayed as a stale frame',()=>{
 const x=setup();x.now(1400);x.owner.start();
 assert.throws(()=>x.deliver(1100),/nonmonotonic RAF timestamp/);
 assert.equal(x.owner.started,false);assert.equal(x.owner.ticks,0);
});
test('after clock catches up, backward RAF timestamps remain invalid',()=>{
 const x=setup();x.owner.start();
 x.deliver(1017);
 assert.equal(x.owner.ticks,1);
 assert.throws(()=>x.deliver(1016),/nonmonotonic RAF timestamp/);
 assert.equal(x.owner.started,false);
});
