'use strict';
// Research candidate #648: a spatial no-pair shortcut must never turn a
// stale or missing hash into proof that two reachable hulls do not exist.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/battlefield-v1.6.0.js'),'utf8');
const start=src.indexOf(' function localStationaryPiercingPlan(');
const end=src.indexOf('\n var oldUpdateBullets=',start);
assert.ok(start>=0&&end>start);
const plan=new Function('CLASSES','ISOLATED_RECOVERY_SCAN_CAP','d2',
 src.slice(start,end)+'\nreturn localStationaryPiercingPlan;')(
 {scout:{size:15}},1200,(x,y,a,b)=>(x-a)**2+(y-b)**2);
function world(complete){
 const shot={x:0,y:0,vx:6000,vy:0,r:3,ttl:.2,pen:1,hits:0,
  dead:false,shell:false,beam:false,splash:false};
 const tanks=[{id:2,x:40,y:0,cls:'scout',kind:'tank',alive:true,hp:100},
  {id:3,x:65,y:0,cls:'scout',kind:'tank',alive:true,hp:100}];
 const hash={cell:180,map:new Map(),query(x,y,r,out){
  out.length=0;
  if(complete)out.push(...tanks);
 }};
 if(complete){
  for(const t of tanks){
   const k=(Math.floor(t.x/180)+2000)*10000+Math.floor(t.y/180)+2000;
   const a=hash.map.get(k)||[];a.push(t);hash.map.set(k,a);
  }
 }
 return {time:1,bullets:[shot],tanks,shapes:[],drones:[],hash};
}
test('missing spatial-hash membership cannot suppress a valid piercing plan',()=>{
 const g=world(false),result=plan(g,.011,true);
 assert.ok(result&&result.size===1);
});
test('two nearby certified hulls retain the normal piercing proof',()=>{
 const g=world(true),result=plan(g,.011,true);
 assert.ok(result&&result.size===1);
});

test('hash membership alone is insufficient when query omits indexed hulls',()=>{
 const g=world(true);
 g.hash.query=function(x,y,r,out){out.length=0;};
 const result=plan(g,.011,true);
 assert.ok(result&&result.size===1,'query inconsistency must fall back to original proof');
});

test('self-query certification does not prove neighboring query completeness',()=>{
 const g=world(true),tanks=g.tanks;
 // A malformed spatial query can return each tank at radius zero while
 // omitting its reachable neighbor from a larger radius query. Every
 // membership probe passes; the no-pair shortcut must still fail closed.
 g.hash.query=function(x,y,r,out){
  out.length=0;
  if(r===0){
   for(const t of tanks)if(t.x===x&&t.y===y)out.push(t);
  }
 };
 const result=plan(g,.011,true);
 assert.ok(result&&result.size===1,
  'self-only hash query cannot certify absence of a reachable second hull');
});
