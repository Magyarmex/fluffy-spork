'use strict';
/* Predeclared research intervention: compare public migration threshold 3 vs
 * canonical 5 without changing physics, AI utility or the default game. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const window={__novaModules:{'game/engine':function(m){m.exports={Game:class{}};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const f of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',f),'utf8'),ctx,{filename:f});
 return{LF:window.__NOVA_LIVING_FRONT_INTERNAL__,T:window.__NOVA_LIVING_FRONT_TEST__};
}
function state(T,heat=3.2){
 const sectors=Array.from({length:16},(_,i)=>({...T.makeSector(i),maturity:.1,value:80,outbound:i===5?6:0}));
 return{age:100,ceiling:1,signal:null,directorEnabled:true,sectors,
  lastSignalAt:-99,lastMeaningfulAt:100,lastBloomSector:-1,
  migrationHeat:heat,migrationX:1,migrationY:0,
  cooldowns:{bloom:100,migration:0,star:100},
  stats:{blooms:0,migrations:0,starsSpawned:0,aiRotations:0}};
}
test('canonical threshold remains 5 unless exact research opt-in is 3',()=>{
 const {T}=boot();
 for(const heat of [0,2.99,3,3.2,4.999,5,6]){
  const st=state(T,heat),ctx={enabled:true,now:100,hasStar:true,migrationFrom:5};
  const canonical=T.directorDecision(st,ctx);
  const opt=T.directorDecision(st,{...ctx,migrationGateResearch:3});
  assert.equal(canonical?.type,heat>=5?'MIGRATION':undefined,'canonical '+heat);
  assert.equal(opt?.type,heat>=3?'MIGRATION':undefined,'research '+heat);
  for(const invalid of [undefined,null,false,true,0,3.5,4,5,'3',NaN]){
   assert.equal(T.directorDecision(st,{...ctx,migrationGateResearch:invalid})?.type,
    canonical?.type,'invalid gate must fail closed');
  }
 }
});
test('research gate never overrides Director cooldown, live signal, or BLOOM priority',()=>{
 const {T}=boot(),ctx={enabled:true,now:100,hasStar:true,migrationFrom:5,migrationGateResearch:3};
 for(const mutation of [
  st=>st.cooldowns.migration=2,
  st=>st.signal={type:'BLOOM',until:110},
  st=>st.lastSignalAt=99,
  st=>{st.cooldowns.bloom=0;st.sectors[6].maturity=.95;st.sectors[6].value=900;}
 ]){
  const st=state(T);mutation(st);
  const d=T.directorDecision(st,ctx);
  if(st.sectors[6].value===900)assert.equal(d?.type,'BLOOM','BLOOM retains priority');
  else assert.equal(d,null,'other public signals and cooldowns retain authority');
 }
 assert.equal(T.directorDecision(state(T),{...ctx,enabled:false}),null);
});
test('lower gate still requires coherent real sector-to-sector flow',()=>{
 const {T}=boot(),st=state(T),ctx={enabled:true,now:100,hasStar:true,migrationGateResearch:3,migrationFrom:5};
 st.migrationX=0;st.migrationY=0;
 // No movement direction: current Director fallback chooses an unchanged sector.
 assert.notEqual(T.directorDecision(st,ctx)?.type,'MIGRATION');
 st.migrationX=1;st.migrationY=0;
 assert.equal(T.directorDecision(st,ctx)?.type,'MIGRATION');
 st.migrationHeat=2.99;
 assert.equal(T.directorDecision(st,ctx),null);
});
test('real Director tick only emits research migration on explicitly opted-in game',()=>{
 const {LF,T}=boot();
 function run(probe){
  const st=state(T),toasts=[],g={time:100,status:'playing',shapes:[],tanks:[],
   __lfState:st,toast(message){toasts.push(message);}};
  if(probe)g.__novaResearchMigrationGate=3;
  LF.directorTick(g,st);
  return{st,toasts};
 }
 const off=run(false),on=run(true);
 assert.equal(off.st.stats.migrations,0);
 assert.equal(off.st.signal,null);
 assert.equal(off.toasts.length,0);
 assert.equal(on.st.stats.migrations,1);
 assert.equal(on.st.signal.type,'MIGRATION');
 assert.equal(on.st.signal.from,5);
 assert.equal(on.st.signal.to,6);
 assert.equal(on.toasts.length,1);
 assert.match(on.toasts[0],/MIGRATION/);
 assert.equal(on.st.migrationHeat,3.2*.28,'existing heat consumption unchanged');
});
test('research-only gate leaves shipping composition and other public signal classes intact',()=>{
 const {T}=boot(),st=state(T,0);
 st.cooldowns.migration=100;st.cooldowns.star=0;st.lastMeaningfulAt=0;
 const ctx={enabled:true,now:100,hasStar:false};
 assert.equal(T.directorDecision(st,ctx)?.type,'ROGUE STAR');
 assert.equal(T.directorDecision(st,{...ctx,migrationGateResearch:3})?.type,'ROGUE STAR');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'));
 const director=fs.readFileSync(path.join(root,'nova-updates/living-front-director-v1.12.0.js'),'utf8');
 assert.match(director,/migrationGateResearch===3\?3:5/);
 assert.match(director,/migrationGateResearch:g\.__novaResearchMigrationGate/);
});
