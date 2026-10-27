'use strict';
/* Research-only NATURAL full-match A/B on the real 48-overlay shipping game.
 * The pilot is a deterministic scripted Scout, not a human. Wander inputs
 * depend only on time; the public-bloom policy reacts to public events, so
 * its ON/OFF inputs may diverge after the worlds diverge.
 * No fake BLOOM, private sector values, teleport, invulnerability or AI buffs. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const LAYOUTS=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'];
const LAYOUT_INDEX=Number(process.env.NOVA_LAYOUT_INDEX??0);
const SEED_INDEX=Number(process.env.NOVA_SEED_INDEX??0);
const PILOT_POLICY=process.env.NOVA_PILOT_POLICY||'wander';
if(!Number.isInteger(LAYOUT_INDEX)||LAYOUT_INDEX<0||LAYOUT_INDEX>=LAYOUTS.length)
 throw Error('NOVA_LAYOUT_INDEX must be 0, 1, or 2');
if(!Number.isInteger(SEED_INDEX)||SEED_INDEX<0||SEED_INDEX>1000)
 throw Error('NOVA_SEED_INDEX must be an integer from 0 to 1000');
if(!['wander','public-bloom','public-bloom-harvest'].includes(PILOT_POLICY))
 throw Error('NOVA_PILOT_POLICY must be wander, public-bloom, or public-bloom-harvest');
const LAYOUT=LAYOUTS[LAYOUT_INDEX],TERRAIN_SEED=LAYOUT_INDEX;
const GAME_SEED=(0x1d4a3f21^Math.imul(SEED_INDEX,0x9e3779b9))>>>0;
const TRIAL_RNG=(0x7d27e91b^Math.imul(SEED_INDEX,0x85ebca6b))>>>0;
const SEED_ID='natural-20261027-'+LAYOUT_INDEX+'-'+SEED_INDEX;
const SECONDS=165,DT=1/30,CHUNK=450;
async function arm(browser,enabled,label){
 const context=await browser.newContext({viewport:{width:900,height:700}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.addScriptTag({url:'/tests/browser/frontlines-public-pilot.js'});
  await page.evaluate(({terrainSeed,gameSeed})=>{
   let state=gameSeed>>>0;
   const seeded=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const spawn=Game.prototype.spawnPlayer,spawnAI=Game.prototype.spawnAITank,update=Game.prototype.update,start=Game.prototype.start;
   /* Seed the entire synchronous real-game constructor (player, neutral
    * population, eight rivals), not the unrelated decorative/menu RAF. */
   Game.prototype.spawnPlayer=function(){
    if(this.__novaTerrain)return spawn.apply(this,arguments);
    const now=Date.now,rand=Math.random;let first=true;
    this.__novaInitRandomRestore=rand;this.__novaInitSpawnCount=0;
    Date.now=()=>0;Math.random=()=>first?(first=false,terrainSeed/0x7fffffff):seeded();
    try{return spawn.apply(this,arguments);}
    finally{Date.now=now;Math.random=seeded;}
   };
   Game.prototype.spawnAITank=function(){
    const result=spawnAI.apply(this,arguments);
    if(this.__novaInitRandomRestore){
     this.__novaInitSpawnCount++;
     if(this.__novaInitSpawnCount>=8){
      Math.random=this.__novaInitRandomRestore;
      delete this.__novaInitRandomRestore;delete this.__novaInitSpawnCount;
     }
    }
    return result;
   };
   Game.prototype.start=function(){
    /* Seed all synchronous start work, including post-spawn AI ordering and
     * hidden initial state; previously the eighth bot restored Math.random
     * while start still had work to do. Freeze before the first RAF tick. */
    window.__novaNaturalMatchGame=this;
    this.paused=true;
    const randomBefore=Math.random,dateBefore=Date.now;
    Math.random=seeded;Date.now=()=>0;
    try{return start.apply(this,arguments);}
    finally{Math.random=randomBefore;Date.now=dateBefore;}
   };
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaNaturalMatchGame=this;
    return update.apply(this,arguments);
   };
  },{terrainSeed:TERRAIN_SEED,gameSeed:GAME_SEED});
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaNaturalMatchGame?.status==='playing'&&!!window.__novaNaturalMatchGame.__lfState,{timeout:30000});
  const initial=await page.evaluate(({enabled,pilotPolicy,trialRng,terrainIndex,seedIndex})=>{
   const g=window.__novaNaturalMatchGame;
   g.setPaused(true); // Advance actual Game.update ourselves.
   /* Paused rendering still runs requestAnimationFrame and may mutate shared
    * visual/game caches between independent OFF replays. Cancel the loop:
    * this is a deterministic headless simulation, not a screenshot test. */
   if(g.raf){cancelAnimationFrame(g.raf);g.raf=0;}
   /* Async spawn completion may permute bot array order despite identical
    * ids/positions. Canonicalize simulation iteration before the first step
    * so OFF replay compares the same physical update order, not RAF timing. */
   g.tanks.sort((a,b)=>Number(a.id)-Number(b.id));
   g.__novaTrialRng=trialRng; // Simulation RNG isolated from asynchronous paused rendering.
   g.__novaExperimentSeed='natural-20261027-'+terrainIndex+'-'+seedIndex;
   g.__novaExperimentPolicy=pilotPolicy;
   if(g.__novaBattlefield?.name!==['CROSSFIRE','SPLIT HORIZON','FOUR GATES'][terrainIndex])throw Error('uncontrolled layout '+g.__novaBattlefield?.name);
   const ai=window.__novaMakeRequire('')('game/ai');
   if(!ai||typeof ai.updateAI!=='function')throw Error('missing composed AI');
   if(!enabled){
    const original=ai.updateAI;
    ai.updateAI=function(t,world,dt){
     const st=world.__lfState,memory=st&&st.bloomMemory;
     if(st)st.bloomMemory=null;
     try{return original(t,world,dt);}finally{if(st)st.bloomMemory=memory;}
    };
   }
   /* Research-only: inspect the same visibility/value gates as CONTESTED at
    * Director cadence; results are post-match artifacts, never live HUD intel. */
   const LF=window.__NOVA_LIVING_FRONT_INTERNAL__,T=window.__NOVA_LIVING_FRONT_TEST__,
    F=window.__NOVA_FAIR_ENGAGEMENT_TEST__;
   if(!LF||!T||!F||typeof LF.directorTick!=='function'||
      typeof F.inGameplayViewport!=='function'||typeof F.viewportHalfExtents!=='function')
    throw Error('shipping Director / Fair Engagement unavailable');
   const audit={samples:0,pilotInside:0,noHostile:0,hostileCoLocated:0,
    outsideGameplayViewport:0,outsideRenderedCamera:0,terrainOccluded:0,
    hostileVisible:0,visibleNeutralBelow155:0,visibleNeutralAtLeast155:0,
    candidateTrue:0,gateMismatches:0,coLocationExamples:[]};
   const director=LF.directorTick;
   LF.directorTick=function(world,st){
    const out=director.apply(this,arguments);
    if(world!==g||world.status!=='playing'||st.directorEnabled===false)return out;
    const now=world.time||0,sig=st.signal,mem=st.bloomMemory;
    const sector=sig&&sig.type==='BLOOM'&&now<sig.until?sig.sector:
     mem&&now<mem.until?mem.sector:null;
    if(!Number.isInteger(sector)||sector<0||sector>=16)return out;
    audit.samples++;
    const pilot=world.player;
    if(!pilot||!(pilot.hp>0)||pilot.alive===false||pilot.spawnShieldT>0||
       LF.sectorIndex(pilot.x,pilot.y)!==sector)return out;
    audit.pilotInside++;
    const eligible=(world.tanks||[]).filter(t=>{
     if(!t||t===pilot||t.id===pilot.id||!(t.hp>0)||t.alive===false||
        t.spawnShieldT>0||LF.sectorIndex(t.x,t.y)!==sector)return false;
     if(world.areAllies&&world.areAllies(pilot,t))return false;
     if(typeof world.areHostile==='function')return !!world.areHostile(pilot,t);
     for(const key of ['teamId','team','factionId','faction','side'])
      if(pilot[key]!=null&&t[key]!=null)return pilot[key]!==t[key];
     return true;
    });
    if(!eligible.length){audit.noHostile++;return out;}
    audit.hostileCoLocated++;
    const ext=F.viewportHalfExtents(world);
    if(!ext||!(ext.x>0)||!(ext.y>0))throw Error('invalid viewport');
    const gameplay=eligible.filter(t=>F.inGameplayViewport(world,pilot,t));
    if(!gameplay.length){audit.outsideGameplayViewport++;return out;}
    const cam=world.cam||{},cx=Number.isFinite(cam.x)?cam.x:pilot.x,
     cy=Number.isFinite(cam.y)?cam.y:pilot.y;
    const rendered=gameplay.filter(t=>Math.abs(t.x-cx)<=ext.x&&Math.abs(t.y-cy)<=ext.y);
    if(!rendered.length){audit.outsideRenderedCamera++;return out;}
    const seen=rendered.filter(t=>world.hasLineOfSight(pilot.x,pilot.y,t.x,t.y,2));
    if(!seen.length){audit.terrainOccluded++;return out;}
    audit.hostileVisible++;
    const defs=st.defs||LF.defs;
    let value=0;
    for(const shape of world.shapes||[]){
     if(!shape||!(shape.hp>0)||LF.sectorIndex(shape.x,shape.y)!==sector||
        Math.abs(shape.x-pilot.x)>ext.x||Math.abs(shape.y-pilot.y)>ext.y||
        Math.abs(shape.x-cx)>ext.x||Math.abs(shape.y-cy)>ext.y||
        !world.hasLineOfSight(pilot.x,pilot.y,shape.x,shape.y,2))continue;
     const base=LF.xp(defs,shape.type);
     if(!(base>0))continue;
     value+=base+(shape.type==='crasher'?(Number(shape.__lfBounty)||0):0)+
      (shape.type==='hexagon'?80:shape.type==='star'?170:shape.type==='pentagon'?22:0);
     if(value>=155)break;
    }
    if(value>=155)audit.visibleNeutralAtLeast155++;
    else audit.visibleNeutralBelow155++;
    const candidate=!!T.contestCandidate(world,st);
    if(candidate)audit.candidateTrue++;
    if(candidate!==(value>=155))audit.gateMismatches++;
    if(audit.coLocationExamples.length<24)
     audit.coLocationExamples.push({time:+now.toFixed(2),sector,
      visibleHostiles:seen.length,visibleNeutralValue:+value.toFixed(1),
      eligible:value>=155});
    return out;
   };
   g.__novaContestAudit=audit;
   const p=g.player;
   if(!p||p.cls!=='scout')throw Error('expected unmodified Scout pilot');
   if(g.tanks.filter(t=>t.ai).length<8)throw Error('expected eight ordinary rivals');
   g.input.mouseActive=false;g.input.autofire=true;g.input.firing=false;
   const wander=()=>({x:Math.cos(g.time*.29),y:Math.sin(g.time*.29)});
   if(pilotPolicy==='public-bloom'||pilotPolicy==='public-bloom-harvest'){
    const LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
    if(!LF||typeof LF.sectorCenter!=='function'||typeof LF.sectorIndex!=='function')
     throw Error('missing canonical public sector geometry');
    g.input.moveVec=()=>{
     const st=g.__lfState,now=g.time||0,sig=st&&st.signal,mem=st&&st.bloomMemory;
     // Public Director announcement / last-known sector only. Never read
     // hidden maturity, current neutral value, or enemy coordinates.
     const sector=sig&&sig.type==='BLOOM'&&now<sig.until?sig.sector:
      mem&&now<mem.until?mem.sector:null;
     if(!Number.isInteger(sector)||sector<0||sector>=16)return wander();
     if(LF.sectorIndex(p.x,p.y)===sector)return{x:0,y:0};
     const c=LF.sectorCenter(sector),dx=c.x-p.x,dy=c.y-p.y,d=Math.hypot(dx,dy);
     if(!(d>1))return{x:0,y:0};
     g.__novaPublicBloomCommands=(g.__novaPublicBloomCommands||0)+1;
     return{x:dx/d,y:dy/d};
    };
    if(pilotPolicy==='public-bloom-harvest'){
     const helper=window.__novaResearchPublicPilot;
     if(!helper)throw Error('research-only public pilot helper missing');
     g.input.moveVec=()=>{
      const v=helper.moveTowardPublicBloom(g,p,LF);
      if(v){g.__novaPublicBloomCommands=(g.__novaPublicBloomCommands||0)+1;return v;}
      return wander();
     };
    }
   }else g.input.moveVec=wander;
   /* Wander movement and aim depend only on simulation time. The optional
    * public-signal movement policy is closed-loop: identical rules and initial
    * state, but not necessarily identical commands after ON/OFF diverge. */
   g.input.aimVec=()=>({x:Math.cos(g.time*.73),y:Math.sin(g.time*.73)});
   if(pilotPolicy==='public-bloom-harvest'){
    const helper=window.__novaResearchPublicPilot,LF=window.__NOVA_LIVING_FRONT_INTERNAL__,
     F=window.__NOVA_FAIR_ENGAGEMENT_TEST__;
    g.input.aimVec=()=>{
     const v=helper.aimAtVisibleNeutral(g,p,LF,F);
     if(v){g.__novaVisibleAimSamples=(g.__novaVisibleAimSamples||0)+1;return v;}
     return{x:Math.cos(g.time*.73),y:Math.sin(g.time*.73)};
    };
   }
   const fingerprint=JSON.stringify({layout:g.__novaBattlefield.name,
    pilot:{x:+p.x.toFixed(3),y:+p.y.toFixed(3),cls:p.cls},
    bots:g.tanks.filter(t=>t.ai).map(t=>[t.id,+t.x.toFixed(3),+t.y.toFixed(3),t.cls]),
    shapes:g.shapes.slice(0,32).map(s=>[s.id,s.type,+s.x.toFixed(3),+s.y.toFixed(3)])});
   return{fingerprint,initialBotCount:g.tanks.filter(t=>t.ai).length,initialShapes:g.shapes.length};
  },{enabled,pilotPolicy:PILOT_POLICY,trialRng:TRIAL_RNG,terrainIndex:LAYOUT_INDEX,seedIndex:SEED_INDEX});
  let last=null;
  for(let i=0;i<Math.ceil(SECONDS/DT/CHUNK);i++){
   last=await page.evaluate(({steps,dt})=>{
    const g=window.__novaNaturalMatchGame;
    const previousRandom=Math.random;
    Math.random=()=>{
     let state=g.__novaTrialRng>>>0;
     state^=state<<13;state^=state>>>17;state^=state<<5;
     g.__novaTrialRng=state>>>0;
     return g.__novaTrialRng/4294967296;
    };
    try{for(let j=0;j<steps&&g.status!=='dead';j++)g.update(dt);}
    finally{Math.random=previousRandom;}
    return{time:g.time,status:g.status,blooms:g.__lfState?.stats?.blooms||0};
   },{steps:Math.min(CHUNK,Math.ceil(SECONDS/DT)-i*CHUNK),dt:DT});
   if(last.status==='dead')break;
  }
  const result=await page.evaluate(()=>{
   const g=window.__novaNaturalMatchGame,s=window.NOVALivingFront.snapshot(),p=g.player;
   return{metadata:{layout:g.__novaBattlefield.name,seed:g.__novaExperimentSeed,pilotPolicy:g.__novaExperimentPolicy},
    frontline:s.frontline,stats:s.stats,game:{time:+g.time.toFixed(3),status:g.status,
     pilotAlive:!!p.alive,score:p.score,kills:p.kills,level:p.level,
     botCount:g.tanks.filter(t=>t.ai&&t.alive).length},
    contestGateAudit:g.__novaContestAudit,
    naturalBlooms:s.stats.blooms||0,publicBloomCommandSamples:g.__novaPublicBloomCommands||0,
    visibleNeutralAimSamples:g.__novaVisibleAimSamples||0,
    events:s.frontline?.events||[]};
  });
  if(result.naturalBlooms>0)assert.ok(result.contestGateAudit.samples>0,'announced BLOOM must be audited');
  assert.equal(result.contestGateAudit.gateMismatches,0,'audit must agree with shipping CONTESTED');
  assert.equal(result.contestGateAudit.pilotInside,
   result.contestGateAudit.noHostile+result.contestGateAudit.hostileCoLocated);
  assert.equal(result.contestGateAudit.hostileCoLocated,
   result.contestGateAudit.outsideGameplayViewport+
   result.contestGateAudit.outsideRenderedCamera+
   result.contestGateAudit.terrainOccluded+result.contestGateAudit.hostileVisible);
  assert.equal(result.contestGateAudit.hostileVisible,
   result.contestGateAudit.visibleNeutralBelow155+result.contestGateAudit.visibleNeutralAtLeast155);
  assert.equal(errors.length,0,errors.join('\n'));
  return{label,enabled,initial,last,result};
 }finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const off=await arm(browser,false,'OFF'),on=await arm(browser,true,'ON'),offReplay=await arm(browser,false,'OFF-REPLAY');
  assert.equal(off.initial.fingerprint,on.initial.fingerprint,'ON/OFF must begin from identical real world');
  assert.equal(off.initial.fingerprint,offReplay.initial.fingerprint,'same seed must reproduce initial world');
  const same=JSON.stringify(off.result)===JSON.stringify(offReplay.result);
  const naturalOpportunityObserved=[off,on].every(a=>a.result.naturalBlooms>0);
  const report={method:'scripted full-match natural Director research; not human fun; public-bloom is closed-loop policy',
   initialWorldIdentical:true,offReplayIdentical:same,
   naturalOpportunityObserved,
   interpretation:naturalOpportunityObserved?'Descriptive only: natural BLOOM observed; inspect opportunity timing, deaths and public pilot commands before causal interpretation.':'INCONCLUSIVE: at least one arm had no natural BLOOM; retain this censored pair.',
   off:off.result,on:on.result,offReplay:offReplay.result,
   limits:['No artificial BLOOM or forced survival','One layout/seed/pilot-policy per invocation; matrix must aggregate independently',
    'A deterministic Scout script is not a human player',
    'Public-bloom commands can differ after ON/OFF worlds diverge; this is matched policy, not fixed inputs',
    'Public-bloom command samples are input calls, not measured seconds or proof of physical progress',
    'Seed replay is checked, not assumed']};
  const dir=path.join('artifacts','browser');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'frontlines-natural-match-ab.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(dir,'frontlines-natural-on.json'),JSON.stringify(on.result,null,2));
  fs.writeFileSync(path.join(dir,'frontlines-natural-off.json'),JSON.stringify(off.result,null,2));
  fs.writeFileSync(path.join(dir,'frontlines-natural-manifest.json'),JSON.stringify({
   pairs:[{layout:LAYOUT,seed:SEED_ID,pilotPolicy:PILOT_POLICY,
    on:'frontlines-natural-on.json',off:'frontlines-natural-off.json'}]
  },null,2));
  console.log('NOVA_FRONTLINES_NATURAL_MATCH_AB '+JSON.stringify({initialWorldIdentical:true,offReplayIdentical:same,
   naturalOpportunityObserved,
   config:{layout:LAYOUT,seed:SEED_ID,pilotPolicy:PILOT_POLICY},
   off:{time:off.result.game.time,status:off.result.game.status,blooms:off.result.naturalBlooms,publicBloomCommands:off.result.publicBloomCommandSamples,frontline:off.result.frontline?.counts,contestGateAudit:Object.fromEntries(Object.entries(off.result.contestGateAudit).filter(([k])=>k!=='coLocationExamples'))},
   on:{time:on.result.game.time,status:on.result.game.status,blooms:on.result.naturalBlooms,publicBloomCommands:on.result.publicBloomCommandSamples,frontline:on.result.frontline?.counts,contestGateAudit:Object.fromEntries(Object.entries(on.result.contestGateAudit).filter(([k])=>k!=='coLocationExamples'))}}));
  if(!same)throw Error('same-arm full-match replay diverged; cannot claim controlled A/B');
  // No natural announcement is valid negative/censored research evidence,
  // not a CI failure to hide by selecting a friendlier seed.
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
