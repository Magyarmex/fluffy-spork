'use strict';
// Frontlines telemetry must measure witnessed choices, never alter combat authority.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function scene(){
 class Game{
  drawMinimap(){return 'base';}
  gainXP(t,amt){t.xp=(t.xp||0)+amt;}
  updateOrbs(){if(!this.orbs.length)return;const o=this.orbs[0];this.gainXP(this.player,o.xp);this.orbs.splice(0,1);}
  damageTank(t,amt){t.hp-=amt;if(t.hp<=0){t.alive=false;this.status='dead';}}
  redeploy(){return 'redeployed';}
 }
 const window={__novaModules:{'game/engine':function(m){m.exports={Game};}},
  __NOVA_FAIR_ENGAGEMENT_TEST__:{inGameplayViewport(g,p,t){
   return Math.abs(p.x-t.x)<=(g.w||800)/2&&Math.abs(p.y-t.y)<=(g.h||600)/2;
  }}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const module={exports:{}};window.__novaModules['game/engine'](module,module.exports,()=>({SHAPE_DEFS:{}}));
 const g=new module.exports.Game(),LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
 const p={id:1,isPlayer:true,x:-560,y:-560,hp:100,alive:true,xp:0};
 const e={id:2,x:-520,y:-540,hp:100,alive:true,ai:{__lfEcoMode:'memory',__lfEcoKey:'BLOOM:5',__lfEcoWeight:.2}};
 const st={directorEnabled:true,signal:{type:'BLOOM',sector:5,started:100,until:105},
  bloomMemory:{sector:5,announcedAt:100,until:124,initialValue:500},
  sectors:Array.from({length:16},(_,i)=>Object.assign(LF.makeSector(i),{value:i===5?500:0})),
  stats:{playerNeutralXP:0,starsIntercepted:0,starsExpired:0,starsSpawned:0,hexSamples:0},
  age:101,ceiling:.3,planMsEma:0,planMsPeak:0,defs:{},cooldowns:{bloom:10,migration:10,star:10},
  lastSignalAt:100,lastMeaningfulAt:100,migrationHeat:0};
 Object.assign(g,{__lfState:st,status:'playing',time:101,player:p,tanks:[p,e],shapes:[],bullets:[],orbs:[],
  w:800,h:600,cam:{zoom:1},hasLineOfSight:()=>true,areHostile:(a,b)=>a.id!==b.id});
 return {g,st,p,e,LF,T:window.__NOVA_LIVING_FRONT_TEST__};
}
test('one public BLOOM, one observed contest, repeated ticks and re-entry are distinguished',()=>{
 const {g,st,p,LF}=scene();
 assert.equal(typeof LF.frontlineTick,'function');
 LF.frontlineTick(g,st,true);LF.frontlineTick(g,st,true);
 const f=st.frontlineTelemetry;
 assert.equal(f.counts.announcements,1);
 assert.equal(f.counts.playerEntries,1);
 assert.equal(f.counts.observedContests,1);
 p.x=-900;p.y=-900;LF.frontlineTick(g,st,false);
 assert.equal(f.counts.playerExits,1);
 p.x=-560;p.y=-560;LF.frontlineTick(g,st,true);
 assert.equal(f.counts.playerEntries,2);
 assert.equal(f.counts.observedContests,1,'same public opportunity is not a new contest');
 p.hp=0;p.alive=false;LF.frontlineTick(g,st,false);LF.frontlineTick(g,st,false);
 assert.equal(f.counts.playerDeaths,1);
});
test('AI arrivals require an actual memory-approach state and are counted once per announcement',()=>{
 const {g,st,e,LF}=scene();
 LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.aiArrivals,0,'already present is not a measured arrival');
 e.x=-900;e.y=-900;LF.frontlineTick(g,st,false);
 e.x=-750;e.y=-750;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.aiApproaches,1);
 e.x=-520;e.y=-540;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.aiArrivals,1);
 LF.frontlineTick(g,st,false);assert.equal(st.frontlineTelemetry.counts.aiArrivals,1);
 e.id=3;e.ai.__lfEcoMode='local';LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.aiArrivals,1);
 e.ai.__lfEcoMode='memory';LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.aiArrivals,1,'a new id spawned inside is not an arrival');
});
test('neutral XP is attributed only to the public pocket and actual pilot, never PvP or distant drops',()=>{
 const {g,st,p,LF}=scene();LF.frontlineTick(g,st,false);
 assert.equal(typeof LF.recordFrontlineNeutralXP,'function');
 assert.equal(LF.recordFrontlineNeutralXP(g,st,p,30,{x:p.x,y:p.y}),true);
 assert.equal(LF.recordFrontlineNeutralXP(g,st,p,20,{x:900,y:900}),false);
 assert.equal(LF.recordFrontlineNeutralXP(g,st,g.tanks[1],20,{x:p.x,y:p.y}),false);
 g.status='paused';assert.equal(LF.recordFrontlineNeutralXP(g,st,p,20,{x:p.x,y:p.y}),false);
 g.status='playing';st.directorEnabled=false;
 assert.equal(LF.recordFrontlineNeutralXP(g,st,p,20,{x:p.x,y:p.y}),false);
 assert.equal(st.frontlineTelemetry.counts.neutralXP,30);
});
test('real neutral orb collection hook measures XP once, excludes unmarked PvP orbs',()=>{
 const {g,st,p,LF}=scene();LF.frontlineTick(g,st,false);
 g.orbs=[{x:p.x,y:p.y,xp:25,__lfNeutral:true}];g.updateOrbs(.1);
 assert.equal(st.frontlineTelemetry.counts.neutralXP,25);
 g.orbs=[{x:p.x,y:p.y,xp:40}];g.updateOrbs(.1);
 assert.equal(st.frontlineTelemetry.counts.neutralXP,25);
 assert.equal(p.xp,65,'telemetry cannot modify real XP awards');
});
test('hidden or shielded enemy cannot become an observed contest through diagnostics',()=>{
 const {g,st,e,LF}=scene();g.hasLineOfSight=()=>false;
 LF.directorTick(g,st);
 assert.equal(st.frontlineTelemetry.counts.observedContests,0);
 g.hasLineOfSight=()=>true;e.spawnShieldT=2;LF.directorTick(g,st);
 assert.equal(st.frontlineTelemetry.counts.observedContests,0);
});
test('bounded chronological events and copied snapshot contain no private enemy coordinates',()=>{
 const {g,st,p,LF}=scene();
 for(let i=0;i<70;i++){p.x=i%2?-900:-560;p.y=p.x;g.time+=.01;LF.frontlineTick(g,st,false);}
 const f=st.frontlineTelemetry;
 assert.ok(f.events.length<=48,'event ring is bounded');
 const snap=LF.snapshot(g);
 assert.ok(snap.frontline,'COPY ECOLOGY must include telemetry');
 assert.equal(snap.frontline.counts.playerEntries,f.counts.playerEntries);
 assert.equal(snap.frontline.events.length,f.events.length);
 assert.ok(!JSON.stringify(snap.frontline).includes('"x"'),'no hidden enemy coordinates in Frontlines trace');
});
test('disabled Director and redeploy cannot leak an old opportunity into a new life',()=>{
 const {g,st,LF}=scene();st.directorEnabled=false;
 LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry,undefined);
 st.directorEnabled=true;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.announcements,1);
 assert.equal(g.redeploy(),'redeployed');
 assert.equal(g.__lfState,null);
});

test('actual damage authority records death even when the Director stops ticking after game over',()=>{
 const {g,st,p,LF}=scene();LF.frontlineTick(g,st,true);
 g.damageTank(p,200);
 assert.equal(g.status,'dead');
 assert.equal(st.frontlineTelemetry.counts.playerDeaths,1);
 assert.equal(st.frontlineTelemetry.events.filter(e=>e.kind==='player-death').length,1);
 LF.recordFrontlinePlayerDeath(g,st,p);
 assert.equal(st.frontlineTelemetry.counts.playerDeaths,1,'do not double count a fatal hit');
});

test('pilot approach requires measured progress toward a publicly announced sector',()=>{
 const {g,st,p,LF}=scene();
 p.x=-900;p.y=-900;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.playerApproaches,0);
 p.x=-750;p.y=-750;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.playerApproaches,1);
 p.x=-560;p.y=-560;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.playerApproaches,1);
 assert.equal(st.frontlineTelemetry.counts.playerEntries,1);
});
test('death between Director ticks counts actual sector entry, never a stale expired memory',()=>{
 const {g,st,p,LF}=scene();
 p.x=-900;p.y=-900;LF.frontlineTick(g,st,false);
 p.x=-560;p.y=-560;g.damageTank(p,200);
 assert.equal(st.frontlineTelemetry.counts.playerDeaths,1);
 assert.equal(st.frontlineTelemetry.counts.playerEntries,1);
 const q=scene();q.LF.frontlineTick(q.g,q.st,false);
 q.st.signal=null;q.st.bloomMemory.until=100;
 q.g.damageTank(q.p,200);
 assert.equal(q.st.frontlineTelemetry.counts.playerDeaths,0);
});
