'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');

function setup() {
  let now=1000;
  const seen=[];
  const input={
    pd(e){seen.push(e);},pm(e){seen.push(e);},pu(e){seen.push(e);},
    kd(e){seen.push(e);},ku(e){seen.push(e);},
    keyboard:{},aim:{active:false},move:{active:false},
    stickId:{aim:-1,move:-1}
  };
  const timeline=new ChronologicalInput(input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  return {seen,timeline,bridge,setNow(v){now=v;}};
}
function evt(type,timeStamp) {
  return {type,timeStamp,pointerType:'mouse',pointerId:1,button:0,buttons:1,
    clientX:100,clientY:200,target:{tagName:'CANVAS',closest(){return null;}}};
}
test('late DOM input retains original occurrence while replay is monotonic',()=>{
  const s=setup();
  s.timeline.sampled=.03;s.timeline.last=.03;
  s.setNow(1050);
  assert.equal(s.bridge.capture(evt('pointerdown',1010)),true);
  s.timeline.consumeThrough(.04);
  assert.equal(s.seen.length,1);
  assert.ok(Math.abs(s.seen[0].__novaOriginalAt-.01)<1e-10);
  assert.ok(Math.abs(s.seen[0].__novaReplayAt-.03)<1e-10);
  assert.equal(s.seen[0].__novaSampleAt,.04);
  assert.equal(s.bridge.lateClamps,1);
});
test('reordered input retains distinct occurrence times without reordering application',()=>{
  const s=setup();s.setNow(1100);
  assert.equal(s.bridge.capture(evt('pointerdown',1080)),true);
  assert.equal(s.bridge.capture(evt('pointerup',1060)),true);
  s.timeline.consumeThrough(.1);
  assert.deepEqual(s.seen.map(e=>e.type),['pointerdown','pointerup']);
  assert.ok(Math.abs(s.seen[0].__novaOriginalAt-.08)<1e-10);
  assert.ok(Math.abs(s.seen[1].__novaOriginalAt-.06)<1e-10);
  assert.ok(s.seen[1].__novaReplayAt>=s.seen[0].__novaReplayAt);
  assert.ok(s.bridge.reorderedClamps>0);
});
test('invalid and future DOM timestamps use bounded accepted occurrence time',()=>{
  const s=setup();s.setNow(1050);
  assert.equal(s.bridge.capture(evt('pointerdown',0)),true);
  assert.equal(s.bridge.capture(evt('pointerup',1200)),true);
  s.timeline.consumeThrough(.06);
  assert.equal(s.seen.length,2);
  assert.ok(s.seen.every(e=>Math.abs(e.__novaOriginalAt-.05)<1e-10));
  assert.equal(s.bridge.invalidTimestamps,1);
  assert.equal(s.bridge.futureClamps,1);
});
test('manual chronological inputs remain compatible without original DOM metadata',()=>{
  const s=setup();
  s.timeline.push(.01,'pointerdown',{pointerId:1,pointerType:'mouse'});
  s.timeline.consumeThrough(.02);
  assert.equal(s.seen[0].__novaOriginalAt,undefined);
  assert.equal(s.seen[0].__novaReplayAt,.01);
  assert.equal(s.seen[0].__novaSampleAt,.02);
});
test('epoch-style WebKit timestamp converts to the same bounded occurrence time',()=>{
  const s=setup();s.setNow(1050);
  assert.equal(s.bridge.capture(evt('pointerdown',1793560000000+1010)),true);
  s.timeline.consumeThrough(.02);
  assert.equal(s.seen.length,1);
  assert.ok(Math.abs(s.seen[0].__novaOriginalAt-.01)<1e-10);
  assert.ok(Math.abs(s.seen[0].__novaReplayAt-.01)<1e-10);
});
test('stale DOM press fails closed rather than being assigned a fresh occurrence',()=>{
  const s=setup();s.setNow(4000);
  assert.equal(s.bridge.capture(evt('pointerdown',1010)),false);
  s.timeline.consumeThrough(.01);
  assert.equal(s.seen.length,0);
  assert.equal(s.bridge.staleClamps,1);
});
test('epoch timestamp without a valid origin falls back to bounded delivery time',()=>{
  let now=1000;const seen=[];
  const input={pd(e){seen.push(e);},keyboard:{},aim:{active:false},move:{active:false},
    stickId:{aim:-1,move:-1}};
  const t=new ChronologicalInput(input);
  const b=new BrowserEventTimeline(t,{now:()=>now});
  now=1050;
  assert.equal(b.capture(evt('pointerdown',1793560001010)),true);
  t.consumeThrough(.06);
  assert.equal(seen.length,1);
  assert.ok(Math.abs(seen[0].__novaOriginalAt-.05)<1e-10);
  assert.equal(b.invalidTimestamps,1);
});

test('freshness provenance marks delivery-time fallbacks untrusted',()=>{
 const s=setup();s.setNow(1050);
 assert.equal(s.bridge.capture(evt('pointerdown',1010)),true);
 assert.equal(s.bridge.capture(evt('pointerup',0)),true);
 assert.equal(s.bridge.capture(evt('pointerdown',1200)),true);
 s.timeline.consumeThrough(.06);
 assert.deepEqual(s.seen.map(e=>e.__novaTimestampTrusted),[true,false,false]);
});
