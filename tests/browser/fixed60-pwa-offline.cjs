'use strict';
// Installed-service-worker regression for the real materialized NOVA shell.
// Run after the same production composition as fixed60-optin-boot.cjs.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const origin = 'http://127.0.0.1:8765/';
(async () => {
 const browser = await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 try {
  const context = await browser.newContext({serviceWorkers:'allow'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',e=>errors.push(String(e)));
  try {
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   await page.evaluate(async()=>{
    const reg = await navigator.serviceWorker.register('./sw.js');
    await Promise.race([navigator.serviceWorker.ready,
     new Promise((_,reject)=>setTimeout(()=>reject(Error('service worker activation timed out')),30000))]);
    if (!reg.active) throw Error('installed service worker not active');
   });
   // Claim the page, then verify the active build is actually staged.
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:15000});
   const state=await page.evaluate(async()=>{
    const keys=await caches.keys();
    const meta=keys.find(k=>k.startsWith('nova-tanks-real-meta-v'));
    if(!meta) return {keys,active:null};
    const cache=await caches.open(meta);
    const response=await cache.match(new URL('./__nova_real_active__.json',location.href));
    return {keys,active:response?await response.json():null};
   });
   assert.ok(state.active?.cacheName,'installed SW must promote a validated build: '+JSON.stringify(state));
   const cached=await page.evaluate(async name=>{
    const cache=await caches.open(name);
    const shell=await cache.match(new URL('./',location.href));
    const research=await cache.match(new URL('./nova-updates/fixed60-research-browser.js',location.href));
    return {shell:!!shell,research:!!research};
   },state.active.cacheName);
   assert.equal(cached.shell,true,'canonical shell must be staged');
   assert.equal(cached.research,false,'optional pilot bundle must not be mandatory in active build');
   // Browser offline mode, not route.abort(): the SW still serves its cache.
   await context.setOffline(true);
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:20000});
   await page.evaluate(()=>{
    const Game=window.__novaMakeRequire('')('game/engine').Game;
    const start=Game.prototype.start;
    Game.prototype.start=function(){
     if(!this.__novaDecorativeWorld)window.__novaOfflineGame=this;
     return start.apply(this,arguments);
    };
   });
   await page.getByRole('button',{name:/DEPLOY/i}).first().click();
   await page.waitForFunction(()=>window.__novaOfflineGame?.status==='playing' &&
    !!window.__novaOfflineGame.raf,null,{timeout:15000});
   assert.equal(errors.length,0,'offline default gameplay must not throw: '+errors.join('; '));
   await page.evaluate(()=>window.__novaOfflineGame.destroy());
   // Corrupt a *mandatory* staged script while offline. Unlike the optional
   // pilot bundle, a missing canonical boot dependency must fail closed.
   const criticalCheck=await page.evaluate(async name=>{
    const cache=await caches.open(name);
    const url=new URL('./nova-updates/fixed60-optin-boot.js',location.href).href;
    const saved=await cache.match(url);
    if(!saved) throw Error('mandatory opt-in delegate absent from staged shell');
    const backup=url+'?__nova_test_backup=1';
    await cache.put(backup,saved.clone());
    await cache.delete(url);
    return {url,backup};
   },state.active.cacheName);
   const denied=await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(denied.status(),503,'missing mandatory runtime must reject offline shell');
   await page.evaluate(async ({critical,name})=>{
    const cache=await caches.open(name);
    const saved=await cache.match(critical.backup);
    if(!saved) throw Error('critical script backup lost during failed navigation');
    await cache.put(critical.url,saved.clone());
    await cache.delete(critical.backup);
   },{critical:criticalCheck,name:state.active.cacheName});
   const restored=await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(restored.status(),200,'restored mandatory runtime must recover offline shell');
   await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:20000});
   // Optional pilot bytes are NOT mandatory in the staged build. Browser
   // HTTP caches or service-worker fetch behavior may nevertheless supply
   // them while network emulation is offline. Both outcomes are legitimate:
   // a real exclusive fixed60 pilot, or a fail-closed menu. Never a silent
   // production-RAF match under the explicit pilot flag.
   await page.goto(origin+'?nova_fixed60=pilot',{waitUntil:'domcontentloaded',timeout:45000});
   const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
   await deploy.waitFor({state:'visible',timeout:20000});
   await page.evaluate(()=>{
    const Game=window.__novaMakeRequire('')('game/engine').Game;
    const start=Game.prototype.start;
    Game.prototype.start=function(){
     if(!this.__novaDecorativeWorld)window.__novaOfflinePilotGame=this;
     return start.apply(this,arguments);
    };
   });
   // The menu is visible before deployment; it cannot count as successful
   // fail-closed recovery until the real Game.start was actually attempted.
   await deploy.click();
   await page.waitForFunction(()=>{
    const g=window.__novaOfflinePilotGame;
    if(!g)return false;
    // Once a pilot exists, do not mistake a still-visible transition menu
    // for failure; require actual simulated gameplay before evaluating it.
    if(g.__novaFixed60Pilot)
     return g.status==='playing' && g.__novaFixed60Pilot.owner.ticks>5;
    return !!document.querySelector('#root .menu-grid-bg');
   },null,{timeout:20000});
   const pilot=await page.evaluate(()=>{
    const g=window.__novaOfflinePilotGame,p=g?.__novaFixed60Pilot;
    return {menu:!!document.querySelector('#root .menu-grid-bg'),
     research:!!window.__novaFixed60Research,
     playing:g?.status==='playing',destroyed:!!g?.__novaDestroyed,pilot:!!p,
     started:!!p?.owner.started,ticks:p?.owner.ticks||0,
     productionRAF:g?.raf||0,
     controlled:!!navigator.serviceWorker.controller,offline:!navigator.onLine};
   });
   assert.equal(pilot.controlled,true,'offline pilot navigation must remain SW-controlled');
   assert.equal(pilot.offline,true,'browser must report offline for this test');
   if(pilot.menu){
    // Game.status starts as 'playing' in the constructor and is not changed
    // by destroy(); the actual fail-closed invariant is teardown + menu.
    assert.equal(pilot.destroyed,true,'failed pilot must destroy its attempted Game before returning to menu');
    assert.equal(pilot.started,false,'failed pilot must not leave an active fixed60 owner');
    assert.equal(pilot.productionRAF,0,'failed pilot must never run production RAF');
   }else{
    assert.equal(pilot.pilot,true,'offline pilot gameplay must use fixed60 owner');
    assert.equal(pilot.started,true,'offline fixed60 owner must be running');
    assert.ok(pilot.ticks>5,'offline fixed60 must advance real Game');
    assert.equal(pilot.productionRAF,0,'offline pilot must never start production RAF');
    await page.evaluate(()=>window.__novaOfflinePilotGame.destroy());
   }
   // Either optional pilot outcome must not corrupt the active offline shell.
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   const recoveredDeploy=page.getByRole('button',{name:/DEPLOY/i}).first();
   await recoveredDeploy.waitFor({state:'visible',timeout:20000});
   await page.evaluate(()=>{
    const Game=window.__novaMakeRequire('')('game/engine').Game;
    const start=Game.prototype.start;
    Game.prototype.start=function(){
     if(!this.__novaDecorativeWorld)window.__novaRecoveredOfflineGame=this;
     return start.apply(this,arguments);
    };
   });
   await recoveredDeploy.click();
   await page.waitForFunction(()=>{
    const g=window.__novaRecoveredOfflineGame;
    return g?.status==='playing' && !!g.raf;
   },null,{timeout:15000});
   await page.evaluate(()=>window.__novaRecoveredOfflineGame.destroy());
   // Reconnection should restore opt-in availability without changing the
   // validated offline default shell or promoting a partial research build.
   await context.setOffline(false);
   await page.goto(origin+'?nova_fixed60=pilot',{waitUntil:'domcontentloaded',timeout:45000});
   const onlineDeploy=page.getByRole('button',{name:/DEPLOY/i}).first();
   await onlineDeploy.waitFor({state:'visible',timeout:20000});
   await page.evaluate(()=>{
    const Game=window.__novaMakeRequire('')('game/engine').Game;
    const start=Game.prototype.start;
    Game.prototype.start=function(){
     if(!this.__novaDecorativeWorld)window.__novaOnlinePilotGame=this;
     return start.apply(this,arguments);
    };
   });
   await onlineDeploy.click();
   try{
    await page.waitForFunction(()=>{
     const g=window.__novaOnlinePilotGame;
     return g?.status==='playing' && g.__novaFixed60Pilot?.owner.ticks>5;
    },null,{timeout:15000});
   }catch(error){
    const diagnostic=await page.evaluate(()=>{
     const g=window.__novaOnlinePilotGame,p=g?.__novaFixed60Pilot;
     return {hasGame:!!g,status:g?.status,hasPilot:!!p,
      started:p?.owner.started,ticks:p?.owner.ticks,
      raf:g?.raf||0,research:!!window.__novaFixed60Research,
      menu:!!document.querySelector('#root .menu-grid-bg'),
      online:navigator.onLine,controlled:!!navigator.serviceWorker.controller};
    });
    throw Error('reconnected pilot did not start: '+JSON.stringify({diagnostic,errors,cause:String(error)}));
   }
   const online=await page.evaluate(()=>{
    const g=window.__novaOnlinePilotGame;
    const result={ticks:g.__novaFixed60Pilot.owner.ticks,productionRAF:g.raf||0};
    g.destroy();
    return result;
   });
   assert.equal(online.productionRAF,0,'reconnected pilot must own simulation exclusively');
   console.log('NOVA_FIXED60_PWA_OFFLINE '+JSON.stringify({active:state.active.cacheName,cached,pilot,defaultRecovered:true,online}));
  }finally{await context.close()}
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
