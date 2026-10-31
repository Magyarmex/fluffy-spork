'use strict';
// Tactical Frontlines: a visible rival should be actionable BEFORE entering an
// announced BLOOM, without sector radar, a new HUD, or premature contest credit.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function scene(){
 class Game{drawMinimap(){return 'base';}}
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
 const p={id:1,x:-1170,y:-560,hp:100,alive:true},
  enemy={id:2,x:-1050,y:-540,hp:100,alive:true},
  shape={id:44,type:'hexagon',x:-1040,y:-550,hp:200};
 const draws=[],mmCtx={save(){},restore(){},beginPath(){},arc(x,y,r){draws.push({type:'arc',x,y,r});},
  stroke(){},fill(){},moveTo(){},lineTo(){},setLineDash(v){draws.push({type:'dash',v:v.slice()});},
  fillText(v){draws.push({type:'text',value:v,font:this.font});}};
 const st={directorEnabled:true,signal:{type:'BLOOM',sector:5,started:98,until:104},
  stats:{},sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0})),
  defs:{hexagon:{xp:200}},queryScratch:[],queryScratch2:[]};
 const g=new m.exports.Game();Object.assign(g,{time:100,status:'playing',w:800,h:600,
  cam:{x:p.x,y:p.y,zoom:1},player:p,tanks:[p,enemy],shapes:[shape],
  bullets:[],__lfState:st,mmCtx,hasLineOfSight:()=>true,areHostile:(a,b)=>a.id!==b.id});
 return{g,st,p,enemy,shape,draws,T:window.__NOVA_LIVING_FRONT_TEST__};
}
test('visible hostile guarding a public BLOOM warns BEFORE entry but does not count a contest',()=>{
 const s=scene();
 assert.equal(s.T.contestCandidate(s.g,s.st),false,'pilot is still outside sector');
 assert.equal(s.T.preEntryCandidate(s.g,s.st),true,'both enemy and valuable neutral pocket are visible');
 assert.equal(s.T.updateContest(s.g,s.st),false,'do not count the warning as a contested entry');
 assert.equal(s.st.contestSignal,null);
 assert.equal(s.st.stats.contests||0,0);
 assert.equal(s.st.approachSignal.sector,5);
 assert.equal(s.g.drawMinimap(),'base');
 assert.ok(s.draws.some(d=>d.type==='text'&&d.value==='!'),'warn on existing BLOOM minimap marker');
 assert.ok(s.draws.some(d=>d.type==='dash'&&d.v.length>0),'distinguish pre-entry witness from solid inside contest');
 s.p.x=-1110;s.g.cam.x=s.p.x;s.draws.length=0;
 assert.equal(s.T.updateContest(s.g,s.st),true,'entering sector promotes warning to real contest');
 assert.equal(s.st.approachSignal,null);
 assert.equal(s.st.stats.contests,1);
 s.g.drawMinimap();
 assert.ok(s.draws.some(d=>d.type==='text'&&d.value==='!'));
 assert.ok(!s.draws.some(d=>d.type==='dash'&&d.v.length>0),'inside contest uses solid original badge');
});
test('public warning is independent of hidden sector totals and private rival position after visibility fails',()=>{
 const s=scene();
 s.st.sectors[5].value=100000;
 assert.equal(s.T.preEntryCandidate(s.g,s.st),true);
 s.st.sectors[5].value=0;
 assert.equal(s.T.preEntryCandidate(s.g,s.st),true);
 s.g.hasLineOfSight=()=>false;
 assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 assert.equal(s.T.updateContest(s.g,s.st),false);
 assert.equal(s.st.approachSignal,null);
 s.g.drawMinimap();
 assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'));
});
test('warning rejects unseen, shielded, allied, dead and out-of-sector rivals',()=>{
 const s=scene();
 s.enemy.spawnShieldT=1;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.enemy.spawnShieldT=0;s.enemy.hp=0;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.enemy.hp=100;s.g.areAllies=()=>true;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.g.areAllies=()=>false;s.enemy.x=-1170;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.enemy.x=-1050;s.g.w=160;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.g.w=800;s.g.cam.x=-1900;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
});
test('warning rejects stale or future BLOOM, disabled Director and decorative lobby',()=>{
 const s=scene();
 s.st.signal.started=120;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.st.signal.started=98;s.g.time=105;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.st.signal=null;s.st.bloomMemory={sector:5,announcedAt:98,until:122};
 assert.equal(s.T.preEntryCandidate(s.g,s.st),true,'bounded last-known public sector still permits a new local visual witness');
 s.g.time=122;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.g.time=106;s.st.directorEnabled=false;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.st.directorEnabled=true;s.g.__novaDecorativeWorld=true;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
});
test('warning requires a visible harvestable pocket and a genuinely near approach',()=>{
 const s=scene();
 s.shape.hp=0;assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.shape.hp=200;s.g.shapes=[];assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 s.g.shapes=[s.shape];s.g.w=2200;s.g.cam.x=-1600;s.p.x=-1600;
 assert.equal(s.T.preEntryCandidate(s.g,s.st),false,'do not mark a distant unrelated sector');
 s.p.x=-1170;s.g.cam.x=-1170;s.g.w=800;
 s.shape.id=s.p.id;assert.equal(s.T.preEntryCandidate(s.g,s.st),true,'shape and tank ids are separate namespaces');
});
test('pre-entry signal is bounded to a recent witnessed sample and cannot overwrite BLOOM',()=>{
 const s=scene(),original=JSON.stringify(s.st.signal);
 s.T.updateContest(s.g,s.st);
 assert.equal(JSON.stringify(s.st.signal),original);
 s.g.time=103.9;s.T.updateContest(s.g,s.st);
 assert.ok(s.st.approachSignal.until<=104);
 s.g.time=104;s.T.updateContest(s.g,s.st);
 assert.equal(s.st.approachSignal,null);
 s.draws.length=0;s.g.drawMinimap();
 assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'));
});
