'use strict';
// #799: opt-in browser research, not a production feature or a physical-device test.
// Compare real composed-game trusted touch pulses under 100/80/65% render clarity.
// Distinguish event delivery, Input arming, Game.update sampling, projectile birth,
// and actual final renderer CPU cost. Never assert a particular FPS or loss rate.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const {performance:clock}=require('node:perf_hooks');
const scales=[100,80,65];
const round=x=>x==null?null:+x.toFixed(2);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const results=[];
 try{
  for(const scale of scales){
   const context=await browser.newContext({viewport:{width:320,height:700},
    deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(String(e.stack||e)));
   const cdp=await context.newCDPSession(page);
   try{
    await context.addInitScript(value=>{
     localStorage.setItem('novatanks_pilot_settings_v1',JSON.stringify({renderScale:value}));
    },scale);
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const requireGame=window.__novaMakeRequire('');
     const Game=requireGame('game/engine').Game;
     const Input=requireGame('game/input').Input;
     const renderModule=requireGame('game/render');
     const originalAttach=Input.prototype.attach;
     window.__novaTouchClarity={trial:-1,events:[],edges:[],samples:[],births:[],
      renders:[],game:null};
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
       w.samples.push({trial:w.trial,at:performance.now(),
        held:!!this.input.firing&&!!this.input.aim.active&&
         Math.hypot(this.input.aim.dx,this.input.aim.dy)>=9});
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
      try{return oldRender.call(this,g,...args);}
      finally{
       if(!g.__novaDecorativeWorld&&g.status==='playing')
        window.__novaTouchClarity.renders.push({
         trial:window.__novaTouchClarity.trial,ms:performance.now()-start});
      }
     };
     for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
      document.addEventListener(type,e=>{
       if(e.pointerType!=='touch')return;
       const w=window.__novaTouchClarity;
       w.events.push({trial:w.trial,type,at:performance.now(),stamp:e.timeStamp,
        trusted:e.isTrusted});
      },{capture:true,passive:true});
    });
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
      quality:g.quality,dpr:g.dpr,css:[g.w,g.h],backing:[g.canvas.width,g.canvas.height]};
    });
    assert.equal(initial.scale,scale,'settings must preserve requested clarity');
    const rect=await canvas.boundingBox();
    assert.ok(rect&&rect.width>200&&rect.height>200);
    const origin={x:rect.x+rect.width*.72,y:rect.y+rect.height*.68,
     id:41,radiusX:1,radiusY:1,force:1};
    const moved={...origin,x:origin.x+Math.min(35,rect.width*.12),y:origin.y-30};
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    const trials=[];
    // Long positive control last: avoid a misleading short-pulse failure
    // when the fixture itself is unable to arm a real Scout shot.
    for(let trial=0;trial<9;trial++){
     await page.evaluate(i=>{
      const w=window.__novaTouchClarity,g=w.game;
      if(g.status!=='playing')throw Error('playable game ended during trial');
      w.trial=i;g.player.spawnShieldT=20;g.player.fireCd=0;
      g.input.autofire=false;
     },trial);
     const before=clock.now();
     const down=cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
     if(trial===8){await down;await page.waitForTimeout(100);}
     const move=cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});
     await new Promise(resolve=>setTimeout(resolve,trial===8?300:40));
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
      const renders=w.renders.filter(x=>x.trial===i).map(x=>x.ms);
      const deflection=events.find(x=>x.type==='pointermove');
      const released=events.find(x=>x.type==='pointerup'||x.type==='pointercancel');
      const next=deflection?samples.find(x=>x.at>=deflection.at):null;
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
       renderCount:renders.length,medianRenderMs:renders.length?
        [...renders].sort((a,b)=>a-b)[Math.floor(renders.length/2)]:null,
       aimActive:!!g.input.aim.active,status:g.status};
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
     trials.push({trial,control:trial===8,
      canceled:result.events.some(x=>x.type==='pointercancel'),
      protocolGapMs:round(releaseAt-before),
      inputArmed:result.edges.some(x=>x.type==='move'&&x.armed),
      deliveredHoldMs:round(result.deliveredHoldMs),
      stampedHoldMs:round(result.stampedHoldMs),
      moveEventAgeMs:round(result.moveEventAgeMs),
      moveToNextUpdateMs:round(result.moveToNextUpdateMs),
      updateWithinHold:result.updateWithinHold,heldSamples:result.heldSamples,
      births:result.births,renderCount:result.renderCount,
      medianUpdateGapMs:round(result.medianUpdateGapMs),
      maxUpdateGapMs:round(result.maxUpdateGapMs),
      medianRenderMs:round(result.medianRenderMs)});
    }
    assert.deepEqual(errors,[],'no composed game page errors');
    assert.ok(trials.some(x=>x.renderCount>0),'must sample actual final game renderer');
    const short=trials.filter(x=>!x.control);
    results.push({scale,initial,cpuThrottle:4,attempts:short.length,
     armedButUnsampled:short.filter(x=>x.inputArmed&&!x.heldSamples).length,
     noProjectile:short.filter(x=>!x.births).length,
     canceled:short.filter(x=>x.canceled).length,
     totalBirths:short.reduce((n,x)=>n+x.births,0),
     sampledHeldAttempts:short.filter(x=>x.heldSamples>0).length,
     control:trials.at(-1),trials,
     caveat:'CDP touch events and JS render-call time only; no physical Android latency, GPU timing, or guaranteed matched worlds'});
    console.log('NOVA_TOUCH_CLARITY_ARM '+JSON.stringify(results.at(-1)));
   }finally{
    try{await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});}catch{}
    await context.close();
   }
  }
  assert.deepEqual(results.map(x=>x.scale),scales);
  const pixels=results.map(x=>x.initial.backing[0]*x.initial.backing[1]);
  assert.ok(pixels[0]>pixels[1]&&pixels[1]>pixels[2],
   'clarity arms must reduce real canvas backing area');
  assert.equal(new Set(results.map(x=>x.initial.quality)).size,1,
   'do not confound clarity with quality mode');
  const report={
   researchOnly:true,results,backingPixels:pixels,
   caveats:['independent worlds and trials are not matched physical states',
    'event age is performance.now minus DOM event.timeStamp, not hardware latency',
    'renderer JS duration is not GPU completion or physical touch-to-photon',
    'CPU x4 CDP throttling is not equivalent to Android thermal throttling',
    'no assertion of causal FPS benefit; compare arm distributions and replicate']};
  fs.mkdirSync('artifacts/browser',{recursive:true});
  fs.writeFileSync('artifacts/browser/touch-clarity-cpu-research.json',
   JSON.stringify(report,null,2)+'\n');
  console.log('NOVA_TOUCH_CLARITY_RESEARCH '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
