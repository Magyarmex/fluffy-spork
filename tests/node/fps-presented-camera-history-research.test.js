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

test('deterministic randomized chronology oracle never projects from a future frame',()=>{
 let seed=1517800;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let world=0;world<200;world++){
  const h=new PresentedCameraHistory({capacity:48,maxAgeMs:120});
  let at=1000;const frames=[];
  for(let j=0;j<48;j++){
   at+=2+rand()*30;
   const x=rand()*1000-500,zoom=.5+rand()*2;
   const frame={at,x,zoom};frames.push(frame);
   assert.equal(h.record(at,geometry(x,zoom)),true);
  }
  for(let j=0;j<100;j++){
   const physical=frames[0].at-20+rand()*(frames.at(-1).at-frames[0].at+50);
   const delivery=physical+rand()*160;
   const result=h.project(event(physical),{timestampTrusted:true,timestampExact:true,
     physicalAtMs:physical,deliveryMs:delivery});
   const candidates=frames.filter(f=>f.at<=physical);
   const expected=candidates.at(-1);
   const legal=expected&&physical-expected.at<=120&&delivery-physical<=120;
   if(!legal)assert.equal(result,null);
   else{
    assert.ok(result);
    assert.ok(result.frameAt<=physical);
    assert.ok(Math.abs(result.x-(expected.x+200/expected.zoom))<1e-8);
   }
  }
 }
});

test('invalid camera geometry and event coordinates never produce a projected target',()=>{
 const h=new PresentedCameraHistory();const good=geometry(0);
 for(const bad of [
  {...good,zoom:0},{...good,zoom:-1},{...good,x:Infinity},
  {...good,rect:{...good.rect,left:NaN}},
  {...good,rect:{...good.rect,width:0}},
  {...good,width:0},null
 ])assert.equal(h.record(1100,bad),false);
 assert.equal(h.frames.length,0);
 assert.equal(h.record(1100,good),true);
 for(const bad of [{clientX:Infinity,clientY:300},
   {clientX:600,clientY:NaN},{clientX:NaN,clientY:300}])
  assert.equal(h.project(bad,meta),null);
 assert.equal(h.project(event(),{...meta,physicalAtMs:NaN}),null);
 assert.equal(h.project(event(),{...meta,deliveryMs:NaN}),null);
 assert.equal(h.project(event(),null),null);
 assert.equal(h.project(event(),{...meta,physicalAtMs:1201}),null);
});

test('normalized physical clock overrides raw epoch-style event timestamp',()=>{
 const h=new PresentedCameraHistory();h.record(1100,geometry(0));
 const raw=event(1793560001130);
 const result=h.project(raw,{...meta,physicalAtMs:1130});
 assert.equal(result.x,200);
 assert.equal(result.frameAt,1100);
});
