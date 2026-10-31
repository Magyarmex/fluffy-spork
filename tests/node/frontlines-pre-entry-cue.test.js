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

test('a new pilot incarnation cannot inherit a previous pilots visual witness',()=>{
 const s=scene();s.T.updateContest(s.g,s.st);
 assert.equal(s.st.approachSignal.pilotRef,s.p);
 s.g.player={...s.p};
 s.draws.length=0;s.g.drawMinimap();
 assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'),
  'new pilot must earn a new visible witness rather than inherit stale threat');
});
test('multiple visible hostiles do not multiply neutral terrain visibility scans',()=>{
 const s=scene();s.shape.type='circle';s.st.defs.circle={xp:5};
 s.g.tanks.push({id:3,x:-1040,y:-540,hp:100,alive:true});
 let los=0;s.g.hasLineOfSight=()=>{los++;return true;};
 assert.equal(s.T.preEntryCandidate(s.g,s.st),false);
 assert.equal(los,2,'one enemy witness plus one pocket scan, not one scan per rival');
});
test('Fieldcraft distinguishes the early warning from an entered contest',()=>{
 const s=scene();
 const tips=s.T.registerTips;assert.equal(typeof tips,'function');
 const file=fs.readFileSync(path.join(root,'nova-updates/living-front-director-v1.12.0.js'),'utf8');
 assert.match(file,/A dashed red ! at a BLOOM warns of a visible rival ahead/);
 assert.match(file,/solid ! means you entered the contest/);
});


test('solid contest marker never outlives the witnessed pilot, sector, or public BLOOM',()=>{
 const mutations=[
  ['pilot leaves the sector before the next Director sample',s=>{s.p.x=-1170;s.g.cam.x=s.p.x;}],
  ['pilot dies before the next Director sample',s=>{s.p.hp=0;s.p.alive=false;}],
  ['a new pilot incarnation replaces the old one',s=>{s.g.player={...s.p};}],
  ['a new public BLOOM replaces the old one in the same sector',s=>{
   s.st.signal={...s.st.signal,started:99,until:105};
  }],
  ['match leaves playing state',s=>{s.g.status='dead';}],
  ['pilot gains spawn protection',s=>{s.p.spawnShieldT=1;}]
 ];
 for(const [reason,change] of mutations){
  const s=scene();s.p.x=-1110;s.g.cam.x=s.p.x;
  assert.equal(s.T.updateContest(s.g,s.st),true,'real visible contest must be established: '+reason);
  s.g.drawMinimap();
  assert.ok(s.draws.some(d=>d.type==='text'&&d.value==='!'),'initial solid marker must render: '+reason);
  s.draws.length=0;
  change(s);
  s.g.drawMinimap();
  if(reason==='pilot leaves the sector before the next Director sample'){
   assert.ok(s.draws.some(d=>d.type==='text'&&d.value==='!'),
    'a newly witnessed outside threat must replace stale inside contest with a warning');
   assert.ok(s.draws.some(d=>d.type==='dash'&&d.v.length>0),
    'the new outside witness must be dashed, never a stale solid contest');
  }else assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'),
   'stale solid CONTESTED must not mislead the player: '+reason);
 }
 const s=scene();s.p.x=-1110;s.g.cam.x=s.p.x;
 s.T.updateContest(s.g,s.st);s.p.x=-1170;s.g.cam.x=s.p.x;
 s.T.updateContest(s.g,s.st);
 assert.equal(s.st.contestSignal,null,'leaving clears the solid contest witness');
 s.draws.length=0;s.g.drawMinimap();
 assert.ok(s.draws.some(d=>d.type==='text'&&d.value==='!'),
  'a fresh visible rival can legitimately create an outside warning');
 assert.ok(s.draws.some(d=>d.type==='dash'&&d.v.length>0),
  'after leaving, a new warning must be dashed rather than solid');
});


test('dashed pre-entry witness belongs to one public BLOOM, not a later same-sector announcement',()=>{
 const s=scene();
 assert.equal(s.T.updateContest(s.g,s.st),false);
 assert.ok(s.st.approachSignal,'original visible approach must be witnessed');
 assert.equal(s.st.approachSignal.announcedAt,98);
 s.g.drawMinimap();
 assert.ok(s.draws.some(d=>d.type==='text'&&d.value==='!'));
 s.draws.length=0;
 s.st.signal={...s.st.signal,started:99,until:105};
 s.g.drawMinimap();
 assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'),
  'a previous visible rival must not become radar for a newly announced BLOOM');
 s.st.signal={...s.st.signal,started:98,until:104};
 s.draws.length=0;s.g.drawMinimap();
 assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'),
  'an invalidated visual witness must not be resurrected by restoring old metadata');
 s.g.time+=.17;s.draws.length=0;s.g.drawMinimap();
 assert.ok(s.draws.some(d=>d.type==='text'&&d.value==='!'),
  'a new local visibility sample may legitimately reestablish the warning');
});


test('minimap gives a witnessed pre-entry warning before the next 720ms Director sample',()=>{
 const s=scene();
 assert.equal(s.st.approachSignal,undefined,'Director has not yet sampled the visible approach');
 assert.equal(s.g.drawMinimap(),'base');
 assert.ok(s.st.approachSignal,'first minimap update must sample the locally visible threat');
 assert.equal(s.st.approachSignal.pilotRef,s.p);
 assert.ok(s.draws.some(d=>d.type==='text'&&d.value==='!'));
 assert.ok(s.draws.some(d=>d.type==='dash'&&d.v.length>0));
 assert.equal(s.st.stats.contests||0,0,'early warning is not a sector entry or a contested reward');
});

test('early warning expires promptly when visibility is lost, without waiting for Director',()=>{
 const s=scene();
 s.g.drawMinimap();
 assert.ok(s.st.approachSignal,'initial warning must exist');
 s.g.time+=.20;
 s.g.hasLineOfSight=()=>false;
 s.draws.length=0;
 s.g.drawMinimap();
 assert.equal(s.st.approachSignal,null,'a no-longer-visible threat cannot retain a fresh visual badge');
 assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'));
});

test('early warning is bounded, pilot-specific and cannot use hidden sector totals',()=>{
 const s=scene();
 let rays=0;s.g.hasLineOfSight=()=>{rays++;return true;};
 for(let i=0;i<50;i++){
  s.g.time=100+i*.02;
  s.g.drawMinimap();
 }
 assert.ok(rays>0,'the real visible rival and harvestable pocket were checked');
 assert.ok(rays<35,'sampling at minimap cadence must be bounded, not one LOS scan per draw');
 assert.ok(s.st.approachSignal);
 s.g.player={...s.p};s.draws.length=0;s.g.drawMinimap();
 assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'),
  'new player incarnation cannot inherit old local visual intelligence');
 s.g.time+=.2;s.g.shapes=[];s.st.sectors[5].value=999999;
 s.draws.length=0;s.g.drawMinimap();
 assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'),
  'hidden ecological totals never create a visual witness');
});

test('fast warning respects spawn protection and unrelated Director signals',()=>{
 const s=scene();
 s.p.spawnShieldT=1;s.g.drawMinimap();
 assert.equal(s.st.approachSignal,null);
 s.p.spawnShieldT=0;s.g.time+=.2;
 s.st.signal={type:'MIGRATION',from:1,to:2,started:100,until:105};
 s.draws.length=0;s.g.drawMinimap();
 assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'));
});

test('newly visible approach is sampled within 160ms, never every minimap draw',()=>{
 const s=scene();
 let rays=0,clear=false;
 s.g.hasLineOfSight=()=>{rays++;return clear;};
 s.g.drawMinimap();
 assert.equal(s.st.approachSignal,null);
 clear=true;s.g.time=100.08;
 s.g.drawMinimap();
 assert.equal(s.st.approachSignal,null,'no redundant ray scan before cadence deadline');
 assert.equal(rays,1);
 s.g.time=100.16;s.g.drawMinimap();
 assert.ok(s.st.approachSignal,'new visual witness must be sampled by 160ms');
 assert.equal(rays,3,'one hostile ray and one harvestable-pocket ray after deadline');
});

test('re-entering a BLOOM after a witnessed contest receives a fresh outside warning before Director ticks',()=>{
 const s=scene();
 s.p.x=-1110;s.g.cam.x=s.p.x;
 assert.equal(s.T.updateContest(s.g,s.st),true,'entering BLOOM establishes a real contest');
 assert.equal(s.st.stats.contests,1);
 s.g.drawMinimap();
 assert.ok(s.draws.some(d=>d.type==='text'&&d.value==='!'),'initial inside contest marker');
 s.p.x=-1170;s.g.cam.x=s.p.x;
 s.g.time+=.20;s.draws.length=0;
 assert.ok(s.st.contestSignal,'Director has not yet cleared its old inside-sector witness');
 s.g.drawMinimap();
 assert.ok(s.st.approachSignal,'minimap must independently witness a visible rival after exiting');
 assert.ok(s.draws.some(d=>d.type==='text'&&d.value==='!'),'outside warning must render');
 assert.ok(s.draws.some(d=>d.type==='dash'&&d.v.length>0),'outside marker must be dashed');
 assert.equal(s.st.stats.contests,1,'minimap never awards contest credit');
 s.g.hasLineOfSight=()=>false;s.g.time+=.20;s.draws.length=0;
 s.g.drawMinimap();
 assert.equal(s.st.approachSignal,null,'fresh visual loss clears the warning even with stale contest state');
 assert.ok(!s.draws.some(d=>d.type==='text'&&d.value==='!'));
});
