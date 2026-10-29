'use strict';
// Real Chromium, real HTML-ordered overlays: a live menu tip refill must not
// advance the same Math.random stream used by combat and world generation.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
async function run(browser,width,height){
 const context=await browser.newContext({viewport:{width,height}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.locator('.nova-tip-line').first().waitFor({state:'visible',timeout:15000});
  const result=await page.evaluate(()=>{
   const api=window.NOVATips;
   if(!api||typeof api.next!=='function')throw Error('shipping Fieldcraft API unavailable');
   const count=api.audit().current;
   const original=Math.random;
   let draws=0;
   Math.random=function(){draws++;return original();};
   let ids,next;
   try{
    ids=Array.from({length:count},()=>api.next('browser-rng-isolation').id);
    next=api.next('browser-rng-isolation').id;
   }finally{Math.random=original;}
   const line=document.querySelector('.nova-tip-line');
   return {count,unique:new Set(ids).size,antiRepeat:next!==ids[ids.length-1],
    draws,visible:!!line&&!!line.getBoundingClientRect().width,
    text:line&&line.textContent,scrollWidth:document.documentElement.scrollWidth};
  });
  assert.ok(result.count>=50,'unexpectedly small shipping tip registry');
  assert.equal(result.unique,result.count,'real-browser shuffle bag repeated early');
  assert.equal(result.antiRepeat,true,'real-browser shuffle repeated at bag boundary');
  assert.equal(result.draws,0,'real menu rotation advanced combat RNG');
  assert.ok(result.visible&&result.text,'real menu tip did not render');
  assert.ok(result.scrollWidth<=width+1,'Fieldcraft tip caused horizontal overflow');
  assert.deepEqual(errors,[],'real browser page errors');
  console.log('NOVA_FIELDCRAFT_RNG_BROWSER '+JSON.stringify({width,height,
   count:result.count,sharedDraws:result.draws,antiRepeat:result.antiRepeat}));
 }finally{await context.close();}
}
async function main(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{for(const [w,h] of [[320,640],[900,700]])await run(browser,w,h);}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
