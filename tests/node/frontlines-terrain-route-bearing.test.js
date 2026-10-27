'use strict';
// A public opportunity must not pull an AI tank through a wall when the
// canonical Battlefield waypoint owner has a reachable approach instead.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function scene(){
 const window={__novaModules:{'game/engine':function(m){m.exports={Game:class{}};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const T=window.__NOVA_LIVING_FRONT_TEST__;
 const t={id:3,x:-900,y:-900,hp:100,maxHp:100,alive:true,ai:{isElite:false,__v1112TargetId:-1}};
 const st={signal:null,directorEnabled:true,bloomMemory:{sector:5,announcedAt:100,until:124,initialValue:500},
  queryScratch:[],queryScratch2:[],sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0}))};
 const g={time:106,w:800,h:600,cam:{zoom:1},shapes:[],bullets:[],tanks:[t],__lfState:st};
 return {T,t,st,g};
}
test('remembered public BLOOM follows a terrain waypoint instead of steering through cover',()=>{
 const {T,t,g}=scene();
 const calls=[];g.hasLineOfSight=()=>false;
 g.novaBattlefieldWaypoint=(x,y,tx,ty,r,id)=>{calls.push({x,y,tx,ty,r,id});return{x:t.x+60,y:t.y-120};};
 const b=T.publicEcoBias(g,t,{},{});
 assert.equal(b.mode,'memory');assert.ok(b.weight>.04);
 assert.ok(b.x>0&&b.y<0,'the first reachable approach is southeast-to-north, not directly toward the blocked pocket');
 assert.equal(calls.length,1,'one canonical route lookup per opportunity, not an extra global scan');
 assert.equal(calls[0].id,t.id);
});
test('live public BLOOM also respects the terrain waypoint',()=>{
 const {T,t,st,g}=scene();st.signal={type:'BLOOM',sector:5,x:-560,y:-560,started:105,until:110};
 g.hasLineOfSight=()=>false;
 g.novaBattlefieldWaypoint=()=>({x:t.x-80,y:t.y+50});
 const b=T.publicEcoBias(g,t,{},{});
 assert.equal(b.mode,'signal');assert.ok(b.x<0&&b.y>0,'route around the wall rather than toward the target through it');
});
test('visible straight-line opportunities retain their original direction without route lookup',()=>{
 const {T,t,g}=scene();let called=0;
 g.hasLineOfSight=()=>true;g.novaBattlefieldWaypoint=()=>{called++;return{x:0,y:0};};
 const b=T.publicEcoBias(g,t,{},{});
 assert.equal(b.mode,'memory');assert.ok(b.x>0&&b.y>0);assert.equal(called,0);
});
test('a blocked route without a waypoint cannot claim a reachable public opportunity',()=>{
 const {T,g}=scene();g.hasLineOfSight=()=>false;g.novaBattlefieldWaypoint=()=>null;
 const b=T.publicEcoBias(g,g.tanks[0],{},{});
 assert.equal(b.mode,'none');assert.equal(b.weight,0);
});
test('invalid or zero-length waypoint cannot produce NaN or a wall-facing steering bias',()=>{
 for(const waypoint of [{x:NaN,y:1},{x:-900,y:-900},{x:Infinity,y:0}]){
  const {T,g,t}=scene();g.hasLineOfSight=()=>false;g.novaBattlefieldWaypoint=()=>waypoint;
  const b=T.publicEcoBias(g,t,{},{});
  assert.equal(b.mode,'none');assert.equal(b.weight,0);
  assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y));
 }
});
test('blocked memory route cannot reveal hidden sector state or bypass low-health retreat',()=>{
 const {T,g,t,st}=scene();g.hasLineOfSight=()=>false;
 g.novaBattlefieldWaypoint=()=>({x:t.x+50,y:t.y-100});
 const a=T.publicEcoBias(g,t,{},{});
 st.sectors[5].value=99999;st.sectors[5].maturity=1;st.sectors[5].pressure=100;
 const b=T.publicEcoBias(g,t,{},{});
 assert.equal(b.weight,a.weight);assert.equal(b.x,a.x);assert.equal(b.y,a.y);
 t.hp=20;assert.equal(T.publicEcoBias(g,t,{},{}).weight,0);
});

test('shipping AI movement wrapper actually follows a routed public opportunity and restores movement',()=>{
 const window={__novaModules:{
  'game/engine':function(m){m.exports={Game:class{}};},
  'game/ai':function(m){m.exports={updateAI:function(t,g,dt){g.moveTank(t,100,0,dt);}};}
 }};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const aiModule={exports:{}};window.__novaModules['game/ai'](aiModule,aiModule.exports,()=>({SHAPE_DEFS:{}}));
 const t={id:3,x:-900,y:-900,hp:100,maxHp:100,alive:true,ai:{isElite:false,__v1112TargetId:-1}};
 const st={signal:null,directorEnabled:true,bloomMemory:{sector:5,announcedAt:100,until:124},
  queryScratch:[],queryScratch2:[],sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0})),stats:{aiRotations:0}};
 const recorded=[],originalMove=(_t,x,y)=>recorded.push({x,y});
 const g={time:106,w:800,h:600,cam:{zoom:1},shapes:[],bullets:[],tanks:[t],__lfState:st,
  hasLineOfSight:()=>false,novaBattlefieldWaypoint:()=>({x:t.x+60,y:t.y-120}),moveTank:originalMove};
 aiModule.exports.updateAI(t,g,.3);
 assert.equal(recorded.length,1);assert.ok(recorded[0].y<0,'actual engine movement must turn toward reachable waypoint');
 assert.equal(g.moveTank,originalMove,'the temporary wrapper cannot hijack later movement');
 assert.equal(t.ai.__lfEcoMode,'memory');
});
