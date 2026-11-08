'use strict';
// Source-executed composed-game timing witness. NOT physical touch-to-photon.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function run(maxSteps,touch=false){
 return withSeed(1517800,()=>{
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  let now=1000,callback=null,elapsed=0;
  const applied=[],rendered=[];
  const origin={x:g.player.x,y:g.player.y};
  const kd=g.input.kd,ku=g.input.ku,pd=g.input.pd,pu=g.input.pu;
  g.input.kd=function(e){applied.push({kind:'keydown',key:e.key,atMs:now-1000});
    return kd.call(this,e)};
  g.input.ku=function(e){applied.push({kind:'keyup',key:e.key,atMs:now-1000});
    return ku.call(this,e)};
  g.input.pd=function(e){const result=pd.call(this,e);
    applied.push({kind:'pointerdown',key:e.pointerId,atMs:now-1000,
      aimActive:!!this.aim.active,aimOwner:this.stickId.aim});return result};
  g.input.pu=function(e){const result=pu.call(this,e);
    applied.push({kind:'pointerup',key:e.pointerId,atMs:now-1000,
      aimActive:!!this.aim.active,aimOwner:this.stickId.aim});return result};
  const timeline=new ChronologicalInput(g.input);
  const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000});
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
    now:()=>now,maxSteps,request:fn=>{callback=fn;return 1},
    cancel:()=>{callback=null},render(){
      rendered.push({atMs:now-1000,x:g.player.x,y:g.player.y,
        moving:!!g.input.keyboard.w,aimActive:!!g.input.aim.active});
    }});
  const events=touch?[{atMs:130,type:'pointerdown'},
    {atMs:310,type:'pointerup'}]:[{atMs:130,type:'keydown',key:'w'},
    {atMs:310,type:'keyup',key:'w'}];
  let next=0;
  try{
   owner.start();
   for(let frame=0;frame<8;frame++){
    elapsed+=50;now=1000+elapsed;
    while(next<events.length&&events[next].atMs<=elapsed){
     const e=events[next++];
     assert.equal(bridge.capture({type:e.type,timeStamp:1000+e.atMs,key:e.key,
      pointerId:11,pointerType:touch?'touch':undefined,
      clientX:640,clientY:200,button:0,buttons:e.type==='pointerup'?0:1,
      target:{tagName:'CANVAS',closest:()=>null}}),true);
    }
    const f=callback;callback=null;assert.equal(typeof f,'function');f(now);
   }
   return {applied,rendered,origin,ticks:owner.ticks,droppedMs:owner.droppedMs,
    lateClamps:bridge.lateClamps};
  }finally{owner.stop();g.destroy()}
 });
}
test('real composed Game receives a held keyboard edge later under 20Hz two-step overload',()=>{
 const low=run(2),sufficient=run(3);
 assert.equal(low.applied.length,2);
 assert.equal(sufficient.applied.length,2);
 assert.deepEqual(low.applied.map(e=>e.kind),['keydown','keyup']);
 assert.deepEqual(sufficient.applied.map(e=>e.kind),['keydown','keyup']);
 assert.equal(low.applied[0].atMs,200);
 assert.equal(sufficient.applied[0].atMs,150);
 assert.ok(low.ticks<sufficient.ticks);
 assert.ok(low.droppedMs>0);
 assert.equal(sufficient.droppedMs,0);
 assert.equal(sufficient.ticks,24);
});

test('real composed touch press/release application is also delayed by two-step overload',()=>{
 const low=run(2,true),sufficient=run(3,true);
 assert.deepEqual(low.applied.map(e=>e.kind),['pointerdown','pointerup']);
 assert.deepEqual(sufficient.applied.map(e=>e.kind),['pointerdown','pointerup']);
 assert.equal(low.applied[0].atMs,200);
 assert.equal(sufficient.applied[0].atMs,150);
 assert.equal(low.applied[0].key,11);
 assert.equal(sufficient.applied[0].key,11);
 for(const r of [low,sufficient]){
  assert.equal(r.applied[0].aimActive,true,'touch must actually own the aim stick');
  assert.equal(r.applied[0].aimOwner,11);
  assert.equal(r.applied[1].aimActive,false,'release must relinquish aim');
  assert.equal(r.applied[1].aimOwner,-1);
 }
 assert.ok(low.ticks<sufficient.ticks);
 assert.equal(sufficient.droppedMs,0);
});

// Research-only rendered-state witness. A handler firing is not itself a
// visible response: verify what the real composed Game presents on the RAF.
test('first rendered keyboard movement follows the delayed input edge',()=>{
 const low=run(2),sufficient=run(3);
 for(const result of [low,sufficient]){
  assert.equal(result.rendered.length,8);
  const firstHeld=result.rendered.find(f=>f.moving);
  assert.ok(firstHeld,'rendered input state must eventually reflect press');
  assert.equal(firstHeld.atMs,result.applied[0].atMs);
  assert.ok(result.rendered.some(f=>!f.moving&&f.atMs>=result.applied[1].atMs),
    'rendered state must eventually reflect release');
 }
 assert.ok(low.rendered.find(f=>f.moving).atMs>
   sufficient.rendered.find(f=>f.moving).atMs,
   'insufficient simulation throughput delays first presented movement intent');
});
test('first rendered touch ownership and eventual release follow the real bridge',()=>{
 const low=run(2,true),sufficient=run(3,true);
 for(const result of [low,sufficient]){
  const firstHeld=result.rendered.find(f=>f.aimActive);
  assert.ok(firstHeld,'aim ownership must reach presentation');
  assert.equal(firstHeld.atMs,result.applied[0].atMs);
  assert.ok(result.rendered.some(f=>!f.aimActive&&f.atMs>=result.applied[1].atMs),
    'touch release must be visible to the renderer');
 }
 assert.ok(low.rendered.find(f=>f.aimActive).atMs>
   sufficient.rendered.find(f=>f.aimActive).atMs);
});
