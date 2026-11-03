'use strict';
// Real composed React + 49-overlay Game, not an isolated RAF mock.
// Research mode is URL-only; the default production path must remain intact.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 try{
  for(const enabled of [false,true]){
   const context=await browser.newContext({viewport:{width:800,height:600},hasTouch:enabled,isMobile:false});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(String(error.stack||error)));
   try{
    const url='http://127.0.0.1:8765/'+(enabled?'?nova_fixed60=pilot':'');
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const original=Game.prototype.start;
     Game.prototype.start=function(){
      if(!this.__novaDecorativeWorld)window.__novaFixed60Game=this;
      return original.apply(this,arguments);
     };
    });
    await page.evaluate(()=>{
     window.__novaBootDiagnostics=[];
     const prior=console.error;
     console.error=function(...args){
      window.__novaBootDiagnostics.push(args.map(String).join(' '));
      return prior.apply(this,args);
     };
    });
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForTimeout(1200);
    const boot=await page.evaluate(()=>({
     ready:window.__novaFixed60Game?.status==='playing',
     errors:window.__novaBootDiagnostics,
     hasPilot:!!window.__novaFixed60Research,
     hasGame:!!window.__novaFixed60Game,
     pilotAttached:!!window.__novaFixed60Game?.__novaFixed60Pilot,
     menu:!!document.querySelector('#root .menu-grid-bg'),
     screenCanvas:!!document.querySelector('canvas.absolute.inset-0'),
     raf:window.__novaFixed60Game?.raf,
     ticks:window.__novaFixed60Game?.__novaFixed60Pilot?.owner.ticks
    }));
    assert.equal(boot.ready,true,'actual pilot boot failed: '+JSON.stringify(boot));
    await page.waitForTimeout(600);
    const initial=await page.evaluate(()=>{
     const g=window.__novaFixed60Game,p=g.__novaFixed60Pilot;
     return {pilot:!!p,started:!!p?.owner.started,ticks:p?.owner.ticks||0,
      raf:g.raf||0,capture:!!p?.capture.active,
      inputOwner:!!g.input,gameStatus:g.status,paused:g.paused,
      pendingOffer:!!g.pendingOffer,lastMs:p?.owner.lastMs,
      lagMs:p?.owner.lagMs,framesDropped:p?.owner.droppedFrames,
      lastSteps:p?.owner.lastSteps,gameTime:g.time};
    });
    console.log('NOVA_FIXED60_BOOT_DIAGNOSTIC '+JSON.stringify({enabled,initial,errors,boot}));
    assert.equal(initial.pilot,enabled,'only explicit query may activate pilot');
    assert.equal(initial.gameStatus,'playing');
    if(enabled){
     assert.equal(initial.started,true);
     assert.equal(initial.capture,true);
     assert.equal(initial.raf,0,'production RAF must not run beside pilot');
     assert.ok(initial.ticks>0,'fixed60 must advance real composed Game');
     await page.keyboard.down('w');
     await page.waitForTimeout(120);
     const move=await page.evaluate(()=>window.__novaFixed60Game.input.keyboard.up);
     assert.equal(move,true,'chronological keyboard press reaches Game');
     await page.keyboard.up('w');
     await page.waitForTimeout(120);
     const released=await page.evaluate(()=>window.__novaFixed60Game.input.keyboard.up);
     assert.equal(released,false,'chronological keyboard release reaches Game');
     const pause=await page.evaluate(()=>{
      const g=window.__novaFixed60Game;
      g.setPaused(true);
      return {paused:g.paused,ownerPaused:g.__novaFixed60Pilot.owner.paused};
     });
     assert.equal(pause.paused,true);
     await page.waitForTimeout(120);
     await page.evaluate(()=>window.__novaFixed60Game.setPaused(false));
     await page.waitForTimeout(120);
     const resumed=await page.evaluate(()=>{
      const g=window.__novaFixed60Game;
      return {paused:g.paused,ticks:g.__novaFixed60Pilot.owner.ticks,
       active:g.__novaFixed60Pilot.capture.active};
     });
     assert.equal(resumed.paused,false);
     assert.equal(resumed.active,true);
     assert.ok(resumed.ticks>initial.ticks);
     const canvas=page.locator('canvas.absolute.inset-0');
     const box=await canvas.boundingBox();
     assert.ok(box&&box.width>200);
     const cdp=await context.newCDPSession(page);
     const touch={x:box.x+box.width*.18,y:box.y+box.height*.72,
      id:17,radiusX:1,radiusY:1,force:1};
     await page.evaluate(()=>{
      window.__novaTouchEvents=[];
      for(const type of ['pointerdown','touchstart'])
       document.addEventListener(type,e=>window.__novaTouchEvents.push({
        type,target:e.target?.tagName,cls:String(e.target?.className||'').slice(0,80),
        pointerType:e.pointerType,clientX:e.clientX,clientY:e.clientY
       }),true);
     });
     // Measure latency from the actual browser event, not CDP command dispatch:
     // command transport and browser scheduling are separate from simulation lag.
     await page.evaluate(()=>{
      window.__novaInputLatency={};
      document.addEventListener('pointerdown',e=>{
       if(e.pointerType==='touch' && window.__novaInputLatency.downAt===undefined)
        window.__novaInputLatency.downAt=performance.now();
      },{capture:true,once:true});
     });
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
     await page.waitForFunction(()=>{
      const g=window.__novaFixed60Game, m=window.__novaInputLatency;
      if(!g?.input.move.active)return false;
      if(m.downAppliedAt===undefined)m.downAppliedAt=performance.now();
      return true;
     },null,{timeout:3000,polling:'raf'});
     const touchState=await page.evaluate(()=>{
      const g=window.__novaFixed60Game,p=g.__novaFixed60Pilot;
      return {move:g.input.move.active,stickId:g.input.stickId.move,
       touchSeen:g.input.touchSeen,events:window.__novaTouchEvents,
       queued:p.timeline.events.length,applied:p.timeline.applied,
       sampled:p.timeline.sampled,ownerTicks:p.owner.ticks,
       inputCanvas:g.input.canvas===g.canvas};
     });
     touchState.deliveryLatencyMs=await page.evaluate(()=>{
      const m=window.__novaInputLatency;
      return m.downAppliedAt-m.downAt;
     });
     assert.ok(Number.isFinite(touchState.deliveryLatencyMs)&&touchState.deliveryLatencyMs>=0,
      'browser touch-down must have a measurable application delay');
     console.log('NOVA_FIXED60_TOUCH_DIAGNOSTIC '+JSON.stringify(touchState));
     assert.equal(touchState.move,true,
      'touch movement reaches fixed60 simulation: '+JSON.stringify(touchState));
     await page.evaluate(()=>{
      document.addEventListener('pointerup',e=>{
       if(e.pointerType==='touch' && window.__novaInputLatency.upAt===undefined)
        window.__novaInputLatency.upAt=performance.now();
      },{capture:true,once:true});
     });
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await page.waitForFunction(()=>{
      const g=window.__novaFixed60Game,m=window.__novaInputLatency;
      if(g?.input.move.active)return false;
      if(m.upAppliedAt===undefined)m.upAppliedAt=performance.now();
      return true;
     },null,{timeout:3000,polling:'raf'});
     const releaseLatency=await page.evaluate(()=>{
      const m=window.__novaInputLatency;
      return m.upAppliedAt-m.upAt;
     });
     assert.ok(Number.isFinite(releaseLatency)&&releaseLatency>=0,
      'browser touch-up must have a measurable application delay');
     console.log('NOVA_FIXED60_TOUCH_LATENCY '+JSON.stringify({
      downMs:touchState.deliveryLatencyMs,upMs:releaseLatency,
      queued:touchState.queued,ownerTicks:touchState.ownerTicks
     }));
     assert.equal(await page.evaluate(()=>window.__novaFixed60Game.input.move.active),
      false,'touch release clears fixed60 movement');
     // Repeated browser-event-to-state measurements expose tail latency that a
     // single successful touch cannot establish. This is Chromium-only, not
     // input-to-photon or physical Android evidence.
     const sampleTouches=async(count)=>{
      const repeated=[];
      for(let trial=0;trial<count;trial++){
      await page.evaluate(()=>{
       window.__novaRepeatTouch={};
       document.addEventListener('pointerdown',e=>{
        if(e.pointerType==='touch')window.__novaRepeatTouch.downAt=performance.now();
       },{capture:true,once:true});
      });
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:40+trial}]});
      await page.waitForFunction(()=>{
       const g=window.__novaFixed60Game,m=window.__novaRepeatTouch;
       if(!g?.input.move.active||m.downAt===undefined)return false;
       m.downAppliedAt??=performance.now();return true;
      },null,{timeout:3000,polling:'raf'});
      await page.evaluate(()=>{
       document.addEventListener('pointerup',e=>{
        if(e.pointerType==='touch')window.__novaRepeatTouch.upAt=performance.now();
       },{capture:true,once:true});
      });
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForFunction(()=>{
       const g=window.__novaFixed60Game,m=window.__novaRepeatTouch;
       if(g?.input.move.active||m.upAt===undefined)return false;
       m.upAppliedAt??=performance.now();return true;
      },null,{timeout:3000,polling:'raf'});
      const measured=await page.evaluate(()=>{
       const m=window.__novaRepeatTouch;
       const o=window.__novaFixed60Game.__novaFixed60Pilot.owner;
       return {downMs:m.downAppliedAt-m.downAt,upMs:m.upAppliedAt-m.upAt,
        droppedMs:o.droppedMs,droppedFrames:o.droppedFrames,
        lagMs:o.lagMs,ticks:o.ticks};
      });
      assert.ok(Object.values(measured).every(x=>Number.isFinite(x)&&x>=0),
       'repeat touch event application must have finite nonnegative latency');
      repeated.push(measured);
     }
      return repeated;
     };
     const percentile=(values,p)=>{
      const sorted=[...values].sort((a,b)=>a-b);
      return sorted[Math.ceil(p*sorted.length)-1];
     };
     const summarize=(samples)=>({
      trials:samples.length,
      downP50:percentile(samples.map(x=>x.downMs),.5),
      downP95:percentile(samples.map(x=>x.downMs),.95),
      upP50:percentile(samples.map(x=>x.upMs),.5),
      upP95:percentile(samples.map(x=>x.upMs),.95),
      droppedMsAtEnd:samples.at(-1).droppedMs,
      droppedFramesAtEnd:samples.at(-1).droppedFrames,
      lagMsAtEnd:samples.at(-1).lagMs,
      ticksAtEnd:samples.at(-1).ticks,
      samples
     });
     const baseline=await sampleTouches(8);
     console.log('NOVA_FIXED60_TOUCH_LATENCY_SERIES '+JSON.stringify({
      cpuThrottle:1,...summarize(baseline)
     }));
     // Deliberately constructed CPU pressure: diagnostic only, not an Android
     // benchmark. Always restore normal browser speed before teardown.
     await cdp.send('Emulation.setCPUThrottlingRate',{rate:3});
     try{
      const throttled=await sampleTouches(4);
      console.log('NOVA_FIXED60_TOUCH_LATENCY_SERIES '+JSON.stringify({
       cpuThrottle:3,...summarize(throttled)
      }));
     }finally{
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
     }
     const teardown=await page.evaluate(()=>{
      const g=window.__novaFixed60Game,p=g.__novaFixed60Pilot;
      g.destroy();
      return {started:p.owner.started,capture:p.capture.active,
       destroyed:g.__novaDestroyed,raf:p.owner.raf};
     });
     assert.deepEqual(teardown,{started:false,capture:false,destroyed:true,raf:null},
      'Game.destroy must release both simulation and DOM owners');

    }else{
     assert.ok(initial.raf>0,'default game retains production RAF');
    }
    assert.deepEqual(errors,[],'no uncaught browser errors: '+JSON.stringify(initial));
    console.log('NOVA_FIXED60_BOOT '+JSON.stringify({enabled,initial}));
   }finally{await context.close()}
  }
  // A missing experimental bundle must recover to the menu, never launch
  // an unannounced production-rate match under the pilot query flag.
  const context=await browser.newContext({viewport:{width:800,height:600}});
  const page=await context.newPage();
  try{
   await page.route('**/fixed60-research-browser.js',route=>route.abort());
   await page.goto('http://127.0.0.1:8765/?nova_fixed60=pilot',
    {waitUntil:'domcontentloaded',timeout:45000});
   const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
   await deploy.waitFor({state:'visible',timeout:45000});
   await page.evaluate(()=>{
    window.__novaBootErrors=[];
    const original=console.error;
    console.error=function(...args){
     window.__novaBootErrors.push(args.map(String).join(' '));
     return original.apply(this,args);
    };
   });
   await deploy.click();
   await page.waitForFunction(()=>window.__novaBootErrors?.some(x=>
    x.includes('Failed to boot game:')),null,{timeout:15000});
   await deploy.waitFor({state:'visible',timeout:15000});
   const result=await page.evaluate(()=>({
    pilotLoaded:!!window.__novaFixed60Research,
    productionGameStarted:!!window.__novaFixed60Game,
    menuVisible:!!document.querySelector('#root .menu-grid-bg')
   }));
   assert.deepEqual(result,{pilotLoaded:false,productionGameStarted:false,menuVisible:true},
    'missing pilot artifact must not silently launch production simulation');
  }finally{await context.close()}
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
