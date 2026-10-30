'use strict';
// Exercise the exact shipping Wild Instincts overlay: Rogue Star routes must
// sample the whole edge, not a one-unit sliver beside a single corner.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/living-front-instincts-v1.12.0.js'),'utf8');
const ARENA=2250,SPAN=ARENA-180,EDGE=ARENA-125;

function boot(){
 const LF={
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  lerp:(a,b,t)=>a+(b-a)*t,
  d2:(x,y,u,v)=>(x-u)**2+(y-v)**2,
  alive:e=>!!e&&e.hp>0,query:()=>[],speed:()=>100,
  xp:()=>10,sectorIndex:()=>0,sectorCenter:()=>({x:0,y:0}),
  neighbors:()=>[],TAU:Math.PI*2,ARENA,BOUNTY_CAP:260,
  wrap(){},ms:()=>0,planSample(){},addPressure(){}
 };
 const window={__NOVA_LIVING_FRONT_INTERNAL__:LF,__novaModules:{}};
 vm.runInNewContext(source,{window,Math,Number,Map,WeakMap,
  console:{info(){},error(){}}},{filename:'living-front-instincts-v1.12.0.js'});
 return LF;
}
function spawn(LF,id,isTerrainSafe=()=>true){
 const s={id,type:'star',kind:'shape',r:24,x:0,y:0,hp:100};
 const g={time:60,isTerrainSafe};
 const st={stats:{starsSpawned:0}};
 LF.initStar(g,st,s);
 assert.equal(st.stats.starsSpawned,1);
 return s;
}
function edgeFor(id){
 return Math.floor((((Math.sin(id*17.3)*999)%1+1)%1)*4);
}
test('Rogue Star entry and opposite exit span all four arena edges, not one corner',()=>{
 const LF=boot(),entries=[[],[],[],[]],exits=[[],[],[],[]];
 for(let id=1;id<=600;id++){
  const e=edgeFor(id),s=spawn(LF,id);
  const transverse=e<2?s.y:s.x;
  const exitTransverse=e<2?s.__lfGoalY:s.__lfGoalX;
  assert.ok(Math.abs(transverse)<=SPAN+1e-6);
  assert.ok(Math.abs(exitTransverse)<=SPAN+1e-6);
  assert.ok(e===0?s.x===-EDGE:e===1?s.x===EDGE:e===2?s.y===-EDGE:s.y===EDGE);
  assert.ok(e===0?s.__lfGoalX===EDGE:e===1?s.__lfGoalX===-EDGE:e===2?s.__lfGoalY===EDGE:s.__lfGoalY===-EDGE);
  entries[e].push(transverse);exits[e].push(exitTransverse);
 }
 for(let e=0;e<4;e++){
  assert.ok(entries[e].length>80,'edge '+e+' needs enough deterministic samples');
  assert.ok(Math.min(...entries[e])<-1000&&Math.max(...entries[e])>1000,
   'entry '+e+' is pinned to a corner rather than using the full edge');
  assert.ok(Math.min(...exits[e])<-1000&&Math.max(...exits[e])>1000,
   'opposite exit '+e+' is pinned to a corner');
 }
});
test('Star waypoint search still retries terrain-blocked points and preserves fallback',()=>{
 const LF=boot();
 let checks=0;
 const s=spawn(LF,19,()=>{checks++;return checks!==1;});
 assert.ok(checks>=3,'one rejected entry and at least one exit should be checked');
 assert.ok(Math.abs(s.x)===EDGE||Math.abs(s.y)===EDGE);
 const none=spawn(LF,19,()=>false);
 assert.equal(none.x,0);assert.equal(none.y,0);
 assert.equal(none.__lfGoalX,0);assert.equal(none.__lfGoalY,0);
});
test('real materialized runtime includes exactly one Wild Instincts overlay',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.equal(html.split('src="./nova-updates/living-front-instincts-v1.12.0.js"').length-1,1);
 assert.ok(html.indexOf('living-front-core-v1.12.0.js')<
  html.indexOf('living-front-instincts-v1.12.0.js'));
});
