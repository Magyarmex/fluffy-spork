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
 // A safe resize policy may cancel this gesture or retain its original
 // side, but it must never claim a new left-stick owner.
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
 // Either cancel the old aim or preserve it; never manufacture another owner.
 assert.ok(h.input.stickId.aim===22||h.input.stickId.aim===-1);
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
