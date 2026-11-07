'use strict';
// Opt-in research only: real shipping Chromium Render clarity A/A/B.
// NOVA_TRAIL_CAUSAL=1 instead runs matched-start ordinary-glow A/A/B;
// default clarity measurements remain free of extra particle wrappers.
// Not a fixed60 test, matched-world comparison, Android benchmark, or input-latency gate.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {injectBattlefieldSeed}=require('../research/battlefield-layout-fixture.cjs');
// Six-arm ABBA-like order limits linear run-order bias (mean index differs by 1/3 phase).
const trailMode=process.env.NOVA_TRAIL_CAUSAL==='1';
// Opt-in midpoint pilot: three observations per clarity setting, balanced
// across early/middle/late phases. The legacy A/A/B remains unchanged.
const midpointMode=process.env.NOVA_CLARITY_MIDPOINT==='1';
assert.ok(!(trailMode&&midpointMode),'run one research intervention at a time');
const midpointPhases=[100,80,65,65,80,100,80,65,100];
const phases=trailMode?[100,100,100,100,100,100]:
 midpointMode?midpointPhases:[100,65,65,100,65,100];
const viewports=trailMode?[{name:'desktop',width:1280,height:800}]:
 [{name:'desktop',width:1280,height:800},{name:'mobile',width:320,height:640}];
const pct=(xs,p)=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.ceil(s.length*p)-1];};
// Opt-in, bounded DevTools trace of one real composed combat phase.
// Chrome trace events are inclusive: category totals must not be added together.
async function stopTrace(cdp,outputPath){
 let timer;
 const completed=new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(new Error('DevTools trace completion timed out')),30000);
  cdp.once('Tracing.tracingComplete',event=>resolve(event.stream));
 });
 let stream;
 try{await cdp.send('Tracing.end');stream=await completed;}
 finally{clearTimeout(timer);}
 assert.ok(stream,'Chrome must provide a trace stream');
 const chunks=[];let totalBytes=0,eof=false;
 try{
  while(!eof){
   const part=await cdp.send('IO.read',{handle:stream,size:1048576});
   const chunk=Buffer.from(part.data,part.base64Encoded?'base64':'utf8');
   chunks.push(chunk);totalBytes+=chunk.length;
   assert.ok(totalBytes<32*1024*1024,'trace exceeds 32 MiB research cap');
   eof=!!part.eof;
  }
 }finally{await cdp.send('IO.close',{handle:stream});}
 // Decode once: a UTF-8 character can straddle adjacent IO.read chunks.
 const raw=Buffer.concat(chunks,totalBytes).toString('utf8');
 const trace=JSON.parse(raw);
 assert.ok(Array.isArray(trace.traceEvents)&&trace.traceEvents.length>0,
  'Chrome must return parseable trace events');
 fs.mkdirSync('artifacts/browser',{recursive:true});
 fs.writeFileSync(outputPath,raw);
 const interesting=/^(RunTask|Commit|FunctionCall|EvaluateScript|Paint|Layout|UpdateLayerTree|CompositeLayers|MinorGC|MajorGC|V8\.GC.*)$/;
 const rendererMainThreads=new Set(trace.traceEvents.filter(e=>
  e.ph==='M'&&e.name==='thread_name'&&e.args?.name==='CrRendererMain'
 ).map(e=>e.pid+':'+e.tid));
 assert.ok(rendererMainThreads.size>0,'trace must identify a Chromium renderer main thread');
 const byName={};
 for(const event of trace.traceEvents){
  if(event.ph!=='X'||!Number.isFinite(event.dur)||!interesting.test(event.name))continue;
  if(!rendererMainThreads.has(event.pid+':'+event.tid))continue;
  const entry=byName[event.name]||(byName[event.name]={count:0,inclusiveMs:0,maxMs:0});
  const ms=event.dur/1000;
  entry.count++;entry.inclusiveMs+=ms;entry.maxMs=Math.max(entry.maxMs,ms);
  if(event.name==='Commit')(entry.commitDurationsMs||(entry.commitDurationsMs=[])).push(ms);
 }
 if(byName.Commit?.commitDurationsMs){
  const values=byName.Commit.commitDurationsMs;
  byName.Commit.medianMs=pct(values,.5);
  byName.Commit.p95Ms=pct(values,.95);
  delete byName.Commit.commitDurationsMs;
 }
 return {file:outputPath,events:trace.traceEvents.length,bytes:Buffer.byteLength(raw),
  rendererMainThreadCount:rendererMainThreads.size,inclusiveMainThreadEventCosts:byName,
  warning:'Inclusive main-thread trace event durations overlap; never sum categories as exclusive CPU time.'};
}
async function measure(browser,viewport,scale,index){
 const layoutFixture=process.env.NOVA_RESEARCH_LAYOUT_SEED==='1'||trailMode||midpointMode;
 const suppressOrdinaryTrails=trailMode&&[1,2,4].includes(index);
 const layoutSeed=0x12345678;
 const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},
  deviceScaleFactor:2,isMobile:viewport.name==='mobile',hasTouch:viewport.name==='mobile',
  ...(layoutFixture?{serviceWorkers:'block'}:{})});
 let layoutIntercepts=0;
 if(layoutFixture)await context.route('**/nova-updates/battlefield-v1.6.0.js',async route=>{
  const response=await route.fetch();
  assert.equal(response.status(),200,'research Battlefield overlay must load successfully');
  const patched=injectBattlefieldSeed(await response.text(),layoutSeed);
  layoutIntercepts++;
  await route.fulfill({response,body:patched});
 });
 await context.addInitScript(({scale,layoutFixture,trailMode,suppressOrdinaryTrails})=>{
  window.__novaTrailResearchMode=trailMode;
  window.__novaTrailResearchSuppress=suppressOrdinaryTrails;
  localStorage.setItem('novatanks_pilot_settings_v1',JSON.stringify({renderScale:scale}));
  if(layoutFixture){
   // Research-only deterministic global RNG for initial-world equivalence
   // testing. Do not infer identical subsequent combat from identical starts.
   let state=0x9e3779b9;
   window.__novaResearchResetRng=()=>{state=0x9e3779b9;};
   Math.random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;
    return (state>>>0)/4294967296;};
  }
 },{scale,layoutFixture,trailMode,suppressOrdinaryTrails});
 const page=await context.newPage(),errors=[];
 const cdp=await context.newCDPSession(page);
 const traceThisPhase=process.env.NOVA_CLARITY_TRACE==='1'&&viewport.name==='desktop'&&index<(midpointMode?3:2);
 let traceStarted=false;
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:3});
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
  await deploy.waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   // War Room constructs its own Game before DEPLOY and can advance global
   // RNG unpredictably. Reset at the real Game's first spawnPlayer entry,
   // before Battlefield and core player/neutral/AI initialization.
   if(window.__novaResearchResetRng){
    const oldSpawn=Game.prototype.spawnPlayer;
    Game.prototype.spawnPlayer=function(){
     if(!this.__novaResearchInitialSpawnSeeded){
      window.__novaResearchResetRng();
      this.__novaResearchInitialSpawnSeeded=true;
     }
     return oldSpawn.apply(this,arguments);
    };
   }
   const old=Game.prototype.update;
   Game.prototype.update=function(dt){
    if(!this.__novaDecorativeWorld){
     window.__novaClarityResearchGame=this;
     if(!this.__novaResearchInitialFingerprint){
      const compact=(arr,keys)=>(arr||[]).map(o=>keys.map(k=>o?.[k]??null));
      const snapshot=JSON.stringify({
       battlefield:this.__novaBattlefield?.seed??null,
       player:this.player&&[this.player.x,this.player.y,this.player.cls],
       tanks:compact(this.tanks,['id','x','y','cls','hp']),
       shapes:compact(this.shapes,['id','x','y','type','hp']),
       terrain:compact(this.__novaTerrain,['id','x','y','w','h','r','type','hp','solid'])
      });
      let hash=2166136261;
      for(let i=0;i<snapshot.length;i++){
       hash^=snapshot.charCodeAt(i);hash=Math.imul(hash,16777619);
      }
      this.__novaResearchInitialFingerprint=(hash>>>0).toString(16).padStart(8,'0')+
       ':'+snapshot.length;
     }
    }
    return old.apply(this,arguments);
   };
  });
  await deploy.click();
  await page.waitForFunction(()=>window.__novaClarityResearchGame?.status==='playing',{timeout:30000});
  // Start tracing only after the game's warmup, at the exact beginning of
  // the measured RAF window. Earlier traces included warmup and could not be
  // compared directly with the four-second simulation/long-task counters.
  if(traceThisPhase)await page.exposeFunction('__novaResearchBeginMeasuredTrace',async()=>{
   assert.equal(traceStarted,false,'trace must begin exactly once per phase');
   await cdp.send('Tracing.start',{transferMode:'ReturnAsStream',
    categories:'devtools.timeline,blink.user_timing,v8,disabled-by-default-devtools.timeline'});
   traceStarted=true;
  });
  const data=await page.evaluate(async()=>{
   const trailMode=window.__novaTrailResearchMode===true;
   const suppressOrdinaryTrails=window.__novaTrailResearchSuppress===true;
   const g=window.__novaClarityResearchGame;
   // Same legal Tempest build and held aim/firing intent in each independent
   // game. These are still NOT matched physical worlds or player trajectories.
   g.setClass(g.player,'tempest');
   g.player.stats.reload=8;
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   g.input.firing=true;g.input.autofire=false;
   // Causal intervention only during the measured window: all arms have
   // identical ordinary-trail warmup. Preserve cosmetic RNG chronology.
   let trailSampling=false,trailStage=false,ordinaryOpportunities=0,ordinarySuppressed=0;
   if(trailMode){
   const originalBulletUpdate=g.updateBullets;
   g.updateBullets=function(){const prior=trailStage;trailStage=true;
    try{return originalBulletUpdate.apply(this,arguments);}finally{trailStage=prior;}};
   const originalParticles=g.addParticles;
   g.addParticles=function(x,y,color,n,speed,kind){
    if(trailSampling&&trailStage&&n===1&&speed===20&&kind==='glow'){
     ordinaryOpportunities++;
     if(suppressOrdinaryTrails){ordinarySuppressed++;
      for(let k=0;k<4;k++)this.cosmeticRandom();return;}
    }
    return originalParticles.apply(this,arguments);
   };
   }
   // Measure the final composed methods, outside all previously installed
   // gameplay/visual wrappers. NovaPerf measures earlier inner layers.
   // This is opt-in research instrumentation, never a production hook.
   const outer={update:[],render:[],minimap:[]};
   let sampling=false;
   const originalUpdate=g.update;
   g.update=function(){
    const started=performance.now();
    try{return originalUpdate.apply(this,arguments);}
    finally{if(sampling)outer.update.push(performance.now()-started);}
   };
   const renderModule=window.__novaMakeRequire('')('game/render');
   const originalRender=renderModule.render;
   renderModule.render=function(){
    const started=performance.now();
    try{return originalRender.apply(this,arguments);}
    finally{if(sampling&&arguments[0]===g)outer.render.push(performance.now()-started);}
   };
   // The shipping RAF draws the minimap after render.render(), outside
   // both the old NovaPerf renderer wrapper and the final renderer method.
   const originalMinimap=g.drawMinimap;
   g.drawMinimap=function(){
    const started=performance.now();
    try{return originalMinimap.apply(this,arguments);}
    finally{if(sampling)outer.minimap.push(performance.now()-started);}
   };
   // Distinguish successful firing invocations (volleys) from projectile
   // payload. A multi-projectile volley is one firing decision, not N.
   let shots=0,volleys=0;
   const oldFire=g.tryFire;
   g.tryFire=function(t){
    const before=this.bullets.length,out=oldFire.apply(this,arguments);
    const added=t===this.player?Math.max(0,this.bullets.length-before):0;
    if(added>0){shots+=added;volleys++;}
    return out;
   };
   // Fresh game per arm: no settings menu, pause, or rolling perf history crossover.
   await new Promise(resolve=>setTimeout(resolve,1800));
   if(window.__novaResearchBeginMeasuredTrace)
    await window.__novaResearchBeginMeasuredTrace();
   const begin=performance.now(),gameTime=g.time,shotsAtBegin=shots,
    volleysAtBegin=volleys,heatAtBegin=Number.isFinite(g.player?.__v17Heat)?g.player.__v17Heat:null,gaps=[];
   sampling=true;trailSampling=true;
   const interruptions=[],longTasks=[];
   // Low-cost exposure counters distinguish clarity effects from different
   // independently evolving combat populations; not matched-world proof.
   const entities={samples:0,bullets:0,tanks:0,drones:0,shapes:0,peakBullets:0};
   const visibilityChanged=()=>interruptions.push({atMs:performance.now()-begin,hidden:document.hidden,reason:'visibilitychange'});
   document.addEventListener('visibilitychange',visibilityChanged);
   const longTaskSupported=PerformanceObserver.supportedEntryTypes?.includes('longtask')===true;
   let observer=null;
   if(longTaskSupported){
    observer=new PerformanceObserver(list=>{
     for(const entry of list.getEntries())longTasks.push({
      startMs:entry.startTime-begin,durationMs:entry.duration});
    });
    observer.observe({type:'longtask'});
   }
   try{
    await new Promise(resolve=>{
     let prior=null;
     function frame(ts){
      if(prior!==null)gaps.push(ts-prior);
      prior=ts;
      entities.samples++;
      const bullets=g.bullets?.length||0;
      entities.bullets+=bullets;
      entities.tanks+=g.tanks?.length||0;
      entities.drones+=g.drones?.length||0;
      entities.shapes+=g.shapes?.length||0;
      if(bullets>entities.peakBullets)entities.peakBullets=bullets;
      if(document.hidden||g.status!=='playing'||g.paused)
       interruptions.push({atMs:ts-begin,hidden:document.hidden,status:g.status,paused:!!g.paused});
      if(ts-begin<4200)requestAnimationFrame(frame);else resolve();
     }
     requestAnimationFrame(frame);
    });
   }finally{sampling=false;trailSampling=false;observer?.disconnect();document.removeEventListener('visibilitychange',visibilityChanged);}
   const end=performance.now();
   const longTaskInWindow=longTasks.map(t=>({
    startMs:Math.max(0,t.startMs),
    durationMs:Math.max(0,Math.min(end-begin,t.startMs+t.durationMs)-Math.max(0,t.startMs))
   })).filter(t=>t.durationMs>0);
   return {scale:JSON.parse(localStorage.getItem('novatanks_pilot_settings_v1')).renderScale,
    quality:g.quality,dpr:g.dpr,css:[g.w,g.h],backing:[g.canvas.width,g.canvas.height],
    battlefieldSeed:g.__novaBattlefield?.seed??null,battlefieldName:g.__novaBattlefield?.name??null,
    initialFingerprint:g.__novaResearchInitialFingerprint??null,
    gameSeconds:g.time-gameTime,wallMs:end-begin,shots:shots-shotsAtBegin,warmupShots:shotsAtBegin,
    volleys:volleys-volleysAtBegin,warmupVolleys:volleysAtBegin,
    heatAtBegin,heatAtEnd:Number.isFinite(g.player?.__v17Heat)?g.player.__v17Heat:null,
    gaps,interruptions,longTaskSupported,longTasks:longTaskInWindow,entities,
    ordinaryOpportunities,ordinarySuppressed,
    outer,perf:window.NovaPerf?.snapshot(g)||null,status:g.status};
  });
  if(trailMode){
   assert.ok(data.ordinaryOpportunities>0,'actual combat must emit ordinary trails');
   assert.equal(data.ordinarySuppressed,suppressOrdinaryTrails?data.ordinaryOpportunities:0,
    'causal intervention must suppress exactly the sampled ordinary trails');
  }
  if(layoutFixture)assert.equal(layoutIntercepts,1,'research must intercept exactly one shipping Battlefield overlay');
  if(traceThisPhase)assert.equal(traceStarted,true,'measured trace must have started after warmup');
  const trace=traceStarted?await stopTrace(cdp,`artifacts/browser/render-clarity-combat-trace-${scale}-phase-${index}.json`):null;
  traceStarted=false;
  assert.equal(data.scale,scale);
  if(layoutFixture){
   assert.equal(data.battlefieldSeed,layoutSeed,'research layout fixture must reach the composed game');
   assert.match(data.initialFingerprint,/^[0-9a-f]{8}:[0-9]+$/,'initial-world fingerprint must be captured');
  }
  // Very slow but active frames are the phenomenon under investigation.
  // Do not censor a 5-FPS phase just because it yields fewer than 21 gaps;
  // preserve low-sample percentile uncertainty explicitly instead.
  assert.ok(data.wallMs>=4000&&data.gaps.length>=8,
   'must observe a full active foreground interval with multiple RAF samples');
  assert.ok(data.backing.every(x=>Number.isFinite(x)&&x>0));
  assert.equal(data.status,'playing','must measure active gameplay, not menu');
  assert.equal(data.interruptions.length,0,'hidden/paused frames invalidate active combat comparison');
  assert.ok(data.shots>0&&data.volleys>0&&data.shots>=data.volleys,
   'must observe successful Tempest volleys and their projectile payload');
  assert.equal(errors.length,0,'page errors: '+errors.join('; '));
  assert.ok(data.outer.update.length>0&&data.outer.render.length>0,
   'final composed update/render must both execute during active capture');
  const total=data.gaps.reduce((a,b)=>a+b,0);
  const longTaskMs=data.longTasks.reduce((sum,t)=>sum+t.durationMs,0);
  // RAF timestamps and performance.now() are not identical sampling points;
  // preserve small positive lead explicitly instead of reporting >100% coverage.
  const observedRafMs=total,unobservedWallMs=Math.max(0,data.wallMs-observedRafMs);
  const rafTimestampLeadMs=Math.max(0,observedRafMs-data.wallMs);
  return {viewport:viewport.name,index,scale,cpuThrottle:3,quality:data.quality,dpr:data.dpr,
   trailCausal:trailMode,ordinarySuppressed:data.ordinarySuppressed,
   ordinaryOpportunities:data.ordinaryOpportunities,
   layoutFixture,layoutSeed:data.battlefieldSeed,battlefieldName:data.battlefieldName,
   initialFingerprint:data.initialFingerprint,
   css:data.css,backing:data.backing,frames:data.gaps.length,
   fps:1000*data.gaps.length/total,percentileSampleAdequate:data.gaps.length>=30,
   p50GapMs:pct(data.gaps,.5),
   p95GapMs:pct(data.gaps,.95),p99GapMs:pct(data.gaps,.99),
   gameSeconds:data.gameSeconds,wallMs:data.wallMs,observedRafMs,unobservedWallMs,
   rafCoveragePct:Math.min(100,100*observedRafMs/data.wallMs),rafTimestampLeadMs,
   simulationPace:data.gameSeconds/(data.wallMs/1000),
   stallFramesOver250Ms:data.gaps.filter(ms=>ms>250).length,
   maxFrameGapMs:Math.max(...data.gaps),
   longTaskSupported:data.longTaskSupported,longTaskCount:data.longTasks.length,
   longTaskTotalMs:longTaskMs,longTaskP95Ms:data.longTasks.length?pct(data.longTasks.map(t=>t.durationMs),.95):null,
   shots:data.shots,warmupShots:data.warmupShots,
   volleys:data.volleys,warmupVolleys:data.warmupVolleys,
   heatAtBegin:data.heatAtBegin,heatAtEnd:data.heatAtEnd,
   meanEntities:Object.fromEntries(['bullets','tanks','drones','shapes'].map(key=>
    [key,data.entities[key]/data.entities.samples])),
   peakBullets:data.entities.peakBullets,
   trace,
   outerCost:Object.fromEntries(['update','render','minimap'].map(key=>{
    const samples=data.outer[key];
    return [key,{calls:samples.length,meanMs:samples.length?samples.reduce((a,b)=>a+b,0)/samples.length:null,
     p95Ms:samples.length?pct(samples,.95):null,
     p99Ms:samples.length?pct(samples,.99):null,
     maxMs:samples.length?Math.max(...samples):null}];
   })),perf:data.perf};
 }finally{
  if(traceStarted){try{await cdp.send('Tracing.end');}catch{ /* preserve original failure */ }}
  await context.close();
 }
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 try{
  const records=[];
  for(const viewport of viewports)for(let i=0;i<phases.length;i++){
   // Reverse arms for the second viewport to balance overall time/order exposure.
   const scale=viewport.name==='mobile'?(phases[i]===100?65:phases[i]===65?100:80):phases[i];
   const result=await measure(browser,viewport,scale,i);
   records.push(result);
   console.log((trailMode?'NOVA_TRAIL_CAUSAL_PHASE ':'NOVA_CLARITY_PHASE ')+JSON.stringify(result));
  }
  const fingerprints=records.filter(r=>r.layoutFixture).map(r=>r.initialFingerprint);
  const matchedInitialWorlds=fingerprints.length===records.length&&
   new Set(fingerprints).size===1;
  if(trailMode||midpointMode)assert.equal(matchedInitialWorlds,true,
   'seeded research arms require the same selected initial physical world');
  // Descriptive summaries are not causal estimates: preserve all individual
  // phase records, including outliers, for order/drift and exposure review.
  const midpointSummary=midpointMode?Object.fromEntries(viewports.map(v=>[
   v.name,Object.fromEntries([65,80,100].map(scale=>{
    const group=records.filter(r=>r.viewport===v.name&&r.scale===scale);
    assert.equal(group.length,3,'midpoint pilot needs three real phases per arm');
    const fps=group.map(r=>r.fps),pace=group.map(r=>r.simulationPace);
    return [scale,{n:group.length,medianFps:pct(fps,.5),
     minFps:Math.min(...fps),maxFps:Math.max(...fps),
     medianSimulationPace:pct(pace,.5),
     medianP95GapMs:pct(group.map(r=>r.p95GapMs),.5),
     backingPixels:group.map(r=>r.backing[0]*r.backing[1])}];
   }))
  ])):null;
  const evidence={researchOnly:true,trailCausal:trailMode,midpointMode,
   phaseOrder:phases,midpointSummary,commit:process.env.GITHUB_SHA||null,
   matchedInitialWorlds,distinctInitialWorlds:new Set(fingerprints).size,
   caveats:['independent worlds not matched even with identical Battlefield layouts',
    ...(midpointMode?['80% clarity is a research arm, not an adaptive-resolution controller',
     'nine phases per viewport do not eliminate time drift or establish physical-device readability',
     'matched initial fingerprint does not imply matched state after warmup']:[]),
    ...(trailMode?['ordinary trail suppression is measurement-window only and burns four cosmetic draws',
     'A/A/B browser arms may diverge after identical initial fingerprints due to scheduling',
     'no claim of causal FPS benefit until A/A variance and physical exposure are compared']:[]),
    'layout fixture resets the RNG at the first post-hook Game spawn; later gameplay can diverge with frame scheduling',
    'initial-world fingerprint covers selected public physical fields, not complete mutable state',
    'shots counts synchronous projectile-array growth; volleys counts successful player tryFire invocations, not hits or damage',
    'heat snapshots are descriptive, not matched-tick heat parity',
    'fixture mode blocks service workers so route interception cannot be bypassed',
    'not fixed60','not physical Android',
    'no human touch latency','CI hardware is not a phone','3x synthetic CPU throttle is not GPU throttling',
    'NovaPerf rolling windows can include warmup on slow frames',
    'RAF percentiles from fewer than 30 intervals are descriptive only',
    'outermost JS method durations are inclusive and do not measure GPU completion or input-to-photon',
    'minimap drawing occurs outside update/render in the shipping RAF; background browser tasks remain unaccounted',
    'Long Tasks API may be unsupported or miss tasks below its threshold',
    'RAF timestamps and PerformanceObserver are browser-clock observations, not input-to-photon latency',
    'opt-in DevTools trace begins after warmup and ends after measured RAF completion; trailing CDP turnaround may remain',
    'opt-in DevTools trace event durations overlap and are not exclusive CPU attribution'],records};
  fs.mkdirSync('artifacts/browser',{recursive:true});
  fs.writeFileSync(trailMode?'artifacts/browser/trail-causal-research.json':
   'artifacts/browser/render-clarity-research.json',
   JSON.stringify(evidence,null,2)+'\n');
  console.log((trailMode?'NOVA_TRAIL_CAUSAL_RESEARCH ':'NOVA_CLARITY_RESEARCH ')+JSON.stringify(evidence));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
