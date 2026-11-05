'use strict';
// Research-only regression: the input coalescing grid must follow the real
// simulation epoch after pause/resume and a foreground stall.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput,STEP}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');

function fixture(){
 let now=1000, callback=null;
 const input={firing:false,keyboard:{},stickId:{move:-1,aim:-1},
   move:{active:false},aim:{active:false},pd(){},pm(){},pu(){},kd(){},ku(){}};
 const game={input,raf:null,paused:false,sfx:{startMusic(){}},w:800,h:600,
   update(){},start(){},destroy(){},setPaused(v){this.paused=v}};
 const timeline=new ChronologicalInput(input,4);
 const bridge={timeline,startMs:1000};
 const owner=new FixedStepRafOwner(game,timeline,bridge,{
   now:()=>now,request:fn=>{callback=fn;return 1},cancel:()=>{callback=null},
   render:()=>{}
 });
 return {game,timeline,owner,clock(ms){now=ms},frame(ms){now=ms;const fn=callback;callback=null;assert.equal(typeof fn,'function');fn(ms)}};
}

test('fixed60 resets coalescing tick origin when simulation epoch changes',()=>{
 const f=fixture();f.owner.start();
 try {
   assert.equal(f.timeline.tickOrigin,0);
   f.frame(1017);
   f.clock(1500);f.game.setPaused(true);
   assert.ok(Math.abs(f.timeline.tickOrigin-0.5)<1e-9);
   f.clock(1528);f.game.setPaused(false);
   assert.ok(Math.abs(f.timeline.tickOrigin-0.528)<1e-9);
   assert.ok(Math.abs(f.timeline.sampled-0.528)<1e-9);
   f.frame(1545);
   // 120ms gap reanchors the simulation epoch again.
   f.frame(1665);
   const expected=(1665-1000-2*STEP*1000)/1000;
   assert.ok(Math.abs(f.timeline.tickOrigin-expected)<1e-9);
 }finally{f.owner.stop()}
});

test('coalescing keeps distinct actual ticks and removes only same-tick movement',()=>{
 const f=fixture();f.owner.start();
 try {
   f.clock(1528);f.game.setPaused(true);
   f.clock(1529);f.game.setPaused(false);
   const origin=f.timeline.tickOrigin;
   const id=7;
   const event=(at,kind)=>f.timeline.push(at,kind,{pointerId:id,pointerType:'touch'});
   assert.equal(event(origin+0.001,'pointerdown'),true);
   assert.equal(event(origin+0.002,'pointermove'),true);
   assert.equal(event(origin+STEP+0.001,'pointermove'),true);
   assert.equal(f.timeline.events.length,3,'different simulation ticks must remain separate');
   assert.equal(event(origin+STEP+0.002,'pointermove'),true);
   assert.equal(f.timeline.events.length,3,'same-tick movement should coalesce');
   assert.deepEqual(f.timeline.events.map(e=>e.kind),
     ['pointerdown','pointermove','pointermove']);
   assert.equal(f.timeline.overflowCount,0);
 }finally{f.owner.stop()}
});
