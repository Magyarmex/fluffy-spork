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
    await cache.delete(url);
    return {url,body:await saved.text(),headers:[...saved.headers.entries()]};
   },state.active.cacheName);
   const denied=await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(denied.status(),503,'missing mandatory runtime must reject offline shell');
   await page.evaluate(async ({critical,name})=>{
    const cache=await caches.open(name);
    await cache.put(critical.url,new Response(critical.body,{status:200,headers:critical.headers}));
   },{critical:criticalCheck,name:state.active.cacheName});
   const restored=await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(restored.status(),200,'restored mandatory runtime must recover offline shell');
   await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:20000});
   // Pilot bundle is deliberately optional and absent offline. It must fail
   // closed to the menu instead of secretly launching a normal-rate match.
   await page.goto(origin+'?nova_fixed60=pilot',{waitUntil:'domcontentloaded',timeout:45000});
   const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
   await deploy.waitFor({state:'visible',timeout:20000});
   await deploy.click();
   try{await deploy.waitFor({state:'visible',timeout:15000})}
   catch(error){
    const diagnostic=await page.evaluate(()=>({
     readyState:document.readyState,
     menu:!!document.querySelector('#root .menu-grid-bg'),
     pilot:!!window.__novaFixed60Research,
     bodyText:document.body?.innerText?.slice(0,1000),
     loading:!!document.querySelector('.nv-loading'),
     canvas:!!document.querySelector('canvas.absolute.inset-0'),
     rootChildren:document.querySelector('#root')?.children.length
    }));
    console.error('NOVA_FIXED60_PWA_OFFLINE_PILOT_FAILURE '+JSON.stringify({diagnostic,errors}));
    throw error;
   }
   const pilot=await page.evaluate(()=>({
    menu:!!document.querySelector('#root .menu-grid-bg'),
    pilot:!!window.__novaFixed60Research,
    gameplay:!!document.querySelector('canvas.absolute.inset-0')
   }));
   assert.equal(pilot.menu,true,'offline pilot without bundle must recover to menu');
   assert.equal(pilot.pilot,false,'missing pilot bundle must not initialize research');
   // A failed optional pilot boot must not corrupt the active offline shell.
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:20000});
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
   await page.waitForFunction(()=>{
    const g=window.__novaOnlinePilotGame;
    return g?.status==='playing' && g.__novaFixed60Pilot?.owner.ticks>5;
   },null,{timeout:15000});
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
