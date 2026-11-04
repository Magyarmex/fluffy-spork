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
  // Counterbalance scheduler and CPU-load order. The 6x stress phase is
  // intended to expose sub-60Hz presentation if the runner is fast enough;
  // actual measured FPS, not the throttle multiplier, determines that.
  // This remains a synthetic proxy, not a physical-device release gate.
  for(const repeat of [0,1])for(const fixed60 of (repeat?[true,false]:[false,true])){
   const context=await browser.newContext({viewport:{width:800,height:600}});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   const cdp=await context.newCDPSession(page);
   try{
    await page.goto(origin+(fixed60?'?nova_fixed60=pilot':''),{waitUntil:'domcontentloaded',timeout:45000});
    const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:20000});
    await page.evaluate(seed=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
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
      bulletWorkMs:0,collisionWorkMs:0,
      frameGaps:[],lastFrame:null,frames:0,active:true,
      renderGaps:[],lastRender:null,stepsPerRender:[],lastRenderUpdates:null,
      updateCostSamples:[],renderCostSamples:[]
     };
     const update=g.update,fire=g.tryFire;
     const updateBullets=g.updateBullets,collisions=g.resolveBulletCollisions;
     assert.equal(typeof updateBullets,'function');
     assert.equal(typeof collisions,'function');
     g.updateBullets=function(...args){
      const t=performance.now();
      try{return updateBullets.apply(this,args)}
      finally{m.bulletWorkMs+=performance.now()-t}
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
      m.lastFrame=null;
     });
     const before=await page.evaluate(()=>{
      const m=window.__novaCombatBench,g=window.__novaCombatBenchGame;
      return {updates:m.updates,simMs:m.simMs,work:m.updateWorkMs,
       renders:m.renders,renderWork:m.renderWorkMs,
       minimaps:m.minimaps,minimapWork:m.minimapWorkMs,
       projectiles:m.projectiles,fireCalls:m.fireCalls,frames:m.frames,
       bulletWorkMs:m.bulletWorkMs,collisionWorkMs:m.collisionWorkMs,
       gaps:m.frameGaps.length,renderGaps:m.renderGaps.length,
       stepsPerRender:m.stepsPerRender.length,
       updateCosts:m.updateCostSamples.length,renderCosts:m.renderCostSamples.length,
       ticks:g.__novaFixed60Pilot?.owner.ticks||0,
       droppedMs:g.__novaFixed60Pilot?.owner.droppedMs||0};
     });
     const wallStart=Date.now();
     await page.waitForTimeout(3000);
     const wallMs=Date.now()-wallStart;
     const after=await page.evaluate(({gapStart,renderGapStart,stepsStart,updateCostStart,renderCostStart})=>{
      const m=window.__novaCombatBench,g=window.__novaCombatBenchGame;
      return {updates:m.updates,simMs:m.simMs,work:m.updateWorkMs,
       renders:m.renders,renderWork:m.renderWorkMs,
       minimaps:m.minimaps,minimapWork:m.minimapWorkMs,
       projectiles:m.projectiles,fireCalls:m.fireCalls,frames:m.frames,
       bulletWorkMs:m.bulletWorkMs,collisionWorkMs:m.collisionWorkMs,
       gaps:m.frameGaps.length,ticks:g.__novaFixed60Pilot?.owner.ticks||0,
       droppedMs:g.__novaFixed60Pilot?.owner.droppedMs||0,
       frameGaps:m.frameGaps.slice(gapStart),
       renderGaps:m.renderGaps.slice(renderGapStart),
       stepsPerRender:m.stepsPerRender.slice(stepsStart),
       updateCostSamples:m.updateCostSamples.slice(updateCostStart),
       renderCostSamples:m.renderCostSamples.slice(renderCostStart),
       heat:g.player?.__v17Heat||0,
       alive:g.player?.hp>0,playerClass:g.player?.cls,
       entityCounts:{tanks:g.tanks?.length||0,drones:g.drones?.length||0,
        bullets:g.bullets?.length||0,shapes:g.shapes?.length||0},
       layout:g.__novaBattlefield?.name||null};
     },{gapStart:before.gaps,renderGapStart:before.renderGaps,
       stepsStart:before.stepsPerRender,
       updateCostStart:before.updateCosts,renderCostStart:before.renderCosts});
     const delta=(k)=>after[k]-before[k];
     const gaps=after.frameGaps;
     const sorted=gaps.slice().sort((a,b)=>a-b);
     const p95=sorted.length?sorted[Math.ceil(.95*sorted.length)-1]:null;
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
     const simulatedMs=delta('simMs');
     const updates=delta('updates'),renders=delta('renders'),frames=delta('frames');
     const updateWorkMs=delta('work'),renderWorkMs=delta('renderWork');
     const projectiles=delta('projectiles');
     // Game render throughput is the presentation metric; the independent
     // RAF observer is only a browser scheduling diagnostic.
     // Normalize to simulated game time. Raw projectile totals are misleading
     // when the world has different heat, targets, or startup histories.
     const result={repeat,fixed60,throttle,wallMs,updates,simulatedMs,updateWorkMs,
      renders,renderWorkMs,bulletWorkMs:delta('bulletWorkMs'),
      collisionWorkMs:delta('collisionWorkMs'),minimaps:delta('minimaps'),
      minimapWorkMs:delta('minimapWork'),projectiles,
      fireCalls:delta('fireCalls'),frames,frameGapP95Ms:p95,
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
      renderPerUpdate:renders/updates,
      updateCostMs:updateWorkMs/updates,
      updateCostP95Ms,renderCostP95Ms,
      renderCostMs:renderWorkMs/renders,
      projectilesPerSimSecond:projectiles*1000/simulatedMs,
      heat:after.heat,alive:after.alive,playerClass:after.playerClass,
      entityCounts:after.entityCounts,layout:after.layout,droppedMs:delta('droppedMs'),ticks:delta('ticks')};
     console.log('NOVA_FIXED60_COMBAT_PHASE '+JSON.stringify(result));
     assert.ok(result.updates>0 && result.simulatedMs>0 && result.renders>0 &&
      Number.isFinite(result.updateWorkMs) && Number.isFinite(result.renderWorkMs) &&
      Number.isFinite(result.updateCostP95Ms) && Number.isFinite(result.renderCostP95Ms) &&
      Number.isFinite(result.bulletWorkMs) && Number.isFinite(result.collisionWorkMs) &&
      result.renderGapSamples>0 && Number.isFinite(result.renderGapP95Ms) &&
      Number.isFinite(result.stepsPerRenderP95),
      'real composed combat and renderer must advance');
     assert.equal(result.playerClass,'tempest','real combat must use Tempest');
     assert.equal(result.alive,true,'player death must not censor a sustained combat trial');
     assert.ok(result.fireCalls>0 && result.projectiles>0,
      'Tempest must spawn actual projectiles in composed browser Game');
     if(fixed60)assert.equal(await page.evaluate(()=>window.__novaCombatBenchGame.raf||0),0,
      'fixed60 must never coexist with production RAF');
     observations.push(result);
    }
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    await page.evaluate(()=>{
     window.__novaCombatBench.active=false;
     window.__novaCombatBenchGame.destroy();
    });
    assert.deepEqual(errors,[],'combat browser errors: '+errors.join('; '));
   }finally{
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});
    await context.close();
   }
  }
  assert.equal(observations.length,12,'two counterbalanced passes across two schedulers and three CPU loads');
  for(const fixed60 of [false,true])for(const throttle of [1,3,6])
   assert.equal(observations.filter(x=>x.fixed60===fixed60&&x.throttle===throttle).length,2,
    'each scheduler/load pair must have independent replicates');
  // Layouts are paired within each repeat, but entity spawns, AI decisions,
  // and combat histories remain independent. This is not deterministic A/B.
  for(const repeat of [0,1]){
   const worlds=observations.filter(x=>x.repeat===repeat);
   assert.ok(worlds.every(x=>typeof x.layout==='string'&&x.layout.length>0),
    'paired browser worlds must expose a real Battlefield layout');
   assert.equal(new Set(worlds.map(x=>x.layout)).size,1,
    'scheduler comparisons within a repeat must share Battlefield layout');
  }
  // Chromium CPU throttling is not a physical Android acceptance gate.
  const summaries=[];
  for(const throttle of [1,3,6]){
   const baseline=observations.filter(x=>!x.fixed60&&x.throttle===throttle);
   const pilot=observations.filter(x=>x.fixed60&&x.throttle===throttle);
   const mean=(xs,key)=>xs.reduce((sum,x)=>sum+x[key],0)/xs.length;
   const baseFps=mean(baseline,'presentationFps');
   const pilotFps=mean(pilot,'presentationFps');
   summaries.push({throttle,baselinePresentationFps:baseFps,
    fixed60PresentationFps:pilotFps,
    fixed60PresentationRatio:pilotFps/baseFps,
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
    baselineBulletWorkMs:mean(baseline,'bulletWorkMs'),
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
    baselineRenderPerUpdate:mean(baseline,'renderPerUpdate'),
    fixed60RenderPerUpdate:mean(pilot,'renderPerUpdate')});
  }
  console.log('NOVA_FIXED60_COMBAT_COMPARISON '+JSON.stringify(summaries));
  console.log('NOVA_FIXED60_SUSTAINED_COMBAT '+JSON.stringify(observations));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
