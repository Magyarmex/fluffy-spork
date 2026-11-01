'use strict';
// Research gate: chronological REAL composed Input, not synthetic moveVec()
// stubs. No change to the shipping Game.start() or controls.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const {bootGame,withSeed,digest,physical} = require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput,FixedStepPresentation} = require('../research/fixed-step-dom-input.cjs');
const trace = [
  [0.000,'keydown',{key:'w'}],
  [0.100,'pointerdown',{pointerId:11,pointerType:'touch',clientX:100,clientY:200}],
  [0.120,'pointermove',{pointerId:11,pointerType:'touch',clientX:140,clientY:200}],
  [0.150,'pointerdown',{pointerId:22,pointerType:'touch',clientX:600,clientY:200}],
  [0.160,'pointermove',{pointerId:22,pointerType:'touch',clientX:650,clientY:180}],
  [0.330,'keyup',{key:'w'}],
  [0.520,'pointermove',{pointerId:11,pointerType:'touch',clientX:100,clientY:230}],
  [0.700,'pointerup',{pointerId:11,pointerType:'touch'}],
  [0.800,'pointercancel',{pointerId:22,pointerType:'touch'}],
  [1.020,'keydown',{key:'d'}],
  [1.400,'keyup',{key:'d'}],
  [1.450,'keydown',{key:'e'}],
  [1.460,'keyup',{key:'e'}],
  [1.700,'pointerdown',{pointerId:33,pointerType:'touch',clientX:600,clientY:200}],
  [1.750,'pointermove',{pointerId:33,pointerType:'touch',clientX:630,clientY:225}],
  [1.910,'pointerup',{pointerId:33,pointerType:'touch'}],
  [2.000,'blur',{}],
  [2.100,'keydown',{key:'w'}],
  [2.400,'keyup',{key:'w'}]
];
function run(seed,hz,{naive = false,draw = false,legacy60 = false}={}) {
  return withSeed(seed,draws=>{
    const g=bootGame(),input=new ChronologicalInput(g.input);
    g.sfx.muted=true;g.input.autofire=false;
    for(const [t,kind,data] of trace) assert.equal(input.push(t,kind,data),true);
    const renderer=draw?g.__testWindow.__novaMakeRequire('')('game/render').render:null;
    const driver=new FixedStepPresentation(g,input,{render:renderer});
    const initial=digest(physical(g));
    if(legacy60){
      assert.equal(hz,60);
      for(let tick=1;tick<=180;tick++){
        input.consumeThrough(tick/60);
        if(g.paused&&g.pendingOffer)g.dismissOffer();
        g.update(1/60);driver.ticks++;
        if(renderer)renderer(g,g.w,g.h);
      }
    }else for(let frame=1;frame<=3*hz;frame++)driver.frame(frame/hz,{naiveFrameInput:naive});
    return {initial,final:digest(physical(g)),draws:draws(),ticks:driver.ticks,
      dropped:driver.droppedTicks,events:input.applied,
      held:g.input.firing||g.input.move.active||g.input.aim.active||
        Object.values(g.input.keyboard).some(Boolean)};
  });
}
test('chronological real Input gives identical physical outcomes at 30/60/120/240Hz presentation',()=>{
  for(const seed of [1517800,1517802,1517810,1517814]){
    const baseline=run(seed,60,{draw:true});
    for(const hz of [30,120,240]){
      const other=run(seed,hz,{draw:true});
      assert.deepEqual(other,baseline,`seed=${seed} hz=${hz}`);
    }
    assert.equal(baseline.ticks,180);assert.equal(baseline.dropped,0);
    assert.equal(baseline.events,trace.length);assert.equal(baseline.held,false);
  }
});
test('60Hz scheduler reproduces the established direct update/render loop with real Input',()=>{
  for(const seed of [1517800,1517802,1517810])
    assert.deepEqual(run(seed,60,{draw:true}),run(seed,60,{draw:true,legacy60:true}));
});
test('frame-end input replay is detectably different from chronological input',()=>{
  let divergent=0;
  for(const seed of [1517800,1517802,1517810]){
    const good=run(seed,30),bad=run(seed,30,{naive:true});
    if(good.final!==bad.final)divergent++;
  }
  assert.ok(divergent>0,'negative control failed to expose premature input');
});
test('actual Input handles pointer cancellation and blur without retained movement or fire',()=>{
  withSeed(1517800,()=>{
    const g=bootGame(),t=new ChronologicalInput(g.input);
    t.push(0,'pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:200});
    t.push(.01,'pointermove',{pointerId:1,pointerType:'touch',clientX:140,clientY:200});
    t.push(.02,'pointerdown',{pointerId:2,pointerType:'touch',clientX:600,clientY:200});
    t.consumeThrough(.03);assert.ok(g.input.move.active&&g.input.aim.active&&g.input.firing);
    t.push(.04,'pointercancel',{pointerId:2,pointerType:'touch'});
    t.push(.05,'blur');t.consumeThrough(.06);
    assert.equal(g.input.firing,false);assert.equal(g.input.move.active,false);
    assert.equal(g.input.aim.active,false);assert.equal(g.input.abilityQueued,false);
  });
});
test('pending-event cap coalesces movement but never drops discrete release silently',()=>{
  withSeed(1517800,()=>{
    const g=bootGame(),t=new ChronologicalInput(g.input,10);
    t.push(0,'pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:200});
    for(let i=1;i<=100;i++) assert.equal(t.push(i/20000,'pointermove',
      {pointerId:1,pointerType:'touch',clientX:100+i,clientY:200}),true);
    assert.equal(t.push(.101,'pointerup',{pointerId:1,pointerType:'touch'}),true);
    t.consumeThrough(.11);assert.equal(g.input.move.active,false);
    assert.equal(t.overflowCount,0);assert.ok(t.applied>=3&&t.applied<=10);
    for(let i=0;i<10;i++) assert.equal(t.push(.2+i/1000,'keydown',{key:'w'}),true);
    assert.equal(t.push(.21,'keydown',{key:'e'}),false);
    assert.equal(t.overflowCount,1);assert.equal(t.quarantined,true);
    assert.equal(g.input.firing,false);assert.equal(g.input.keyboard.up,false);
    assert.equal(t.push(.22,'keyup',{key:'w'}),false);
    assert.equal(t.quarantined,false);
  });
});
test('overflow coalescing respects the post-resume simulation tick origin',()=>{
  withSeed(1517800,()=>{
    const g=bootGame(),t=new ChronologicalInput(g.input,3);
    t.tickOrigin=.008;
    t.push(.009,'pointerdown',{pointerId:1,pointerType:'touch',clientX:100,clientY:200});
    t.push(.023,'pointermove',{pointerId:1,pointerType:'touch',clientX:120,clientY:200});
    // .025 crosses the real .024667s tick boundary even though both samples
    // fall within the same unshifted .016667-.033333s bucket.
    assert.equal(t.push(.025,'pointermove',{pointerId:1,pointerType:'touch',clientX:150,clientY:200}),true);
    assert.equal(t.events.length,3);
    assert.equal(t.events[1].at,.023);
    assert.equal(t.events[2].at,.025);
    t.consumeThrough(.024);assert.equal(g.input.move.dx,20);
    t.consumeThrough(.03);assert.equal(g.input.move.dx,50);
  });
});
test('pause resets held input and cannot replay stale ability after resume',()=>{
  withSeed(1517800,()=>{
    const g=bootGame(),t=new ChronologicalInput(g.input),d=new FixedStepPresentation(g,t);
    t.push(0,'keydown',{key:'w'});t.push(.1,'keydown',{key:'e'});
    d.frame(1/60);assert.equal(g.input.keyboard.up,true);
    d.pause();assert.equal(g.input.keyboard.up,false);assert.equal(g.input.abilityQueued,false);
    d.frame(1);assert.equal(d.ticks,1);
    d.resume(1);d.frame(1+1/60);assert.equal(d.ticks,2);
    assert.equal(g.input.keyboard.up,false);assert.equal(g.input.abilityQueued,false);
  });
});
test('long-frame stall is bounded and explicitly records dropped simulation ticks',()=>{
  withSeed(1517800,()=>{
    const g=bootGame(),t=new ChronologicalInput(g.input),d=new FixedStepPresentation(g,t);
    d.frame(.5);assert.equal(d.ticks,30);assert.equal(d.droppedTicks,28);
    assert.ok(g.time < .1,'research scheduler must not hide its slow-motion fallback');
    d.frame(.5+1/60);assert.equal(d.ticks,31);assert.equal(d.droppedTicks,28);
  });
});
