'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const pilot=require('../browser/frontlines-public-star-pilot.js');
const player={id:1,x:0,y:0,alive:true};
const F={viewportHalfExtents:()=>({x:400,y:300}),
  inGameplayViewport:(_g,_p,s)=>Math.abs(s.x)<=400&&Math.abs(s.y)<=300};
function world(shapes=[],signal=null){
 return {time:100,cam:{x:0,y:0},shapes,player,
  __lfState:{directorEnabled:true,signal},
  hasLineOfSight:()=>true,
  novaBattlefieldWaypoint:()=>({x:0,y:100})};
}
const star=(x,y)=>({id:9,type:'star',hp:1,x,y});
const report=(x,y)=>({type:'ROGUE STAR',started:95,until:102,x,y});

test('hidden, occluded, or outside-camera Stars never drive public pilot',()=>{
 for(const [shape,los,cam] of [
  [star(600,0),true,{x:0,y:0}],
  [star(200,0),false,{x:0,y:0}],
  [star(200,0),true,{x:-350,y:0}]
 ]){
  const g=world([shape]);g.cam=cam;g.hasLineOfSight=()=>los;
  assert.equal(pilot.visibleStar(g,player,F),null);
  assert.equal(pilot.cue(g,player,F),null);
  assert.equal(pilot.moveTowardPublicStar(g,player,F),null);
 }
});

test('public report remains frozen when the hidden Star moves',()=>{
 const g=world([star(900,900)],report(0,250));
 assert.deepEqual(pilot.cue(g,player,F),{x:0,y:250,source:'report'});
 assert.deepEqual(pilot.moveTowardPublicStar(g,player,F),{x:0,y:1});
 g.shapes[0].x=-900;g.shapes[0].y=-900;
 assert.deepEqual(pilot.moveTowardPublicStar(g,player,F),{x:0,y:1});
});

test('future, expired, disabled, invalid and non-Star reports grant no cue',()=>{
 for(const sig of [
  {...report(0,250),started:101},
  {...report(0,250),until:99},
  {...report(0,250),x:Infinity},
  {...report(0,250),type:'BLOOM'},
  null
 ]){
  assert.equal(pilot.publicReport(world([],sig)),null);
 }
 const g=world([],report(0,250));g.__lfState.directorEnabled=false;
 assert.equal(pilot.publicReport(g),null);
});

test('actually visible Star outranks old report, and blocked paths use public terrain',()=>{
 const g=world([star(200,0)],report(0,250));
 assert.deepEqual(pilot.cue(g,player,F),{x:200,y:0,source:'visible'});
 assert.deepEqual(pilot.aimAtVisibleStar(g,player,F),{x:1,y:0});
 assert.deepEqual(pilot.moveTowardPublicStar(g,player,F),{x:1,y:0});
 g.hasLineOfSight=()=>false;
 assert.deepEqual(pilot.moveTowardPublicStar(g,player,F),{x:0,y:1},
  'only the frozen public report can be used when Star becomes occluded');
 g.novaBattlefieldWaypoint=()=>null;
 assert.equal(pilot.moveTowardPublicStar(g,player,F),null);
});

test('visible Star remains legitimate even with Director disabled',()=>{
 const g=world([star(200,0)],report(0,250));g.__lfState.directorEnabled=false;
 assert.deepEqual(pilot.cue(g,player,F),{x:200,y:0,source:'visible'});
});

test('dead pilots never receive steering authority from a public report',()=>{
 const dead={...player,alive:false};
 const g=world([star(200,0)],report(0,250));
 assert.equal(pilot.cue(g,dead,F),null);
 assert.equal(pilot.moveTowardPublicStar(g,dead,F),null);
 assert.equal(pilot.aimAtVisibleStar(g,dead,F),null);
});
