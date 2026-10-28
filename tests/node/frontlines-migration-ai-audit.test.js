'use strict';
// Public MIGRATION audit: decision samples are not physical arrivals or
// independent player outcomes. No hidden sector state or AI authority added.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 class Game {
  moveTank(t,vx,vy,dt){t.x+=vx*dt;t.y+=vy*dt;}
 }
 const window={__novaModules:{'game/engine':function(m){m.exports={Game};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const m={exports:{}};window.__novaModules['game/engine'](m,m.exports,()=>({SHAPE_DEFS:{}}));
 return {T:window.__NOVA_LIVING_FRONT_TEST__,Game:m.exports.Game};
}
function scene(x=-200){
 const {T,Game}=boot(),t={id:3,x,y:-562.5,hp:100,maxHp:100,alive:true,
  ai:{isElite:false,__v1112TargetId:-1}};
 const st={signal:{type:'MIGRATION',from:5,to:6,x:0,y:-562.5,started:100,until:104.4},
  directorEnabled:true,stats:{},queryScratch:[],queryScratch2:[],
  sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0}))};
 const g=new Game();Object.assign(g,{time:101,status:'playing',w:800,h:600,cam:{zoom:1},
  shapes:[],bullets:[],tanks:[t],__lfState:st,tankSpeed:()=>124,
  hasLineOfSight:()=>true});
 return {T,g,t,st};
}
test('reachable public migration yields an audited steering sample and route bin',()=>{
 const {T,g,t,st}=scene();
 const b=T.publicEcoBias(g,t,{},{});
 assert.equal(b.mode,'signal');assert.equal(b.key,'MIGRATION:6');assert.ok(b.weight>.04);
 assert.equal(st.stats.migrationAiSamples,1);assert.equal(st.stats.migrationAiSteered,1);
 assert.equal(st.stats.migrationAiRouteLt300,1);
 assert.equal(t.ai.__lfMigrationSignalStarted,100,'the accepted bias witnesses this announcement epoch');
 assert.equal(st.stats.migrationAiPhysicalArrivals||0,0,'an intention is not an arrival');
});
test('health and legitimate visible combat vetoes are distinct from route failures',()=>{
 const {T,g,t,st}=scene();
 t.hp=20;assert.equal(T.publicEcoBias(g,t,{},{}).weight,0);
 t.hp=100;const enemy={id:77,x:t.x+20,y:t.y,hp:100,alive:true,spawnShieldT:0};
 g.tanks.push(enemy);g.getTank=id=>id===77?enemy:null;t.ai.__v1112TargetId=77;
 assert.equal(T.publicEcoBias(g,t,{},{}).weight,0);
 assert.equal(st.stats.migrationAiSamples,2);
 assert.equal(st.stats.migrationAiHealthVeto,1);
 assert.equal(st.stats.migrationAiCombatVeto,1);
 assert.equal(st.stats.migrationAiSteered||0,0);
});
test('blocked terrain and long routes are reported without manufacturing arrivals',()=>{
 const {T,g,t,st}=scene(-900);
 const far=T.publicEcoBias(g,t,{},{});
 assert.equal(far.mode,'none');assert.equal(st.stats.migrationAiScoreVeto,1);
 assert.equal(st.stats.migrationAiRoute644to1200,1);
 g.hasLineOfSight=()=>false;g.novaBattlefieldWaypoint=()=>null;
 const blocked=T.publicEcoBias(g,t,{},{});
 assert.equal(blocked.mode,'none');assert.equal(st.stats.migrationAiRouteBlocked,1);
 assert.equal(st.stats.migrationAiSamples,2);
});
test('crowding veto is measured without changing canonical saturation behavior',()=>{
 const {T,g,t,st}=scene();
 for(let i=0;i<2;i++)g.tanks.push({id:10+i,hp:100,alive:true,ai:{
  __lfEcoKey:'MIGRATION:6',__lfEcoWeight:.3}});
 const b=T.publicEcoBias(g,t,{},{});
 assert.equal(b.mode,'none');
 assert.equal(st.stats.migrationAiScoreVeto,1);
 assert.equal(st.stats.migrationAiCrowdVeto,1);
});
test('disabled, expired, future and decorative signals do not enter the audit',()=>{
 const {T,g,t,st}=scene();
 st.directorEnabled=false;
 assert.equal(T.publicEcoBias(g,t,{},{}).mode,'none');
 st.directorEnabled=true;g.time=105;
 assert.equal(T.publicEcoBias(g,t,{},{}).mode,'none');
 g.time=99;assert.equal(T.publicEcoBias(g,t,{},{}).mode,'none');
 g.time=101;g.__novaDecorativeWorld=true;
 T.publicEcoBias(g,t,{},{});
 assert.equal(st.stats.migrationAiSamples||0,0);
});
test('changing hidden maturity and value cannot change migration decision or route',()=>{
 const {T,g,t,st}=scene();
 const a=T.publicEcoBias(g,t,{},{});
 for(const s of st.sectors){s.value=100000;s.maturity=1;s.pressure=100;}
 const b=T.publicEcoBias(g,t,{},{});
 assert.equal(b.mode,a.mode);assert.equal(b.x,a.x);assert.equal(b.y,a.y);
 assert.equal(b.weight,a.weight);assert.equal(st.stats.migrationAiSteered,2);
});
test('only a witnessed, plausible sector entry counts as physical arrival, once',()=>{
 const {T,g,t,st}=scene(-20);
 t.ai.__lfEcoKey='MIGRATION:6';t.ai.__lfEcoMode='signal';t.ai.__lfMigrationSignalStarted=100;
 assert.equal(T.sectorIndex(t.x,t.y),5);
 g.moveTank(t,124,0,.3);
 assert.equal(T.sectorIndex(t.x,t.y),6);
 assert.equal(st.stats.migrationAiPhysicalArrivals,1);
 g.moveTank(t,-124,0,.3);g.moveTank(t,124,0,.3);
 assert.equal(st.stats.migrationAiPhysicalArrivals,1,'repeat crossing is not a new arrival');
});
test('teleport-scale motion, absent speed, non-AI and expired signals fail closed',()=>{
 for(const invalid of ['teleport','speed','no-ai','expired']){
  const {g,t,st}=scene(-20);
  t.ai.__lfEcoKey='MIGRATION:6';t.ai.__lfEcoMode='signal';t.ai.__lfMigrationSignalStarted=100;
  if(invalid==='teleport')g.moveTank(t,2000,0,.3);
  if(invalid==='speed'){delete g.tankSpeed;g.moveTank(t,124,0,.3);}
  if(invalid==='no-ai'){t.ai=null;g.moveTank(t,124,0,.3);}
  if(invalid==='expired'){g.time=105;g.moveTank(t,124,0,.3);}
  assert.equal(st.stats.migrationAiPhysicalArrivals||0,0,invalid);
 }
});
test('stale AI steering from a previous public migration cannot count a new arrival',()=>{
 const {g,t,st}=scene(-20);
 t.ai.__lfEcoKey='MIGRATION:6';t.ai.__lfEcoMode='signal';
 t.ai.__lfMigrationSignalStarted=99;
 g.moveTank(t,124,0,.3);
 assert.equal(st.stats.migrationAiPhysicalArrivals||0,0);
});
