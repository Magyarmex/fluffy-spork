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
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch]});
     await page.waitForTimeout(120);
     assert.equal(await page.evaluate(()=>window.__novaFixed60Game.input.move.active),
      true,'touch movement reaches fixed60 simulation');
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await page.waitForTimeout(120);
     assert.equal(await page.evaluate(()=>window.__novaFixed60Game.input.move.active),
      false,'touch release clears fixed60 movement');
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
