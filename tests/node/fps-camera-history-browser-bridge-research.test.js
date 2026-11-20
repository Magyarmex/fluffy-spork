'use strict';
// Research-only composition gate: an event-time camera sample must survive
// BrowserEventTimeline capture even when DOM delivery sees a newer camera.
// This is not a production input or Android-device validation.
const test=require('node:test'),assert=require('node:assert/strict');
const {PresentedCameraHistory}=require('../research/presented-camera-history.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');

const geometry=x=>({x,y:0,zoom:1,width:800,height:600,
 rect:{left:0,top:0,width:800,height:600}});
function setup({epoch=false}={}){
 const history=new PresentedCameraHistory({maxAgeMs:120});
 history.record(1090,geometry(0));
 history.record(1160,geometry(100));
 let now=1000;
 const accepted=[];
 const timeline={sampled:0,last:0,input:{},push(at,kind,data){
  accepted.push({at,kind,data});this.last=at;return true;
 }};
 const clock={now:()=>now,timeOrigin:1793560000000};
 const bridge=new BrowserEventTimeline(timeline,clock,{
  captureMouseWorld:(e,physicalMeta)=>{
   // The bridge, not the caller, owns normalization of epoch-style and
   // monotonic event timestamps. Never trust the raw event clock here.
   const projected=history.project(e,physicalMeta);
   return projected&&{x:projected.x,y:projected.y};
  }
 });
 const release=(stamp=1130)=>({type:'pointerup',pointerType:'mouse',
  pointerId:1,button:0,buttons:0,clientX:600,clientY:300,
  timeStamp:epoch?clock.timeOrigin+stamp:stamp,target:{closest:()=>null}});
 return {history,bridge,accepted,release,setNow:v=>{now=v;}};
}
test('late DOM delivery keeps last physically presented world target across camera motion',()=>{
 const s=setup();s.setNow(1200);
 assert.equal(s.bridge.capture(s.release()),true);
 assert.equal(s.accepted.length,1);
 const e=s.accepted[0];
 assert.equal(e.kind,'pointerup');
 assert.ok(Math.abs(e.at-.13)<1e-9);
 assert.deepEqual(e.data.__novaCaptureWorld,{x:200,y:0});
 assert.equal(e.data.__novaTimestampTrusted,true);
 assert.equal(e.data.__novaPhysicalTimestampExact,true);
 assert.equal(s.bridge.mouseProjectionFailures,0);
 // A naive delivery-time projection would use the later x=100 camera,
 // incorrectly targeting x=300.
 assert.notEqual(e.data.__novaCaptureWorld.x,300);
});
test('epoch-style DOM timestamps can share the same physical camera clock',()=>{
 const s=setup({epoch:true});s.setNow(1200);
 assert.equal(s.bridge.capture(s.release()),true);
 assert.deepEqual(s.accepted[0].data.__novaCaptureWorld,{x:200,y:0});
 assert.ok(Math.abs(s.accepted[0].at-.13)<1e-9);
});
test('old camera frames and untrusted DOM timestamps never invent targets',()=>{
 const s=setup();
 s.setNow(1400);
 assert.equal(s.bridge.capture(s.release()),true);
 assert.equal(s.accepted[0].data.__novaCaptureWorld,null);
 assert.equal(s.bridge.mouseProjectionFailures,1);
 const t=setup();t.setNow(1200);
 assert.equal(t.bridge.capture(t.release(0)),true);
 assert.equal(t.accepted[0].data.__novaTimestampTrusted,false);
 assert.equal(t.accepted[0].data.__novaCaptureWorld,null);
 assert.equal(t.bridge.mouseProjectionFailures,1);
});

test('historical mouse projection survives chronological replay into real Game projectile',()=>{
 const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
 const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
 const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
 const g=bootGame(),i=g.input,win=g.__testWindow,doc=win.document;
 g.sfx.muted=true;i.autofire=false;g.status='playing';g.paused=false;
 Object.assign(g.cam,{x:0,y:0,zoom:1});
 const history=new PresentedCameraHistory({maxAgeMs:120});
 assert.equal(history.record(1090,geometry(0)),true);
 assert.equal(history.record(1160,geometry(100)),true);
 let now=1000;
 const timeline=new ChronologicalInput(i);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>now,timeOrigin:1793560000000},{
  captureMouseWorld:(e,physicalMeta)=>{
   const p=history.project(e,physicalMeta);
   return p&&{x:p.x,y:p.y};
  }
 });
 const owner=new DirectShotIntent(g,{window:win,document:doc,
  rebindDomListeners:false,requireTrustedDuration:true,eventOriginMs:1000,
  maxIntentAgeMs:100,nowMs:()=>1200});
 const pointer=(type,timeStamp,buttons)=>({type,timeStamp,pointerType:'mouse',
  pointerId:1,button:0,buttons,clientX:600,clientY:300,
  target:{closest:()=>null}});
 try{
  now=1100;assert.equal(bridge.capture(pointer('pointerdown',1100,1)),true);
  // Physical release happened before camera moved, but DOM delivery was late.
  g.cam.x=100;
  now=1180;assert.equal(bridge.capture(pointer('pointerup',1130,0)),true);
  timeline.consumeThrough(.2);
  assert.ok(owner.pending&&owner.pending.world);
  assert.ok(Math.abs(owner.pending.world.x-200)<1e-8,
   'replay must use the last presented camera before physical release');
  assert.ok(Math.abs(owner.pending.durationMs-30)<1e-8);
  Object.assign(g.player,{x:0,y:0,angle:0,fireCd:0});
  const born=[];const fire=g.tryFire;
  g.tryFire=function(t,...args){
   const before=this.bullets.length,result=fire.call(this,t,...args);
   if(t===g.player)born.push(...this.bullets.slice(before).map(b=>({vx:b.vx,vy:b.vy})));
   return result;
  };
  g.update(1/60);
  assert.ok(born.length>0,'one real player projectile must be born');
  assert.ok(born[0].vx>0,'projectile must point toward the historical eastward target');
  assert.equal(owner.intents,1);
 }finally{owner.detach();g.destroy();}
});

test('future-skewed and future-clamped releases cannot borrow a historical camera',()=>{
 for(const physical of [1210,1300]){
  const s=setup();s.setNow(1200);
  assert.equal(s.bridge.capture(s.release(physical)),true);
  assert.equal(s.accepted[0].data.__novaCaptureWorld,null,
   'a non-exact physical clock must not authorize a camera projection');
  assert.equal(s.bridge.mouseProjectionFailures,1);
  assert.equal(s.accepted[0].data.__novaPhysicalTimestampExact,false);
  if(physical>1232)assert.equal(s.accepted[0].data.__novaTimestampTrusted,false);
 }
});

test('camera history must sample inside interpolated render before pose restoration',()=>{
 const {FixedStepPosePresentation}=require('../research/fixed-step-presentation.cjs');
 const game={cam:{x:0,y:0},player:null,status:'playing',paused:false,
  tanks:[],drones:[],shapes:[],bullets:[],
  update(){this.cam.x+=60;},destroy(){}};
 const pose=new FixedStepPosePresentation(game,{enabled:true});
 const h=new PresentedCameraHistory();
 try{
  game.update(1/60);
  assert.equal(game.cam.x,60);
  pose.draw((g)=>{
   assert.equal(g.cam.x,30,'the canvas sees an interpolated camera');
   assert.equal(h.record(1000,geometry(g.cam.x)),true);
  },game,800,600,.5);
  assert.equal(game.cam.x,60,'render must restore authoritative simulation camera');
  const projected=h.project({clientX:600,clientY:300},
   {timestampTrusted:true,timestampExact:true,physicalAtMs:1010,deliveryMs:1020});
  assert.equal(projected.x,230);
  assert.notEqual(projected.x,260,
   'post-render simulation camera is not the displayed camera');
 }finally{pose.stop();}
});
