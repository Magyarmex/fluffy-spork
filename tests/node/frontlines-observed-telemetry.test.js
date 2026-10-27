'use strict';
// Frontlines telemetry must measure witnessed choices, never alter combat authority.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function scene(){
 class Game{
  drawMinimap(){return 'base';}
  update(dt){this.time+=dt;return 'base-update';}
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
 return {g,st,p,e,LF,T:window.__NOVA_LIVING_FRONT_TEST__,window};
}
test('one public BLOOM, one observed contest, repeated ticks and re-entry are distinguished',()=>{
 const {g,st,p,LF}=scene();
 assert.equal(typeof LF.frontlineTick,'function');
 LF.frontlineTick(g,st,true);LF.frontlineTick(g,st,true);
 const f=st.frontlineTelemetry;
 assert.equal(f.counts.announcements,1);
 assert.equal(f.counts.playerEntries,1);
 assert.equal(f.counts.observedContests,1);
 p.x=-1500;p.y=-1500;LF.frontlineTick(g,st,false);
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
 e.x=-1500;e.y=-1500;LF.frontlineTick(g,st,false);
 e.x=-1250;e.y=-1250;LF.frontlineTick(g,st,false);
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
 for(let i=0;i<70;i++){p.x=i%2?-1500:-560;p.y=p.x;g.time+=.01;LF.frontlineTick(g,st,false);}
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
 p.x=-1500;p.y=-1500;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.playerApproaches,0);
 p.x=-1250;p.y=-1250;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.playerApproaches,1);
 p.x=-560;p.y=-560;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.playerApproaches,1);
 assert.equal(st.frontlineTelemetry.counts.playerEntries,1);
});
test('death between Director ticks counts actual sector entry, never a stale expired memory',()=>{
 const {g,st,p,LF}=scene();
 p.x=-1500;p.y=-1500;LF.frontlineTick(g,st,false);
 p.x=-560;p.y=-560;g.damageTank(p,200);
 assert.equal(st.frontlineTelemetry.counts.playerDeaths,1);
 assert.equal(st.frontlineTelemetry.counts.playerEntries,1);
 const q=scene();q.LF.frontlineTick(q.g,q.st,false);
 q.st.signal=null;q.st.bloomMemory.until=100;
 q.g.damageTank(q.p,200);
 assert.equal(q.st.frontlineTelemetry.counts.playerDeaths,0);
});

test('the canonical 4.5Hz sector owner samples entry even without a Director tick',()=>{
 const {g,st,p}=scene();
 st.sectorT=0;st.behaviorT=10;st.directorT=10;st.tutorial={ecology:true};
 st.migrationHeat=0;st.migrationX=0;st.migrationY=0;
 p.x=-1500;p.y=-1500;
 assert.equal(g.update(1/60),'base-update');
 assert.equal(st.frontlineTelemetry.counts.playerEntries,0);
 p.x=-560;p.y=-560;st.sectorT=0;
 g.update(1/60);
 assert.equal(st.frontlineTelemetry.counts.playerEntries,1);
});

test('allied and spawn-protected bots cannot inflate hostile arrival telemetry',()=>{
 const {g,st,e,LF}=scene();
 e.x=-1500;e.y=-1500;e.spawnShieldT=2;LF.frontlineTick(g,st,false);
 e.x=-1250;e.y=-1250;LF.frontlineTick(g,st,false);
 e.x=-520;e.y=-540;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.aiArrivals,0);
 e.spawnShieldT=0;e.x=-1500;e.y=-1500;
 g.areHostile=()=>false;LF.frontlineTick(g,st,false);
 e.x=-1250;e.y=-1250;LF.frontlineTick(g,st,false);
 e.x=-520;e.y=-540;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.aiArrivals,0);
});

test('pilot shield suppresses contest entry but absent shield metadata means unshielded',()=>{
 const {g,st,p,LF}=scene();
 p.spawnShieldT=1;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.playerEntries,0);
 p.spawnShieldT=0;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.playerEntries,1);
 const q=scene();delete q.p.spawnShieldT;q.LF.frontlineTick(q.g,q.st,false);
 assert.equal(q.st.frontlineTelemetry.counts.playerEntries,1);
});

test('a witnessed contest resolves as survived only after the public opportunity ends',()=>{
 const {g,st,LF}=scene();LF.frontlineTick(g,st,true);
 assert.equal(st.frontlineTelemetry.counts.contestSurvivals,0);
 g.time=125;st.signal=null;LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.resolved,1);
 assert.equal(st.frontlineTelemetry.counts.contestSurvivals,1);
 LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.contestSurvivals,1,'resolution must be idempotent');
});
test('fatal contest cannot be counted as a survival at memory expiry',()=>{
 const {g,st,p,LF}=scene();LF.frontlineTick(g,st,true);
 g.damageTank(p,200);
 g.time=125;st.signal=null;g.status='playing';LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.playerDeaths,1);
 assert.equal(st.frontlineTelemetry.counts.contestSurvivals,0);
});
test('time in public opportunity is sampled from simulation time, capped across long gaps',()=>{
 const {g,st,LF}=scene();LF.frontlineTick(g,st,false);
 g.time+=.22;LF.frontlineTick(g,st,false);
 assert.ok(st.frontlineTelemetry.counts.playerSeconds>=.21);
 g.time+=15;st.signal=null;LF.frontlineTick(g,st,false);
 assert.ok(st.frontlineTelemetry.counts.playerSeconds<.7,'tab suspension must not inflate presence');
});

test('Director emission records the public BLOOM immediately, before another sector sample',()=>{
 const {g,st,LF}=scene();
 st.signal=null;st.bloomMemory=null;st.ceiling=1;st.age=120;
 st.lastSignalAt=-99;st.lastBloomSector=-1;st.cooldowns.bloom=0;
 st.sectors[5].maturity=.9;st.sectors[5].value=900;st.stats.blooms=0;
 LF.directorTick(g,st);
 assert.equal(st.signal.type,'BLOOM');
 assert.equal(st.frontlineTelemetry.counts.announcements,1);
 LF.frontlineTick(g,st,false);
 assert.equal(st.frontlineTelemetry.counts.announcements,1);
});

test('nonfatal damage never creates a Frontlines death',()=>{
 const {g,st,p,LF}=scene();LF.frontlineTick(g,st,true);
 g.damageTank(p,20);
 assert.equal(st.frontlineTelemetry.counts.playerDeaths,0);
 assert.equal(p.hp,80);
});
test('decorative War Room cannot produce pilot opportunity telemetry',()=>{
 const {g,st,LF}=scene();g.__novaDecorativeWorld=true;
 assert.equal(LF.frontlineTick(g,st,true),false);
 assert.equal(st.frontlineTelemetry,undefined);
});

test('canonical Fieldcraft explains dashed last-known BLOOM and visible-only CONTESTED',()=>{
 const {window}=scene();
 const tip=window.__NOVA_LIVING_FRONT_TIPS__.find(t=>t.id==='living-front-bloom-choice');
 assert.ok(tip);
 assert.match(tip.text,/dashed ring is last-known/);
 assert.match(tip.text,/red ! on a BLOOM means a visible rival/);
 assert.doesNotMatch(tip.text,/CONTESTED/,'Fieldcraft must describe the actual visible icon');
 assert.equal(window.__NOVA_LIVING_FRONT_TIPS__.length,7,'no extra tip slot or UI clutter');
});

test('paired Frontlines telemetry exposes sampled time and eligible hostile bot-seconds',()=>{
 const {g,st,p,e,LF,T}=scene();
 e.ai.__lfEcoMode='none'; // denominator must be independent of the A/B strategy
 LF.frontlineTick(g,st,false);
 g.time+=.22;LF.frontlineTick(g,st,false);
 const c=st.frontlineTelemetry.counts;
 assert.ok(Math.abs(c.sampledSeconds-.22)<1e-6);
 assert.ok(Math.abs(c.pilotAliveSeconds-.22)<1e-6);
 assert.ok(Math.abs(c.hostileBotSeconds-.22)<1e-6);
 e.spawnShieldT=1;g.time+=.22;LF.frontlineTick(g,st,false);
 assert.ok(Math.abs(c.hostileBotSeconds-.22)<1e-6,'shielded rival contributes no eligible bot exposure');
 e.spawnShieldT=0;g.areHostile=()=>false;g.time+=.22;LF.frontlineTick(g,st,false);
 assert.ok(Math.abs(c.hostileBotSeconds-.22)<1e-6,'ally contributes no hostile bot exposure');
 assert.ok(Math.abs(c.sampledSeconds-.66)<1e-6);
 assert.ok(Math.abs(c.pilotAliveSeconds-.66)<1e-6);
 const summary=T.debugSummary(LF.snapshot(g));
 assert.match(summary,/BOT-S 0\.2/);
 assert.match(summary,/ALIVE-S 0\.7/);
});
test('death outside the announced pocket censors the opportunity without fabricating an in-zone death',()=>{
 const {g,st,p,LF}=scene();LF.frontlineTick(g,st,false);
 p.x=-1500;p.y=-1500;g.damageTank(p,200);
 const c=st.frontlineTelemetry.counts;
 assert.equal(c.pilotDeathCensors,1,'A/B must report early pilot death even outside the contested pocket');
 assert.equal(c.playerDeaths,0,'in-zone deaths remain a separate metric');
 assert.equal(st.frontlineTelemetry.events.filter(e=>e.kind==='pilot-death-censor').length,1);
 LF.frontlineTick(g,st,false);LF.frontlineTick(g,st,false);
 assert.equal(c.pilotDeathCensors,1,'death censor is counted once after closure');
});
test('fatal in-pocket combat records both an in-zone death and one A/B death censor',()=>{
 const {g,st,p,LF}=scene();LF.frontlineTick(g,st,true);
 g.damageTank(p,200);
 const c=st.frontlineTelemetry.counts;
 assert.equal(c.playerDeaths,1);
 assert.equal(c.pilotDeathCensors,1);
 LF.recordFrontlinePlayerDeath(g,st,p);
 assert.equal(c.pilotDeathCensors,1);
});
test('unobserved long tab gaps cannot inflate Frontlines exposure denominators',()=>{
 const {g,st,LF}=scene();LF.frontlineTick(g,st,false);
 g.time+=12;st.signal=null;LF.frontlineTick(g,st,false);
 const c=st.frontlineTelemetry.counts;
 assert.ok(c.sampledSeconds<=LF.SECTOR_PERIOD*2+1e-6);
 assert.ok(c.hostileBotSeconds<=LF.SECTOR_PERIOD*2+1e-6);
});
