'use strict';
// Research-only causal intervention: remove ONLY ordinary bullet-trail glow, preserve cosmetic RNG, measure frame pacing.
// This measures real browser work; it does NOT certify Android or input-to-photon.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin='http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 try{
  const observations=[];
  // Counterbalance scheduler, player Render clarity, and CPU-load order. The 6x stress phase is
  // intended to expose sub-60Hz presentation if the runner is fast enough;
  // actual measured FPS, not the throttle multiplier, determines that.
  // This remains a synthetic proxy, not a physical-device release gate.
  for(const repeat of [0,1])for(const renderScale of (repeat?[67,100]:[100,67]))for(const trailMode of (repeat?['suppressed','sham','sham2']:['sham2','sham','suppressed'])){
   const fixed60=true;
   const context=await browser.newContext({viewport:{width:800,height:600},deviceScaleFactor:1.5});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   // Use the shipping Pilot Console Render clarity setting at fixed device DPR.
   await page.addInitScript(scale=>localStorage.setItem('novatanks_pilot_settings_v1',
    JSON.stringify({renderScale:scale})),renderScale);
   const cdp=await context.newCDPSession(page);
   try{
    await page.goto(origin+(fixed60?'?nova_fixed60=pilot':''),{waitUntil:'domcontentloaded',timeout:45000});
    const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:20000});
    await page.evaluate(seed=>{
     const engine=window.__novaMakeRequire('')('game/engine');
     const Game=engine.Game;
     const spawn=Game.prototype.spawnPlayer;
     // Pair the canonical Battlefield layout between schedulers within each
     // repeat. Do not seed the entire match: that would override live RNG.
     Game.prototype.spawnPlayer=function(){
      if(this.__novaTerrain)return spawn.apply(this,arguments);
      const now=Date.now,random=Math.random;
      let first=true;
      Date.now=()=>0;
      Math.random=()=>first?(first=false,seed/0x7fffffff):random();
      try{return spawn.apply(this,arguments)}
      finally{Date.now=now;Math.random=random}
     };
     const original=Game.prototype.start;
     Game.prototype.start=function(){
      if(!this.__novaDecorativeWorld)window.__novaCombatBenchGame=this;
      return original.apply(this,arguments);
     };
     // The real Game constructor itself spawns player, shapes and eight AI
     // tanks. Seeding redeploy() would miss that entire initial transaction.
     // Subclass the actual module export for this benchmark only, so the
     // constructor's full RNG stream is paired and always restored, even
     // if construction throws. The decorative lobby was already constructed.
     engine.Game=class BenchSeededGame extends Game{
      constructor(...args){
       const oldRandom=Math.random,oldNow=Date.now;
       let state=(0x9e3779b9^(seed+1))>>>0||1;
       Math.random=()=>{
        state^=state<<13;state^=state>>>17;state^=state<<5;
        return(state>>>0)/4294967296;
       };
       Date.now=()=>0;
       try{super(...args)}finally{Math.random=oldRandom;Date.now=oldNow}
       this.__novaCombatInitialSignature=JSON.stringify({
        layout:this.__novaBattlefield?.name||null,
        player:this.player&&[this.player.x,this.player.y,this.player.cls],
        tanks:this.tanks.map(t=>[t.x,t.y,t.cls,t.angle]),
        shapes:this.shapes.map(sh=>[sh.x,sh.y,sh.type]),
        terrain:(this.__novaTerrain||[]).map(w=>[w.x,w.y,w.w,w.h,w.r,w.shape])
       });
      }
     };
    },repeat);
    await deploy.click();
    await page.waitForFunction(expected=>{
     const g=window.__novaCombatBenchGame;
     return !!g && g.status==='playing' &&
      (expected?g.__novaFixed60Pilot?.owner.ticks>5:!!g.raf);
    },fixed60,{timeout:20000});
    await page.evaluate(trailMode=>{
     const g=window.__novaCombatBenchGame;
     g.setClass(g.player,'tempest');
     g.player.stats.reload=8;
     g.player.perk='alacrity';
     g.useAbility(g.player);
     g.player.hp=1000000; // prevent an unrelated AI kill from censoring the trial
     g.input.aim.active=true;
     g.input.aim.dx=40;
     g.input.aim.dy=0;
     g.input.firing=true;
     g.input.autofire=false;
     const m=window.__novaCombatBench={
      updates:0,simMs:0,updateWorkMs:0,renders:0,renderWorkMs:0,
      minimaps:0,minimapWorkMs:0,projectiles:0,fireCalls:0,
      bulletWorkMs:0,collisionWorkMs:0,
      bulletSeconds:0,bulletVfxCalls:0,bulletVfxParticles:0,inBulletUpdate:false,
      trailCandidates:0,suppressedTrails:0,
      frameGaps:[],rafDispatchLags:[],lastFrame:null,frames:0,active:true,
      renderGaps:[],lastRender:null,stepsPerRender:[],lastRenderUpdates:null,
      updateCostSamples:[],renderCostSamples:[],
      updatePlusRenderSamples:[],lastRenderUpdateWorkMs:null,
      longTasks:[],longTaskObserver:null
     };
     // Diagnose RAF stalls not explained by measured update/render work.
     // Long tasks can originate outside Game and do not prove causation.
     if(typeof PerformanceObserver==='function' &&
        PerformanceObserver.supportedEntryTypes?.includes('longtask')){
      m.longTaskObserver=new PerformanceObserver(list=>{
       for(const entry of list.getEntries())m.longTasks.push({start:entry.startTime,duration:entry.duration});
      });
      m.longTaskObserver.observe({type:'longtask',buffered:true});
     }
     const update=g.update,fire=g.tryFire;
     const updateBullets=g.updateBullets,collisions=g.resolveBulletCollisions;
     if(typeof updateBullets!=='function'||typeof collisions!=='function')
      throw Error('materialized projectile/collision owners unavailable');
     const addParticles=g.addParticles;
     if(typeof g.cosmeticRandom!=='function'||!Array.isArray(g.parts))
      throw Error('canonical cosmetic RNG / particle pool unavailable');
     g.addParticles=function(...args){
      const ordinaryTrail=m.inBulletUpdate&&args[3]===1&&args[4]===20&&args[5]==='glow';
      if(ordinaryTrail){
       m.trailCandidates++;
       if(trailMode==='suppressed'){
        // The canonical one-particle glow consumes four cosmetic draws.
        // Preserve its isolated RNG sequence without creating a visual particle.
        for(let i=0;i<4;i++)this.cosmeticRandom();
        m.suppressedTrails++;
        return;
       }
      }
      if(m.inBulletUpdate){
       m.bulletVfxCalls++;
       m.bulletVfxParticles+=Number(args[3])||0;
      }
      return addParticles.apply(this,args);
     };
     g.updateBullets=function(...args){
      const t=performance.now(),dt=Number(args[0]);
      if(Number.isFinite(dt)&&dt>0)
       m.bulletSeconds+=this.bullets.length*dt;
      m.inBulletUpdate=true;
      try{return updateBullets.apply(this,args)}
      finally{m.inBulletUpdate=false;m.bulletWorkMs+=performance.now()-t}
     };
     g.resolveBulletCollisions=function(...args){
      const t=performance.now();
      try{return collisions.apply(this,args)}
      finally{m.collisionWorkMs+=performance.now()-t}
     };
     const renderer=window.__novaMakeRequire('')('game/render');
     const render=renderer.render;
     renderer.render=function(...args){
      // The module is shared with decorative/lobby worlds. Only completed
      // renders of the measured live Game belong in its frame statistics.
      if(args[0]!==g)return render.apply(this,args);
      const t=performance.now();
      try{return render.apply(this,args)}
      finally{
       const completed=performance.now();
       if(m.lastRender!==null)m.renderGaps.push(completed-m.lastRender);
       if(m.lastRenderUpdates!==null)
        m.stepsPerRender.push(m.updates-m.lastRenderUpdates);
       m.lastRenderUpdates=m.updates;
       m.lastRender=completed;
       m.renders++;m.renderWorkMs+=completed-t;
       m.renderCostSamples.push(completed-t);
       if(m.lastRenderUpdateWorkMs!==null)
        m.updatePlusRenderSamples.push(m.updateWorkMs-m.lastRenderUpdateWorkMs+completed-t);
       m.lastRenderUpdateWorkMs=m.updateWorkMs;
      }
     };
     const drawMinimap=g.drawMinimap;
     g.drawMinimap=function(...args){
      const t=performance.now();
      try{return drawMinimap.apply(this,args)}
      finally{m.minimaps++;m.minimapWorkMs+=performance.now()-t}
     };
     g.update=function(dt){
      const t=performance.now();
      try{return update.apply(this,arguments)}
      finally{const cost=performance.now()-t;
       m.updates++;m.simMs+=dt*1000;m.updateWorkMs+=cost;
       m.updateCostSamples.push(cost)}
     };
     g.tryFire=function(tank){
      const before=this.bullets.length;
      try{return fire.apply(this,arguments)}
      finally{if(tank===this.player){
       m.fireCalls++;m.projectiles+=Math.max(0,this.bullets.length-before);
      }}
     };
     const frame=at=>{
      if(!m.active)return;
      if(m.lastFrame!==null)m.frameGaps.push(at-m.lastFrame);
      // RAF timestamp and performance.now share the browser time origin.
      // Dispatch lag distinguishes delayed callbacks from sparse RAF scheduling.
      m.rafDispatchLags.push(Math.max(0,performance.now()-at));
      m.lastFrame=at;m.frames++;
      requestAnimationFrame(frame);
     };
     requestAnimationFrame(frame);
    },trailMode);
    for(const throttle of [6]){
     await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});
     // Do not attribute the interval spanning a throttle transition or the
     // Playwright/CDP setup pause to either measured presentation phase.
     // The next completed render establishes the phase-local origin.
     await page.evaluate(()=>{
      const m=window.__novaCombatBench;
      m.lastRender=null;
      m.lastRenderUpdates=null;
      m.lastRenderUpdateWorkMs=null;
      m.lastFrame=null;
     });
     const before=await page.evaluate(()=>{
      const m=window.__novaCombatBench,g=window.__novaCombatBenchGame;
      return {at:performance.now(),canvasBacking:[g.canvas.width,g.canvas.height],
       canvasCss:[g.canvas.clientWidth,g.canvas.clientHeight],dpr:g.dpr,updates:m.updates,simMs:m.simMs,work:m.updateWorkMs,
       renders:m.renders,renderWork:m.renderWorkMs,
       minimaps:m.minimaps,minimapWork:m.minimapWorkMs,
       projectiles:m.projectiles,fireCalls:m.fireCalls,frames:m.frames,
       bulletWorkMs:m.bulletWorkMs,collisionWorkMs:m.collisionWorkMs,
       bulletSeconds:m.bulletSeconds,bulletVfxCalls:m.bulletVfxCalls,
       bulletVfxParticles:m.bulletVfxParticles,
       trailCandidates:m.trailCandidates,suppressedTrails:m.suppressedTrails,
       activeParticles:g.parts.filter(p=>p.active).length,
       gaps:m.frameGaps.length,dispatchLags:m.rafDispatchLags.length,
       renderGaps:m.renderGaps.length,
       stepsPerRender:m.stepsPerRender.length,
       updateCosts:m.updateCostSamples.length,renderCosts:m.renderCostSamples.length,
       updatePlusRender:m.updatePlusRenderSamples.length,
       ticks:g.__novaFixed60Pilot?.owner.ticks||0,
       droppedMs:g.__novaFixed60Pilot?.owner.droppedMs||0};
     });
     await page.waitForTimeout(3000);
     const after=await page.evaluate(({gapStart,dispatchLagStart,renderGapStart,stepsStart,updateCostStart,renderCostStart,updatePlusRenderStart})=>{
      const m=window.__novaCombatBench,g=window.__novaCombatBenchGame;
      if(m.longTaskObserver)for(const entry of m.longTaskObserver.takeRecords())
       m.longTasks.push({start:entry.startTime,duration:entry.duration});
      return {at:performance.now(),longTaskSupported:!!m.longTaskObserver,
       longTasks:m.longTasks.slice(),canvasBacking:[g.canvas.width,g.canvas.height],
       canvasCss:[g.canvas.clientWidth,g.canvas.clientHeight],dpr:g.dpr,updates:m.updates,simMs:m.simMs,work:m.updateWorkMs,
       renders:m.renders,renderWork:m.renderWorkMs,
       minimaps:m.minimaps,minimapWork:m.minimapWorkMs,
       projectiles:m.projectiles,fireCalls:m.fireCalls,frames:m.frames,
       bulletWorkMs:m.bulletWorkMs,collisionWorkMs:m.collisionWorkMs,
       bulletSeconds:m.bulletSeconds,bulletVfxCalls:m.bulletVfxCalls,
       bulletVfxParticles:m.bulletVfxParticles,
       trailCandidates:m.trailCandidates,suppressedTrails:m.suppressedTrails,
       activeParticles:g.parts.filter(p=>p.active).length,
       gaps:m.frameGaps.length,ticks:g.__novaFixed60Pilot?.owner.ticks||0,
       droppedMs:g.__novaFixed60Pilot?.owner.droppedMs||0,
       frameGaps:m.frameGaps.slice(gapStart),
       rafDispatchLags:m.rafDispatchLags.slice(dispatchLagStart),
       renderGaps:m.renderGaps.slice(renderGapStart),
       stepsPerRender:m.stepsPerRender.slice(stepsStart),
       updateCostSamples:m.updateCostSamples.slice(updateCostStart),
       renderCostSamples:m.renderCostSamples.slice(renderCostStart),
       updatePlusRenderSamples:m.updatePlusRenderSamples.slice(updatePlusRenderStart),
       heat:g.player?.__v17Heat||0,
       alive:g.player?.hp>0,destroyed:!!g.__novaDestroyed,playerClass:g.player?.cls,
       paused:!!g.paused,pendingOffer:!!g.pendingOffer,
       entityCounts:{tanks:g.tanks?.length||0,drones:g.drones?.length||0,
        bullets:g.bullets?.length||0,shapes:g.shapes?.length||0},
       layout:g.__novaBattlefield?.name||null,
       initialSignature:g.__novaCombatInitialSignature||null};
     },{gapStart:before.gaps,dispatchLagStart:before.dispatchLags,
       renderGapStart:before.renderGaps,
       stepsStart:before.stepsPerRender,
       updateCostStart:before.updateCosts,renderCostStart:before.renderCosts,
       updatePlusRenderStart:before.updatePlusRender});
     // Snapshot on the browser's own clock: under CPU pressure Playwright's
     // post-timeout evaluate may wait for the busy main thread. Its delay
     // contributes real game work and must be included in the denominator.
     const longTasks=after.longTasks.filter(x=>x.start>=before.at&&x.start<=after.at);
     const longTaskTotalMs=longTasks.reduce((sum,x)=>sum+x.duration,0);
     const longTaskMaxMs=longTasks.reduce((max,x)=>Math.max(max,x.duration),0);
     const wallMs=after.at-before.at;
     assert.ok(Number.isFinite(wallMs)&&wallMs>=2500,
      'combat measurement interval must use actual browser elapsed time');
     const delta=(k)=>after[k]-before[k];
     const gaps=after.frameGaps;
     const sorted=gaps.slice().sort((a,b)=>a-b);
     const p95=sorted.length?sorted[Math.ceil(.95*sorted.length)-1]:null;
     const dispatchLags=after.rafDispatchLags;
     const dispatchLagP95Ms=dispatchLags.length?
      dispatchLags.slice().sort((a,b)=>a-b)[Math.ceil(.95*dispatchLags.length)-1]:null;
     const dispatchLagMaxMs=dispatchLags.length?Math.max(...dispatchLags):null;
     const renderGaps=after.renderGaps;
     const sortedRenderGaps=renderGaps.slice().sort((a,b)=>a-b);
     const renderGapP95Ms=sortedRenderGaps.length?
      sortedRenderGaps[Math.ceil(.95*sortedRenderGaps.length)-1]:null;
     const renderGapMaxMs=sortedRenderGaps.length?
      sortedRenderGaps[sortedRenderGaps.length-1]:null;
     const stepsPerRender=after.stepsPerRender;
     const sortedSteps=stepsPerRender.slice().sort((a,b)=>a-b);
     const stepsPerRenderP95=sortedSteps.length?
      sortedSteps[Math.ceil(.95*sortedSteps.length)-1]:null;
     const stepsPerRenderMax=sortedSteps.length?
      sortedSteps[sortedSteps.length-1]:null;
     const percentile=(values,p)=>{
      const sorted=values.slice().sort((a,b)=>a-b);
      return sorted.length?sorted[Math.ceil(p*sorted.length)-1]:null;
     };
     const updateCostP95Ms=percentile(after.updateCostSamples,.95);
     const renderCostP95Ms=percentile(after.renderCostSamples,.95);
     // Actual measured update+render work accumulated between completed
     // game frames. Excludes browser scheduling, minimap and other tasks.
     const updatePlusRenderP95Ms=percentile(after.updatePlusRenderSamples,.95);
     const simulatedMs=delta('simMs');
     const updates=delta('updates'),renders=delta('renders'),frames=delta('frames');
     const updateWorkMs=delta('work'),renderWorkMs=delta('renderWork');
     const projectiles=delta('projectiles');
     // Game render throughput is the presentation metric; the independent
     // RAF observer is only a browser scheduling diagnostic.
     // Normalize to simulated game time. Raw projectile totals are misleading
     // when the world has different heat, targets, or startup histories.
     const result={repeat,renderScale,fixed60,trailMode,throttle,wallMs,
      trailCandidates:delta('trailCandidates'),suppressedTrails:delta('suppressedTrails'),
      activeParticles:after.activeParticles,
      longTaskSupported:after.longTaskSupported,
      longTaskCount:longTasks.length,longTaskTotalMs,longTaskMaxMs,
      updates,simulatedMs,updateWorkMs,
      renders,renderWorkMs,bulletWorkMs:delta('bulletWorkMs'),
      collisionWorkMs:delta('collisionWorkMs'),minimaps:delta('minimaps'),
      bulletSeconds:delta('bulletSeconds'),bulletVfxCalls:delta('bulletVfxCalls'),
      bulletVfxParticles:delta('bulletVfxParticles'),
      minimapWorkMs:delta('minimapWork'),projectiles,
      fireCalls:delta('fireCalls'),frames,frameGapP95Ms:p95,
      dispatchLagP95Ms,dispatchLagMaxMs,
      frameGapSamples:gaps.length,
      renderGapP95Ms,renderGapMaxMs,renderGapSamples:renderGaps.length,
      renderGapsOver50Ms:renderGaps.filter(ms=>ms>50).length,
      renderGapsOver100Ms:renderGaps.filter(ms=>ms>100).length,
      // Sum only the excess beyond a 30Hz presentation budget. This is
      // diagnostic exposure, not a substitute for input-to-photon latency.
      renderGapExcessOver33Ms:renderGaps.reduce((sum,ms)=>sum+Math.max(0,ms-1000/30),0),
      stepsPerRenderP95,stepsPerRenderMax,
      multiStepRenderFrames:stepsPerRender.filter(n=>n>=2).length,
      presentationFps:renders*1000/wallMs,
      observerRafFps:frames*1000/wallMs,
      simulationHz:updates*1000/wallMs,
      simulatedTimeRatio:simulatedMs/wallMs,
      simulatedTimeDeficitMs:wallMs-simulatedMs,
      renderPerUpdate:renders/updates,
      updateCostMs:updateWorkMs/updates,
      updateCostP95Ms,renderCostP95Ms,updatePlusRenderP95Ms,
      renderCostMs:renderWorkMs/renders,
      projectilesPerSimSecond:projectiles*1000/simulatedMs,
      bulletVfxCallsPerBulletSecond:delta('bulletVfxCalls')/Math.max(1e-9,delta('bulletSeconds')),
      bulletVfxParticlesPerBulletSecond:delta('bulletVfxParticles')/Math.max(1e-9,delta('bulletSeconds')),
      heat:after.heat,alive:after.alive,destroyed:after.destroyed,playerClass:after.playerClass,
      canvasBacking:after.canvasBacking,canvasCss:after.canvasCss,actualDpr:after.dpr,
      paused:after.paused,pendingOffer:after.pendingOffer,
      entityCounts:after.entityCounts,layout:after.layout,
      initialSignature:after.initialSignature,
      droppedMs:delta('droppedMs'),ticks:delta('ticks')};
     console.log('NOVA_FIXED60_COMBAT_PHASE '+JSON.stringify(result));
     assert.ok(result.updates>0 && result.simulatedMs>0 && result.renders>0 &&
      Number.isFinite(result.updateWorkMs) && Number.isFinite(result.renderWorkMs) &&
      Number.isFinite(result.updateCostP95Ms) && Number.isFinite(result.renderCostP95Ms) &&
      Number.isFinite(result.updatePlusRenderP95Ms) &&
      Number.isFinite(result.bulletWorkMs) && Number.isFinite(result.collisionWorkMs) &&
      Number.isFinite(result.bulletVfxCallsPerBulletSecond) &&
      Number.isFinite(result.bulletVfxParticlesPerBulletSecond) &&
      result.renderGapSamples>0 && Number.isFinite(result.renderGapP95Ms) &&
      Number.isFinite(result.dispatchLagP95Ms) && Number.isFinite(result.dispatchLagMaxMs) &&
      Number.isFinite(result.stepsPerRenderP95),
      'real composed combat and renderer must advance');
     assert.equal(typeof result.longTaskSupported,'boolean',
      'browser must report whether long-task observation is supported');
     assert.ok(result.canvasBacking.every(Number.isFinite) && result.canvasCss.every(Number.isFinite) &&
      Number.isFinite(result.actualDpr), 'real composed canvas scale must be measurable');
     assert.ok(Math.abs(result.actualDpr-Math.max(1,1.5*renderScale/100))<0.01,
      'Render clarity must reach actual game DPR');
     assert.equal(result.playerClass,'tempest','real combat must use Tempest');
     assert.equal(result.alive,true,'player death must not censor a sustained combat trial');
     assert.equal(result.destroyed,false,'destroyed Game must not censor a sustained combat trial');
     assert.equal(result.paused,false,'evolution or menu pause must not censor combat measurement');
     assert.equal(result.pendingOffer,false,'pending evolution offer must not censor combat measurement');
     assert.ok(result.bulletSeconds>0 && result.bulletVfxCalls+result.suppressedTrails>0,
      'real combat must exercise projectile particle effects or explicitly suppress ordinary trails');
     assert.ok(result.fireCalls>0 && result.projectiles>0,
      'Tempest must spawn actual projectiles in composed browser Game');
     if(fixed60)assert.equal(await page.evaluate(()=>window.__novaCombatBenchGame.raf||0),0,
      'fixed60 must never coexist with production RAF');
     observations.push(result);
    }
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    await page.evaluate(()=>{
     window.__novaCombatBench.active=false;
     window.__novaCombatBench.longTaskObserver?.disconnect();
     window.__novaCombatBenchGame.destroy();
    });
    assert.deepEqual(errors,[],'combat browser errors: '+errors.join('; '));
   }finally{
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});
    await context.close();
   }
  }
  assert.equal(observations.length,12,'two layouts x two clarity levels x three causal arms');
  for(const x of observations){
   assert.ok(x.trailCandidates>0,'real Tempest bullet trails must occur');
   assert.equal(x.suppressedTrails,x.trailMode==='suppressed'?x.trailCandidates:0,
    'only the suppression arm may discard ordinary trails');
   assert.ok(Number.isFinite(x.activeParticles),'real particle pool must be measurable');
  }
  const paired=[];
  for(const repeat of [0,1])for(const renderScale of [67,100]){
   const group=observations.filter(x=>x.repeat===repeat&&x.renderScale===renderScale);
   const sham=group.find(x=>x.trailMode==='sham');
   const sham2=group.find(x=>x.trailMode==='sham2');
   const suppressed=group.find(x=>x.trailMode==='suppressed');
   assert.ok(sham&&sham2&&suppressed,'each paired world requires A/A and intervention');
   assert.equal(sham.initialSignature,sham2.initialSignature,'A/A starts must match');
   assert.equal(sham.initialSignature,suppressed.initialSignature,'A/B starts must match');
   paired.push({repeat,renderScale,layout:sham.layout,
    aaFpsDelta:sham2.presentationFps-sham.presentationFps,
    suppressionFpsDelta:suppressed.presentationFps-sham.presentationFps,
    aaRenderGapP95DeltaMs:sham2.renderGapP95Ms-sham.renderGapP95Ms,
    suppressionRenderGapP95DeltaMs:suppressed.renderGapP95Ms-sham.renderGapP95Ms,
    aaSimulatedTimeRatioDelta:sham2.simulatedTimeRatio-sham.simulatedTimeRatio,
    suppressionSimulatedTimeRatioDelta:suppressed.simulatedTimeRatio-sham.simulatedTimeRatio,
    shamActiveParticles:sham.activeParticles,
    suppressedActiveParticles:suppressed.activeParticles,
    suppressedTrailCount:suppressed.suppressedTrails});
  }
  console.log('NOVA_TRAIL_CAUSAL_PAIRED '+JSON.stringify(paired));
  console.log('NOVA_TRAIL_CAUSAL_PHASES '+JSON.stringify(observations));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
