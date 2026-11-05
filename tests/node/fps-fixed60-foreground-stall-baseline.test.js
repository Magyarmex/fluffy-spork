'use strict';
// Import composed Game fixture without registering its independent audio A/B suite.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
// Research-only: establish the exact 120ms foreground-stall input contract
// before attempting a touch-stick recovery fix. This intentionally documents
// the current loss of ownership; it does NOT authorize production promotion.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');

function scene(){
  let now=1000,updates=0,blurResets=0,presses=0,releases=0;
  const input={
    held:false,firing:false,
    __novaBlurReset(){blurResets++;this.held=false;this.firing=false;},
    pd(e){if(e.pointerId===7){presses++;this.held=true;this.firing=true;}},
    pm(){},pu(e){if(e.pointerId===7){releases++;this.held=false;this.firing=false;}},
    kd(){},ku(){}
  };
  const game={input,raf:null,paused:false,sfx:{startMusic(){}},
    w:800,h:600,start(){},destroy(){},setPaused(v){this.paused=v},
    update(){updates++}};
  const timeline=new ChronologicalInput(input);
  const bridge={timeline,startMs:1000};
  const owner=new FixedStepRafOwner(game,timeline,bridge,{
    now:()=>now,request:()=>1,cancel:()=>{},render:()=>{}
  });
  return {input,game,timeline,owner,
    at(ms){now=ms;owner.frame(ms)},
    event(ms,kind){timeline.push((ms-1000)/1000,kind,{
      pointerId:7,pointerType:'touch',clientX:100,clientY:100,button:0,buttons:kind==='pointerup'?0:1
    })},
    counts(){return {updates,blurResets,presses,releases}}
  };
}

test('120ms foreground stall currently drops a held touch without a release edge',()=>{
  const s=scene();s.owner.start();
  try{
    s.event(1005,'pointerdown');s.at(1017);
    assert.equal(s.input.held,true,'real press must own stick before stall');
    const before=s.counts();
    s.at(1137); // 120ms presentation gap; owner currently resets input.
    assert.equal(s.owner.droppedFrames,1);
    assert.equal(s.input.held,false,'document current silent ownership loss');
    assert.equal(s.input.firing,false,'stall must not leave phantom fire');
    assert.equal(s.counts().releases,before.releases,
      'the loss was caused by reset, not by an actual pointer release');
    assert.ok(s.counts().blurResets>before.blurResets);
  }finally{s.owner.stop()}
});

test('late release after a 120ms stall stays safe and fresh touch can reacquire',()=>{
  const s=scene();s.owner.start();
  try{
    s.event(1005,'pointerdown');s.at(1017);
    s.at(1137);
    s.event(1140,'pointerup');s.at(1154);
    assert.equal(s.input.held,false);
    assert.equal(s.input.firing,false);
    assert.equal(s.counts().releases,1,'late release still reaches input owner');
    s.event(1160,'pointerdown');s.at(1171);
    assert.equal(s.input.held,true,'a new genuine down must restore ownership');
    s.event(1175,'pointercancel');s.at(1188);
    assert.equal(s.input.held,false,'cancel must clear reacquired touch');
    assert.equal(s.input.firing,false);
    assert.equal(s.counts().releases,2);
  }finally{s.owner.stop()}
});


test('composed 49-overlay Game loses a genuine held movement pointer after visible 120ms stall',()=>{
  const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
  const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  let now=1000,callback=null;
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
    now:()=>now,request:fn=>{callback=fn;return 1;},
    cancel:()=>{callback=null},render:()=>{}
  });
  function pointer(type,ms,x=100,id=11){
    return bridge.capture({type,timeStamp:ms,pointerId:id,pointerType:'touch',
      clientX:x,clientY:200,button:0,buttons:type==='pointerup'||type==='pointercancel'?0:1,
      target:{tagName:'CANVAS',closest:()=>null}});
  }
  function frame(ms){now=ms;const fn=callback;callback=null;assert.equal(typeof fn,'function');fn(ms);}
  try{
    owner.start();
    assert.equal(pointer('pointerdown',1005),true);
    assert.equal(pointer('pointermove',1010,140),true);
    assert.equal(pointer('pointerdown',1011,640,12),true);
    assert.equal(pointer('pointermove',1012,680,12),true);
    frame(1017);
    assert.equal(g.input.stickId.move,11,'real Game should own the movement stick');
    assert.equal(g.input.move.active,true);
    assert.equal(g.input.stickId.aim,12);
    assert.equal(g.input.aim.active,true);
    assert.equal(g.input.firing,true);
    frame(1137);
    assert.equal(owner.droppedFrames,1);
    assert.equal(g.input.stickId.move,-1,'reproduced silent pointer ownership loss');
    assert.equal(g.input.move.active,false);
    assert.equal(g.input.stickId.aim,-1);
    assert.equal(g.input.aim.active,false);
    assert.equal(g.input.firing,false,'no phantom firing after reset');
    assert.equal(pointer('pointerup',1140),true);
    assert.equal(pointer('pointerup',1141,680,12),true);
    frame(1154);
    assert.equal(g.input.stickId.move,-1,'late release remains safe');
    assert.equal(g.input.stickId.aim,-1);
    assert.equal(g.input.firing,false);
    assert.equal(pointer('pointerdown',1160),true);
    frame(1171);
    assert.equal(g.input.stickId.move,11,'genuine new touch reacquires movement');
    assert.equal(pointer('pointercancel',1175),true);
    frame(1188);
    assert.equal(g.input.stickId.move,-1);
    assert.equal(g.input.move.active,false);
    assert.equal(g.input.firing,false);
  }finally{owner.stop();g.destroy()}
});
