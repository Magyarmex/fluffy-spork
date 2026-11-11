'use strict';
// RESEARCH ONLY. A canvas resize between DOM capture and fixed-step replay
// must never silently turn an aim press into a movement press.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');

function harness(){
 let now=1000, width=800;
 const input={
   canvas:{getBoundingClientRect:()=>({left:0,top:0,width,height:400})},
   touchSeen:true,stickId:{move:-1,aim:-1},
   move:{active:false,dx:0,dy:0},aim:{active:false,dx:0,dy:0},
   keyboard:{},firing:false,abilityQueued:false,
   pd(e){
     const r=this.canvas.getBoundingClientRect();
     const side=e.clientX-r.left<r.width*.45?'move':'aim';
     if(this.stickId[side]!==-1)return;
     this.stickId[side]=e.pointerId;
     this[side].active=true;
     if(side==='aim')this.firing=true;
   },
   pm(){},
   pu(e){
     for(const side of ['move','aim'])if(this.stickId[side]===e.pointerId){
       this.stickId[side]=-1;this[side].active=false;
     }
     this.firing=this.aim.active;
   }
 };
 const timeline=new ChronologicalInput(input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
 function capture(type,id=22,x=600,stamp=1010){
   return bridge.capture({type,timeStamp:stamp,pointerType:'touch',
     pointerId:id,clientX:x,clientY:200,button:0,
     buttons:type==='pointerup'?0:1,target:{closest:()=>null}});
 }
 return {input,timeline,capture,resize:w=>{width=w;},setNow:v=>{now=v;}};
}

test('research falsifier: resize cannot reclassify queued right-stick down as movement',()=>{
 const h=harness();
 h.setNow(1020);
 assert.equal(h.capture('pointerdown'),true);
 assert.equal(h.timeline.events[0].data.__novaCanvasSide,'aim');
 h.resize(1600); // 600px is now inside the left 45% of the canvas.
 h.timeline.consumeThrough(.02);
 assert.equal(h.input.stickId.move,-1,'old aim touch must not become movement');
 assert.equal(h.input.move.active,false);
 assert.equal(h.input.aim.active,false);
 assert.equal(h.input.firing,false);
 assert.equal(h.timeline.quarantined,true,'old resize-crossing gesture must be quarantined');
});

test('research falsifier: a queued resize-crossing flick cannot fire on wrong stick',()=>{
 const h=harness();
 h.setNow(1020);
 assert.equal(h.capture('pointerdown',22,600,1010),true);
 assert.equal(h.capture('pointerup',22,650,1012),true);
 h.resize(1600);
 h.timeline.consumeThrough(.02);
 assert.equal(h.input.stickId.move,-1);
 assert.equal(h.input.stickId.aim,-1);
 assert.equal(h.input.firing,false);
});

test('research falsifier: active aim must not turn into movement after resize',()=>{
 const h=harness();
 h.setNow(1020);
 h.capture('pointerdown',22,600,1010);
 h.timeline.consumeThrough(.02);
 assert.equal(h.input.stickId.aim,22,'pre-resize aim owner');
 h.resize(1600);
 h.capture('pointermove',22,620,1030);
 h.timeline.consumeThrough(.04);
 assert.equal(h.input.stickId.move,-1,'resize cannot create movement owner');
 assert.equal(h.input.stickId.aim,-1,'old aim must be canceled');
 assert.equal(h.input.firing,false);
 assert.equal(h.timeline.events.length,0,'queued input discarded on resize');
 assert.equal(h.capture('pointermove',22,625,1031),false,'old pointer stays suppressed');
 assert.equal(h.input.firing,false);
 h.capture('pointerup',22,625,1032);
 h.setNow(1050);
 h.capture('pointerdown',23,1200,1040);
 h.timeline.consumeThrough(.05);
 assert.equal(h.input.stickId.aim,23,'new post-resize gesture works');
});

test('research control: unchanged canvas retains independent two-stick owners',()=>{
 const h=harness();
 h.setNow(1020);
 h.capture('pointerdown',11,100,1010);
 h.capture('pointerdown',22,600,1011);
 h.timeline.consumeThrough(.02);
 assert.equal(h.input.stickId.move,11);
 assert.equal(h.input.stickId.aim,22);
 h.capture('pointerup',22,600,1030);
 h.capture('pointerup',11,100,1031);
 h.timeline.consumeThrough(.04);
 assert.equal(h.input.stickId.move,-1);
 assert.equal(h.input.stickId.aim,-1);
 assert.equal(h.input.firing,false);
});

test('research: resize quarantines both queued sticks, not just the aim pointer',()=>{
 const h=harness();
 h.setNow(1020);
 h.capture('pointerdown',11,100,1010);
 h.capture('pointerdown',22,600,1011);
 h.resize(1600);
 h.timeline.consumeThrough(.02);
 assert.equal(h.input.stickId.move,-1);
 assert.equal(h.input.stickId.aim,-1);
 assert.equal(h.input.move.active,false);
 assert.equal(h.input.aim.active,false);
 assert.equal(h.input.firing,false);
 assert.equal(h.timeline.quarantined,true);
 h.setNow(1040);
 assert.equal(h.capture('pointermove',22,620,1030),false,'stale move cannot rearm');
 assert.equal(h.input.firing,false);
 h.capture('pointerup',22,620,1031);
 assert.equal(h.timeline.quarantined,false,'release clears quarantine');
});

test('research: fresh touch after resize quarantine can still aim normally',()=>{
 const h=harness();
 h.setNow(1020);
 h.capture('pointerdown',22,600,1010);
 h.resize(1600);
 h.timeline.consumeThrough(.02);
 assert.equal(h.timeline.quarantined,true);
 h.setNow(1040);
 h.capture('pointerup',22,600,1030);
 assert.equal(h.timeline.quarantined,false);
 h.setNow(1060);
 h.capture('pointerdown',23,1200,1050);
 h.timeline.consumeThrough(.06);
 assert.equal(h.input.stickId.aim,23);
 assert.equal(h.input.stickId.move,-1);
 assert.equal(h.input.firing,true);
 h.capture('pointerup',23,1200,1061);
 h.timeline.consumeThrough(.08);
 assert.equal(h.input.firing,false);
});

test('research: active dual-stick resize revokes both owners and suppresses old moves',()=>{
 const h=harness();
 h.setNow(1020);
 h.capture('pointerdown',11,100,1010);
 h.capture('pointerdown',22,600,1011);
 h.timeline.consumeThrough(.02);
 assert.equal(h.input.stickId.move,11);
 assert.equal(h.input.stickId.aim,22);
 h.resize(1600);
 assert.equal(h.capture('pointermove',11,120,1030),false);
 assert.equal(h.input.stickId.move,-1);
 assert.equal(h.input.stickId.aim,-1);
 assert.equal(h.input.firing,false);
 assert.equal(h.capture('pointermove',22,640,1031),false);
 h.capture('pointerup',11,120,1032);
 h.capture('pointerup',22,640,1033);
 h.setNow(1060);
 h.capture('pointerdown',33,1200,1050);
 h.timeline.consumeThrough(.06);
 assert.equal(h.input.stickId.aim,33);
 assert.equal(h.input.stickId.move,-1);
});

test('composed Game: queued resize-crossing right-stick flick cannot produce a player shot',()=>{
 process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
 process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
 const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
 const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
 const g=bootGame();
 let owner;
 try{
  g.sfx.muted=true;g.input.autofire=false;
  let now=1000,width=800;
  g.input.canvas.getBoundingClientRect=()=>({left:0,top:0,width,height:400,right:width,bottom:400});
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  owner=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document,
    rebindDomListeners:false});
  const event=(type,stamp,x)=>({type,timeStamp:stamp,pointerType:'touch',
    pointerId:22,clientX:x,clientY:200,button:0,
    buttons:type==='pointerup'?0:1,target:{closest:()=>null}});
  now=1020;
  assert.equal(bridge.capture(event('pointerdown',1010,600)),true);
  assert.equal(bridge.capture(event('pointerup',1012,650)),true);
  width=1600;
  timeline.consumeThrough(.02);
  assert.equal(g.input.stickId.move,-1);
  assert.equal(g.input.stickId.aim,-1);
  assert.equal(g.input.firing,false);
  assert.equal(owner.pending,null,'no synthetic shot after resize');
  let playerShots=0;
  const originalFire=g.tryFire;
  g.tryFire=function(tank){
    if(tank===g.player)playerShots++;
    return originalFire.apply(this,arguments);
  };
  g.update(1/60);
  assert.equal(playerShots,0,'discarded gesture cannot invoke player firing');
 }finally{
  if(owner)owner.detach();
  g.destroy();
 }
});

test('research: failed canvas geometry read revokes an active touch rather than retaining fire',()=>{
 const h=harness();
 h.setNow(1020);
 h.capture('pointerdown',22,600,1010);
 h.timeline.consumeThrough(.02);
 assert.equal(h.input.stickId.aim,22);
 h.input.canvas.getBoundingClientRect=()=>{throw Error('layout unavailable');};
 assert.equal(h.capture('pointermove',22,620,1030),false);
 assert.equal(h.input.stickId.aim,-1);
 assert.equal(h.input.firing,false);
 assert.equal(h.capture('pointermove',22,640,1031),false);
 h.capture('pointerup',22,640,1032);
 assert.equal(h.input.firing,false);
});

test('research: unreadable geometry at replay cannot invent movement or a shot',()=>{
 const h=harness();
 h.setNow(1020);
 h.capture('pointerdown',22,600,1010);
 h.capture('pointerup',22,650,1012);
 h.input.canvas.getBoundingClientRect=()=>{throw Error('detached canvas');};
 h.timeline.consumeThrough(.02);
 assert.equal(h.input.stickId.move,-1);
 assert.equal(h.input.stickId.aim,-1);
 assert.equal(h.input.firing,false);
 assert.equal(h.timeline.quarantined,true);
});
