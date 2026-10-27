'use strict';
// Tactical Frontlines: only an observed hostile contest of an existing public
// BLOOM may produce the CONTESTED minimap signal. No hidden enemy coordinates.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(fair=true){
 const Game=class{drawMinimap(){return 'base';}};
 const window={__novaModules:{'game/engine':function(m){m.exports={Game};}}};
 if(fair)window.__NOVA_FAIR_ENGAGEMENT_TEST__={inGameplayViewport(g,p,t){
  return Math.abs(t.x-p.x)<=g.w/(2*g.cam.zoom)&&Math.abs(t.y-p.y)<=g.h/(2*g.cam.zoom);
 }};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const module={exports:{}};
 window.__novaModules['game/engine'](module,module.exports,()=>({SHAPE_DEFS:{}}));
 return {T:window.__NOVA_LIVING_FRONT_TEST__,LF:window.__NOVA_LIVING_FRONT_INTERNAL__,Game:module.exports.Game};
}
function scene(fair=true){
 const {T,LF,Game}=boot(fair),g=new Game(),p={id:1,x:-560,y:-560,hp:100,alive:true},
  enemy={id:2,x:-520,y:-540,hp:100,alive:true};
 const calls=[],ctx={save(){},restore(){},beginPath(){},arc(){},stroke(){},fill(){},moveTo(){},lineTo(){},
  fillText(s){calls.push(s);}};
 Object.assign(g,{time:100,player:p,tanks:[p,enemy],shapes:[],w:800,h:600,cam:{zoom:1},
  mmCtx:ctx,hasLineOfSight:()=>true,areHostile:(a,b)=>a.id!==b.id,areAllies:()=>false});
 g.__lfState={signal:{type:'BLOOM',sector:5,started:98,until:104},stats:{},sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0})),
  lastSignalAt:99,cooldowns:{bloom:24,migration:20,star:58},migrationHeat:0,planMsEma:0,planMsPeak:0};
 return {T,LF,g,p,enemy,calls,st:g.__lfState};
}
test('visible hostile in the existing BLOOM sector yields a single readable contest',()=>{
 const {T,g,calls,st}=scene();
 assert.equal(T.contestCandidate(g,st),true);
 assert.equal(T.updateContest(g,st),true);
 assert.equal(st.stats.contests,1);
 assert.equal(st.contestSignal.sector,5);
 assert.equal(g.drawMinimap(),'base');
 assert.ok(calls.includes('CONTESTED'),'actual shipping minimap path must render the signal');
 T.updateContest(g,st);assert.equal(st.stats.contests,1,'do not count every Director tick');
});
test('terrain occlusion suppresses signal and clears stale contest',()=>{
 const {T,g,st,calls}=scene();T.updateContest(g,st);
 g.hasLineOfSight=()=>false;assert.equal(T.updateContest(g,st),false);
 assert.equal(st.contestSignal,null);g.drawMinimap();
 assert.equal(calls.includes('CONTESTED'),false);
});
test('outside the real Fair Engagement viewport is not radar',()=>{
 const {T,g,enemy,st}=scene();g.w=320;enemy.x=-320;
 assert.equal(T.contestCandidate(g,st),false);
 g.w=800;assert.equal(T.contestCandidate(g,st),true);
});
test('allies and nonhostile tanks cannot create a false contest',()=>{
 const {T,g,st}=scene();
 g.areAllies=()=>true;assert.equal(T.contestCandidate(g,st),false);
 g.areAllies=()=>false;g.areHostile=()=>false;assert.equal(T.contestCandidate(g,st),false);
 delete g.areHostile;assert.equal(T.contestCandidate(g,st),false,'unknown hostility fails closed');
});
test('spawn shields, dead targets and player death suppress the contest',()=>{
 const {T,g,p,enemy,st}=scene();
 enemy.spawnShieldT=1;assert.equal(T.contestCandidate(g,st),false);
 enemy.spawnShieldT=0;enemy.hp=0;assert.equal(T.contestCandidate(g,st),false);
 enemy.hp=100;p.hp=0;assert.equal(T.contestCandidate(g,st),false);
});
test('neither a distant sector nor an unrelated signal creates a contest',()=>{
 const {T,g,enemy,st}=scene();
 enemy.x=620;assert.equal(T.contestCandidate(g,st),false);
 enemy.x=-520;st.signal.type='MIGRATION';assert.equal(T.contestCandidate(g,st),false);
 st.signal.type='BLOOM';st.signal.until=99;assert.equal(T.contestCandidate(g,st),false);
});
test('missing Fair Engagement or terrain visibility APIs fail closed',()=>{
 const {T,g,st}=scene(false);assert.equal(T.contestCandidate(g,st),false);
 const q=scene();delete q.g.hasLineOfSight;assert.equal(q.T.contestCandidate(q.g,q.st),false);
});
test('decorative lobby simulation cannot generate player tactical signals',()=>{
 const {T,g,st}=scene();g.__novaDecorativeWorld=true;
 assert.equal(T.contestCandidate(g,st),false);
});
test('Director tick updates contest but never replaces the public BLOOM',()=>{
 const {LF,g,st}=scene(),before=JSON.stringify(st.signal);
 LF.directorTick(g,st);
 assert.equal(st.stats.contests,1,'the real Director tick must drive contest telemetry');
 assert.ok(st.contestSignal,'the real Director tick must drive the minimap signal');
 assert.equal(JSON.stringify(st.signal),before,'local contest cannot rewrite public BLOOM');
});
test('the actual shipping HTML loads the patched Director after Fair Engagement and Living Front core',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const fair=html.indexOf('nova-updates/fair-engagement-v1.11.2.js');
 const core=html.indexOf('nova-updates/living-front-core-v1.12.0.js');
 const director=html.indexOf('nova-updates/living-front-director-v1.12.0.js');
 assert.ok(fair>0&&core>fair&&director>core);
});
