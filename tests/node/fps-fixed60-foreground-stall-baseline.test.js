'use strict';
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
