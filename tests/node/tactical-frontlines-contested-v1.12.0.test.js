'use strict';
// Tactical Frontlines: only an observed hostile contest of an existing public
// BLOOM may produce the CONTESTED minimap signal. No hidden enemy coordinates.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(fair=true){
 const Game=class{drawMinimap(){return 'base';}};
 const window={__novaModules:{'game/engine':function(m){m.exports={Game};}}};
 if(fair)window.__NOVA_FAIR_ENGAGEMENT_TEST__={viewportHalfExtents(g){return{x:g.w/(2*g.cam.zoom),y:g.h/(2*g.cam.zoom)};},inGameplayViewport(g,p,t){
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
 const calls=[],ctx={save(){},restore(){},beginPath(){},arc(x,y,r){calls.push({type:'arc',x,y,r});},stroke(){},fill(){},moveTo(){},lineTo(){},
  fillText(s){calls.push(s);calls.push({type:'text',value:s,font:this.font});}};
 Object.assign(g,{time:100,player:p,tanks:[p,enemy],shapes:[{id:44,type:'hexagon',x:-540,y:-550,hp:200}],w:800,h:600,cam:{zoom:1},
  mmCtx:ctx,hasLineOfSight:()=>true,areHostile:(a,b)=>a.id!==b.id,areAllies:()=>false});
 g.__lfState={defs:{hexagon:{xp:200},square:{xp:50},pentagon:{xp:100},circle:{xp:5}},signal:{type:'BLOOM',sector:5,started:98,until:104},stats:{},sectors:Array.from({length:16},(_,i)=>({value:i===5?500:0,maturity:0,pressure:0})),
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
 assert.ok(calls.includes('!'),'actual shipping minimap path must render the signal');
 T.updateContest(g,st);assert.equal(st.stats.contests,1,'do not count every Director tick');
});
test('60px CSS minimap gets a readable contest badge rather than a 2.5px label',()=>{
 const {T,g,calls,st}=scene();
 assert.equal(T.updateContest(g,st),true);
 g.drawMinimap();
 const badge=calls.find(v=>v&&v.type==='text'&&v.value==='!');
 assert.ok(badge,'CONTESTED must use a large visible exclamation badge');
 const fontPx=Number((badge.font||'').match(/(\d+)px/)?.[1]||0);
 assert.ok(fontPx*60/216>=8,'badge glyph must remain at least 8 CSS px on 60px minimap');
 assert.ok(calls.some(v=>v&&v.type==='arc'&&v.r*2*60/216>=10),
  'badge must have a >=10 CSS px visual target');
 assert.ok(!calls.includes('CONTESTED'),'the old 2.5 CSS px text is not a usable signal');
});
test('contest badge preserves the actual sector center and stays on the map at every latitude',()=>{
 const {g,st,calls}=scene();
 for(const sector of [1,5,9,13]){
  calls.length=0;
  st.signal.sector=sector;st.contestSignal={sector,until:104};
  g.drawMinimap();
  const badge=calls.find(v=>v&&v.type==='arc'&&v.r===22);
  assert.ok(badge,'visible contest draws a 12px CSS badge');
  const centerY=(Math.floor(sector/4)+.5)*54;
  assert.ok(Math.abs(badge.y-centerY)>=27,'badge must not cover the sector/player dot');
  assert.ok(badge.y>=22&&badge.y<=194,'badge must stay inside minimap canvas');
 }
});
test('terrain occlusion suppresses signal and clears stale contest',()=>{
 const {T,g,st,calls}=scene();T.updateContest(g,st);
 g.hasLineOfSight=()=>false;assert.equal(T.updateContest(g,st),false);
 assert.equal(st.contestSignal,null);g.drawMinimap();
 assert.equal(calls.includes('!'),false);
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
 delete g.areHostile;assert.equal(T.contestCandidate(g,st),true,'canonical FFA without team methods is hostile by default');
 g.player.team=7;g.tanks[1].team=7;assert.equal(T.contestCandidate(g,st),false,'shared team tags are allied');
 g.tanks[1].team=8;assert.equal(T.contestCandidate(g,st),true,'different teams are hostile');
});
test('canonical FFA without hostility helpers still exposes an observed enemy',()=>{
 const {T,g,st}=scene();delete g.areHostile;delete g.areAllies;
 assert.equal(T.contestCandidate(g,st),true);
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


test('a publicly announced BLOOM leaves bounded last-known map intelligence after its short live signal',()=>{
 const {T,LF,g,st}=scene();
 st.signal=null;st.stats.blooms=0;st.lastSignalAt=-99;st.lastBloomSector=-1;
 st.ceiling=1;st.cooldowns.bloom=0;
 st.sectors[5].maturity=.9;st.sectors[5].value=900;
 LF.directorTick(g,st);
 assert.equal(st.signal.type,'BLOOM');
 assert.equal(st.bloomMemory.sector,5);
 assert.equal(st.bloomMemory.announcedAt,100);
 assert.equal(st.bloomMemory.until,124);
 g.time=106;st.signal=null;
 g.tanks=[g.player];
 assert.equal(T.contestCandidate(g,st),false,'public memory alone is not evidence of an enemy');
});

test('last-known BLOOM can be contested after the live five-second signal, but not after memory expiry',()=>{
 const {T,g,st,calls}=scene();
 st.signal=null;st.bloomMemory={sector:5,announcedAt:98,until:122};
 st.sectors[5].value=450;
 g.time=106;
 assert.equal(T.contestCandidate(g,st),true);
 assert.equal(T.updateContest(g,st),true);
 assert.equal(g.drawMinimap(),'base');
 assert.ok(calls.includes('!'),'render after the public live signal expires');
 g.time=123;
 assert.equal(T.updateContest(g,st),false);
 assert.equal(st.contestSignal,null);
});

test('a depleted remembered BLOOM is historical information, not a false live contest',()=>{
 const {T,g,st,calls}=scene();
 st.signal=null;st.bloomMemory={sector:5,announcedAt:98,until:122};
 st.sectors[5].value=0;g.shapes=[];g.time=106;
 assert.equal(T.contestCandidate(g,st),false);
 assert.equal(T.updateContest(g,st),false);
 g.drawMinimap();
 assert.ok(!calls.includes('!'));
});

test('a remembered BLOOM never reveals an occluded, off-screen or allied opponent',()=>{
 const {T,g,st,enemy}=scene();
 st.signal=null;st.bloomMemory={sector:5,announcedAt:98,until:122};
 st.sectors[5].value=500;g.time=106;
 g.hasLineOfSight=()=>false;
 assert.equal(T.contestCandidate(g,st),false);
 g.hasLineOfSight=()=>true;g.w=200;enemy.x=-300;
 assert.equal(T.contestCandidate(g,st),false);
 g.w=800;enemy.x=-520;g.areAllies=()=>true;
 assert.equal(T.contestCandidate(g,st),false);
});

test('last-known BLOOM memory survives a different public Director signal without creating enemy radar',()=>{
 const {T,g,st}=scene();
 st.bloomMemory={sector:5,announcedAt:98,until:122};
 st.sectors[5].value=500;g.time=106;
 st.signal={type:'MIGRATION',started:105,until:110,from:1,to:2};
 assert.equal(T.contestCandidate(g,st),true);
 g.tanks=[g.player];
 assert.equal(T.contestCandidate(g,st),false);
});

test('even a live BLOOM cannot advertise an empty opportunity as contested',()=>{
 const {T,g,st}=scene();st.sectors[5].value=0;g.shapes=[];
 assert.equal(T.contestCandidate(g,st),false);
});

test('a formerly huge BLOOM remains contestable when a meaningful pocket survives',()=>{
 const {T,g,st}=scene();g.time=106;st.signal=null;
 st.bloomMemory={sector:5,announcedAt:98,until:122,initialValue:8000};
 st.sectors[5].value=450;
 assert.equal(T.contestCandidate(g,st),true,
  'do not require 25% of a huge old pocket when 450 XP still physically remains');
});
test('disabling the Front Director also suppresses its remembered tactical signals',()=>{
 const {T,g,st}=scene();g.time=106;st.signal=null;
 st.bloomMemory={sector:5,announcedAt:98,until:122,initialValue:500};
 st.directorEnabled=false;
 assert.equal(T.contestCandidate(g,st),false);
});

test('a visible contest is invariant under hidden live sector totals',()=>{
 const {T,g,st}=scene();
 assert.equal(T.contestCandidate(g,st),true);
 st.sectors[5].value=0;
 assert.equal(T.contestCandidate(g,st),true,'a hidden sector total cannot suppress a visible real pocket');
 st.sectors[5].value=100000;
 assert.equal(T.contestCandidate(g,st),true);
});
test('hidden resources cannot produce a contest when no visible neutral shape remains',()=>{
 const {T,g,st}=scene();
 g.shapes=[];st.sectors[5].value=9000;
 assert.equal(T.contestCandidate(g,st),false,'visible rival alone does not prove an active harvest');
});
test('occluded and off-screen resources do not reveal current hidden pocket value',()=>{
 const {T,g,st}=scene();
 st.sectors[5].value=9000;
 g.hasLineOfSight=(x1,y1,x2,y2)=>x2!==-540;
 assert.equal(T.contestCandidate(g,st),false,'terrain must hide the neutral resource even if rival is visible');
 g.hasLineOfSight=()=>true;
 g.shapes[0].x=-1000;g.shapes[0].y=-550;
 assert.equal(T.contestCandidate(g,st),false,'offscreen neutral shape must not qualify');
});
test('visible small and dead neutral shapes cannot advertise a depleted BLOOM',()=>{
 const {T,g,st}=scene();
 st.sectors[5].value=10000;
 g.shapes=[{id:80,type:'circle',x:-540,y:-550,hp:10},{id:81,type:'circle',x:-550,y:-550,hp:10}];
 assert.equal(T.contestCandidate(g,st),false,'ten observed XP is not a meaningful pocket');
 g.shapes=[{id:44,type:'hexagon',x:-540,y:-550,hp:0}];
 assert.equal(T.contestCandidate(g,st),false,'dead shape cannot be harvested');
});
test('visible resource identity is independent of player tank id namespace',()=>{
 const {T,g,st}=scene();
 g.shapes[0].id=g.player.id;
 assert.equal(T.contestCandidate(g,st),true,'shape and tank id namespaces may overlap');
});
