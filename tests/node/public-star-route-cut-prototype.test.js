'use strict';
// Research-only route cut: the public report is an uncertainty region, not radar.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const pilot=require('../browser/frontlines-public-star-pilot.js');
const p={id:1,x:0,y:0,alive:true};
const F={viewportHalfExtents:()=>({x:400,y:300}),
 inGameplayViewport:(_g,_p,s)=>Math.abs(s.x)<=400&&Math.abs(s.y)<=300};
const sig=(x=600,y=0,started=99,until=106)=>
 ({type:'ROGUE STAR',x,y,started,until});
function world(signal=sig(),shapes=[]){
 return{time:100,cam:{x:0,y:0},shapes,
  __lfState:{directorEnabled:true,signal},
  hasLineOfSight:()=>true,
  novaBattlefieldWaypoint:()=>({x:0,y:100})};
}
function approx(a,b){assert.ok(Math.abs(a-b)<1e-8,'expected '+b+' got '+a);}
test('prototype speed envelope is bounded by actual shipping Star speed caps',()=>{
 const core=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 const instincts=fs.readFileSync(path.join(__dirname,'../../nova-updates/living-front-instincts-v1.12.0.js'),'utf8');
 assert.match(core,/star: \\{ hp: 340, xp: 500, r: 24, speed: 78/);
 assert.match(instincts,/STAR_SPEED_MULT=1\\.95/);
 assert.match(instincts,/cap\\(s,sp\\*1\\.12\\)/);
 const t=pilot.publicRouteCutTarget(world(),p);
 approx(t.radius,78*1.95*1.12);
});
test('public uncertainty disk expands with age; route cut targets its near boundary',()=>{
 const g=world(),one=pilot.publicRouteCutTarget(g,p);
 assert.equal(one.source,'public-route-cut');
 approx(one.x,600-78*1.95*1.12);
 approx(one.y,0);
 g.__lfState.signal.started=98;
 const two=pilot.publicRouteCutTarget(g,p);
 assert.ok(two.radius>one.radius);
 assert.ok(two.x<one.x,'later report has a wider reachable uncertainty region');
 assert.deepEqual(pilot.moveToPublicRouteCut(g,p,F),{x:1,y:0});
});
test('uncertainty disk containing player is not a false target',()=>{
 const g=world(sig(600,0,95,102));
 assert.equal(pilot.publicRouteCutTarget(g,p),null);
 assert.equal(pilot.moveToPublicRouteCut(g,p,F),null);
});
test('unreachable boundary before public report expires is rejected',()=>{
 const g=world(sig(1200,0,99,106));
 assert.equal(pilot.publicRouteCutTarget(g,p),null);
});
test('expired, future, disabled, malformed and dead pilots get no route authority',()=>{
 for(const signal of [
  sig(600,0,101,106),sig(600,0,95,99),sig(Infinity,0,99,106),
  {...sig(),type:'BLOOM'},null]){
  const g=world(signal);
  assert.equal(pilot.publicRouteCutTarget(g,p),null);
  assert.equal(pilot.moveToPublicRouteCut(g,p,F),null);
 }
 const disabled=world();disabled.__lfState.directorEnabled=false;
 assert.equal(pilot.moveToPublicRouteCut(disabled,p,F),null);
 const dead={...p,alive:false};
 assert.equal(pilot.moveToPublicRouteCut(world(),dead,F),null);
});
test('hidden Star position and movement cannot change the public route cut',()=>{
 const hidden={id:7,type:'star',x:1800,y:1700,hp:300};
 const g=world(sig(),[hidden]);
 const before=pilot.publicRouteCutTarget(g,p),v=pilot.moveToPublicRouteCut(g,p,F);
 hidden.x=-1700;hidden.y=-1800;
 assert.deepEqual(pilot.publicRouteCutTarget(g,p),before);
 assert.deepEqual(pilot.moveToPublicRouteCut(g,p,F),v);
});
test('actually visible Star is the only current-position exception',()=>{
 const g=world(sig(),[{id:7,type:'star',x:200,y:0,hp:300}]);
 assert.deepEqual(pilot.moveToPublicRouteCut(g,p,F),{x:1,y:0});
 g.hasLineOfSight=()=>false;
 assert.deepEqual(pilot.moveToPublicRouteCut(g,p,F),{x:0,y:1});
});
test('visible hostile combat takes priority over a speculative Star route',()=>{
 const g=world(),defense={aimAtVisibleHostile:()=>({x:1,y:0})};
 assert.equal(pilot.moveToPublicRouteCut(g,p,F,defense),null);
});
test('blocked route uses terrain waypoint and missing authority fails closed',()=>{
 const g=world();g.hasLineOfSight=()=>false;
 assert.deepEqual(pilot.moveToPublicRouteCut(g,p,F),{x:0,y:1});
 g.novaBattlefieldWaypoint=()=>null;
 assert.equal(pilot.moveToPublicRouteCut(g,p,F),null);
 delete g.hasLineOfSight;
 assert.equal(pilot.moveToPublicRouteCut(g,p,F),null);
});
test('research route calculation is read-only and original pilot is unchanged',()=>{
 const g=world(),before=JSON.stringify(g);
 pilot.moveToPublicRouteCut(g,p,F);
 assert.equal(JSON.stringify(g),before);
 assert.deepEqual(pilot.moveTowardPublicStar(g,p,F),{x:1,y:0});
});
