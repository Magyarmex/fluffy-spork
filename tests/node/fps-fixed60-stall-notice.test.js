'use strict';
// Research-only: involuntary foreground touch cancellation must be legible,
// without restoring stale firing or generating notices for unrelated stalls.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function fixture({visible=true}={}){
  let now=1000;const notices=[];
  const input={touchSeen:true,stickId:{move:-1,aim:-1},
    move:{active:false},aim:{active:false},firing:false,
    __novaBlurReset(){this.stickId.move=-1;this.stickId.aim=-1;
      this.move.active=false;this.aim.active=false;this.firing=false;},
    pd(e){this.stickId.move=e.pointerId;this.move.active=true;this.firing=true;},
    pm(){},pu(){this.__novaBlurReset()},kd(){},ku(){}};
  const game={input,raf:null,paused:false,sfx:{startMusic(){}},
    start(){},destroy(){},setPaused(v){this.paused=v},
    update(){},toast(...args){notices.push(args)}};
  const timeline=new ChronologicalInput(input);
  const bridge={timeline,startMs:1000};
  const owner=new FixedStepRafOwner(game,timeline,bridge,{
    now:()=>now,request:()=>1,cancel:()=>{},render:()=>{},
    isVisible:()=>visible});
  return {input,game,timeline,owner,notices,
    frame(ms){now=ms;owner.frame(ms)},
    down(ms,id=7){timeline.push((ms-1000)/1000,'pointerdown',{
      pointerId:id,pointerType:'touch',clientX:100,clientY:100,button:0,buttons:1})},
    up(ms,id=7){timeline.push((ms-1000)/1000,'pointerup',{
      pointerId:id,pointerType:'touch',clientX:100,clientY:100,button:0,buttons:0})}};
}
test('only a genuine held touch reset produces one short warning',()=>{
  const s=fixture();s.owner.start();
  try{
    s.frame(1120);assert.equal(s.notices.length,0,'idle stall is silent');
    s.down(1125);s.frame(1140);
    assert.equal(s.input.firing,true);
    s.frame(1260);
    assert.deepEqual(s.notices,[['Touch controls reset — touch again','warn']]);
    assert.equal(s.input.firing,false);
    assert.equal(s.input.stickId.move,-1);
    s.up(1265);s.frame(1280);
    assert.equal(s.notices.length,1,'late release cannot generate another warning');
    s.down(1290);s.frame(1300);
    s.frame(1420);
    assert.equal(s.notices.length,1,'8-second notice throttle survives repeated stalls');
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});
test('normal jitter, hidden document, and pause do not display a reset warning',()=>{
  const s=fixture({visible:false});s.owner.start();
  try{
    s.down(1005);s.frame(1017);s.frame(1097);
    assert.equal(s.input.firing,true,'80ms jitter retains ownership');
    s.frame(1217);assert.equal(s.notices.length,0,'hidden document stays silent');
    assert.equal(s.input.firing,false);
    s.game.setPaused(true);
    s.frame(1337);assert.equal(s.notices.length,0);
  }finally{s.owner.stop()}
});
test('mouse-only input does not create a touch reset warning',()=>{
  const s=fixture();s.input.touchSeen=false;s.owner.start();
  try{
    s.down(1005);s.frame(1017);s.frame(1137);
    assert.equal(s.notices.length,0);
    assert.equal(s.input.firing,false);
  }finally{s.owner.stop()}
});

test('composed 49-overlay Game emits warning at genuine held touch stall',()=>{
  process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
  const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
  const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  let now=1000;const notices=[];g.toast=(...args)=>notices.push(args);
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
    now:()=>now,request:()=>1,cancel:()=>{},render:()=>{}
  });
  function event(type,ms,x=100,id=11){
    now=ms;
    return bridge.capture({type,timeStamp:ms,pointerId:id,pointerType:'touch',
      clientX:x,clientY:200,button:0,buttons:type==='pointerup'?0:1,
      target:{tagName:'CANVAS',closest:()=>null}});
  }
  try{
    owner.start();
    event('pointerdown',1005);now=1017;owner.frame(now);
    assert.equal(g.input.stickId.move,11);
    assert.equal(g.input.move.active,true);
    now=1137;owner.frame(now);
    assert.deepEqual(notices,[['Touch controls reset — touch again','warn']]);
    assert.equal(g.input.stickId.move,-1);
    assert.equal(g.input.firing,false);
    event('pointerup',1140);now=1154;owner.frame(now);
    assert.equal(g.input.stickId.move,-1);
    assert.equal(notices.length,1);
  }finally{owner.stop();g.destroy()}
});
