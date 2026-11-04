'use strict';
// Research-only: sustained Tempest firing in the actual composed browser Game.
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
  for(const repeat of [0,1])for(const renderScale of (repeat?[67,100]:[100,67]))for(const fixed60 of (repeat?[true,false]:[false,true])){
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
    await page.evaluate(()=>{
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
      bulletWorkMs:0,collisionWorkMs:0,droneWorkMs:0,droneCalls:0,droneSeconds:0,
      bulletSeconds:0,bulletVfxCalls:0,bulletVfxParticles:0,inBulletUpdate:false,
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
     const updateDrones=g.updateDrones;
     if(typeof updateBullets!=='function'||typeof collisions!=='function'||typeof updateDrones!=='function')
      throw Error('materialized projectile/collision owners unavailable');
     const addParticles=g.addParticles;
     g.addParticles=function(...args){
      if(m.inBulletUpdate){
       m.bulletVfxCalls++;
       m.bulletVfxParticles+=Number(args[3])||0;
      }
      return addParticles.apply(this,args);
     };
     g.updateDrones=function(...args){
      const t=performance.now(),dt=Number(args[0]);
      if(Number.isFinite(dt)&&dt>0)m.droneSeconds+=(this.drones?.length||0)*dt;
      try{return updateDrones.apply(this,args)}
      finally{m.droneCalls++;m.droneWorkMs+=performance.now()-t}
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
    });
    for(const throttle of (repeat?[6,3,1]:[1,3,6])){
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
       droneWorkMs:m.droneWorkMs,droneCalls:m.droneCalls,droneSeconds:m.droneSeconds,
       bulletSeconds:m.bulletSeconds,bulletVfxCalls:m.bulletVfxCalls,
       bulletVfxParticles:m.bulletVfxParticles,
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
       droneWorkMs:m.droneWorkMs,droneCalls:m.droneCalls,droneSeconds:m.droneSeconds,
       bulletSeconds:m.bulletSeconds,bulletVfxCalls:m.bulletVfxCalls,
       bulletVfxParticles:m.bulletVfxParticles,
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
     const result={repeat,renderScale,fixed60,throttle,wallMs,
      longTaskSupported:after.longTaskSupported,
      longTaskCount:longTasks.length,longTaskTotalMs,longTaskMaxMs,
      updates,simulatedMs,updateWorkMs,
      renders,renderWorkMs,bulletWorkMs:delta('bulletWorkMs'),
      droneWorkMs:delta('droneWorkMs'),droneCalls:delta('droneCalls'),
      droneSeconds:delta('droneSeconds'),
      meanLiveDrones:simulatedMs>0?delta('droneSeconds')*1000/simulatedMs:null,
      // Compare work per simulated second, not only per browser wall second:
      // fixed60 may advance substantially more game time under CPU pressure.
      droneMsPerSimSecond:simulatedMs>0?delta('droneWorkMs')*1000/simulatedMs:null,
      // The sampled owners can call one another; do not subtract their
      // inclusive times to fabricate an exclusive "other" CPU bucket.
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
      Number.isFinite(result.droneWorkMs) && result.droneCalls>0 &&
      Number.isFinite(result.droneMsPerSimSecond) && Number.isFinite(result.meanLiveDrones) &&
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
     assert.ok(result.bulletSeconds>0 && result.bulletVfxCalls>0,
      'real combat must exercise projectile particle effects');
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
  assert.equal(observations.length,24,'two passes across two clarity levels, two schedulers and three CPU loads');
  for(const renderScale of [67,100])for(const fixed60 of [false,true])for(const throttle of [1,3,6])
   assert.equal(observations.filter(x=>x.renderScale===renderScale&&x.fixed60===fixed60&&x.throttle===throttle).length,2,
    'each scheduler/load pair must have independent replicates');
  // Initial constructor-spawned worlds are seeded and checked within each
  // repeat. Subsequent live AI/RNG decisions and combat histories still
  // diverge: matched starts are not deterministic combat replay.
  for(const repeat of [0,1])for(const renderScale of [67,100]){
   const worlds=observations.filter(x=>x.repeat===repeat&&x.renderScale===renderScale);
   assert.ok(worlds.every(x=>typeof x.layout==='string'&&x.layout.length>0),
    'paired browser worlds must expose a real Battlefield layout');
   assert.equal(new Set(worlds.map(x=>x.layout)).size,1,
    'scheduler comparisons within a repeat must share Battlefield layout');
   assert.ok(worlds.every(x=>typeof x.initialSignature==='string'&&x.initialSignature.length>100),
    'each trial must capture the actual constructor-spawned initial world');
   assert.equal(new Set(worlds.map(x=>x.initialSignature)).size,1,
    'scheduler and clarity comparisons must share initial player, AI, shapes and terrain');
  }
  // Confirm the player's setting actually reduces rendered pixels while
  // preserving the same tactical viewport. Otherwise an apparent performance
  // improvement could be a test setup illusion rather than a game setting.
  for(const repeat of [0,1])for(const fixed60 of [false,true]){
   const hi=observations.find(x=>x.repeat===repeat&&x.fixed60===fixed60&&x.renderScale===100);
   const lo=observations.find(x=>x.repeat===repeat&&x.fixed60===fixed60&&x.renderScale===67);
   assert.ok(hi&&lo,'both clarity modes must be measured');
   assert.deepEqual(lo.canvasCss,hi.canvasCss,
    'Render clarity must not change CSS viewport or input geometry');
   assert.ok(lo.canvasBacking[0]*lo.canvasBacking[1]<hi.canvasBacking[0]*hi.canvasBacking[1]*.55,
    'reduced Render clarity must materially reduce backing pixel area');
  }
  // Render clarity uses the shipped Pilot Console setting at fixed browser DPR.
  // Synthetic CPU throttling is not a physical Android acceptance gate.
  const summaries=[];
  for(const renderScale of [67,100])for(const throttle of [1,3,6]){
   const baseline=observations.filter(x=>x.renderScale===renderScale&&!x.fixed60&&x.throttle===throttle);
   const pilot=observations.filter(x=>x.renderScale===renderScale&&x.fixed60&&x.throttle===throttle);
   const mean=(xs,key)=>xs.reduce((sum,x)=>sum+x[key],0)/xs.length;
   const baseFps=mean(baseline,'presentationFps');
   const pilotFps=mean(pilot,'presentationFps');
   summaries.push({renderScale,throttle,baselinePresentationFps:baseFps,
    fixed60PresentationFps:pilotFps,
    fixed60PresentationRatio:pilotFps/baseFps,
    baselineLongTaskTotalMs:mean(baseline,'longTaskTotalMs'),
    fixed60LongTaskTotalMs:mean(pilot,'longTaskTotalMs'),
    baselineLongTaskMaxMs:mean(baseline,'longTaskMaxMs'),
    fixed60LongTaskMaxMs:mean(pilot,'longTaskMaxMs'),
    baselineDispatchLagP95Ms:mean(baseline,'dispatchLagP95Ms'),
    fixed60DispatchLagP95Ms:mean(pilot,'dispatchLagP95Ms'),
    baselineRenderGapP95Ms:mean(baseline,'renderGapP95Ms'),
    fixed60RenderGapP95Ms:mean(pilot,'renderGapP95Ms'),
    baselineRenderGapMaxMs:mean(baseline,'renderGapMaxMs'),
    fixed60RenderGapMaxMs:mean(pilot,'renderGapMaxMs'),
    baselineRenderGapsOver50Ms:mean(baseline,'renderGapsOver50Ms'),
    fixed60RenderGapsOver50Ms:mean(pilot,'renderGapsOver50Ms'),
    baselineRenderGapsOver100Ms:mean(baseline,'renderGapsOver100Ms'),
    fixed60RenderGapsOver100Ms:mean(pilot,'renderGapsOver100Ms'),
    baselineRenderGapExcessOver33Ms:mean(baseline,'renderGapExcessOver33Ms'),
    fixed60RenderGapExcessOver33Ms:mean(pilot,'renderGapExcessOver33Ms'),
    baselineStepsPerRenderP95:mean(baseline,'stepsPerRenderP95'),
    fixed60StepsPerRenderP95:mean(pilot,'stepsPerRenderP95'),
    baselineMultiStepRenderFrames:mean(baseline,'multiStepRenderFrames'),
    fixed60MultiStepRenderFrames:mean(pilot,'multiStepRenderFrames'),
    baselineMeanLiveDrones:mean(baseline,'meanLiveDrones'),
    fixed60MeanLiveDrones:mean(pilot,'meanLiveDrones'),
    baselineDroneMsPerSimSecond:mean(baseline,'droneMsPerSimSecond'),
    fixed60DroneMsPerSimSecond:mean(pilot,'droneMsPerSimSecond'),
    baselineDroneWorkMs:mean(baseline,'droneWorkMs'),
    fixed60DroneWorkMs:mean(pilot,'droneWorkMs'),
    baselineBulletWorkMs:mean(baseline,'bulletWorkMs'),
    baselineBulletVfxRate:mean(baseline,'bulletVfxCallsPerBulletSecond'),
    fixed60BulletVfxRate:mean(pilot,'bulletVfxCallsPerBulletSecond'),
    baselineBulletVfxParticlesRate:mean(baseline,'bulletVfxParticlesPerBulletSecond'),
    fixed60BulletVfxParticlesRate:mean(pilot,'bulletVfxParticlesPerBulletSecond'),
    fixed60BulletWorkMs:mean(pilot,'bulletWorkMs'),
    baselineCollisionWorkMs:mean(baseline,'collisionWorkMs'),
    fixed60CollisionWorkMs:mean(pilot,'collisionWorkMs'),
    baselineUpdateCostMs:mean(baseline,'updateCostMs'),
    baselineUpdateCostP95Ms:mean(baseline,'updateCostP95Ms'),
    fixed60UpdateCostP95Ms:mean(pilot,'updateCostP95Ms'),
    baselineRenderCostP95Ms:mean(baseline,'renderCostP95Ms'),
    fixed60RenderCostP95Ms:mean(pilot,'renderCostP95Ms'),
    fixed60UpdateCostMs:mean(pilot,'updateCostMs'),
    baselineProjectilesPerSimSecond:mean(baseline,'projectilesPerSimSecond'),
    fixed60ProjectilesPerSimSecond:mean(pilot,'projectilesPerSimSecond'),
    baselineSimulatedTimeRatio:mean(baseline,'simulatedTimeRatio'),
    fixed60SimulatedTimeRatio:mean(pilot,'simulatedTimeRatio'),
    baselineSimulatedTimeDeficitMs:mean(baseline,'simulatedTimeDeficitMs'),
    fixed60SimulatedTimeDeficitMs:mean(pilot,'simulatedTimeDeficitMs'),
    baselineRenderPerUpdate:mean(baseline,'renderPerUpdate'),
    fixed60RenderPerUpdate:mean(pilot,'renderPerUpdate')});
  }
  for(const summary of summaries){
   for(const [key,value] of Object.entries(summary))
    assert.ok(typeof value==='number'&&Number.isFinite(value),
     'combat comparison must not silently serialize invalid '+key+' as null');
  }
  // Aggregate means can conceal opposite outcomes in independent Battlefield
  // worlds. Keep each within-layout, within-throttle pair visible; this is
  // descriptive evidence, not a deterministic A/B or a release threshold.
  const paired=[];
  for(const repeat of [0,1])for(const renderScale of [67,100])for(const throttle of [1,3,6]){
   const baseline=observations.find(x=>x.repeat===repeat&&x.renderScale===renderScale&&x.throttle===throttle&&!x.fixed60);
   const pilot=observations.find(x=>x.repeat===repeat&&x.renderScale===renderScale&&x.throttle===throttle&&x.fixed60);
   assert.ok(baseline&&pilot&&baseline.layout===pilot.layout,
    'paired scheduler trials must share the same real Battlefield layout');
   paired.push({repeat,renderScale,throttle,layout:baseline.layout,
    baselineLongTaskTotalMs:baseline.longTaskTotalMs,
    fixed60LongTaskTotalMs:pilot.longTaskTotalMs,
    baselinePresentationFps:baseline.presentationFps,
    fixed60PresentationFps:pilot.presentationFps,
    presentationFpsDelta:pilot.presentationFps-baseline.presentationFps,
    baselineDispatchLagP95Ms:baseline.dispatchLagP95Ms,
    fixed60DispatchLagP95Ms:pilot.dispatchLagP95Ms,
    baselineObserverGapP95Ms:baseline.frameGapP95Ms,
    fixed60ObserverGapP95Ms:pilot.frameGapP95Ms,
    observerGapP95DeltaMs:pilot.frameGapP95Ms-baseline.frameGapP95Ms,
    baselineUpdatePlusRenderP95Ms:baseline.updatePlusRenderP95Ms,
    fixed60UpdatePlusRenderP95Ms:pilot.updatePlusRenderP95Ms,
    baselineMeasuredWorkFraction:(baseline.updateWorkMs+baseline.renderWorkMs)/baseline.wallMs,
    baselineBulletVfxRate:baseline.bulletVfxCallsPerBulletSecond,
    fixed60BulletVfxRate:pilot.bulletVfxCallsPerBulletSecond,
    bulletVfxRateDelta:pilot.bulletVfxCallsPerBulletSecond-baseline.bulletVfxCallsPerBulletSecond,
    fixed60MeasuredWorkFraction:(pilot.updateWorkMs+pilot.renderWorkMs)/pilot.wallMs,
    baselineRenderGapP95Ms:baseline.renderGapP95Ms,
    fixed60RenderGapP95Ms:pilot.renderGapP95Ms,
    renderGapP95DeltaMs:pilot.renderGapP95Ms-baseline.renderGapP95Ms,
    simulatedTimeRatioDelta:pilot.simulatedTimeRatio-baseline.simulatedTimeRatio,
    projectilesPerSimSecondDelta:pilot.projectilesPerSimSecond-baseline.projectilesPerSimSecond});
  }
  assert.equal(paired.length,12,'all counterbalanced layout/clarity/load pairs must be reported');
  for(const pair of paired)for(const [key,value] of Object.entries(pair)){
   if(key==='layout')continue;
   assert.ok(typeof value==='number'&&Number.isFinite(value),
    'paired combat comparison must not silently serialize invalid '+key);
  }
  // A scheduler A/B alone cannot answer whether the existing Render clarity
  // control recovers smoothness. Report the within-scheduler clarity effect
  // for each paired Battlefield and CPU load without claiming causality.
  const clarityPairs=[];
  for(const repeat of [0,1])for(const fixed60 of [false,true])for(const throttle of [1,3,6]){
   const hi=observations.find(x=>x.repeat===repeat&&x.fixed60===fixed60&&x.throttle===throttle&&x.renderScale===100);
   const lo=observations.find(x=>x.repeat===repeat&&x.fixed60===fixed60&&x.throttle===throttle&&x.renderScale===67);
   assert.ok(hi&&lo&&hi.layout===lo.layout,
    'Render clarity comparisons must use paired Battlefield layouts');
   clarityPairs.push({repeat,fixed60,throttle,layout:hi.layout,
    highPresentationFps:hi.presentationFps,lowPresentationFps:lo.presentationFps,
    presentationFpsDelta:lo.presentationFps-hi.presentationFps,
    highRenderGapP95Ms:hi.renderGapP95Ms,lowRenderGapP95Ms:lo.renderGapP95Ms,
    renderGapP95DeltaMs:lo.renderGapP95Ms-hi.renderGapP95Ms,
    highSimulatedTimeRatio:hi.simulatedTimeRatio,lowSimulatedTimeRatio:lo.simulatedTimeRatio,
    highProjectileRate:hi.projectilesPerSimSecond,lowProjectileRate:lo.projectilesPerSimSecond,
    highUpdateWorkFraction:hi.updateWorkMs/hi.wallMs,
    lowUpdateWorkFraction:lo.updateWorkMs/lo.wallMs,
    highRenderWorkFraction:hi.renderWorkMs/hi.wallMs,
    lowRenderWorkFraction:lo.renderWorkMs/lo.wallMs});
  }
  assert.equal(clarityPairs.length,12,'every scheduler/layout/load clarity pair must be reported');
  for(const pair of clarityPairs)for(const [key,value] of Object.entries(pair)){
   if(key==='layout'||key==='fixed60')continue;
   assert.ok(typeof value==='number'&&Number.isFinite(value),
    'clarity comparison must not silently serialize invalid '+key);
  }
  console.log('NOVA_FIXED60_COMBAT_CLARITY '+JSON.stringify(clarityPairs));
  console.log('NOVA_FIXED60_COMBAT_PAIRED '+JSON.stringify(paired));
  console.log('NOVA_FIXED60_COMBAT_COMPARISON '+JSON.stringify(summaries));
  console.log('NOVA_FIXED60_SUSTAINED_COMBAT '+JSON.stringify(observations));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
