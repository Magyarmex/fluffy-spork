'use strict';
/* A public MIGRATION must describe an actual flow from its announced origin.
 * The world-wide migration vector mixes different source sectors and cannot
 * certify a direction at one particular source. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const window={__novaModules:{'game/engine':function(m){m.exports={Game:class{}};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js',
  'living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 return window.__NOVA_LIVING_FRONT_TEST__;
}
function state(T){
 const sectors=Array.from({length:16},(_,i)=>({...T.makeSector(i),value:80,maturity:.1,
  outbound:0,flowX:0,flowY:0}));
 return{sectors,ceiling:1,signal:null,lastSignalAt:-99,lastMeaningfulAt:100,
  lastBloomSector:-1,migrationHeat:9,migrationX:4,migrationY:-3,
  cooldowns:{bloom:100,migration:0,star:100}};
}
test('dominant source northward flow cannot be misreported as global eastward flow',()=>{
 const T=boot(),st=state(T);
 // Five actual crossings at sector 5: four north, one south => local north.
 // Four other crossings at sector 10: all east. Global vector points east.
 st.sectors[5].outbound=5;st.sectors[5].flowY=-3;
 st.sectors[10].outbound=4;st.sectors[10].flowX=4;
 const d=T.directorDecision(st,{enabled:true,now:100,hasStar:true});
 assert.equal(d?.type,'MIGRATION');
 assert.equal(d.from,5);
 assert.equal(d.to,1,'announce sector 5 -> 1 north, not global 5 -> 6 east');
});
test('explicitly selected second source uses its own eastward flow',()=>{
 const T=boot(),st=state(T);
 st.sectors[5].outbound=5;st.sectors[5].flowY=-3;
 st.sectors[10].outbound=4;st.sectors[10].flowX=4;
 const d=T.directorDecision(st,{enabled:true,now:100,hasStar:true,migrationFrom:10});
 assert.equal(d?.type,'MIGRATION');
 assert.equal(d.from,10);
 assert.equal(d.to,11);
});
test('cancelling source flows do not invent a public migration direction',()=>{
 const T=boot(),st=state(T);
 // Equal north/south crossings at the chosen source; unrelated sector
 // still has a global direction. This source has no coherent public flow.
 st.sectors[5].outbound=6;st.sectors[5].flowX=0;st.sectors[5].flowY=0;
 st.sectors[10].outbound=4;st.sectors[10].flowX=4;
 assert.equal(T.directorDecision(st,{enabled:true,now:100,hasStar:true}),null);
});
test('source-local direction is independent of hidden maturity/value and unrelated flows',()=>{
 const T=boot(),st=state(T);
 st.sectors[5].outbound=6;st.sectors[5].flowX=1;st.sectors[5].flowY=0;
 st.sectors[10].outbound=4;st.sectors[10].flowY=-4;
 const ctx={enabled:true,now:100,hasStar:true};
 const d=T.directorDecision(st,ctx);
 assert.equal(d?.to,6);
 st.sectors.forEach((s,i)=>{s.value=i*999;s.maturity=i/16;});
 st.migrationX=-100;st.migrationY=50;
 const d2=T.directorDecision(st,ctx);
 assert.equal(d2?.from,5);
 assert.equal(d2?.to,6);
});
test('source flow preserves canonical migration gate, cooldown and shipping overlay',()=>{
 const T=boot(),st=state(T);
 st.sectors[5].outbound=6;st.sectors[5].flowX=1;
 st.migrationHeat=4.99;
 assert.equal(T.directorDecision(st,{enabled:true,now:100,hasStar:true}),null);
 st.migrationHeat=6;st.cooldowns.migration=3;
 assert.equal(T.directorDecision(st,{enabled:true,now:100,hasStar:true}),null);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'));
});
