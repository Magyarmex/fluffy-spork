'use strict';
// Crasher perception must use its 700u physical radius, not Zero Churn's
// broader bucket membership. Regression-first: before the fix, a low-health
// target at x=715 was acquired with the optimized hash but not the fallback.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const files=['nova-updates/performance-v1.7.8.js',
 'nova-updates/living-front-core-v1.12.0.js',
 'nova-updates/living-front-instincts-v1.12.0.js'];
function boot(){
 const window={__novaModules:{}};
 const context={window,Math,Map,Set,WeakMap,Number,Object,Array,Date,JSON,
  performance:{now:()=>0},console:{info(){},warn(){},error(){}}};
 for(const file of files)vm.runInNewContext(
  fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 return window;
}
function scenario({x=715,indexed=true,blocked=false,existing=false,dt=.12,extra=[]}={}){
 const window=boot(),LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
 const cr={id:1,kind:'shape',type:'crasher',x:0,y:0,hp:100,maxHp:100,
  r:15,vx:0,vy:0,__lfPredatorState:'track',__lfPredatorT:.2,
  __lfTargetId:existing?2:-1,__lfTargetKind:existing?'shape':''};
 const target={id:2,kind:'shape',type:'circle',x,y:0,hp:1,maxHp:20,
  r:12,vx:0,vy:0};
 const shapes=[cr,target,...extra],rays=[];
 const g={time:10,shapes,bullets:[],tanks:[],
  getShape(id){return shapes.find(s=>s.id===id)||null;},
  hasLineOfSight(ax,ay,bx,by){rays.push([ax,ay,bx,by]);return !blocked;}};
 if(indexed){
  g.hash=window.__NOVA_PERFORMANCE_2_TEST__.optimizeHash({
   cell:180,map:new Map()
  });
  for(const s of shapes)g.hash.insert(s);
 }
 const defs={circle:{speed:60,xp:10},crasher:{speed:105,xp:60}};
 const st=LF.ensure(g,defs);
 LF.behaviorTick(g,st,defs,dt);
 return {cr,target,rays,st,g};
}

test('optimized broadphase does not grant Crasher extra 15u of perception',()=>{
 const indexed=scenario({x:715,indexed:true});
 const fallback=scenario({x:715,indexed:false});
 assert.equal(indexed.cr.__lfTargetId,-1,'715u must be outside 700u sense');
 assert.equal(fallback.cr.__lfTargetId,-1);
 assert.equal(indexed.rays.filter(p=>p[2]===715).length,0,
  'no terrain ray should be spent on a candidate outside the sense radius');
});
test('Crasher still acquires genuinely nearby prey at the exact boundary',()=>{
 for(const x of [690,699,700]){
  assert.equal(scenario({x,indexed:true}).cr.__lfTargetId,2,'x='+x);
  assert.equal(scenario({x,indexed:false}).cr.__lfTargetId,2,'fallback x='+x);
 }
});
test('existing pursuit remains valid to its separate 860u leash',()=>{
 assert.equal(scenario({x:715,existing:true}).cr.__lfTargetId,2,
  'do not shorten legitimate pursuit once target was sensed');
 assert.equal(scenario({x:861,existing:true}).cr.__lfTargetId,-1,
  'existing chase still releases after its own 860u leash');
});
test('terrain line-of-sight continues to veto in-radius acquisition',()=>{
 assert.equal(scenario({x:500,blocked:true}).cr.__lfTargetId,-1);
});
test('an out-of-radius weak target cannot displace a valid local target',()=>{
 const near={id:3,kind:'shape',type:'circle',x:690,y:0,hp:8,
  maxHp:20,r:12,vx:0,vy:0};
 const s=scenario({x:715,extra:[near]});
 assert.equal(s.cr.__lfTargetId,3);
});
for(const hz of [30,60,120,240]){
 test('Crasher acquisition radius is stable at '+hz+' Hz',()=>{
  assert.equal(scenario({x:699,dt:1/hz}).cr.__lfTargetId,2);
  assert.equal(scenario({x:715,dt:1/hz}).cr.__lfTargetId,-1);
 });
}
test('fix is wired into the materialized Living Front runtime',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
 assert.ok(html.includes('nova-updates/performance-v1.7.8.js'));
});
