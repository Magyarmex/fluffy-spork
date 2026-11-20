'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PresentedCameraHistory}=require('../research/presented-camera-history.cjs');
const geometry=(x,zoom=1)=>({x,y:0,zoom,width:800,height:600,
  rect:{left:0,top:0,width:800,height:600}});
const event=(timeStamp=1130)=>({timeStamp,clientX:600,clientY:300});
const meta={timestampTrusted:true,timestampExact:true,deliveryMs:1200,physicalAtMs:1130};
test('delayed release projects using last displayed camera, not dispatch camera',()=>{
 const h=new PresentedCameraHistory();
 assert.equal(h.record(1100,geometry(0)),true);
 assert.equal(h.record(1180,geometry(100,1.5)),true);
 const result=h.project(event(),meta);
 assert.deepEqual(result,{x:200,y:0,frameAt:1100,ageMs:30});
 assert.equal(h.project(event(1190),{...meta,physicalAtMs:1190}).x,100+(600-400)/1.5);
});
test('old, unknown, future and untrusted camera samples fail closed',()=>{
 const h=new PresentedCameraHistory({capacity:2,maxAgeMs:50});
 assert.equal(h.record(1000,geometry(0)),true);
 assert.equal(h.project(event(1060),{...meta,physicalAtMs:1060}),null);
 assert.equal(h.stale,1);
 assert.equal(h.project(event(990),{...meta,physicalAtMs:990}),null);
 assert.equal(h.misses,1);
 assert.equal(h.project(event(),{...meta,timestampTrusted:false}),null);
 assert.equal(h.project(event(),{...meta,timestampExact:false}),null);
 assert.equal(h.project(event(1300),{...meta,physicalAtMs:1300}),null);
 assert.equal(h.project(event(1010),{...meta,physicalAtMs:1010}),null,
   'old event cannot be revived by a matching old camera frame');
 assert.equal(h.project(null,meta),null);
 h.reset();assert.equal(h.frames.length,0);
 assert.equal(h.project(event(),meta),null);
});
test('bounded history never returns future frames or nonmonotonic snapshots',()=>{
 const h=new PresentedCameraHistory({capacity:2});
 assert.equal(h.record(1000,geometry(0)),true);
 assert.equal(h.record(1010,geometry(10)),true);
 assert.equal(h.record(1010,geometry(20)),false);
 assert.equal(h.record(1020,geometry(20)),true);
 assert.equal(h.frames.length,2);
 assert.equal(h.project(event(1005),{...meta,physicalAtMs:1005}),null);
 assert.equal(h.project(event(1015),{...meta,physicalAtMs:1015,deliveryMs:1030}).x,210);
 assert.equal(h.project(event(1025),{...meta,physicalAtMs:1025,deliveryMs:1030}).x,220);
});
test('resize and hidden lifecycle require explicit reset',()=>{
 const h=new PresentedCameraHistory();h.record(1100,geometry(0));
 assert.equal(h.project(event(),meta).x,200);
 h.reset();assert.equal(h.project(event(),meta),null);
 assert.equal(h.record(1180,geometry(100)),true);
 assert.equal(h.project(event(1190),{...meta,physicalAtMs:1190}).x,300);
});

test('default history covers 120ms at high 240Hz presentation without unbounded growth',()=>{
 const h=new PresentedCameraHistory();
 for(let i=0;i<48;i++)assert.equal(h.record(1000+i*1000/240,geometry(i)),true);
 assert.equal(h.frames.length,48);
 const at=1000+30*1000/240;
 const result=h.project(event(at),{...meta,physicalAtMs:at,deliveryMs:at+10});
 assert.ok(result&&result.x===230,'history must retain a 240Hz camera 75ms behind newest frame');
 assert.equal(h.record(1200,geometry(100)),true);
 assert.equal(h.frames.length,48);
});
