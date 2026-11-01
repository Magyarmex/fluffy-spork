'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
function setup(now=1000){
  let current=now;
  const clock={now:()=>current,timeOrigin:1793560000000};
  const game=withSeed(1517800,()=>bootGame());
  const timeline=new ChronologicalInput(game.input);
  const browser=new BrowserEventTimeline(timeline,clock);
  return {game,timeline,browser,clock,setNow:v=>{current=v;}};
}
function event(type,timeStamp,extra={}){
  return {type,timeStamp,pointerType:'touch',pointerId:1,
    clientX:100,clientY:200,button:0,buttons:1,
    target:{closest:()=>null},...extra};
}
test('real Input is not mutated until chronological tick consumption',()=>{
  const {game,timeline,browser,setNow}=setup();
  setNow(1020);browser.capture(event('pointerdown',1015));
  setNow(1040);browser.capture(event('pointermove',1030,{clientX:150}));
  assert.equal(game.input.move.active,false);
  timeline.consumeThrough(.016);assert.equal(game.input.move.active,true);
  assert.equal(game.input.move.dx,0);
  timeline.consumeThrough(.032);assert.equal(game.input.move.dx,50);
});
test('modern DOMHighRes and legacy epoch timestamps produce the same chronology',()=>{
  const a=setup(),b=setup();
  a.setNow(1020);b.setNow(1020);
  a.browser.capture(event('pointerdown',1010));
  b.browser.capture(event('pointerdown',b.clock.timeOrigin+1010));
  assert.deepEqual(a.timeline.events,b.timeline.events);
  assert.equal(a.browser.invalidTimestamps,0);
  assert.equal(b.browser.invalidTimestamps,0);
});
test('future, ancient and invalid browser timestamps fail closed to delivery time',()=>{
  const h=setup();h.setNow(1050);
  h.browser.capture(event('pointerdown',50000));
  h.browser.capture(event('pointermove',-1));
  h.browser.capture(event('pointermove',1));
  assert.equal(h.browser.futureClamps,1);
  assert.equal(h.browser.invalidTimestamps,1);
  assert.equal(h.browser.staleClamps,0);
  assert.ok(h.timeline.events.every(e=>e.at<=.05+1e-9));
  h.setNow(5000);assert.equal(h.browser.capture(event('pointerdown',1)),false);
  assert.equal(h.browser.staleClamps,1);
  assert.equal(h.timeline.events.length,0);
  assert.equal(h.timeline.quarantined,true);
  assert.equal(h.browser.capture(event('pointerup',1)),false);
  assert.equal(h.timeline.quarantined,false);
});
test('late and out-of-order browser events never rewrite past simulation time',()=>{
  const h=setup();h.setNow(1100);
  h.browser.capture(event('pointerdown',1080));
  h.timeline.consumeThrough(.09);
  h.browser.capture(event('pointermove',1070));
  assert.equal(h.browser.lateClamps,1);
  assert.equal(h.timeline.events.at(-1).at,.09);
  h.setNow(1120);h.browser.capture(event('pointermove',1100));
  h.browser.capture(event('pointermove',1090));
  assert.equal(h.browser.reorderedClamps,1);
  assert.equal(h.timeline.events.at(-1).at,.1);
});
test('UI-target pointer presses remain excluded by the actual Input handler',()=>{
  const h=setup();h.setNow(1020);
  h.browser.capture(event('pointerdown',1010,{target:{closest:()=>({})}}));
  h.timeline.consumeThrough(.02);
  assert.equal(h.game.input.move.active,false);
});
test('blur and release are delivered in order without stale held movement',()=>{
  const h=setup();h.setNow(1020);
  h.browser.capture(event('pointerdown',1010));
  h.setNow(1030);h.browser.capture(event('pointermove',1020,{clientX:150}));
  h.setNow(1040);h.browser.capture(event('blur',1030));
  h.timeline.consumeThrough(.04);
  assert.equal(h.game.input.move.active,false);
  assert.equal(h.game.input.firing,false);
});
test('browser sourceCapabilities survive replay for hybrid mouse handoff',()=>{
  const h=setup();h.setNow(1010);
  h.browser.capture(event('pointerdown',1005));
  h.browser.capture(event('pointerup',1006));
  h.setNow(1020);h.browser.capture(event('pointerdown',1015,{
    pointerType:'mouse',sourceCapabilities:{firesTouchEvents:false}}));
  h.timeline.consumeThrough(.02);
  assert.equal(h.game.input.touchSeen,false);
  assert.equal(h.game.input.mouseActive,true);
});
test('unsupported browser event types and invalid clocks reject without state mutation',()=>{
  const h=setup();assert.throws(()=>h.browser.capture(event('wheel',1010)),/unsupported/);
  assert.throws(()=>new BrowserEventTimeline(h.timeline,{now:()=>NaN}),/invalid browser clock/);
  assert.equal(h.timeline.events.length,0);
});
test('stale keyboard press cannot resurrect movement after a long browser stall',()=>{
  const h=setup();h.setNow(5100);
  assert.equal(h.browser.capture(event('keydown',1010,{key:'w'})),false);
  h.timeline.consumeThrough(4.2);
  assert.equal(h.game.input.keyboard.up,false);
  assert.equal(h.timeline.quarantined,true);
  h.setNow(5120);assert.equal(h.browser.capture(event('keyup',5110,{key:'w'})),false);
  assert.equal(h.timeline.quarantined,false);
  h.setNow(5140);assert.equal(h.browser.capture(event('keydown',5130,{key:'w'})),true);
  h.timeline.consumeThrough(4.2);
  assert.equal(h.game.input.keyboard.up,true);
});
test('browser-delivered real Input events preserve fixed-step physical worlds across 30/60/120/240Hz',()=>{
  const {FixedStepPresentation}=require('../research/fixed-step-dom-input.cjs');
  const {digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
  const trace=[
    [0,'keydown',{key:'w'}],
    [.12,'pointerdown',{pointerId:11,pointerType:'touch',clientX:100,clientY:200}],
    [.18,'pointermove',{pointerId:11,pointerType:'touch',clientX:155,clientY:210}],
    [.27,'pointerdown',{pointerId:22,pointerType:'touch',clientX:600,clientY:200}],
    [.36,'pointermove',{pointerId:22,pointerType:'touch',clientX:650,clientY:185}],
    [.58,'keyup',{key:'w'}],
    [.73,'pointerup',{pointerId:11,pointerType:'touch'}],
    [.91,'pointerup',{pointerId:22,pointerType:'touch'}],
    [1.14,'keydown',{key:'d'}],
    [1.41,'keyup',{key:'d'}],
    [1.56,'blur',{}]
  ];
  function run(seed,hz){
    return withSeed(seed,draws=>{
      const game=bootGame();game.sfx.muted=true;game.input.autofire=false;
      const timeline=new ChronologicalInput(game.input);
      let now=1000;
      const browser=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
      const driver=new FixedStepPresentation(game,timeline,{maxSteps:2});
      let index=0;
      for(let frame=1;frame<=2*hz;frame++){
        now=1000+frame*1000/hz;
        while(index<trace.length&&trace[index][0]<=frame/hz+1e-9){
          const [t,kind,data]=trace[index++];
          assert.equal(browser.capture(event(kind,1000+t*1000,data)),true);
        }
        driver.frame(frame/hz);
      }
      return {initial:game.player?.id,final:digest(physical(game)),draws:draws(),
        ticks:driver.ticks,events:timeline.applied,late:browser.lateClamps,
        dropped:driver.droppedTicks};
    });
  }
  for(const seed of [1517800,1517810]){
    const baseline=run(seed,60);
    for(const hz of [30,120,240])
      assert.deepEqual(run(seed,hz),baseline,`seed ${seed}, ${hz}Hz`);
    assert.equal(baseline.ticks,120);
    assert.equal(baseline.events,trace.length);
    assert.equal(baseline.dropped,0);
  }
});
test('strict browser scheduler stops within a 30Hz frame on an evolution offer',()=>{
  const {FixedStepPresentation}=require('../research/fixed-step-dom-input.cjs');
  const h=setup();
  const game=h.game;
  const update=game.update;
  game.update=function(dt){
    update.call(this,dt);
    if(this.time>=1/60-1e-9 && !this.pendingOffer)this.tryOffer(1);
  };
  const driver=new FixedStepPresentation(game,h.timeline,{strictPause:true});
  driver.frame(1/30);
  assert.equal(driver.ticks,1);
  assert.equal(game.paused,true);
  assert.equal(game.pendingOffer,1);
  assert.ok(Math.abs(game.time-1/60)<1e-9);
  driver.frame(2/30);
  assert.equal(driver.ticks,1);
  assert.throws(()=>driver.resume(2/30),/cannot resume before player resolves/);
  game.dismissOffer();
  driver.resume(2/30);
  driver.frame(2/30+1/60);
  assert.equal(driver.ticks,2);
});

test('replayed keyboard events preserve focused UI exclusion',()=>{
  const h=setup();h.setNow(1020);
  h.browser.capture(event('keydown',1010,{key:'w',target:{tagName:'INPUT',closest:()=>({})}}));
  h.timeline.consumeThrough(.02);
  assert.equal(h.game.input.keyboard.up,false);
  h.setNow(1040);
  h.browser.capture(event('keyup',1030,{key:'w',target:{tagName:'INPUT',closest:()=>({})}}));
  h.timeline.consumeThrough(.04);
  assert.equal(h.game.input.keyboard.up,false);
});
test('ten thousand jittered browser events preserve monotonic bounded pending input',()=>{
  const h=setup();let state=0x1234abcd, lastSample=0;
  function random(){state^=state<<13;state^=state>>>17;state^=state<<5;
    return (state>>>0)/4294967296;}
  for(let i=1;i<=10000;i++){
    const now=1000+i*5;
    h.setNow(now);
    const jitter=(random()-.5)*50;
    h.browser.capture(event('pointermove',now+jitter,{clientX:100+i%60}));
    if(i%4===0){
      const sample=(now-1000)/1000-.01;
      h.timeline.consumeThrough(sample);
      lastSample=sample;
    }
    assert.ok(h.timeline.events.length<=128);
    assert.ok(h.timeline.events.slice(h.timeline.index).every(e=>e.at>=lastSample-1e-9));
    for(let j=1;j<h.timeline.events.length;j++)
      assert.ok(h.timeline.events[j].at>=h.timeline.events[j-1].at-1e-9);
  }
  assert.equal(h.browser.staleClamps,0);
  assert.ok(h.browser.reorderedClamps>0);
  assert.ok(h.browser.lateClamps>0);
  assert.equal(h.timeline.overflowCount,0);
});

test('a browser-prevented keyboard event cannot bypass composed UI ownership',()=>{
  const h=setup();h.setNow(1020);
  h.browser.capture(event('keydown',1010,{key:'w',defaultPrevented:true}));
  h.timeline.consumeThrough(.02);
  assert.equal(h.game.input.keyboard.up,false);
});
