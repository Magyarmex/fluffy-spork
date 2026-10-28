'use strict';
// Regression-first: public BLOOM is information only AFTER it was announced.
// A future-dated signal/memory must not manufacture a visible contest, AI
// rotation or a Frontlines telemetry opportunity after a clock discontinuity.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function scene(){
 class Game{drawMinimap(){return 'base';}}
 const window={__novaModules:{'game/engine':m=>{m.exports={Game};}},
  __NOVA_FAIR_ENGAGEMENT_TEST__:{
   viewportHalfExtents:g=>({x:g.w/(2*g.cam.zoom),y:g.h/(2*g.cam.zoom)}),
   inGameplayViewport:(g,t,s)=>Math.abs(s.x-t.x)<=g.w/(2*g.cam.zoom)&&Math.abs(s.y-t.y)<=g.h/(2*g.cam.zoom)
  }};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const m={exports:{}};window.__novaModules['game/engine'](m,m.exports,()=>({SHAPE_DEFS:{}}));
 const p={id:1,x:-560,y:-560,hp:100,alive:true},
  rival={id:2,x:-520,y:-540,hp:100,alive:true},
  bot={id:7,x:-1150,y:-900,hp:100,maxHp:100,alive:true,ai:{isElite:false,__v1112TargetId:-1}};
 const arcs=[],mmCtx={save(){},restore(){},beginPath(){},arc(...a){arcs.push(a);},
  stroke(){},fill(){},moveTo(){},lineTo(){},setLineDash(){},fillText(){}};
 const st={directorEnabled:true,signal:null,bloomMemory:null,stats:{},queryScratch:[],queryScratch2:[],
  sectors:Array.from({length:16},()=>({value:0,maturity:0,pressure:0})),defs:{hexagon:{xp:200}}};
 const g=new Game();Object.assign(g,{time:100,status:'playing',w:800,h:600,cam:{x:-560,y:-560,zoom:1},
  player:p,tanks:[p,rival,bot],shapes:[{id:44,kind:'shape',type:'hexagon',x:-540,y:-550,hp:200}],
  bullets:[],__lfState:st,mmCtx,hasLineOfSight:()=>true,areHostile:(a,b)=>a.id!==b.id});
 return{g,st,p,rival,bot,arcs,T:window.__NOVA_LIVING_FRONT_TEST__,LF:window.__NOVA_LIVING_FRONT_INTERNAL__};
}
test('a not-yet-announced live BLOOM cannot show CONTESTED or open an opportunity',()=>{
 const s=scene();
 s.st.signal={type:'BLOOM',sector:5,x:-562.5,y:-562.5,started:120,until:125};
 assert.equal(s.T.contestCandidate(s.g,s.st),false);
 assert.equal(s.T.updateContest(s.g,s.st),false);
 assert.equal(s.st.contestSignal,null);
 assert.equal(s.LF.frontlineTick(s.g,s.st,false),false);
 assert.equal(s.st.frontlineTelemetry,undefined);
 s.g.drawMinimap();assert.equal(s.arcs.length,0);
 assert.equal(s.T.publicEcoBias(s.g,s.bot,{},{}).mode,'none');
});
test('a future BLOOM memory cannot steer rivals or claim a visible contest',()=>{
 const s=scene();
 s.st.bloomMemory={sector:5,announcedAt:120,until:144,initialValue:500};
 assert.equal(s.T.contestCandidate(s.g,s.st),false);
 assert.equal(s.T.publicEcoBias(s.g,s.bot,{},{}).mode,'none');
 assert.equal(s.LF.frontlineTick(s.g,s.st,false),false);
 s.g.drawMinimap();assert.equal(s.arcs.length,0);
});
test('the same signal becomes valid at announcement and remains bounded by expiry',()=>{
 const s=scene();
 s.st.signal={type:'BLOOM',sector:5,x:-562.5,y:-562.5,started:120,until:125};
 s.st.bloomMemory={sector:5,announcedAt:120,until:144,initialValue:500};
 s.g.time=120;
 assert.equal(s.T.contestCandidate(s.g,s.st),true);
 assert.equal(s.LF.frontlineTick(s.g,s.st,false),true);
 assert.equal(s.st.frontlineTelemetry.counts.announcements,1);
 s.g.time=126;s.st.signal=null;
 assert.equal(s.T.contestCandidate(s.g,s.st),true);
 assert.equal(s.T.publicEcoBias(s.g,s.bot,{},{}).mode,'memory');
 s.g.time=144;
 assert.equal(s.T.contestCandidate(s.g,s.st),false);
 assert.equal(s.T.publicEcoBias(s.g,s.bot,{},{}).mode,'none');
});
test('disabled Director remains closed regardless of timestamp',()=>{
 const s=scene();s.st.directorEnabled=false;
 s.st.signal={type:'BLOOM',sector:5,x:-562.5,y:-562.5,started:90,until:110};
 s.st.bloomMemory={sector:5,announcedAt:90,until:114};
 assert.equal(s.T.contestCandidate(s.g,s.st),false);
 assert.equal(s.T.publicEcoBias(s.g,s.bot,{},{}).mode,'none');
});

test('Rogue Star minimap reports only its frozen public location, never hidden live coordinates',()=>{
 const s=scene();
 const star={id:77,type:'star',x:1500,y:-900,hp:100};
 let hiddenReads=0;
 s.g.getShape=id=>{hiddenReads++;return id===77?star:null;};
 s.st.signal={type:'ROGUE STAR',starId:77,x:300,y:0,started:98,until:110};
 s.g.drawMinimap();
 assert.equal(s.arcs.length,1,'public Star announcement should retain one minimap marker');
 const first=s.arcs[0];
 const scale=216/4500;
 assert.ok(Math.abs(first[0]-(300+2250)*scale)<1e-8);
 assert.ok(Math.abs(first[1]-108)<1e-8);
 star.x=-1500;star.y=1200;
 s.arcs.length=0;s.g.drawMinimap();
 assert.deepEqual(s.arcs[0],first,'unseen Star movement cannot update public marker');
 assert.equal(hiddenReads,0,'public minimap must not query private live Star coordinates');
});
