'use strict';
// Opt-in research only: real shipping Chromium Render clarity A/A/B.
// Not a fixed60 test, matched-world comparison, Android benchmark, or input-latency gate.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
// Six-arm ABBA-like order limits linear run-order bias (mean index differs by 1/3 phase).
const phases=[100,65,65,100,65,100];
const viewports=[{name:'desktop',width:1280,height:800},{name:'mobile',width:320,height:640}];
const pct=(xs,p)=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.ceil(s.length*p)-1];};
async function measure(browser,viewport,scale,index){
 const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},
  deviceScaleFactor:2,isMobile:viewport.name==='mobile',hasTouch:viewport.name==='mobile'});
 await context.addInitScript(v=>{
  localStorage.setItem('novatanks_pilot_settings_v1',JSON.stringify({renderScale:v}));
 },scale);
 const page=await context.newPage(),errors=[];
 const cdp=await context.newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:3});
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
  await deploy.waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const old=Game.prototype.update;
   Game.prototype.update=function(dt){
    if(!this.__novaDecorativeWorld)window.__novaClarityResearchGame=this;
    return old.apply(this,arguments);
   };
  });
  await deploy.click();
  await page.waitForFunction(()=>window.__novaClarityResearchGame?.status==='playing',{timeout:30000});
  const data=await page.evaluate(async()=>{
   const g=window.__novaClarityResearchGame;
   // Same legal Tempest build and held aim/firing intent in each independent
   // game. These are still NOT matched physical worlds or player trajectories.
   g.setClass(g.player,'tempest');
   g.player.stats.reload=8;
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   g.input.firing=true;g.input.autofire=false;
   let shots=0;
   const oldFire=g.tryFire;
   g.tryFire=function(t){
    const before=this.bullets.length,out=oldFire.apply(this,arguments);
    if(t===this.player&&this.bullets.length>before)shots+=this.bullets.length-before;
    return out;
   };
   // Fresh game per arm: no settings menu, pause, or rolling perf history crossover.
   await new Promise(resolve=>setTimeout(resolve,1800));
   const begin=performance.now(),gameTime=g.time,shotsAtBegin=shots,gaps=[];
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
      for(const key of ['bullets','tanks','drones','shapes'])
       entities[key]+=Array.isArray(g[key])?g[key].length:0;
      entities.peakBullets=Math.max(entities.peakBullets,g.bullets?.length||0);
      if(document.hidden||g.status!=='playing'||g.paused)
       interruptions.push({atMs:ts-begin,hidden:document.hidden,status:g.status,paused:!!g.paused});
      if(ts-begin<4200)requestAnimationFrame(frame);else resolve();
     }
     requestAnimationFrame(frame);
    });
   }finally{observer?.disconnect();document.removeEventListener('visibilitychange',visibilityChanged);}
   const end=performance.now();
   const longTaskInWindow=longTasks.map(t=>({
    startMs:Math.max(0,t.startMs),
    durationMs:Math.max(0,Math.min(end-begin,t.startMs+t.durationMs)-Math.max(0,t.startMs))
   })).filter(t=>t.durationMs>0);
   return {scale:JSON.parse(localStorage.getItem('novatanks_pilot_settings_v1')).renderScale,
    quality:g.quality,dpr:g.dpr,css:[g.w,g.h],backing:[g.canvas.width,g.canvas.height],
    gameSeconds:g.time-gameTime,wallMs:end-begin,shots:shots-shotsAtBegin,warmupShots:shotsAtBegin,
    gaps,interruptions,longTaskSupported,longTasks:longTaskInWindow,entities,
    perf:window.NovaPerf?.snapshot(g)||null,status:g.status};
  });
  assert.equal(data.scale,scale);
  assert.ok(data.gaps.length>20,'real foreground RAF intervals required');
  assert.ok(data.backing.every(x=>Number.isFinite(x)&&x>0));
  assert.equal(data.status,'playing','must measure active gameplay, not menu');
  assert.equal(data.interruptions.length,0,'hidden/paused frames invalidate active combat comparison');
  assert.ok(data.shots>0,'must exercise actual Tempest firing, not an idle scene');
  assert.equal(errors.length,0,'page errors: '+errors.join('; '));
  const total=data.gaps.reduce((a,b)=>a+b,0);
  const longTaskMs=data.longTasks.reduce((sum,t)=>sum+t.durationMs,0);
  const observedRafMs=total,unobservedWallMs=Math.max(0,data.wallMs-observedRafMs);
  return {viewport:viewport.name,index,scale,cpuThrottle:3,quality:data.quality,dpr:data.dpr,
   css:data.css,backing:data.backing,frames:data.gaps.length,
   fps:1000*data.gaps.length/total,p50GapMs:pct(data.gaps,.5),
   p95GapMs:pct(data.gaps,.95),p99GapMs:pct(data.gaps,.99),
   gameSeconds:data.gameSeconds,wallMs:data.wallMs,observedRafMs,unobservedWallMs,
   rafCoveragePct:100*observedRafMs/data.wallMs,
   simulationPace:data.gameSeconds/(data.wallMs/1000),
   stallFramesOver250Ms:data.gaps.filter(ms=>ms>250).length,
   maxFrameGapMs:Math.max(...data.gaps),
   longTaskSupported:data.longTaskSupported,longTaskCount:data.longTasks.length,
   longTaskTotalMs:longTaskMs,longTaskP95Ms:data.longTasks.length?pct(data.longTasks.map(t=>t.durationMs),.95):null,
   shots:data.shots,warmupShots:data.warmupShots,
   meanEntities:Object.fromEntries(['bullets','tanks','drones','shapes'].map(key=>
    [key,data.entities[key]/data.entities.samples])),
   peakBullets:data.entities.peakBullets,perf:data.perf};
 }finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 try{
  const records=[];
  for(const viewport of viewports)for(let i=0;i<phases.length;i++){
   // Reverse arms for the second viewport to balance overall time/order exposure.
   const scale=viewport.name==='mobile'?(phases[i]===100?65:100):phases[i];
   const result=await measure(browser,viewport,scale,i);
   records.push(result);
   console.log('NOVA_CLARITY_PHASE '+JSON.stringify(result));
  }
  const evidence={researchOnly:true,commit:process.env.GITHUB_SHA||null,
   caveats:['independent worlds not matched','not fixed60','not physical Android',
    'no human touch latency','CI hardware is not a phone','3x synthetic CPU throttle is not GPU throttling',
    'NovaPerf rolling windows can include warmup on slow frames',
    'Long Tasks API may be unsupported or miss tasks below its threshold',
    'RAF timestamps and PerformanceObserver are browser-clock observations, not input-to-photon latency'],records};
  fs.mkdirSync('artifacts/browser',{recursive:true});
  fs.writeFileSync('artifacts/browser/render-clarity-research.json',
   JSON.stringify(evidence,null,2)+'\n');
  console.log('NOVA_CLARITY_RESEARCH '+JSON.stringify(evidence));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
