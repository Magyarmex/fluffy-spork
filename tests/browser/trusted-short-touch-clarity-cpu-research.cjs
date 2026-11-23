'use strict';
// #799: opt-in browser research, not a production feature or a physical-device test.
// Compare real composed-game trusted touch pulses under 100/80/65% render clarity.
// Distinguish event delivery, Input arming, Game.update sampling, projectile birth,
// and actual final renderer CPU cost. Never assert a particular FPS or loss rate.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {performance:clock}=require('node:perf_hooks');
const {injectBattlefieldSeed}=require('../research/battlefield-layout-fixture.cjs');
// Forward/reverse order is a drift check, not a matched-world causal estimate.
const renderControl=process.env.NOVA_TOUCH_RENDER_CONTROL==='1';
const scales=renderControl?[100,100,100,100]:[100,80,65,65,80,100];
const round=x=>x==null?null:+x.toFixed(2);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const results=[];
 try{
  for(let arm=0;arm<scales.length;arm++){
   const scale=scales[arm];
   const renderEnabled=!renderControl||arm===0||arm===3;
   const context=await browser.newContext({viewport:{width:320,height:700},
    deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
   let layoutIntercepts=0;
   await context.route('**/nova-updates/battlefield-v1.6.0.js',async route=>{
    const response=await route.fetch();
    assert.equal(response.status(),200,'canonical Battlefield overlay must load');
    layoutIntercepts++;
    await route.fulfill({response,body:injectBattlefieldSeed(await response.text(),0x12345678)});
   });
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e.stack||e)));
   const cdp=await context.newCDPSession(page);
   try{
    await context.addInitScript(value=>{
     localStorage.setItem('novatanks_pilot_settings_v1',JSON.stringify({renderScale:value}));
     let state=0x9e3779b9;
     window.__novaResearchResetRng=()=>{state=0x9e3779b9;};
     Math.random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;
      return (state>>>0)/4294967296;};
    },scale);
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:45000});
    await page.evaluate(suppressRender=>{
     const requireGame=window.__novaMakeRequire('');
     const Game=requireGame('game/engine').Game;
     const Input=requireGame('game/input').Input;
     const renderModule=requireGame('game/render');
     const oldSpawn=Game.prototype.spawnPlayer;
     Game.prototype.spawnPlayer=function(...args){
      if(!this.__novaResearchInitialSpawnSeeded){
       window.__novaResearchResetRng();
       this.__novaResearchInitialSpawnSeeded=true;
      }
      return oldSpawn.apply(this,args);
     };
     const originalAttach=Input.prototype.attach;
     window.__novaTouchClarity={trial:-1,suppressRender,events:[],edges:[],samples:[],births:[],
      renders:[],longTasks:[],game:null,updatesSinceRender:0,
      longTaskSupported:typeof PerformanceObserver!=='undefined'&&
       PerformanceObserver.supportedEntryTypes?.includes('longtask')===true};
     if(window.__novaTouchClarity.longTaskSupported){
      const observer=new PerformanceObserver(list=>{
       const w=window.__novaTouchClarity;
       for(const entry of list.getEntries())
        w.longTasks.push({at:entry.startTime,ms:entry.duration});
      });
      observer.observe({type:'longtask',buffered:false});
      window.__novaTouchClarity.longTaskObserver=observer;
     }
     Input.prototype.attach=function(canvas){
      const oldMove=this.pm,oldRelease=this.pu;
      this.pm=function(e){
       const result=oldMove.apply(this,arguments);
       if(e.pointerType==='touch'){
        const w=window.__novaTouchClarity;
        w.edges.push({trial:w.trial,type:'move',at:performance.now(),
         armed:!!this.firing&&!!this.aim.active&&Math.hypot(this.aim.dx,this.aim.dy)>=9});
       }
       return result;
      };
      this.pu=function(e){
       const result=oldRelease.apply(this,arguments);
       if(e.pointerType==='touch'){
        const w=window.__novaTouchClarity;
        w.edges.push({trial:w.trial,type:'release',at:performance.now(),
         armed:!!this.firing,active:!!this.aim.active});
       }
       return result;
      };
      return originalAttach.apply(this,arguments);
     };
     const oldUpdate=Game.prototype.update,oldFire=Game.prototype.tryFire;
     Game.prototype.update=function(...args){
      if(!this.__novaDecorativeWorld&&this.status==='playing'&&this.player){
       const w=window.__novaTouchClarity;w.game=this;
       w.updatesSinceRender++;
       if(!w.initialFingerprint){
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
        w.initialFingerprint=(hash>>>0).toString(16).padStart(8,'0')+':'+snapshot.length;
       }
       w.samples.push({trial:w.trial,at:performance.now(),
        held:!!this.input.firing&&!!this.input.aim.active&&
         Math.hypot(this.input.aim.dx,this.input.aim.dy)>=9,
        priorRafWorkMs:Number.isFinite(this.__novaRafWorkMs)?this.__novaRafWorkMs:null});
      }
      return oldUpdate.apply(this,args);
     };
     Game.prototype.tryFire=function(t,...args){
      const before=this.bullets.length,result=oldFire.call(this,t,...args);
      if(!this.__novaDecorativeWorld&&t===this.player&&this.bullets.length>before)
       window.__novaTouchClarity.births.push({trial:window.__novaTouchClarity.trial,
        at:performance.now(),count:this.bullets.length-before});
      return result;
     };
     const oldRender=renderModule.render;
     renderModule.render=function(g,...args){
      const start=performance.now();
      const executed=!window.__novaTouchClarity.suppressRender||g.__novaDecorativeWorld;
      try{if(executed)return oldRender.call(this,g,...args);}
      finally{
       if(!g.__novaDecorativeWorld&&g.status==='playing')
        window.__novaTouchClarity.renders.push({
         trial:window.__novaTouchClarity.trial,at:performance.now(),
         executed,ms:performance.now()-start,
         updates:window.__novaTouchClarity.updatesSinceRender});
       if(!g.__novaDecorativeWorld&&g.status==='playing')
        window.__novaTouchClarity.updatesSinceRender=0;
      }
     };
     for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
      document.addEventListener(type,e=>{
       if(e.pointerType!=='touch')return;
       const w=window.__novaTouchClarity;
       w.events.push({trial:w.trial,type,at:performance.now(),stamp:e.timeStamp,
        trusted:e.isTrusted});
      },{capture:true,passive:true});
    },!renderEnabled);
    await deploy.click();
    await page.waitForFunction(()=>window.__novaTouchClarity?.game?.status==='playing',
     null,{timeout:30000});
    const canvas=page.locator('canvas.absolute.inset-0');
    await canvas.waitFor({state:'visible',timeout:30000});
    await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
    const initial=await page.evaluate(()=>{
     const g=window.__novaTouchClarity.game;
     g.setClass(g.player,'scout');g.input.autofire=false;g.player.spawnShieldT=20;
     return {scale:JSON.parse(localStorage.getItem('novatanks_pilot_settings_v1')).renderScale,
      quality:g.quality,dpr:g.dpr,css:[g.w,g.h],backing:[g.canvas.width,g.canvas.height],
      battlefieldSeed:g.__novaBattlefield?.seed??null,
      initialFingerprint:window.__novaTouchClarity.initialFingerprint};
    });
    assert.equal(initial.scale,scale,'settings must preserve requested clarity');
    assert.equal(layoutIntercepts,1,'exactly one Battlefield overlay must be seeded');
    assert.equal(initial.battlefieldSeed,0x12345678,'seeded Battlefield must reach the real Game');
    assert.match(initial.initialFingerprint,/^[0-9a-f]{8}:[0-9]+$/);
    const rect=await canvas.boundingBox();
    assert.ok(rect&&rect.width>200&&rect.height>200);
    const origin={x:rect.x+rect.width*.72,y:rect.y+rect.height*.68,
     id:41,radiusX:1,radiusY:1,force:1};
    const moved={...origin,x:origin.x+Math.min(35,rect.width*.12),y:origin.y-30};
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    const trials=[];
    // Eight short CPU x4 pulses, one long CPU x4 control, then a long
    // CPU x1 positive control to certify the fixture itself can fire.
    for(let trial=0;trial<10;trial++){
     if(trial===9)await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
     await page.evaluate(i=>{
      const w=window.__novaTouchClarity,g=w.game;
      if(g.status!=='playing')throw Error('playable game ended during trial');
      w.trial=i;g.player.spawnShieldT=20;g.player.fireCd=0;
      g.input.autofire=false;
     },trial);
     const before=clock.now();
     const down=cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
     if(trial>=8){await down;await page.waitForTimeout(100);}
     const move=cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});
     await new Promise(resolve=>setTimeout(resolve,trial>=8?300:40));
     const releaseAt=clock.now();
     const up=cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await Promise.all([down,move,up]);
     await page.waitForTimeout(120);
     const result=await page.evaluate(i=>{
      const w=window.__novaTouchClarity,g=w.game;
      const events=w.events.filter(x=>x.trial===i);
      const edges=w.edges.filter(x=>x.trial===i);
      const samples=w.samples.filter(x=>x.trial===i);
      const births=w.births.filter(x=>x.trial===i);
      const renderFrames=w.renders.filter(x=>x.trial===i);
      const renders=renderFrames.map(x=>x.ms);
      const rafWork=samples.map(x=>x.priorRafWorkMs)
       .filter(x=>Number.isFinite(x)&&x>=0).sort((a,b)=>a-b);
      const deflection=events.find(x=>x.type==='pointermove');
      const released=events.find(x=>x.type==='pointerup'||x.type==='pointercancel');
      const next=deflection?samples.find(x=>x.at>=deflection.at):null;
      const longTasks=deflection&&released?w.longTasks.filter(x=>
       x.at<released.at+120&&x.at+x.ms>deflection.at-120):[];
      const nearTouchFrames=deflection&&released?renderFrames.filter(x=>
       x.at>=deflection.at-120&&x.at<=released.at+120):[];
      const nearTouchRaf=deflection&&released?samples.filter(x=>
       x.at>=deflection.at-120&&x.at<=released.at+120)
       .map(x=>x.priorRafWorkMs).filter(x=>Number.isFinite(x)&&x>=0)
       .sort((a,b)=>a-b):[];
      const updateGaps=samples.slice(1).map((x,j)=>x.at-samples[j].at)
       .filter(x=>Number.isFinite(x)&&x>0).sort((a,b)=>a-b);
      return {events,edges,samples:samples.length,heldSamples:samples.filter(x=>x.held).length,
       medianUpdateGapMs:updateGaps.length?updateGaps[Math.floor(updateGaps.length/2)]:null,
       maxUpdateGapMs:updateGaps.length?updateGaps.at(-1):null,
       births:births.length,postReleaseBirths:released?
        births.filter(x=>x.at>released.at).length:null,
       deliveredHoldMs:deflection&&released?released.at-deflection.at:null,
       stampedHoldMs:deflection&&released?released.stamp-deflection.stamp:null,
       moveEventAgeMs:deflection?deflection.at-deflection.stamp:null,
       moveToNextUpdateMs:deflection&&next?next.at-deflection.at:null,
       updateWithinHold:!!(deflection&&released&&next&&next.at<released.at),
       longTaskSupported:w.longTaskSupported,
       longTaskCount:longTasks.length,
       longTaskOverlapMs:deflection&&released?longTasks.reduce((n,x)=>n+
        Math.max(0,Math.min(x.at+x.ms,released.at+120)-
         Math.max(x.at,deflection.at-120)),0):0,
       maxLongTaskMs:longTasks.length?Math.max(...longTasks.map(x=>x.ms)):0,
       medianPriorRafWorkMs:rafWork.length?rafWork[Math.floor(rafWork.length/2)]:null,
       medianNearTouchRafWorkMs:nearTouchRaf.length?
        nearTouchRaf[Math.floor(nearTouchRaf.length/2)]:null,
       renderCount:renders.length,
       executedRenderCount:renderFrames.filter(x=>x.executed).length,
       twoUpdateFrames:renderFrames.filter(x=>x.updates===2).length,
       nearTouchTwoUpdateFrames:nearTouchFrames.filter(x=>x.updates===2).length,
       maxUpdatesPerFrame:renderFrames.length?Math.max(...renderFrames.map(x=>x.updates)):0,
       medianRenderMs:renders.length?
        [...renders].sort((a,b)=>a-b)[Math.floor(renders.length/2)]:null,
       aimActive:!!g.input.aim.active,status:g.status,simTime:g.time};
     },trial);
     assert.ok(result.events.some(x=>x.type==='pointerdown'),'trusted down required');
     assert.ok(result.events.some(x=>x.type==='pointerup'||x.type==='pointercancel'),
      'trusted release or cancellation required');
     assert.ok(result.events.every(x=>x.trusted),'all touch events must be browser trusted');
     assert.ok(result.edges.some(x=>x.type==='release'&&!x.armed&&!x.active),
      'real Input must clear firing and aim on release');
     assert.equal(result.aimActive,false,'right stick must release');
     assert.equal(result.postReleaseBirths,0,'no ghost projectile after release');
     assert.equal(result.status,'playing');
     if(renderControl){
      if(renderEnabled)assert.ok(result.executedRenderCount>0,'full render must execute');
      else assert.equal(result.executedRenderCount,0,'suppressed render must not execute');
     }
     trials.push({trial,control:trial>=8,normalSpeedControl:trial===9,
      canceled:result.events.some(x=>x.type==='pointercancel'),
      protocolGapMs:round(releaseAt-before),
      inputArmed:result.edges.some(x=>x.type==='move'&&x.armed),
      deliveredHoldMs:round(result.deliveredHoldMs),
      stampedHoldMs:round(result.stampedHoldMs),
      moveEventAgeMs:round(result.moveEventAgeMs),
      moveToNextUpdateMs:round(result.moveToNextUpdateMs),
      updateWithinHold:result.updateWithinHold,heldSamples:result.heldSamples,
      updateSamples:result.samples,simTime:round(result.simTime),
      births:result.births,renderCount:result.renderCount,
      executedRenderCount:result.executedRenderCount,
      twoUpdateFrames:result.twoUpdateFrames,
      nearTouchTwoUpdateFrames:result.nearTouchTwoUpdateFrames,
      maxUpdatesPerFrame:result.maxUpdatesPerFrame,
      medianUpdateGapMs:round(result.medianUpdateGapMs),
      maxUpdateGapMs:round(result.maxUpdateGapMs),
      medianRenderMs:round(result.medianRenderMs),
      medianPriorRafWorkMs:round(result.medianPriorRafWorkMs),
      medianNearTouchRafWorkMs:round(result.medianNearTouchRafWorkMs),
      longTaskSupported:result.longTaskSupported,
      longTaskCount:result.longTaskCount,
      longTaskOverlapMs:round(result.longTaskOverlapMs),
      maxLongTaskMs:round(result.maxLongTaskMs)});
    }
    assert.deepEqual(errors,[],'no composed game page errors');
    assert.ok(trials.some(x=>x.renderCount>0),'must sample actual final game renderer');
    assert.ok(trials[9].inputArmed&&trials[9].heldSamples>0&&trials[9].births>0,
     'CPU x1 long control must arm, be sampled, and create a real Scout projectile');
    const short=trials.filter(x=>!x.control);
    results.push({arm,scale,renderEnabled,initial,cpuThrottle:4,attempts:short.length,
     armedButUnsampled:short.filter(x=>x.inputArmed&&!x.heldSamples).length,
     totalUpdateSamples:short.reduce((n,x)=>n+x.updateSamples,0),
     noProjectile:short.filter(x=>!x.births).length,
     canceled:short.filter(x=>x.canceled).length,
     totalBirths:short.reduce((n,x)=>n+x.births,0),
     sampledHeldAttempts:short.filter(x=>x.heldSamples>0).length,
     controlThrottled:trials[8],controlNormal:trials[9],trials,
     caveat:'CDP touch events and JS render-call time only; no physical Android latency, GPU timing, or guaranteed matched worlds'});
    console.log('NOVA_TOUCH_CLARITY_ARM '+JSON.stringify(results.at(-1)));
   }finally{
    try{await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});}catch{}
    await context.close();
   }
  }
  assert.deepEqual(results.map(x=>x.scale),scales);
  const pixels=results.map(x=>x.initial.backing[0]*x.initial.backing[1]);
  if(!renderControl)assert.ok(pixels[0]>pixels[1]&&pixels[1]>pixels[2]&&
   pixels[3]<pixels[4]&&pixels[4]<pixels[5],
   'forward/reverse clarity arms must change real canvas backing area');
  for(const scale of (renderControl?[100]:[100,80,65])){
   const group=results.filter(x=>x.scale===scale);
   assert.equal(group.length,renderControl?4:2,
    'each research condition must have the expected repeated observations');
   assert.equal(group[0].initial.backing.join(','),group[1].initial.backing.join(','),
    'same clarity must have same backing across order reversal');
  }
  assert.equal(new Set(results.map(x=>x.initial.quality)).size,1,
   'do not confound clarity with quality mode');
  assert.equal(new Set(results.map(x=>x.initial.initialFingerprint)).size,1,
   'research clarity arms must start from the same selected physical world');
  const grouped=Object.fromEntries((renderControl?[100]:[100,80,65]).map(scale=>{
   const arms=results.filter(x=>x.scale===scale);
   return [scale,{runs:arms.length,attempts:arms.reduce((n,x)=>n+x.attempts,0),
    armedButUnsampled:arms.reduce((n,x)=>n+x.armedButUnsampled,0),
    noProjectile:arms.reduce((n,x)=>n+x.noProjectile,0),
    totalBirths:arms.reduce((n,x)=>n+x.totalBirths,0)}];
  }));
  const report={
   researchOnly:true,renderControl,phaseOrder:scales,grouped,results,backingPixels:pixels,
   caveats:['matched selected initial fingerprint does not ensure matched subsequent physical worlds',
    'forward/reverse phase order reduces but cannot eliminate temporal drift',
    'event age is performance.now minus DOM event.timeStamp, not hardware latency',
    'renderer JS duration and prior RAF callback work exclude GPU completion or physical touch-to-photon',
    'Long Tasks are main-thread tasks of at least 50ms, not a complete browser scheduling or compositor trace; window is move minus 120ms to release plus 120ms',
    'Two-update frames count consecutive live Game.update calls before one final Game render; they do not prove why the scheduler permitted catch-up',
    'CPU x4 CDP throttling is not equivalent to Android thermal throttling',
    'render suppression preserves Game.update but deliberately removes presentation work, so it is not playable and cannot isolate JS canvas from compositor cost',
    'no assertion of causal FPS benefit; compare arm distributions and replicate']};
  fs.mkdirSync('artifacts/browser',{recursive:true});
  fs.writeFileSync(renderControl?
   'artifacts/browser/touch-render-control-research.json':
   'artifacts/browser/touch-clarity-cpu-research.json',
   JSON.stringify(report,null,2)+'\n');
  console.log('NOVA_TOUCH_CLARITY_RESEARCH '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
