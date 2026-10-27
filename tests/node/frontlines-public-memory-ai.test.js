'use strict';
// AI must treat public BLOOM memory as uncertain intelligence, not hidden ecology.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const window={__novaModules:{'game/engine':function(m){m.exports={Game:class{}};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 return window.__NOVA_LIVING_FRONT_TEST__;
}
function scene(){
 const T=boot(),t={id:3,x:-900,y:-900,hp:100,maxHp:100,alive:true,
  ai:{isElite:false,__v1112TargetId:-1}};
 const st={signal:null,directorEnabled:true,bloomMemory:{sector:5,announcedAt:100,until:124,initialValue:500},
  queryScratch:[],queryScratch2:[],sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0}))};
 const g={time:106,w:800,h:600,cam:{zoom:1},shapes:[],bullets:[],tanks:[t],__lfState:st};
 return{T,t,g,st};
}
test('nearby AI can rotate toward a recently announced public BLOOM after live signal expiry',()=>{
 const {T,t,g}=scene(),b=T.publicEcoBias(g,t,{},{});assert.equal(b.mode,'memory');
 assert.equal(b.key,'BLOOM:5');assert.ok(b.weight>.04&&b.weight<=.26);
 assert.ok(b.x>0&&b.y>0,'approach announced center without new enemy coordinates');
});
test('public memory never reads hidden sector value or maturity',()=>{
 const {T,t,g,st}=scene(),a=T.publicEcoBias(g,t,{},{});
 st.sectors[5].value=9000;st.sectors[5].maturity=1;st.sectors[5].pressure=9;
 const b=T.publicEcoBias(g,t,{},{});
 assert.equal(b.mode,a.mode);assert.equal(b.weight,a.weight);assert.equal(b.x,a.x);assert.equal(b.y,a.y);
});
test('expired or disabled memory cannot bias AI',()=>{
 const {T,t,g,st}=scene();st.bloomMemory.until=105;
 assert.equal(T.publicEcoBias(g,t,{},{}).mode,'none');
 st.bloomMemory.until=124;st.directorEnabled=false;
 assert.equal(T.publicEcoBias(g,t,{},{}).mode,'none');
});
test('active public migration overrides stale BLOOM memory',()=>{
 const {T,t,g,st}=scene();
 st.signal={type:'MIGRATION',from:2,to:3,x:1500,y:1500,started:105,until:110};
 const b=T.publicEcoBias(g,t,{},{});
 assert.notEqual(b.mode,'memory');
});
test('low-health AI and a nearby legitimate combat target never chase remembered farming',()=>{
 const {T,t,g}=scene();t.hp=20;
 assert.equal(T.publicEcoBias(g,t,{},{}).weight,0);
 t.hp=100;const enemy={id:7,x:t.x+40,y:t.y+40,hp:100,alive:true,spawnShieldT:0};
 g.tanks.push(enemy);g.getTank=id=>id===7?enemy:null;t.ai.__v1112TargetId=7;
 assert.equal(T.publicEcoBias(g,t,{},{}).weight,0);
});
test('already committed rivals saturate remembered opportunity rather than dogpiling',()=>{
 const {T,t,g}=scene();for(let i=0;i<3;i++)g.tanks.push({
  id:10+i,x:-900,y:-900,hp:100,alive:true,ai:{__lfEcoKey:'BLOOM:5',__lfEcoWeight:.3}
 });
 const b=T.publicEcoBias(g,t,{},{});
 assert.equal(b.mode,'none');
});

test('the actual wrapped AI update steers toward public memory without permanently hijacking movement',()=>{
 const window={__novaModules:{
  'game/engine':function(m){m.exports={Game:class{}};},
  'game/ai':function(m){m.exports={updateAI:function(t,g,dt){g.moveTank(t,100,0,dt);}};}
 }};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const aiModule={exports:{}};
 window.__novaModules['game/ai'](aiModule,aiModule.exports,()=>({SHAPE_DEFS:{}}));
 const t={id:3,x:-900,y:-900,hp:100,maxHp:100,alive:true,ai:{isElite:false,__v1112TargetId:-1}};
 const st={signal:null,directorEnabled:true,bloomMemory:{sector:5,announcedAt:100,until:124,initialValue:500},
  queryScratch:[],queryScratch2:[],sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0})),stats:{aiRotations:0}};
 const recorded=[];
 const originalMove=function(_t,x,y){recorded.push({x,y});};
 const g={time:106,w:800,h:600,cam:{zoom:1},shapes:[],bullets:[],tanks:[t],__lfState:st,moveTank:originalMove};
 aiModule.exports.updateAI(t,g,.3);
 assert.equal(g.moveTank,originalMove,'temporary movement wrapper must always restore authority');
 assert.equal(recorded.length,1);
 assert.ok(recorded[0].x<100&&recorded[0].y>0,'actual AI movement is pulled toward remembered public front');
 assert.equal(t.ai.__lfEcoMode,'memory');
 assert.equal(st.stats.aiRotations,1);
});
