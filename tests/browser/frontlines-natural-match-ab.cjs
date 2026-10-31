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
const AB_MODE=process.env.NOVA_AB_MODE||'memory';
const BOMBER_RESEARCH=process.env.NOVA_BOMBER_RESEARCH==='1';
if(BOMBER_RESEARCH&&(!['cover-pressure','bomber-physics'].includes(AB_MODE)||PILOT_POLICY!=='cover-pressure'))
 throw Error('Bomber research requires paired cover-pressure policy');
if(!['memory','live-turn','cover-pressure','bomber-physics'].includes(AB_MODE))throw Error('NOVA_AB_MODE must be memory, live-turn, cover-pressure, or bomber-physics');
if(!Number.isInteger(LAYOUT_INDEX)||LAYOUT_INDEX<0||LAYOUT_INDEX>=LAYOUTS.length)
 throw Error('NOVA_LAYOUT_INDEX must be 0, 1, or 2');
if(!Number.isInteger(SEED_INDEX)||SEED_INDEX<0||SEED_INDEX>1000)
 throw Error('NOVA_SEED_INDEX must be an integer from 0 to 1000');
if(!['wander','public-bloom','public-bloom-harvest','public-bloom-harvest-defense','cover-pressure'].includes(PILOT_POLICY))
 throw Error('NOVA_PILOT_POLICY must be wander, public-bloom, public-bloom-harvest, or public-bloom-harvest-defense');
const LAYOUT=LAYOUTS[LAYOUT_INDEX],TERRAIN_SEED=LAYOUT_INDEX;
const GAME_SEED=(0x1d4a3f21^Math.imul(SEED_INDEX,0x9e3779b9))>>>0;
const TRIAL_RNG=(0x7d27e91b^Math.imul(SEED_INDEX,0x85ebca6b))>>>0;
const SEED_ID='natural-20261027-'+LAYOUT_INDEX+'-'+SEED_INDEX;
const SECONDS=165,DT=1/30,CHUNK=450;
async function arm(browser,enabled,label){
 const context=await browser.newContext({viewport:{width:900,height:700},
  ...(AB_MODE==='bomber-physics'?{serviceWorkers:'block'}:{})});
 const page=await context.newPage(),errors=[];
 let patchedCount=0;
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  /* Research-only OFF: intercept precisely one shipped script response and
   * suppress only the newborn fragment movement. No gameplay source changes. */
  if(AB_MODE==='bomber-physics'&&!enabled){
   await page.route('**/nova-updates/disciplines-v1.7.0.js',async route=>{
    const response=await route.fetch(),source=await response.text();
    const needle='advanceClearFuseChildren(this,b,childStart,dt,physicalCross,sole);';
    if(response.status()!==200||source.split(needle).length!==2)
     throw Error('Causal OFF could not identify exact shipping fragment call');
    patchedCount++;
    await route.fulfill({response,body:source.replace(needle,
     '/* research-only causal OFF: leave newborn fragments at birth */')});
   });
  }
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  if(AB_MODE==='bomber-physics')assert.equal(patchedCount,enabled?0:1,
   'Causal OFF must patch exactly one shipping Disciplines script');
  await page.addScriptTag({url:'/tests/browser/projectile-density-audit.js'});
  if(BOMBER_RESEARCH)await page.addScriptTag({url:'/tests/browser/bomber-burst-audit.js'});
  await page.addScriptTag({url:'/tests/browser/frontlines-public-pilot.js'});
  await page.addScriptTag({url:'/tests/browser/cover-pressure-pilot.js'});
  await page.addScriptTag({url:'/tests/browser/frontlines-visible-defense.js'});
  await page.addScriptTag({url:'/tests/browser/frontlines-commitment-audit.js'});
  await page.addScriptTag({url:'/tests/browser/frontlines-live-turn-intervention.js'});
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
  const initial=await page.evaluate(({enabled,pilotPolicy,trialRng,terrainIndex,seedIndex,abMode,bomberResearch})=>{
   const g=window.__novaNaturalMatchGame;
   g.setPaused(true); // Advance actual Game.update ourselves.
    /* Sample the real composed bullet owner; do not touch game decisions. */
    const density=window.__novaProjectileDensityAudit;
    if(!density)throw Error('projectile density research helper missing');
    g.__novaProjectileDensityAudit=density.install(g,density.create());
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
   g.__novaExperimentABMode=abMode;
   if(abMode==='cover-pressure'||abMode==='bomber-physics'){
    g.__novaCoverPriorityResearch={schema:1,activations:0};
    g.__novaCoverDamageResearch={schema:1,pilotId:g.player.id,allEffectiveDamage:0,
     playerEffectiveDamage:0,allBreaks:0,playerBreaks:0};
    /* Observe actual player projectiles created by the composed weapon
     * owner. An aim-input sample is not proof that a shot was fired. */
    const fire=g.tryFire;
    g.tryFire=function(t){
     const before=this.bullets.length,out=fire.apply(this,arguments);
     if(t===this.player&&this.bullets.length>before){
      this.__novaResearchPlayerShots=(this.__novaResearchPlayerShots||0)+
       this.bullets.length-before;
      if(bomberResearch)this.__novaResearchPlayerShells=(this.__novaResearchPlayerShells||0)+
       this.bullets.slice(before).filter(b=>b&&b.shell).length;
     }
     return out;
    };
   }
   if(g.__novaBattlefield?.name!==['CROSSFIRE','SPLIT HORIZON','FOUR GATES'][terrainIndex])throw Error('uncontrolled layout '+g.__novaBattlefield?.name);
   const ai=window.__novaMakeRequire('')('game/ai');
   if(!ai||typeof ai.updateAI!=='function')throw Error('missing composed AI');
   if(!enabled&&abMode!=='cover-pressure'&&abMode!=='bomber-physics'){
    const original=ai.updateAI;
    if(abMode==='memory'){
     // Historical experiment: suppress stale memory (live turns still ON).
     ai.updateAI=function(t,world,dt){
      const st=world.__lfState,memory=st&&st.bloomMemory;
      if(st)st.bloomMemory=null;
      try{return original(t,world,dt);}finally{if(st)st.bloomMemory=memory;}
     };
    }else{
     // Causal intervention: retain public signals and stale memory;
     // forbid only a fresh live commitment on the current announcement.
     const intervention=window.__novaResearchLiveTurnIntervention;
     if(!intervention||typeof intervention.suppressLiveStart!=='function')
      throw Error('missing research-only live-turn intervention');
     ai.updateAI=function(t,world,dt){
      return intervention.suppressLiveStart(original,t,world,dt);
     };
    }
   }
   /* Observe the real composed AI without altering its decision authority. */
   const commitmentWitness=window.__novaResearchCommitmentAudit;
   if(!commitmentWitness)throw Error('missing research commitment witness');
   g.__novaCommitmentAudit=commitmentWitness.create();
   const beforeAudit=ai.updateAI;
   ai.updateAI=function(t,world,dt){
    const result=beforeAudit(t,world,dt);
    if(world===g)commitmentWitness.sample(g.__novaCommitmentAudit,world,t,enabled,
     window.__NOVA_LIVING_FRONT_INTERNAL__.sectorIndex);
    return result;
   };
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
   if(!p||p.cls!=='scout')throw Error('expected unmodified Scout initial pilot');
   if(bomberResearch){
    /* A standard Bomber weapon on the same initial physical world, with
     * no invulnerability, added damage, fake targets or changed AI. This
     * is a scripted class exposure experiment, not a human match. */
    const classes=window.__novaMakeRequire('')('game/classes').CLASSES;
    if(!classes?.bomber?.bullet?.cluster)throw Error('canonical Bomber unavailable');
    if(typeof g.setClass!=='function')throw Error('canonical class evolution owner missing');
    g.setClass(p,'bomber'); // canonical tier, HP, ability and drone refit
    if(p.tier!==classes.bomber.tier||p.maxHp!==g.maxHpFor(p))
     throw Error('Bomber pilot did not receive canonical class stats');
    g.__novaExperimentPilotClass='bomber';
    p.fireCd=0;p.barrelIdx=0;
    const witness=window.__novaBomberBurstAudit;
    if(!witness)throw Error('research-only burst witness missing');
    g.__novaBomberBurstAudit=witness.install(g,witness.create(p.id));
   }
   if(g.tanks.filter(t=>t.ai).length<8)throw Error('expected eight ordinary rivals');
   g.input.mouseActive=false;g.input.autofire=true;g.input.firing=false;
   const wander=()=>({x:Math.cos(g.time*.29),y:Math.sin(g.time*.29)});
   if(['public-bloom','public-bloom-harvest','public-bloom-harvest-defense'].includes(pilotPolicy)){
    const LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
    if(!LF||typeof LF.sectorCenter!=='function'||typeof LF.sectorIndex!=='function')
     throw Error('missing canonical public sector geometry');
    // Reuse the tested public epoch predicate. A clock reset must never
    // let the natural-match A/B pilot move on future-only information.
    const helper=window.__novaResearchPublicPilot;
    if(!helper||typeof helper.publicSector!=='function')
     throw Error('research public BLOOM epoch selector missing');
    g.input.moveVec=()=>{
     const sector=helper.publicSector(g);
     if(!Number.isInteger(sector)||sector<0||sector>=16)return wander();
     if(LF.sectorIndex(p.x,p.y)===sector)return{x:0,y:0};
     const c=LF.sectorCenter(sector),dx=c.x-p.x,dy=c.y-p.y,d=Math.hypot(dx,dy);
     if(!(d>1))return{x:0,y:0};
     g.__novaPublicBloomCommands=(g.__novaPublicBloomCommands||0)+1;
     return{x:dx/d,y:dy/d};
    };
    if(pilotPolicy==='public-bloom-harvest'||pilotPolicy==='public-bloom-harvest-defense'){
     const helper=window.__novaResearchPublicPilot;
     if(!helper)throw Error('research-only public pilot helper missing');
     g.input.moveVec=()=>{
      const v=helper.moveTowardPublicBloom(g,p,LF);
      if(v){g.__novaPublicBloomCommands=(g.__novaPublicBloomCommands||0)+1;return v;}
      return wander();
     };
    }
   }else g.input.moveVec=wander;
   if(pilotPolicy==='public-bloom-harvest-defense'){
    const defense=window.__novaResearchVisibleDefense,F=window.__NOVA_FAIR_ENGAGEMENT_TEST__;
    if(!defense||typeof defense.dodgeVisibleProjectile!=='function'||!F)
     throw Error('research-only visible defense helper missing');
    const baseMove=g.input.moveVec;
    g.input.moveVec=()=>{
     const base=baseMove(),dodge=defense.dodgeVisibleProjectile(g,p,F,base);
     if(dodge){g.__novaVisibleDodgeSamples=(g.__novaVisibleDodgeSamples||0)+1;return dodge;}
     return base;
    };
   }
   /* Wander movement and aim depend only on simulation time. The optional
    * public-signal movement policy is closed-loop: identical rules and initial
    * state, but not necessarily identical commands after ON/OFF diverge. */
   g.input.aimVec=()=>({x:Math.cos(g.time*.73),y:Math.sin(g.time*.73)});
   if(pilotPolicy==='public-bloom-harvest'||pilotPolicy==='public-bloom-harvest-defense'){
    const helper=window.__novaResearchPublicPilot,LF=window.__NOVA_LIVING_FRONT_INTERNAL__,
     F=window.__NOVA_FAIR_ENGAGEMENT_TEST__,
     defense=pilotPolicy==='public-bloom-harvest-defense'?window.__novaResearchVisibleDefense:null;
    g.input.aimVec=()=>{
     const hostile=defense&&defense.aimAtVisibleHostile(g,p,F);
     if(hostile){g.__novaVisibleHostileAimSamples=(g.__novaVisibleHostileAimSamples||0)+1;return hostile;}
     const v=helper.aimAtVisibleNeutral(g,p,LF,F);
     if(v){g.__novaVisibleAimSamples=(g.__novaVisibleAimSamples||0)+1;return v;}
     return{x:Math.cos(g.time*.73),y:Math.sin(g.time*.73)};
    };
   }
   if(abMode==='cover-pressure'||abMode==='bomber-physics'){
    if(pilotPolicy!=='cover-pressure')throw Error('cover-pressure experiment requires its named policy');
    const helper=window.__novaResearchCoverPressurePilot,
     F=window.__NOVA_FAIR_ENGAGEMENT_TEST__;
    if(!helper||typeof helper.select!=='function'||!F)
     throw Error('missing public cover-pressure pilot or viewport contract');
    if(enabled||abMode==='bomber-physics'){
     g.input.moveVec=()=>{
      const v=helper.move(g,p,F);
      if(v){g.__novaCoverPressureMoveSamples=(g.__novaCoverPressureMoveSamples||0)+1;return v;}
      return wander();
     };
     g.input.aimVec=()=>{
      const v=helper.aim(g,p,F);
      if(v){g.__novaCoverPressureAimSamples=(g.__novaCoverPressureAimSamples||0)+1;return v;}
      g.__novaCoverPressureNoTargetSamples=(g.__novaCoverPressureNoTargetSamples||0)+1;
      return{x:Math.cos(g.time*.73),y:Math.sin(g.time*.73)};
     };
    }
   }
   const fingerprint=JSON.stringify({layout:g.__novaBattlefield.name,
    pilot:{x:+p.x.toFixed(3),y:+p.y.toFixed(3),cls:p.cls},
    bots:g.tanks.filter(t=>t.ai).map(t=>[t.id,+t.x.toFixed(3),+t.y.toFixed(3),t.cls]),
    shapes:g.shapes.slice(0,32).map(s=>[s.id,s.type,+s.x.toFixed(3),+s.y.toFixed(3)])});
   return{fingerprint,initialBotCount:g.tanks.filter(t=>t.ai).length,initialShapes:g.shapes.length};
  },{enabled,pilotPolicy:PILOT_POLICY,trialRng:TRIAL_RNG,terrainIndex:LAYOUT_INDEX,seedIndex:SEED_INDEX,abMode:AB_MODE,bomberResearch:BOMBER_RESEARCH});
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
    try{
     for(let j=0;j<steps&&g.status!=='dead';j++){
      g.update(dt);
      if(g.__novaExperimentABMode==='bomber-physics'){
       const n=(g.__novaCausalFrames=(g.__novaCausalFrames||0)+1);
       if(g.__novaCausalFirstAdvanceTime==null&&
          g.__novaBomberBurstAudit?.airburst?.advanced>0)
        g.__novaCausalFirstAdvanceTime=g.time;
       if(n%30===0){
        /* Read-only 1-second physical-state fingerprints, including RNG.
         * This is a divergence witness, not a claim of improved player fun. */
        const state=JSON.stringify({
         rng:g.__novaTrialRng,
         player:[g.player?.id,g.player?.x,g.player?.y,g.player?.hp,
          g.player?.score,g.player?.kills,g.player?.level,g.player?.alive],
         tanks:g.tanks.map(t=>[t.id,t.x,t.y,t.hp,t.alive,t.cls]),
         shapes:g.shapes.map(t=>[t.id,t.x,t.y,t.hp,t.type]),
         drones:g.drones.map(t=>[t.id,t.x,t.y,t.hp,t.ownerId]),
         bullets:g.bullets.map(t=>[t.id,t.x,t.y,t.ttl,t.dead,t.ownerId]),
         terrain:(g.__novaTerrain||[]).map(t=>[t.id,t.hp,t.solid,t.destructible]),
         powerups:(g.powerups||[]).map(t=>[t.id,t.x,t.y,t.type]),
         orbs:(g.orbs||[]).map(t=>[t.id,t.x,t.y,t.value])
        });
        let h1=2166136261,h2=0x9e3779b9;
        for(let k=0;k<state.length;k++){
         const c=state.charCodeAt(k);
         h1=Math.imul(h1^c,16777619);
         h2=Math.imul(h2^c,2246822519);
        }
        (g.__novaCausalTrace||(g.__novaCausalTrace=[])).push({
         time:+g.time.toFixed(3),hash:(h1>>>0).toString(16)+':'+(h2>>>0).toString(16),
         hp:g.player?.hp,score:g.player?.score,kills:g.player?.kills,
         projectiles:g.bullets.length,alive:g.player?.alive});
       }
      }
     }
    }
    finally{Math.random=previousRandom;}
    return{time:g.time,status:g.status,blooms:g.__lfState?.stats?.blooms||0};
   },{steps:Math.min(CHUNK,Math.ceil(SECONDS/DT)-i*CHUNK),dt:DT});
   if(last.status==='dead')break;
  }
  const result=await page.evaluate(()=>{
   const g=window.__novaNaturalMatchGame,s=window.NOVALivingFront.snapshot(),p=g.player;
   return{metadata:{layout:g.__novaBattlefield.name,seed:g.__novaExperimentSeed,pilotPolicy:g.__novaExperimentPolicy,abMode:g.__novaExperimentABMode,
     ...(g.__novaBomberBurstAudit?{pilotClass:g.__novaExperimentPilotClass,
      pilotClassFinal:g.player.cls}:{})},
    frontline:s.frontline,stats:s.stats,game:{time:+g.time.toFixed(3),status:g.status,
     pilotAlive:!!p.alive,score:p.score,kills:p.kills,level:p.level,
     botCount:g.tanks.filter(t=>t.ai&&t.alive).length},
    projectileDensityAudit:g.__novaProjectileDensityAudit,
    ...(g.__novaExperimentABMode==='bomber-physics'?{bomberPhysicsTrace:{
     firstAdvanceTime:g.__novaCausalFirstAdvanceTime??null,
     samples:g.__novaCausalTrace||[]}}:{}),
    ...(g.__novaBomberBurstAudit?{bomberBurstAudit:g.__novaBomberBurstAudit}:{}),
    coverPressure:{coverBroken:g.__novaBattlefield?.coverBroken||0,
     allEffectiveDamage:g.__novaCoverDamageResearch?.allEffectiveDamage||0,
     playerEffectiveDamage:g.__novaCoverDamageResearch?.playerEffectiveDamage||0,
     allBreaks:g.__novaCoverDamageResearch?.allBreaks||0,
     playerBreaks:g.__novaCoverDamageResearch?.playerBreaks||0,
     playerShotsFired:g.__novaResearchPlayerShots||0,
     ...(g.__novaBomberBurstAudit?{playerShellsFired:g.__novaResearchPlayerShells||0}:{}),
     certifiedActivations:g.__novaCoverPriorityResearch?.activations||0,
     coverDamage:(g.__novaTerrain||[]).filter(t=>t.destructible).reduce((sum,t)=>
      sum+Math.max(0,(t.maxHp||0)-Math.max(0,t.hp||0)),0),
     aimSamples:g.__novaCoverPressureAimSamples||0,
     moveSamples:g.__novaCoverPressureMoveSamples||0,
     noTargetSamples:g.__novaCoverPressureNoTargetSamples||0},
     contestGateAudit:g.__novaContestAudit,
    commitmentAudit:window.__novaResearchCommitmentAudit.summary(g.__novaCommitmentAudit),
    naturalBlooms:s.stats.blooms||0,publicBloomCommandSamples:g.__novaPublicBloomCommands||0,
    visibleNeutralAimSamples:g.__novaVisibleAimSamples||0,
    visibleDodgeSamples:g.__novaVisibleDodgeSamples||0,
    visibleHostileAimSamples:g.__novaVisibleHostileAimSamples||0,
    events:s.frontline?.events||[]};
  });
  if(result.naturalBlooms>0)assert.ok(result.contestGateAudit.samples>0,'announced BLOOM must be audited');
  assert.equal(result.contestGateAudit.gateMismatches,0,'audit must agree with shipping CONTESTED');
  assert.ok(result.commitmentAudit.samples>0,'real composed AI must be observed');
   const density=result.projectileDensityAudit;
   assert.ok(density.bulletUpdateCalls>0,'real composed projectile owner must be sampled');
   assert.equal(Object.values(density.projectileCountBuckets).reduce((a,b)=>a+b,0),density.bulletUpdateCalls);
   assert.ok(density.basicEligibleFrames<=density.projectileCountBuckets.threeToEight);
   assert.ok(density.coverBreaksBasicEligible<=density.coverBreaksAtThreeToEight);
   assert.ok(density.coverBreaksAtThreeToEight+density.coverBreaksAboveEight<=density.coverBreaks);
  if(BOMBER_RESEARCH){
   const a=result.bomberBurstAudit;
   assert.equal(a?.schema,1,'composed Bomber observer required');
   assert.ok(Number.isSafeInteger(result.coverPressure.playerShellsFired));
   assert.ok(result.coverPressure.playerShellsFired>=0);
   if(result.coverPressure.playerShotsFired>0)
    assert.ok(result.coverPressure.playerShellsFired>0,
     'standard Bomber emitted projectiles but no actual shells');
   assert.equal(a.firstBursts+a.suppressedCalls,a.calls);
   assert.equal(Object.values(a.byOwner).reduce((x,y)=>x+y,0),a.firstBursts);
   assert.equal(Object.values(a.bySource).reduce((x,y)=>x+y,0),a.firstBursts);
   assert.equal(Object.values(a.byTTL).reduce((x,y)=>x+y,0),a.firstBursts);
   assert.equal(Object.values(a.bySite).reduce((x,y)=>x+y,0),a.firstBursts);
   const b=a.airburst;
   assert.ok(b&&b.observerErrors===0,'airburst observer must remain safe');
   assert.equal(b.advanced+b.stationary+b.mixed+b.noChildren,b.calls);
   assert.equal(b.calls,a.bySource.disciplines,
    'every actual Disciplines airburst must be witnessed inside the frame');
   assert.ok(b.advancedChildren<=b.children);
   assert.equal(Object.values(b.byOwner).reduce((x,y)=>x+y,0),b.calls);
   const q=b.gates;
   assert.ok(q,'read-only airburst gate witness required');
   assert.equal(q.soleWithoutRewound+q.soleRewoundNotClean+
    q.soleCleanNearAny+q.soleCleanNoNearby,b.sole);
   for(const k of ['soleCleanNearShape','soleCleanNearTank','soleCleanNearDrone'])
    assert.ok(q[k]<=q.soleCleanNearAny);
  }
  assert.ok(result.commitmentAudit.eligibleWindow<=result.commitmentAudit.publicMemory);
  assert.ok(result.commitmentAudit.precombatIntersection<=result.commitmentAudit.eligibleWindow);
  const liveGate=result.commitmentAudit.liveGate;
  assert.ok(liveGate,'research live eligibility witness required');
  assert.equal(liveGate.samples,result.commitmentAudit.liveSignal);
  assert.equal(Object.values(liveGate.firstBlock).reduce((a,b)=>a+b,0),liveGate.samples);
  assert.ok(liveGate.possibleFreshNoHeldTarget<=liveGate.possibleFreshStarts);
  assert.ok(liveGate.possibleFreshStarts<=liveGate.precombatIntersection);
  assert.ok(liveGate.precombatIntersection<=liveGate.samples);
  assert.equal(result.contestGateAudit.pilotInside,
   result.contestGateAudit.noHostile+result.contestGateAudit.hostileCoLocated);
  assert.equal(result.contestGateAudit.hostileCoLocated,
   result.contestGateAudit.outsideGameplayViewport+
   result.contestGateAudit.outsideRenderedCamera+
   result.contestGateAudit.terrainOccluded+result.contestGateAudit.hostileVisible);
  assert.equal(result.contestGateAudit.hostileVisible,
   result.contestGateAudit.visibleNeutralBelow155+result.contestGateAudit.visibleNeutralAtLeast155);
  assert.equal(errors.length,0,errors.join('\n'));
  return{label,enabled,initial,last,result,patchedCount};
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
  let bomberPhysicsCausal=null;
  if(AB_MODE==='bomber-physics'){
   assert.equal(off.patchedCount,1);
   assert.equal(on.patchedCount,0);
   assert.equal(offReplay.patchedCount,1);
   assert.equal(off.result.bomberBurstAudit.airburst.advanced,0,
    'OFF script must not advance newborn fragments');
   const before=off.result.bomberPhysicsTrace.samples,
    after=on.result.bomberPhysicsTrace.samples;
   const shared=Math.min(before.length,after.length);
   let firstDifferent=null;
   for(let i=0;i<shared;i++){
    assert.equal(before[i].time,after[i].time,
     'matched physical samples must have identical simulated timestamps');
    if(before[i].hash!==after[i].hash){
     firstDifferent=after[i].time;break;
    }
   }
   const firstAdvance=on.result.bomberPhysicsTrace.firstAdvanceTime;
   if(firstDifferent!==null){
    assert.ok(firstAdvance!==null&&firstDifferent+1e-6>=firstAdvance,
     'physical divergence preceded the first corrected airburst');
   }
   if(on.result.bomberBurstAudit.airburst.advanced===0)
    assert.deepEqual(after,before,
     'no treatment exposure must leave all physical samples identical');
   bomberPhysicsCausal={sourcePatchVerified:true,
    offAdvanced:0,onAdvanced:on.result.bomberBurstAudit.airburst.advanced,
    firstAdvanceTime:firstAdvance,firstPhysicalDifferenceTime:firstDifferent,
    sharedPhysicalSamples:shared,
    physicalDifferenceObserved:firstDifferent!==null,
    noAdvanceNoDifference:on.result.bomberBurstAudit.airburst.advanced>0?null:
     JSON.stringify(after)===JSON.stringify(before)};
  }
  if(AB_MODE==='live-turn'){
   assert.equal(off.result.commitmentAudit.startedLive,0,'OFF must suppress all live-turn starts');
   assert.equal(offReplay.result.commitmentAudit.startedLive,0,'OFF replay must also suppress live starts');
  }
  const verifiedLiveStart=AB_MODE==='live-turn'&&on.result.commitmentAudit.startedLive>0;
  if(AB_MODE==='live-turn'&&!verifiedLiveStart){
   /* If no live turn was initiated, masking its start must be a true
    * no-op for the physical game. OFF replay alone cannot prove this. */
   for(const key of ['frontline','stats','game','contestGateAudit','naturalBlooms',
     'publicBloomCommandSamples','visibleNeutralAimSamples','events'])
    assert.deepEqual(on.result[key],off.result[key],
     'no-treatment live-turn arms must have identical '+key);
  }
  const report={bomberPhysicsCausal,method:AB_MODE==='bomber-physics'?'matched standard Bomber, identical scripted cover-seeking pilot; research-only single-call fragment-advance intervention':BOMBER_RESEARCH?'paired standard Bomber cover-seeking versus wander in the full shipping game; not human play':AB_MODE==='cover-pressure'?'paired ordinary Scout cover-seeking versus wander in the full shipping game; not human play':AB_MODE==='live-turn'?'paired natural full-match live-turn causal intervention (not human fun)':'scripted full-match natural Director research; not human fun; public-bloom is closed-loop policy',
   abMode:AB_MODE,bomberResearch:BOMBER_RESEARCH,verifiedLiveStart,
   initialWorldIdentical:true,initialFingerprint:off.initial.fingerprint,offReplayIdentical:same,
   naturalOpportunityObserved,
   interpretation:AB_MODE==='bomber-physics'?'Causal ON/OFF difference is only the certified newborn-fragment movement; later combat, AI and RNG may diverge as downstream effects. Human fun and physical-device performance are unmeasured.':AB_MODE==='cover-pressure'?'Descriptive matched initial worlds; ordinary cover-seeking input may change survival and subsequent AI/world states. Report early deaths and all no-target periods.':AB_MODE==='live-turn'?(verifiedLiveStart&&naturalOpportunityObserved?'Live-turn intervention activated; interpret matched-policy differences cautiously because later public signals can diverge endogenously.':'INCONCLUSIVE: no verified ON live start or natural BLOOM exposure in both arms; retain the pair.'):(naturalOpportunityObserved?'Descriptive only: natural BLOOM observed; inspect opportunity timing, deaths and public pilot commands before causal interpretation.':'INCONCLUSIVE: at least one arm had no natural BLOOM; retain this censored pair.'),
   off:off.result,on:on.result,offReplay:offReplay.result,
   limits:['No artificial BLOOM or forced survival','One layout/seed/pilot-policy per invocation; matrix must aggregate independently',
    BOMBER_RESEARCH?'A standard Bomber class is piloted by deterministic scripted inputs; no human gameplay inference':'A deterministic Scout script is not a human player',
    'Public-bloom commands can differ after ON/OFF worlds diverge; this is matched policy, not fixed inputs',
    'Public-bloom command samples are input calls, not measured seconds or proof of physical progress',
    'Seed replay is checked, not assumed',
    'Cover-pressure mode changes only pilot inputs; coverDamage includes AI damage and cannot be attributed solely to the player pilot',
    'Cover-pressure aim/move counts are input calls, not seconds fired or verified hits',
    ...(AB_MODE==='bomber-physics'?['OFF intercepts exactly one delivered Disciplines call, not repository source; production remains unchanged',
      'Physical hashes sample once per simulated second; first divergence is interval-censored',
      'Treatment effect is not a player-value or survival estimate; death-censored trials remain visible']:[]),
    ...(BOMBER_RESEARCH?['Burst callsites are provenance, not a chronological first-contact oracle',
      'Synthetic scripted Bomber exposure does not estimate ordinary human class usage']:[]),
     'Projectile density is read-only and counts necessary eligibility gates, not actual certificate activations or player benefit',
     'Only cover breaks inside the bullet owner are counted; scripted pilot trials are not human-match frequencies',
    'In live-turn mode, only live-start authority is intervened on; later natural signals can differ as treatment outcomes']};
  const dir=path.join('artifacts','browser');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'frontlines-natural-match-ab.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(dir,'frontlines-natural-on.json'),JSON.stringify(on.result,null,2));
  fs.writeFileSync(path.join(dir,'frontlines-natural-off.json'),JSON.stringify(off.result,null,2));
  fs.writeFileSync(path.join(dir,'frontlines-natural-manifest.json'),JSON.stringify({
   pairs:[{layout:LAYOUT,seed:SEED_ID,pilotPolicy:PILOT_POLICY,abMode:AB_MODE,bomberResearch:BOMBER_RESEARCH,
    on:'frontlines-natural-on.json',off:'frontlines-natural-off.json'}]
  },null,2));
  console.log('NOVA_FRONTLINES_NATURAL_MATCH_AB '+JSON.stringify({initialWorldIdentical:true,offReplayIdentical:same,
   naturalOpportunityObserved,abMode:AB_MODE,verifiedLiveStart,
   config:{layout:LAYOUT,seed:SEED_ID,pilotPolicy:PILOT_POLICY},
   off:{time:off.result.game.time,status:off.result.game.status,blooms:off.result.naturalBlooms,publicBloomCommands:off.result.publicBloomCommandSamples,frontline:off.result.frontline?.counts,contestGateAudit:Object.fromEntries(Object.entries(off.result.contestGateAudit).filter(([k])=>k!=='coLocationExamples'))},
   on:{time:on.result.game.time,status:on.result.game.status,blooms:on.result.naturalBlooms,publicBloomCommands:on.result.publicBloomCommandSamples,frontline:on.result.frontline?.counts,contestGateAudit:Object.fromEntries(Object.entries(on.result.contestGateAudit).filter(([k])=>k!=='coLocationExamples'))}}));
  if(!same)throw Error('same-arm full-match replay diverged; cannot claim controlled A/B');
  // No natural announcement is valid negative/censored research evidence,
  // not a CI failure to hide by selecting a friendlier seed.
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
