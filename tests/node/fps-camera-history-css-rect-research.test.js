'use strict';
// Research-only regression: historical mouse projection must use the CSS
// rectangle actually presented to the player, not assume 1:1 canvas pixels.
const test=require('node:test');
const assert=require('node:assert/strict');
const {PresentedCameraHistory}=require('../research/presented-camera-history.cjs');

const event=(x,y)=>({clientX:x,clientY:y});
const meta=(at,delivery=at+5)=>({timestampTrusted:true,timestampExact:true,
 physicalAtMs:at,deliveryMs:delivery});
function geometry({left=0,top=0,rectWidth=800,rectHeight=600,
 width=800,height=600,x=20,y=-10,zoom=2}={}){
 return {x,y,zoom,width,height,rect:{left,top,width:rectWidth,height:rectHeight}};
}
function project(g,point,at=1000){
 const history=new PresentedCameraHistory();
 assert.equal(history.record(at,g),true);
 return history.project(event(...point),meta(at+1));
}
test('center of a CSS-scaled canvas still targets the historical camera center',()=>{
 const g=geometry({left:100,top:50,rectWidth:400,rectHeight:300});
 const p=project(g,[300,200]);
 assert.deepEqual({x:p.x,y:p.y},{x:20,y:-10});
});
test('off-center CSS-scaled pointer maps through canvas-space size and zoom',()=>{
 const g=geometry({left:100,top:50,rectWidth:400,rectHeight:300});
 const p=project(g,[400,125]);
 assert.deepEqual({x:p.x,y:p.y},{x:120,y:-85});
});
test('unscaled centered and off-center canvas preserve existing mapping',()=>{
 const g=geometry({left:100,top:50,rectWidth:800,rectHeight:600});
 const p=project(g,[700,200]);
 assert.deepEqual({x:p.x,y:p.y},{x:120,y:-85});
});
test('CSS enlargement and noninteger rectangle offsets are projection-safe',()=>{
 const g=geometry({left:12.5,top:24.25,rectWidth:1200,rectHeight:900,
  width:800,height:600,x:-30,y:40,zoom:1.5});
 const p=project(g,[912.5,249.25]);
 assert.ok(Math.abs(p.x-( -30+800/6))<1e-9);
 assert.ok(Math.abs(p.y-(40-100))<1e-9);
});
test('latest eligible presented frame controls scaling and translation',()=>{
 const history=new PresentedCameraHistory();
 assert.equal(history.record(1000,geometry({left:0,top:0,rectWidth:800,rectHeight:600,x:0,y:0,zoom:1})),true);
 assert.equal(history.record(1030,geometry({left:100,top:50,rectWidth:400,rectHeight:300,x:80,y:30,zoom:2})),true);
 const early=history.project(event(600,300),meta(1010,1040));
 const late=history.project(event(300,200),meta(1040,1050));
 assert.deepEqual({x:early.x,y:early.y},{x:200,y:0});
 assert.deepEqual({x:late.x,y:late.y},{x:80,y:30});
});
test('untrusted and stale event timestamps never borrow historical geometry',()=>{
 const history=new PresentedCameraHistory({maxAgeMs:50});
 assert.equal(history.record(1000,geometry({rectWidth:400,rectHeight:300})),true);
 assert.equal(history.project(event(200,150),{...meta(1010),timestampExact:false}),null);
 assert.equal(history.project(event(200,150),meta(1100,1110)),null);
 assert.equal(history.invalid,1);
 assert.equal(history.stale,1);
});
