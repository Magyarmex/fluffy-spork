'use strict';
// Candidate reuse must preserve conservative shared-victim and movement gates.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/battlefield-v1.6.0.js'),'utf8');
const a=source.indexOf(' function localStationaryPiercingPlan('),z=source.indexOf('\n var oldUpdateBullets=',a);
assert.ok(a>=0&&z>a);
const plan=new Function('CLASSES','ISOLATED_RECOVERY_SCAN_CAP',source.slice(a,z)+'\nreturn localStationaryPiercingPlan;')({scout:{size:15}},1200);
function shot(y,live){return {kind:'bullet',x:0,y,vx:6000,vy:0,r:3,ttl:live?.2:.01,pen:live?2:1,hits:0,dead:false,shell:false,beam:false,splash:false};}
function hull(id,x,y,startX=x,startY=y){return {id,cls:'scout',alive:true,x,y,__novaSweepMoveTime:1,__novaSweepPrevX:startX,__novaSweepPrevY:startY};}
function world(shots,tanks){return {time:1,bullets:shots,tanks,shapes:[],drones:[]};}
for(const live of [false,true]){
 test('moving hulls remain eligible with swept start positions ('+(live?'live':'expiry')+')',()=>{
  const s=shot(0,live),g=world([s],[hull(2,105,0,40,0),hull(3,95,0,65,0)]);
  const p=plan(g,1/60,live);
  assert.ok(p&&p.has(s),'moving hulls may enter the shot corridor even when final positions are farther');
  assert.deepEqual([...p.get(s)],[]);
 });
 test('shared moving hull veto is array-order independent ('+(live?'live':'expiry')+')',()=>{
  const a=shot(0,live),b=shot(0,live),g=world([a,b],[hull(2,80,0,40,0),hull(3,90,0,65,0)]);
  assert.equal(plan(g,1/60,live),null);
  g.bullets.reverse();assert.equal(plan(g,1/60,live),null);
 });
 test('invalid hull motion remains fail closed ('+(live?'live':'expiry')+')',()=>{
  const s=shot(0,live),g=world([s],[hull(2,80,0,NaN,0),hull(3,90,0,65,0)]);
  assert.equal(plan(g,1/60,live),null);
 });
}
