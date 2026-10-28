'use strict';
// Experimental migration interception waypoint: public sector IDs only.
// This branch must NOT enable the probe by default or claim better gameplay
// until real matched natural Chromium comparisons establish player value.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const window={__novaModules:{'game/engine':m=>{m.exports={Game:class{}};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const file of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js',
  'living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),ctx,{filename:file});
 return window.__NOVA_LIVING_FRONT_TEST__;
}
function scene(){
 const T=boot(),from=T.sectorCenter(0),to=T.sectorCenter(1);
 const t={id:3,x:-1050,y:-1400,hp:100,maxHp:100,alive:true,
  ai:{isElite:false,__v1112TargetId:-1}};
 const st={signal:{type:'MIGRATION',from:0,to:1,x:(from.x+to.x)/2,
  y:(from.y+to.y)/2,started:100,until:105},
  directorEnabled:true,queryScratch:[],queryScratch2:[],
  sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0}))};
 const g={time:101,w:800,h:600,cam:{zoom:1},shapes:[],bullets:[],tanks:[t],__lfState:st};
 return{T,t,st,g};
}
test('probe is OFF by default and keeps the canonical public midpoint policy',()=>{
 const {T,t,g}=scene();
 const baseline=T.publicEcoBias(g,t,{},{});g.__novaMigrationInterceptProbe=false;
 const explicitOff=T.publicEcoBias(g,t,{},{});
 assert.equal(baseline.mode,'signal');assert.equal(baseline.key,'MIGRATION:1');
 assert.equal(baseline.x,explicitOff.x);assert.equal(baseline.y,explicitOff.y);
 assert.equal(baseline.weight,explicitOff.weight);
 assert.ok(baseline.x<0&&baseline.y<0,'midpoint lies west and north of this rival');
});
test('experimental downstream waypoint changes only the public route bearing',()=>{
 const {T,t,g}=scene(),off=T.publicEcoBias(g,t,{},{});
 g.__novaMigrationInterceptProbe=true;
 const on=T.publicEcoBias(g,t,{},{});
 assert.equal(on.mode,'signal');assert.equal(on.key,off.key);
 assert.ok(on.weight>0&&on.weight<=.48);
 assert.ok(on.x>0&&on.y<0,'65% flow point lies east and north of this rival');
 assert.ok(off.x<0,'baseline midpoint remains west');
});
test('hidden ecology cannot influence either migration policy',()=>{
 const {T,t,g,st}=scene();g.__novaMigrationInterceptProbe=true;
 const before=T.publicEcoBias(g,t,{},{});
 st.sectors[0].value=90000;st.sectors[1].maturity=1;
 st.sectors[1].pressure=100;st.migrationHeat=9999;
 const after=T.publicEcoBias(g,t,{},{});
 for(const k of ['x','y','weight','key','mode'])assert.equal(after[k],before[k]);
});
test('invalid public crossing cannot authorize a new target',()=>{
 const {T,t,g,st}=scene(),baseline=T.publicEcoBias(g,t,{},{});
 g.__novaMigrationInterceptProbe=true;st.signal.from=-1;
 const out=T.publicEcoBias(g,t,{},{});
 assert.equal(out.x,baseline.x);assert.equal(out.y,baseline.y);
});
test('BLOOM and ROGUE STAR are unaffected by the migration-only probe',()=>{
 const {T,t,g,st}=scene();for(const type of ['BLOOM','ROGUE STAR']){
  st.signal.type=type;st.signal.sector=5;st.signal.starId=null;
  const off=T.publicEcoBias(g,t,{},{});g.__novaMigrationInterceptProbe=true;
  const on=T.publicEcoBias(g,t,{},{});
  for(const k of ['x','y','weight','key','mode'])assert.equal(on[k],off[k]);
  g.__novaMigrationInterceptProbe=false;
 }
});
test('no public signal or low health prevents experimental migration steering',()=>{
 const {T,t,g,st}=scene();g.__novaMigrationInterceptProbe=true;
 const live=st.signal;st.signal=null;st.directorEnabled=false;
 assert.equal(T.publicEcoBias(g,t,{},{}).weight,0);
 st.signal=live;st.directorEnabled=true;t.hp=20;
 assert.equal(T.publicEcoBias(g,t,{},{}).weight,0);
});

test('experimental migration waypoint still follows the actual terrain route',()=>{
 const {T,t,g}=scene();g.__novaMigrationInterceptProbe=true;
 g.hasLineOfSight=()=>false;
 g.novaBattlefieldWaypoint=()=>({x:t.x-40,y:t.y-40});
 const routed=T.publicEcoBias(g,t,{},{});
 assert.equal(routed.mode,'signal');
 assert.ok(routed.x<0&&routed.y<0,'terrain waypoint, not direct target, owns steering');
 g.novaBattlefieldWaypoint=()=>null;
 assert.equal(T.publicEcoBias(g,t,{},{}).weight,0,
  'missing safe terrain route must not authorize a through-cover turn');
});
test('visible close combat target retains priority over public migration probe',()=>{
 const {T,t,g}=scene();g.__novaMigrationInterceptProbe=true;
 const target={id:7,x:t.x+40,y:t.y+40,hp:100,alive:true,spawnShieldT:0};
 g.tanks.push(target);g.getTank=id=>id===7?target:null;
 t.ai.__v1112TargetId=7;
 assert.equal(T.publicEcoBias(g,t,{},{}).weight,0);
});
