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
