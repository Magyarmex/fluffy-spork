'use strict';
// Research-only: a different pointer's discrete press is an ordering fence.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');

function event(t,at,kind,id,x){
 return t.push(at,kind,{pointerId:id,pointerType:'touch',
   clientX:x,clientY:200,button:0,buttons:kind==='pointerup'?0:1,
   targetTagName:'CANVAS'});
}

test('coalescing cannot move a movement sample across another pointerdown',()=>{
 const g=bootGame(),t=new ChronologicalInput(g.input,5);
 try{
   event(t,.001,'pointerdown',11,100);
   event(t,.002,'pointermove',11,140);
   event(t,.003,'pointerdown',12,640);
   event(t,.004,'pointermove',12,680);
   event(t,.005,'pointermove',11,160);
   assert.deepEqual(t.events.map(e=>[e.at,e.kind,e.data.pointerId]),[
     [.001,'pointerdown',11],[.002,'pointermove',11],
     [.003,'pointerdown',12],[.004,'pointermove',12],
     [.005,'pointermove',11]]);
   t.consumeThrough(.0025);
   assert.equal(g.input.move.dx,40,'movement before aim press must not vanish');
   t.consumeThrough(.006);
   assert.equal(g.input.move.dx,60);
   assert.equal(g.input.stickId.aim,12);
   assert.equal(g.input.aim.dx,40);
   assert.equal(t.overflowCount,0);
 }finally{g.destroy()}
});

test('coalescing still replaces same-pointer same-tick motion without a discrete edge',()=>{
 const input={__novaBlurReset(){},pd(){},pm(){},pu(){},kd(){},ku(){}};
 const t=new ChronologicalInput(input,4);
 event(t,.001,'pointerdown',11,100);
 event(t,.002,'pointermove',11,120);
 event(t,.003,'pointermove',12,640);
 event(t,.004,'pointermove',11,140);
 assert.deepEqual(t.events.map(e=>[e.at,e.kind,e.data.pointerId]),[
   [.001,'pointerdown',11],[.003,'pointermove',12],[.004,'pointermove',11]]);
 assert.equal(t.overflowCount,0);
});

test('release and cancellation edges remain intact when queue reaches its cap',()=>{
 const input={__novaBlurReset(){},pd(){},pm(){},pu(){},kd(){},ku(){}};
 const t=new ChronologicalInput(input,4);
 event(t,.001,'pointerdown',11,100);
 event(t,.002,'pointermove',11,140);
 event(t,.003,'pointerdown',12,640);
 event(t,.004,'pointermove',11,160);
 assert.equal(t.events.length,4);
 assert.equal(t.push(.005,'pointerup',{pointerId:11,pointerType:'touch'}),false);
 assert.equal(t.overflowCount,1);
 assert.equal(t.quarantined,false,'release at cap must fail closed without stuck quarantine');
});

test('keyboard and pointer-cancel edges also fence movement coalescing',()=>{
 for(const edge of ['keydown','keyup','pointercancel']){
   const input={__novaBlurReset(){},pd(){},pm(){},pu(){},kd(){},ku(){}};
   const t=new ChronologicalInput(input,4);
   event(t,.001,'pointermove',11,120);
   t.push(.002,edge,edge==='pointercancel'?{pointerId:12,pointerType:'touch'}:{key:'w'});
   event(t,.003,'pointermove',12,640);
   event(t,.004,'pointermove',11,140);
   assert.deepEqual(t.events.map(e=>e.at),[.001,.002,.003,.004],
     edge+' must prevent moving the first sample after the discrete edge');
   assert.equal(t.overflowCount,0);
 }
});
