'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {publicSector,moveTowardPublicBloom,aimAtVisibleNeutral}=
 require('../browser/frontlines-public-pilot.js');
const LF={defs:{circle:{xp:10},square:{xp:100}},xp:(defs,t)=>defs[t]?.xp||0,
 sectorCenter:s=>({x:s*100,y:0})};
const F={viewportHalfExtents:()=>({x:100,y:100})};
function game(shapes=[]){
 return{time:10,cam:{x:0,y:0},__lfState:{signal:{type:'BLOOM',sector:3,until:15},defs:LF.defs},
  shapes,hasLineOfSight:()=>true};
}
const p={id:1,x:0,y:0};
test('public pilot never treats an expired or non-BLOOM signal as a destination',()=>{
 const g=game();assert.equal(publicSector(g),3);
 g.__lfState.signal.until=9;assert.equal(publicSector(g),null);
 g.__lfState.bloomMemory={sector:5,until:20};
 assert.equal(publicSector(g),5);
 g.__lfState.bloomMemory.until=9;assert.equal(publicSector(g),null);
});
test('pilot continues toward the public center instead of stopping at sector entry',()=>{
 const g=game();const v=moveTowardPublicBloom(g,{...p,x:180},LF);
 assert.ok(v.x>.99,'sector entry must not be mistaken for reaching its center');
 const stop=moveTowardPublicBloom(g,{...p,x:270},LF);
 assert.deepEqual(stop,{x:0,y:0});
});
test('blocked public center follows an actual terrain waypoint',()=>{
 const g=game();g.hasLineOfSight=()=>false;
 g.novaBattlefieldWaypoint=()=>({x:0,y:100});
 const v=moveTowardPublicBloom(g,p,LF);
 assert.ok(v.y>.99&&Math.abs(v.x)<.01);
 g.novaBattlefieldWaypoint=()=>null;
 assert.equal(moveTowardPublicBloom(g,p,LF),null,'missing route must not walk into wall');
});
test('aim ignores unseen high-value shapes and selects only a visible neutral',()=>{
 const g=game([{x:400,y:0,hp:100,type:'square'},
  {x:35,y:0,hp:10,type:'circle'}]);
 const v=aimAtVisibleNeutral(g,p,LF,F);
 assert.ok(v.x>.99&&Math.abs(v.y)<.01);
});
test('rendered camera offset and terrain cover both forbid a target',()=>{
 const g=game([{x:35,y:0,hp:10,type:'circle'}]);
 g.cam.x=250;assert.equal(aimAtVisibleNeutral(g,p,LF,F),null);
 g.cam.x=0;g.hasLineOfSight=()=>false;
 assert.equal(aimAtVisibleNeutral(g,p,LF,F),null);
});
test('dead or non-neutral shapes are never aim candidates',()=>{
 const g=game([{x:35,y:0,hp:0,type:'circle'},
  {x:20,y:0,hp:50,type:'unknown'}]);
 assert.equal(aimAtVisibleNeutral(g,p,LF,F),null);
});
test('visible neutral acquisition is deterministic under hidden-shape changes',()=>{
 const g=game([{x:30,y:0,hp:10,type:'circle'},
  {x:0,y:400,hp:10,type:'square'}]);
 const before=aimAtVisibleNeutral(g,p,LF,F);
 g.shapes[1].hp=9999;g.shapes[1].type='circle';
 assert.deepEqual(aimAtVisibleNeutral(g,p,LF,F),before);
});
