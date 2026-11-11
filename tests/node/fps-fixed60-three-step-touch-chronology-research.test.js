'use strict';
// Research only. Three simulation updates in one RAF must observe distinct
// chronological touch states, not the final DOM state for the whole callback.
// This tests the actual opt-in FixedStepRafOwner + BrowserEventTimeline source.
// It does NOT validate real browser touch-to-photon latency or production use.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');

function replay(releaseKind='pointerup'){
 let now=1000,callback=null;
 const states=[],events=[];
 const input={
  canvas:{getBoundingClientRect(){return {left:0,top:0,width:800,height:600}}},
  firing:false,keyboard:{},touchSeen:true,
  move:{active:false,dx:0,dy:0},aim:{active:false,dx:0,dy:0},
  stickId:{move:-1,aim:-1},
  pd(e){
   const side=e.clientX<450?'move':'aim';
   if(this.stickId[side]!==-1)return;
   this.stickId[side]=e.pointerId;
   this[side].active=true;
  },
  pm(e){
   for(const side of ['move','aim'])
    if(this.stickId[side]===e.pointerId)this[side].dx=e.clientX-(side==='move'?200:650);
  },
  pu(e){
   for(const side of ['move','aim'])if(this.stickId[side]===e.pointerId){
    this.stickId[side]=-1;
    this[side].active=false;this[side].dx=0;this[side].dy=0;
   }
  },kd(){},ku(){}
 };
 const game={input,sfx:{startMusic(){}},paused:false,status:'playing',
  update(){
   states.push({aim:input.aim.active,move:input.move.active,
    aimDx:input.aim.dx,aimId:input.stickId.aim,moveId:input.stickId.move});
  },start(){},destroy(){},setPaused(){}};
 const timeline=new ChronologicalInput(input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
  now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null},
  render(){},maxSteps:3,backlogExtraTicks:2
 });
 const specs=[
  [20,'pointerdown',11,650],
  [24,'pointermove',11,688],
  [30,'pointerdown',12,200],
  [45,'pointerup',11,688],
  [80,releaseKind,12,200]
 ];
 let next=0;
 try{
  owner.start();
  for(const elapsed of [55,110]){
   now=1000+elapsed;
   while(next<specs.length && specs[next][0]<=elapsed){
    const [at,type,pointerId,clientX]=specs[next++];
    const accepted=bridge.capture({type,timeStamp:1000+at,pointerId,
     pointerType:'touch',clientX,clientY:300,
     target:{tagName:'CANVAS',closest:()=>null}});
    assert.equal(accepted,true);
    events.push(type);
   }
   const fn=callback;callback=null;
   assert.equal(typeof fn,'function');
   fn(now);
  }
  return {states,events,ticks:owner.ticks,applied:timeline.applied,
   droppedMs:owner.droppedMs,late:bridge.lateClamps,
   reordered:bridge.reorderedClamps,stale:bridge.staleClamps,
   final:{aim:input.aim.active,move:input.move.active,
    aimId:input.stickId.aim,moveId:input.stickId.move}};
 }finally{owner.stop()}
}
for(const releaseKind of ['pointerup','pointercancel']){
 test('three-step catch-up samples aim, independent move, and '+releaseKind+' in their own ticks',()=>{
  const r=replay(releaseKind);
  assert.deepEqual(r.events,['pointerdown','pointermove','pointerdown','pointerup',releaseKind]);
  assert.equal(r.applied,5);
  assert.equal(r.ticks,6);
  assert.equal(r.droppedMs,0);
  assert.equal(r.late+r.reordered+r.stale,0);
  assert.deepEqual(r.states,[
   {aim:false,move:false,aimDx:0,aimId:-1,moveId:-1},
   {aim:true,move:true,aimDx:38,aimId:11,moveId:12},
   {aim:false,move:true,aimDx:0,aimId:-1,moveId:12},
   {aim:false,move:true,aimDx:0,aimId:-1,moveId:12},
   {aim:false,move:false,aimDx:0,aimId:-1,moveId:-1},
   {aim:false,move:false,aimDx:0,aimId:-1,moveId:-1}
  ]);
  assert.deepEqual(r.final,{aim:false,move:false,aimId:-1,moveId:-1});
 });
}
