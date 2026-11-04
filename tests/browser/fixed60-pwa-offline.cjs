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
    await navigator.serviceWorker.ready;
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
   await page.getByRole('button',{name:/DEPLOY/i}).first().click();
   await page.waitForFunction(()=>document.querySelector('canvas.absolute.inset-0'),null,{timeout:15000});
   assert.equal(errors.length,0,'offline default gameplay must not throw: '+errors.join('; '));
   // Pilot bundle is deliberately optional and absent offline. It must fail
   // closed to the menu instead of secretly launching a normal-rate match.
   await page.goto(origin+'?nova_fixed60=pilot',{waitUntil:'domcontentloaded',timeout:45000});
   const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
   await deploy.waitFor({state:'visible',timeout:20000});
   await deploy.click();
   await deploy.waitFor({state:'visible',timeout:15000});
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
   console.log('NOVA_FIXED60_PWA_OFFLINE '+JSON.stringify({active:state.active.cacheName,cached,pilot,defaultRecovered:true}));
  }finally{await context.close()}
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
