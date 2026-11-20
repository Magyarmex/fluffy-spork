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
  captureMouseWorld:e=>{
   // Adapter deliberately normalizes the raw DOM timestamp to the same
   // monotonic clock as the displayed-camera history.
   const raw=e.timeStamp;
   const physical=raw>1e11?raw-clock.timeOrigin:raw;
   const projected=history.project(e,{timestampTrusted:true,
    timestampExact:true,physicalAtMs:physical,deliveryMs:now});
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
