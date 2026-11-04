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
   const researchRequests=[];
   page.on('request',request=>{
    if(new URL(request.url()).pathname.endsWith('/nova-updates/fixed60-research-browser.js'))
     researchRequests.push(request.url());
   });
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
    assert.equal(boot.hasPilot,enabled,'default boot must not initialize fixed60 research modules');
    assert.equal(researchRequests.length,enabled?1:0,
     'ordinary startup must not fetch the optional fixed60 research bundle; pilot must fetch exactly once');
    if(enabled){
     const fingerprint=await page.locator('meta[name="nova-runtime-build"]').getAttribute('content');
     assert.equal(new URL(researchRequests[0]).searchParams.get('nova_build'),fingerprint,
      'pilot research HTTP cache must be keyed to validated shell fingerprint');
    }
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
     assert.equal(resumed.active,true,'pilot lost input capture during pause/resume: '+
      JSON.stringify({resumed,errors,diagnostics:await page.evaluate(()=>({
       bootErrors:window.__novaBootDiagnostics,
       ownerStarted:window.__novaFixed60Game?.__novaFixed60Pilot?.owner.started,
       ownerLastMs:window.__novaFixed60Game?.__novaFixed60Pilot?.owner.lastMs,
       ownerTicks:window.__novaFixed60Game?.__novaFixed60Pilot?.owner.ticks
      }))}));
     assert.ok(resumed.ticks>initial.ticks);
     // The real Game -> React evolution offer must pause the chronological
     // owner, preserve the player's choice, then resume that SAME owner.
     // A green pause-button test alone cannot validate this lifecycle.
     const beforeOffer=await page.evaluate(()=>{
      const g=window.__novaFixed60Game;
      const ticks=g.__novaFixed60Pilot.owner.ticks;
      g.pendingOffer=1;g.openOffer();
      return ticks;
     });
     const evolution=page.getByText('EVOLVE — CHOOSE YOUR PATH',{exact:true});
     await evolution.waitFor({state:'visible',timeout:8000});
     const duringOffer=await page.evaluate(()=>{
      const g=window.__novaFixed60Game,p=g.__novaFixed60Pilot;
      return {paused:g.paused,ownerPaused:p.owner.paused,
       started:p.owner.started,capture:p.capture.active,raf:g.raf||0,
       ticks:p.owner.ticks};
     });
     assert.equal(duringOffer.paused,true,'real evolution offer pauses Game');
     assert.equal(duringOffer.started,true,'offer must not destroy fixed60 owner');
     assert.equal(duringOffer.raf,0,'offer must not start production RAF');
     await page.waitForTimeout(160);
     assert.equal(await page.evaluate(()=>
      window.__novaFixed60Game.__novaFixed60Pilot.owner.ticks),duringOffer.ticks,
      'evolution choice must freeze combat simulation until the player decides');
     await evolution.locator('xpath=..').getByRole('button',{name:/DECIDE LATER/i}).click();
     await evolution.waitFor({state:'detached',timeout:8000});
     await page.waitForFunction(before=>{
      const g=window.__novaFixed60Game,p=g?.__novaFixed60Pilot;
      return g&&!g.paused&&p?.owner.started&&p.capture.active&&
       p.owner.ticks>before&&!g.raf;
     },beforeOffer,{timeout:8000});
     console.log('NOVA_FIXED60_EVOLUTION_LIFECYCLE '+JSON.stringify({
      duringOffer,afterTicks:await page.evaluate(()=>
       window.__novaFixed60Game.__novaFixed60Pilot.owner.ticks)
     }));
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
     // Real composed browser regression: a brief blocked foreground main
     // thread must not silently discard a finger that is still down.
     // The queued touchEnd below also checks release after recovery.
     const stallBefore=await page.evaluate(()=>{
      const o=window.__novaFixed60Game.__novaFixed60Pilot.owner;
      return {dropped:o.droppedFrames,ticks:o.ticks};
     });
     await page.evaluate(()=>{
      const until=performance.now()+130;
      while(performance.now()<until){} // deliberately block one foreground RAF
     });
     await page.waitForFunction(before=>{
      const o=window.__novaFixed60Game?.__novaFixed60Pilot?.owner;
      return o && o.droppedFrames>before;
     },stallBefore.dropped,{timeout:3000,polling:'raf'});
     const stallAfter=await page.evaluate(()=>{
      const g=window.__novaFixed60Game,o=g.__novaFixed60Pilot.owner;
      return {held:g.input.move.active,stickId:g.input.stickId.move,
       dropped:o.droppedFrames,ticks:o.ticks,started:o.started};
     });
     assert.equal(stallAfter.started,true,'pilot must survive foreground RAF stall');
     assert.ok(stallAfter.dropped>stallBefore.dropped,
      'controlled foreground stall must exercise dropped-frame recovery');
     assert.equal(stallAfter.held,true,
      'held touch must survive a 130ms foreground RAF stall without new pointerdown');
     assert.equal(stallAfter.stickId,touchState.stickId,
      'foreground stall must retain browser-assigned touch-stick ownership');

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
     // A background-sized gap must fail closed instead: old touch ownership
     // cannot remain held forever if the browser drops the release event.
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:18}]});
     await page.waitForFunction(()=>window.__novaFixed60Game?.input.move.active,
      null,{timeout:3000,polling:'raf'});
     const longBefore=await page.evaluate(()=>
      window.__novaFixed60Game.__novaFixed60Pilot.owner.droppedFrames);
     await page.evaluate(()=>{
      const until=performance.now()+320;
      while(performance.now()<until){}
     });
     await page.waitForFunction(before=>{
      const o=window.__novaFixed60Game?.__novaFixed60Pilot?.owner;
      return o&&o.droppedFrames>before;
     },longBefore,{timeout:3000,polling:'raf'});
     assert.equal(await page.evaluate(()=>window.__novaFixed60Game.input.move.active),
      false,'long suspension must release old touch ownership');
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});

     // Focus loss must fail closed even when a finger is still down: no
     // phantom movement/firing can survive switching away from the game.
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:19}]});
     await page.waitForFunction(()=>window.__novaFixed60Game?.input.move.active,
      null,{timeout:3000,polling:'raf'});
     await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
     const blurState=await page.evaluate(()=>{
      const g=window.__novaFixed60Game;
      return {move:g.input.move.active,aim:g.input.aim.active,
       firing:g.input.firing,moveStick:g.input.stickId.move};
     });
     assert.deepEqual(blurState,{move:false,aim:false,firing:false,moveStick:-1},
      'window blur must release held touch and firing state');
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});

     // Repeated browser-event-to-state measurements expose tail latency that a
     // single successful touch cannot establish. This is Chromium-only, not
     // input-to-photon or physical Android evidence.
     // Timestamp the exact Input replay, not the next Playwright RAF poll.
     // Under CPU throttling RAF polling itself can be delayed by >100ms.
     await page.evaluate(()=>{
      const game=window.__novaFixed60Game,input=game.input;
      const owner=game.__novaFixed60Pilot.owner,originalRender=owner.render;
      // A state change is not yet visible. Timestamp the next real composed
      // render invocation after each applied edge (still not screen photons).
      owner.render=function(...args){
       const result=originalRender.apply(this,args);
       const m=window.__novaRepeatTouch,at=performance.now();
       if(m?.downAppliedAt!==undefined && m.downRenderedAt===undefined)
        m.downRenderedAt=at;
       if(m?.upAppliedAt!==undefined && m.upRenderedAt===undefined)
        m.upRenderedAt=at;
       return result;
      };
      const originalDown=input.pd,originalUp=input.pu;
      document.addEventListener('pointercancel',e=>{
       if(e.pointerType==='touch' && window.__novaRepeatTouch)
        window.__novaRepeatTouch.cancelAt=performance.now();
      },true);
      input.pd=function(event){
       const result=originalDown.call(this,event),m=window.__novaRepeatTouch;
       if(m && event.pointerType==='touch' && event.pointerId===m.pointerId &&
          this.move.active && m.downAppliedAt===undefined)
        m.downAppliedAt=performance.now();
       return result;
      };
      input.pu=function(event){
       const result=originalUp.call(this,event),m=window.__novaRepeatTouch;
       if(m && event.pointerType==='touch' && event.pointerId===m.pointerId &&
          !this.move.active && m.upAppliedAt===undefined)
        m.upAppliedAt=performance.now();
       return result;
      };
     });
     const sampleTouches=async(count)=>{
      const repeated=[];
      for(let trial=0;trial<count;trial++){
      await page.evaluate(()=>{
       window.__novaRepeatTouch={};
       document.addEventListener('pointerdown',e=>{
        if(e.pointerType==='touch'){
         window.__novaRepeatTouch.downAt=performance.now();
         window.__novaRepeatTouch.pointerId=e.pointerId;
        }
       },{capture:true,once:true});
      });
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:40+trial}]});
      await page.waitForFunction(()=>{
       const g=window.__novaFixed60Game,m=window.__novaRepeatTouch;
       if(!g?.input.move.active || m.downAt===undefined ||
          m.downAppliedAt===undefined)return false;
       if(m.downRenderedAt===undefined)return false;
       m.downObservedAt??=performance.now();return true;
      },null,{timeout:3000,polling:'raf'});
      await page.evaluate(()=>{
       document.addEventListener('pointerup',e=>{
        if(e.pointerType==='touch')window.__novaRepeatTouch.upAt=performance.now();
       },{capture:true,once:true});
      });
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForFunction(()=>{
       const g=window.__novaFixed60Game,m=window.__novaRepeatTouch;
       if(g?.input.move.active!==false || m.upAt===undefined ||
          m.upAppliedAt===undefined)return false;
       if(m.upRenderedAt===undefined)return false;
       m.upObservedAt??=performance.now();return true;
      },null,{timeout:3000,polling:'raf'});
      const measured=await page.evaluate(()=>{
       const m=window.__novaRepeatTouch;
       const o=window.__novaFixed60Game.__novaFixed60Pilot.owner;
       return {downMs:m.downAppliedAt-m.downAt,upMs:m.upAppliedAt-m.upAt,
        downToRenderMs:m.downRenderedAt-m.downAt,
        upToRenderMs:m.upRenderedAt-m.upAt,
        downPollOverheadMs:m.downObservedAt-m.downAppliedAt,
        upPollOverheadMs:m.upObservedAt-m.upAppliedAt,
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
      downToRenderP50:percentile(samples.map(x=>x.downToRenderMs),.5),
      downToRenderP95:percentile(samples.map(x=>x.downToRenderMs),.95),
      upToRenderP50:percentile(samples.map(x=>x.upToRenderMs),.5),
      upToRenderP95:percentile(samples.map(x=>x.upToRenderMs),.95),
      downPollOverheadP95:percentile(samples.map(x=>x.downPollOverheadMs),.95),
      upPollOverheadP95:percentile(samples.map(x=>x.upPollOverheadMs),.95),
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
      let throttled;
      try{throttled=await sampleTouches(8)}
      catch(error){
       const diagnostic=await page.evaluate(()=>{
        const g=window.__novaFixed60Game,m=window.__novaRepeatTouch;
        const p=g?.__novaFixed60Pilot;
        return {move:g?.input.move.active,stickId:g?.input.stickId.move,
         pointerId:m?.pointerId,downAt:m?.downAt,downAppliedAt:m?.downAppliedAt,
         upAt:m?.upAt,upAppliedAt:m?.upAppliedAt,cancelAt:m?.cancelAt,
         ownerStarted:p?.owner.started,ticks:p?.owner.ticks,
         droppedFrames:p?.owner.droppedFrames,lagMs:p?.owner.lagMs,
         queued:p?.timeline.events.length,applied:p?.timeline.applied};
       });
       console.error('NOVA_FIXED60_THROTTLE_FAILURE '+JSON.stringify({diagnostic,error:String(error)}));
       throw error;
      }
      console.log('NOVA_FIXED60_TOUCH_LATENCY_SERIES '+JSON.stringify({
       cpuThrottle:3,...summarize(throttled)
      }));
     }finally{
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
     }
     // Return to baseline after CPU pressure to expose order/carryover effects.
     const recovered=await sampleTouches(8);
     console.log('NOVA_FIXED60_TOUCH_LATENCY_SERIES '+JSON.stringify({
      cpuThrottle:1,phase:'recovery',...summarize(recovered)
     }));
     // The fixed-step DOM owner must preserve the recently shipped physical
     // mouse-after-touch handoff, not merely isolated touch-stick behavior.
     await page.mouse.move(box.x+box.width*.65,box.y+box.height*.4);
     await page.mouse.down();
     await page.waitForFunction(()=>window.__novaFixed60Game?.input.firing===true,
      null,{timeout:3000,polling:'raf'});
     await page.mouse.up();
     await page.waitForFunction(()=>window.__novaFixed60Game?.input.firing===false,
      null,{timeout:3000,polling:'raf'});
     console.log('NOVA_FIXED60_HYBRID_HANDOFF '+JSON.stringify({
      touchTrials:24,physicalMouseFireRestored:true
     }));
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
  // Optional pilot outage must not degrade the ordinary playable game.
  // This is a real browser network failure, not just a source-level parser check.
  {
   const context=await browser.newContext({viewport:{width:800,height:600}});
   const page=await context.newPage();
   let researchRequests=0;
   try{
    await page.route('**/fixed60-research-browser.js*',route=>{
     researchRequests++;
     return route.abort();
    });
    await page.goto('http://127.0.0.1:8765/',
     {waitUntil:'domcontentloaded',timeout:45000});
    const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const original=Game.prototype.start;
     Game.prototype.start=function(){
      if(!this.__novaDecorativeWorld)window.__novaOutageDefaultGame=this;
      return original.apply(this,arguments);
     };
    });
    await deploy.click();
    await page.waitForFunction(()=>window.__novaOutageDefaultGame?.status==='playing',
     null,{timeout:15000});
    const state=await page.evaluate(()=>{
     const g=window.__novaOutageDefaultGame;
     return {playing:g.status==='playing',raf:!!g.raf,
      pilot:!!g.__novaFixed60Pilot,research:!!window.__novaFixed60Research};
    });
    assert.deepEqual(state,{playing:true,raf:true,pilot:false,research:false},
     'ordinary Game must boot under pilot-bundle network outage');
    assert.equal(researchRequests,0,
     'default path must never request unavailable optional research bytes');
    await page.evaluate(()=>window.__novaOutageDefaultGame.destroy());
   }finally{await context.close()}
  }
  // Fail-closed pilot outage: the explicit opt-in must never fall back to
  // production RAF when its optional bundle cannot be fetched. This test
  // disables service workers so a cached response cannot mask the outage.
  {
   const context=await browser.newContext({viewport:{width:800,height:600},serviceWorkers:'block'});
   const page=await context.newPage();
   let blocked=0;
   try{
    await page.route('**/fixed60-research-browser.js*',route=>{
     blocked++;
     return route.abort('failed');
    });
    await page.goto('http://127.0.0.1:8765/?nova_fixed60=pilot',
     {waitUntil:'domcontentloaded',timeout:45000});
    const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const start=Game.prototype.start;
     Game.prototype.start=function(){
      if(!this.__novaDecorativeWorld)window.__novaMissingBundleGame=this;
      return start.apply(this,arguments);
     };
    });
    await deploy.click();
    // The menu already exists before DEPLOY. Require proof that the real
    // Game.start was attempted before accepting fail-closed recovery.
    await page.waitForFunction(()=>!!window.__novaMissingBundleGame,
     null,{timeout:15000});
    // A menu may remain visible while React is still transitioning. Require
    // teardown of the attempted real Game before accepting fail-closed boot.
    await page.waitForFunction(()=>{
     const g=window.__novaMissingBundleGame;
     return !!g?.__novaDestroyed &&
      !!document.querySelector('#root .menu-grid-bg');
    },null,{timeout:15000});
    const failed=await page.evaluate(()=>{
     const g=window.__novaMissingBundleGame;
     return {research:!!window.__novaFixed60Research,
      productionRAF:g?.raf||0,started:!!g?.__novaFixed60Pilot?.owner.started,
      destroyed:!!g?.__novaDestroyed,
      menu:!!document.querySelector('#root .menu-grid-bg')};
    });
    assert.ok(blocked>0,'pilot outage must exercise an actual failed research request');
    assert.equal(failed.research,false,'missing optional bundle must not initialize');
    assert.equal(failed.productionRAF,0,'missing pilot must not start production RAF');
    assert.equal(failed.started,false,'missing pilot must not leave simulation running');
    assert.equal(failed.destroyed,true,'missing pilot must destroy attempted Game');
    assert.equal(failed.menu,true,'missing pilot must return to menu');
    console.log('NOVA_FIXED60_MISSING_BUNDLE '+JSON.stringify({blocked,failed}));
   }finally{await context.close()}
  }
  // Narrow mobile-viewport pilot smoke: actual responsive canvas, touch
  // ownership and release at phone dimensions, not a desktop-only contract.
  {
   const context=await browser.newContext({viewport:{width:320,height:568},
    deviceScaleFactor:3,hasTouch:true,isMobile:true});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(String(error)));
   try{
    await page.goto('http://127.0.0.1:8765/?nova_fixed60=pilot',
     {waitUntil:'domcontentloaded',timeout:45000});
    const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const start=Game.prototype.start;
     Game.prototype.start=function(){
      if(!this.__novaDecorativeWorld)window.__novaMobilePilotGame=this;
      return start.apply(this,arguments);
     };
    });
    await deploy.click();
    await page.waitForFunction(()=>{
     const g=window.__novaMobilePilotGame;
     return g?.status==='playing' && g.__novaFixed60Pilot?.owner.ticks>5;
    },null,{timeout:15000});
    // The real React loading veil can outlive Game.status='playing'.
    // Wait for an actual finger-reachable canvas, not only simulation ticks.
    await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
    const canvas=page.locator('canvas.absolute.inset-0');
    const box=await canvas.boundingBox();
    assert.ok(box && box.width>=200 && box.height>=300,
     'mobile pilot must have a usable gameplay canvas');
    const targetIsCanvas=await page.evaluate(({x,y})=>
     !!document.elementFromPoint(x,y)?.matches?.('canvas.absolute.inset-0'),
     {x:box.x+box.width*.18,y:box.y+box.height*.72});
    assert.equal(targetIsCanvas,true,
     'mobile touch must land on actual gameplay canvas, not HUD or loading veil');
    const cdp=await context.newCDPSession(page);
    const touch={x:box.x+box.width*.18,y:box.y+box.height*.72,
     id:91,radiusX:1,radiusY:1,force:1};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
    await page.waitForFunction(()=>window.__novaMobilePilotGame?.input.move.active,
     null,{timeout:3000,polling:'raf'});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>window.__novaMobilePilotGame?.input.move.active===false,
     null,{timeout:3000,polling:'raf'});
    const state=await page.evaluate(()=>{
     const g=window.__novaMobilePilotGame;
     return {ticks:g.__novaFixed60Pilot.owner.ticks,
      raf:g.raf||0,move:g.input.move.active};
    });
    assert.equal(state.raf,0,'mobile pilot must exclusively own simulation');
    assert.ok(state.ticks>5 && !state.move);
    assert.deepEqual(errors,[],'mobile pilot must not throw');
    await page.evaluate(()=>window.__novaMobilePilotGame.destroy());
    console.log('NOVA_FIXED60_MOBILE_VIEWPORT '+JSON.stringify(state));
   }finally{await context.close()}
  }
  // Compare both research-only catch-up budgets in the actual materialized
  // browser Game. Diagnostic, not a release gate or a matched-world A/B.
  // A low budget may help presentation while silently losing combat time.
  {
   const observations=[];
   for(const budget of [4,3]){
    const context=await browser.newContext({viewport:{width:800,height:600}});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    const cdp=await context.newCDPSession(page);
    try{
     await page.goto('http://127.0.0.1:8765/?nova_fixed60=pilot&nova_fixed60_steps='+budget,
      {waitUntil:'domcontentloaded',timeout:45000});
     const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
     await deploy.waitFor({state:'visible',timeout:20000});
     await page.evaluate(()=>{
      const engine=window.__novaMakeRequire('')('game/engine');
      const Game=engine.Game,start=Game.prototype.start;
      Game.prototype.start=function(){
       if(!this.__novaDecorativeWorld)window.__novaStepBudgetGame=this;
       return start.apply(this,arguments);
      };
      // Match the entire constructor-spawned Battlefield, AI and shapes.
      // Subsequent live combat RNG remains unpaired; this is not replay.
      engine.Game=class SeededBudgetGame extends Game{
       constructor(...args){
        const oldRandom=Math.random,oldNow=Date.now;
        let state=(0x9e3779b9^(1517800+1))>>>0||1;
        Math.random=()=>{
         state^=state<<13;state^=state>>>17;state^=state<<5;
         return(state>>>0)/4294967296;
        };
        Date.now=()=>0;
        try{super(...args)}finally{Math.random=oldRandom;Date.now=oldNow}
        this.__novaBudgetWorld=JSON.stringify({
         layout:this.__novaBattlefield?.name||null,
         tanks:this.tanks.map(t=>[t.x,t.y,t.cls,t.angle]),
         shapes:this.shapes.map(sh=>[sh.x,sh.y,sh.type]),
         terrain:(this.__novaTerrain||[]).map(w=>[w.x,w.y,w.w,w.h,w.r,w.shape])
        });
       }
      };
     });
     await deploy.click();
     await page.waitForFunction(()=>{
      const g=window.__novaStepBudgetGame;
      return g?.status==='playing'&&g.__novaFixed60Pilot?.owner.ticks>5;
     },null,{timeout:20000});
     await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
     // Keep the throttle transition out of the measured interval.
     await page.waitForTimeout(300);
     const initial=await page.evaluate(()=>{
      const g=window.__novaStepBudgetGame,o=g.__novaFixed60Pilot.owner;
      g.setClass(g.player,'tempest');
      g.player.stats.reload=8;
      g.player.perk='alacrity';
      g.useAbility(g.player);
      g.player.hp=1000000;
      g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
      g.input.firing=true;g.input.autofire=false;
      window.__novaBudgetProjectiles=0;
      const fire=g.tryFire;
      g.tryFire=function(tank){
       const before=this.bullets.length;
       try{return fire.apply(this,arguments)}
       finally{if(tank===this.player)
        window.__novaBudgetProjectiles+=Math.max(0,this.bullets.length-before)}
      };
      if(o.maxSteps!==Number(new URLSearchParams(location.search).get('nova_fixed60_steps')))
       throw Error('research step budget did not reach actual owner');
      if(g.raf)throw Error('production RAF co-owns pilot Game');
      const renderer=window.__novaMakeRequire('')('game/render');
      const render=renderer.render;
      window.__novaStepBudgetRenders=0;
      renderer.render=function(...args){
       const result=render.apply(this,args);
       if(args[0]===g)window.__novaStepBudgetRenders++;
       return result;
      };
      return {at:performance.now(),ticks:o.ticks,droppedMs:o.droppedMs,
       renders:window.__novaStepBudgetRenders,
       projectiles:window.__novaBudgetProjectiles,world:g.__novaBudgetWorld};
     });
     await page.waitForTimeout(3000);
     const measured=await page.evaluate(()=>{
      const g=window.__novaStepBudgetGame,o=g.__novaFixed60Pilot.owner;
      return {at:performance.now(),ticks:o.ticks,droppedMs:o.droppedMs,
       renders:window.__novaStepBudgetRenders,
       projectiles:window.__novaBudgetProjectiles,started:o.started,
       paused:g.paused,raf:g.raf||0};
     });
     const wallMs=measured.at-initial.at;
     const observation={budget,wallMs,world:initial.world,
      ticks:measured.ticks-initial.ticks,
      droppedMs:measured.droppedMs-initial.droppedMs,
      renders:measured.renders-initial.renders,
      projectiles:measured.projectiles-initial.projectiles,
      fps:(measured.renders-initial.renders)*1000/wallMs,
      simulatedTimeRatio:(measured.ticks-initial.ticks)*(1000/60)/wallMs};
     assert.ok(wallMs>=2500&&observation.ticks>0&&observation.renders>0&&
      observation.projectiles>0,
      'both research budgets must advance actual combat and presentation');
     assert.ok(measured.started&&!measured.paused&&!measured.raf,
      'budget experiment must retain exclusive active Game ownership');
     assert.deepEqual(errors,[],'budget browser experiment must not throw');
     observations.push(observation);
     await page.evaluate(()=>window.__novaStepBudgetGame.destroy());
    }finally{
     await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});
     await context.close();
    }
   }
   assert.deepEqual(observations.map(x=>x.budget),[4,3]);
   assert.ok(observations.every(x=>typeof x.world==='string'&&x.world.length>100),
    'both budget trials must capture the real constructor-spawned world');
   assert.equal(new Set(observations.map(x=>x.world)).size,1,
    'catch-up budget comparisons must start from identical Battlefield worlds');
   console.log('NOVA_FIXED60_STEP_BUDGET_COMPARISON '+JSON.stringify(observations));
  }
  // A missing experimental bundle must recover to the menu, never launch
  // an unannounced production-rate match under the pilot query flag.
  const context=await browser.newContext({viewport:{width:800,height:600}});
  const page=await context.newPage();
  try{
   await page.route('**/fixed60-research-browser.js*',route=>route.abort());
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
