'use strict';
// Real composed React + 49-overlay Game, not an isolated RAF mock.
// Research mode is URL-only; the default production path must remain intact.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 try{
  for(const enabled of [false,true]){
   const context=await browser.newContext({viewport:{width:800,height:600}});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(String(error.stack||error)));
   try{
    const url='http://127.0.0.1:8765/'+(enabled?'?nova_fixed60=pilot':'');
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const original=Game.prototype.update;
     Game.prototype.update=function(dt){
      if(!this.__novaDecorativeWorld)window.__novaFixed60Game=this;
      return original.apply(this,arguments);
     };
    });
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForFunction(()=>window.__novaFixed60Game?.status==='playing',null,{timeout:20000});
    await page.waitForTimeout(600);
    const initial=await page.evaluate(()=>{
     const g=window.__novaFixed60Game,p=g.__novaFixed60Pilot;
     return {pilot:!!p,started:!!p?.owner.started,ticks:p?.owner.ticks||0,
      raf:g.raf||0,capture:!!p?.capture.active,
      inputOwner:!!g.input,gameStatus:g.status};
    });
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
    }else{
     assert.ok(initial.raf>0,'default game retains production RAF');
    }
    assert.deepEqual(errors,[],'no uncaught browser errors: '+JSON.stringify(initial));
    console.log('NOVA_FIXED60_BOOT '+JSON.stringify({enabled,initial}));
   }finally{await context.close()}
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
