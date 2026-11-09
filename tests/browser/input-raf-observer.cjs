'use strict';
// Opt-in research probe in real Chromium + shipping React/Game canvas.
// This verifies DOM-to-next-RAF instrumentation only, not touch-to-photon.
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({
  viewport:{width:320,height:640},deviceScaleFactor:2,
  isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{
   waitUntil:'domcontentloaded',timeout:45000});
  const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
  await deploy.waitFor({state:'visible',timeout:45000});
  await deploy.tap();
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:30000});
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  await page.addScriptTag({path:path.resolve(__dirname,
   '../../scripts/fixed60-input-to-raf-observer.js')});
  await page.evaluate(()=>{
   window.__novaInputRafProbe=window.__novaInputRafObserver.create({
    durationMs:10000,maxSamples:100});
   window.__novaInputRafProbe.start();
  });
  const box=await canvas.boundingBox();
  assert.ok(box&&box.width>200&&box.height>200);
  await canvas.tap({position:{x:box.width*.78,y:box.height*.68}});
  await page.evaluate(()=>new Promise(resolve=>
   requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const result=await page.evaluate(()=>{
   const o=window.__novaInputRafProbe;
   const before=o.snapshot();o.stop();
   return {before,after:o.snapshot()};
  });
  assert.ok(result.before.kinds.pointerdown.count>=1,
   'actual browser touch must reach passive pointerdown observer');
  assert.ok(result.before.kinds.pointerup.count>=1,
   'actual browser touch release must reach passive pointerup observer');
  assert.ok(Number.isFinite(result.before.kinds.pointerdown.p95Ms));
  assert.ok(Number.isFinite(result.before.kinds.pointerup.p95Ms));
  assert.equal(result.before.metric,'DOM delivery to next RAF callback');
  assert.equal(result.after.status,'manual');
  assert.equal(result.after.pendingEvents,0);
  const json=JSON.stringify(result);
  for(const secret of ['clientX','clientY','pointerId','targetTagName'])
   assert.equal(json.includes(secret),false,
    'timing probe must never export raw input identifiers/coordinates');
  assert.deepEqual(errors,[],'browser page must remain error-free');
  console.log('NOVA input-to-RAF observer Chromium smoke PASS',
   JSON.stringify({down:result.before.kinds.pointerdown,
    up:result.before.kinds.pointerup}));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
