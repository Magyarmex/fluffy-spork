'use strict';
// Read-only physical reaction-window telemetry: a minimap cue is counted only
// if actually drawn, and entry is witnessed by the real movement owner.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function scene(){
 class Game{
  drawMinimap(){return 'base';}
  moveTank(t,vx,vy,dt){t.x+=vx*dt;t.y+=vy*dt;return true;}
  tankSpeed(){return 200;}
 }
 const window={__novaModules:{'game/engine':m=>{m.exports={Game};}},
  __NOVA_FAIR_ENGAGEMENT_TEST__:{
   viewportHalfExtents:g=>({x:g.w/(2*g.cam.zoom),y:g.h/(2*g.cam.zoom)}),
   inGameplayViewport:(g,p,t)=>Math.abs(t.x-p.x)<=g.w/(2*g.cam.zoom)&&Math.abs(t.y-p.y)<=g.h/(2*g.cam.zoom)
  }};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const m={exports:{}};window.__novaModules['game/engine'](m,m.exports,()=>({SHAPE_DEFS:{}}));
 const p={id:1,x:-1130,y:-560,hp:100,alive:true},enemy={id:2,x:-1050,y:-540,hp:100,alive:true},
  shape={id:44,type:'hexagon',x:-1040,y:-550,hp:200};
 const st={directorEnabled:true,signal:{type:'BLOOM',sector:5,started:98,until:104},
  stats:{},sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0})),
  defs:{hexagon:{xp:200}},queryScratch:[],queryScratch2:[]};
 const mmCtx={save(){},restore(){},beginPath(){},arc(){},stroke(){},fill(){},moveTo(){},lineTo(){},setLineDash(){},fillText(){}};
 const g=new m.exports.Game();Object.assign(g,{time:100,status:'playing',w:800,h:600,
  cam:{x:p.x,y:p.y,zoom:1},player:p,tanks:[p,enemy],shapes:[shape],
  __lfState:st,mmCtx,hasLineOfSight:()=>true,areHostile:(a,b)=>a.id!==b.id});
 const LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
 LF.frontlineTick(g,st,false);
 return{g,st,p,enemy,shape,f:st.frontlineTelemetry,LF};
}
function cross(s,dt=.1,speed=200){s.g.time+=dt;s.g.moveTank(s.p,speed,0,dt);}
test('a drawn visible cue is recorded once and physically crossed entry measures 300ms lead',()=>{
 const s=scene();s.g.drawMinimap();s.g.drawMinimap();
 assert.equal(s.f.counts.cuePresentations,1);
 assert.equal(s.f.events.filter(e=>e.kind==='approach-cue-shown').length,1);
 cross(s,.3,200);
 assert.equal(s.f.counts.cuedPhysicalEntries,1);
 assert.equal(s.f.counts.uncuedPhysicalEntries,0);
 assert.equal(s.f.counts.cueLeadMsMin,300);
 assert.equal(s.f.counts.cueLeadMsMax,300);
 assert.equal(s.f.counts.cueUnder200Ms,0);
 cross(s,.1,200);assert.equal(s.f.counts.cuedPhysicalEntries,1,'remaining inside is not a new entry');
});
test('a short 100ms cue-to-physical-entry interval is recorded without inventing reaction time',()=>{
 const s=scene();s.g.drawMinimap();cross(s,.1,200);
 assert.equal(s.f.counts.cueUnder200Ms,1);
 assert.equal(s.f.counts.cueLeadMsSum,100);
 assert.equal(s.f.events.filter(e=>e.kind==='pilot-entry-after-cue').length,1);
});
test('an entry with no rendered cue is explicitly uncued, not inferred from a candidate',()=>{
 const s=scene();cross(s,.1,200);
 assert.equal(s.f.counts.cuePresentations,0);
 assert.equal(s.f.counts.cuedPhysicalEntries,0);
 assert.equal(s.f.counts.uncuedPhysicalEntries,1);
});
test('a previously rendered cue that disappears with LOS does not count as actionable',()=>{
 const s=scene();s.g.drawMinimap();s.g.hasLineOfSight=()=>false;
 s.g.time+=.2;s.g.drawMinimap();
 assert.equal(s.st.approachSignal,null);
 s.g.moveTank(s.p,200,0,.1);
 assert.equal(s.f.counts.cuedPhysicalEntries,0);
 assert.equal(s.f.counts.uncuedPhysicalEntries,1);
});
test('uncertified teleport, disabled Director and shielded player cannot fabricate physical entries',()=>{
 for(const variant of ['teleport','disabled','shield']){
  const s=scene();s.g.drawMinimap();
  if(variant==='teleport')s.g.moveTank(s.p,5000,0,.1);
  else{if(variant==='disabled')s.st.directorEnabled=false;else s.p.spawnShieldT=1;cross(s,.1,200);}
  assert.equal(s.f.counts.cuedPhysicalEntries+s.f.counts.uncuedPhysicalEntries,0,variant);
  assert.equal(s.f.counts.pilotPhysicalRejectedCrossings,variant==='teleport'?1:0,variant);
 }
});
test('cue from an earlier pilot cannot be transferred to a new player identity',()=>{
 const s=scene();s.g.drawMinimap();
 const replacement={id:77,x:-1130,y:-560,hp:100,alive:true};
 s.g.player=replacement;s.g.tanks=[replacement,s.enemy];s.g.cam.x=replacement.x;
 s.g.time+=.1;s.g.moveTank(replacement,200,0,.1);
 assert.equal(s.f.counts.cuedPhysicalEntries,0);
 assert.equal(s.f.counts.uncuedPhysicalEntries,1);
});
test('Debug snapshot exposes aggregate timing only, not hidden hostile positions',()=>{
 const s=scene();s.g.drawMinimap();cross(s,.1,200);
 Object.assign(s.st,{age:100,ceiling:1,planMsEma:0,planMsPeak:0});
 s.st.stats.playerNeutralXP=0;s.st.stats.starsIntercepted=0;s.st.stats.starsExpired=0;s.st.stats.starsSpawned=0;
 s.st.sectors=s.st.sectors.map(q=>Object.assign(q,{count:0,xp:0,recentHarvest:0,recentCombat:0,inbound:0,outbound:0,flowX:0,flowY:0}));
 const snap=s.LF.snapshot(s.g);
 assert.equal(snap.frontline.counts.cuePresentations,1);
 assert.equal(snap.frontline.counts.cueUnder200Ms,1);
 assert.ok(!JSON.stringify(snap.frontline).includes('enemyX'));
});
