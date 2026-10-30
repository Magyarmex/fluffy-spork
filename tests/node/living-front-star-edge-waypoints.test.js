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

test('real Living Front Director creates a public Star at a distributed edge waypoint',()=>{
 const window={__novaModules:{}};
 const context={window,Math,Number,Object,Array,Date,JSON,Map,Set,WeakMap,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){},
  console:{info(){},warn(){},error(){}}};
 for(const name of ['living-front-core-v1.12.0.js',
   'living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),
   context,{filename:name});
 const LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
 const g={time:100,shapes:[],tanks:[],bullets:[],player:null,
  spawnShape(type){this.shapes.push({id:33,type,kind:'shape',hp:100,r:24,x:0,y:0});},
  getShape(id){return this.shapes.find(s=>s.id===id)||null;},
  isTerrainSafe(){return true;},toast(){}};
 const st=LF.ensure(g,{star:{xp:100}});
 st.directorEnabled=true;st.age=100;st.ceiling=1;st.lastMeaningfulAt=0;
 st.cooldowns.bloom=100;st.cooldowns.migration=100;st.cooldowns.star=0;
 st.migrationHeat=0;
 st.sectors.forEach(s=>{s.value=0;s.maturity=.1;s.pressure=0;s.outbound=0;});
 LF.directorTick(g,st);
 assert.equal(g.shapes.length,1,'the rare fallback creates only one real Star');
 const s=g.shapes[0];
 assert.equal(st.signal.type,'ROGUE STAR');
 assert.equal(st.signal.starId,s.id);
 assert.equal(st.signal.x,s.x);
 assert.equal(st.signal.y,s.y);
 assert.equal(s.y,-EDGE);
 assert.ok(s.x>1000&&s.x<SPAN,
  'real Director fallback should not be pinned to the old lower-left corner');
 assert.equal(s.__lfGoalY,EDGE);
 assert.equal(st.stats.starAnnouncements,1);
});
