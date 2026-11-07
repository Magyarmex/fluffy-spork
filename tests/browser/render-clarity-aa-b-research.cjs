'use strict';
// Opt-in research only: real shipping Chromium Render clarity A/A/B.
// Not a fixed60 test, matched-world comparison, Android benchmark, or input-latency gate.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const phases=[100,65,100,100,65,65];
const viewports=[{name:'desktop',width:1280,height:800},{name:'mobile',width:320,height:640}];
const pct=(xs,p)=>{const s=[...xs].sort((a,b)=>a-b);return s[Math.ceil(s.length*p)-1];};
async function measure(browser,viewport,scale,index){
 const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},
  deviceScaleFactor:2,isMobile:viewport.name==='mobile',hasTouch:viewport.name==='mobile'});
 await context.addInitScript(v=>{
  localStorage.setItem('novatanks_pilot_settings_v1',JSON.stringify({renderScale:v}));
 },scale);
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
  await deploy.waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const old=Game.prototype.update;
   Game.prototype.update=function(dt){
    if(!this.__novaDecorativeWorld)window.__novaClarityResearchGame=this;
    return old.apply(this,arguments);
   };
  });
  await deploy.click();
  await page.waitForFunction(()=>window.__novaClarityResearchGame?.status==='playing',{timeout:30000});
  const data=await page.evaluate(async()=>{
   const g=window.__novaClarityResearchGame;
   // Fresh game per arm: no settings menu, pause, or rolling perf history crossover.
   await new Promise(resolve=>setTimeout(resolve,1800));
   const begin=performance.now(),gameTime=g.time,gaps=[];
   await new Promise(resolve=>{
    let prior=null;
    function frame(ts){
     if(prior!==null)gaps.push(ts-prior);
     prior=ts;
     if(ts-begin<4200)requestAnimationFrame(frame);else resolve();
    }
    requestAnimationFrame(frame);
   });
   return {scale:JSON.parse(localStorage.getItem('novatanks_pilot_settings_v1')).renderScale,
    quality:g.quality,dpr:g.dpr,css:[g.w,g.h],backing:[g.canvas.width,g.canvas.height],
    gameSeconds:g.time-gameTime,wallMs:performance.now()-begin,
    gaps,perf:window.NovaPerf?.snapshot(g)||null,status:g.status};
  });
  assert.equal(data.scale,scale);
  assert.ok(data.gaps.length>20,'real foreground RAF intervals required');
  assert.ok(data.backing.every(x=>Number.isFinite(x)&&x>0));
  assert.equal(data.status,'playing','must measure active gameplay, not menu');
  assert.equal(errors.length,0,'page errors: '+errors.join('; '));
  const total=data.gaps.reduce((a,b)=>a+b,0);
  return {viewport:viewport.name,index,scale,quality:data.quality,dpr:data.dpr,
   css:data.css,backing:data.backing,frames:data.gaps.length,
   fps:1000*data.gaps.length/total,p50GapMs:pct(data.gaps,.5),
   p95GapMs:pct(data.gaps,.95),p99GapMs:pct(data.gaps,.99),
   gameSeconds:data.gameSeconds,wallMs:data.wallMs,perf:data.perf};
 }finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 try{
  const records=[];
  for(const viewport of viewports)for(let i=0;i<phases.length;i++){
   const result=await measure(browser,viewport,phases[i],i);
   records.push(result);
   console.log('NOVA_CLARITY_PHASE '+JSON.stringify(result));
  }
  console.log('NOVA_CLARITY_RESEARCH '+JSON.stringify({researchOnly:true,
   caveats:['independent worlds not matched','not fixed60','not physical Android',
    'no human touch latency','CI hardware is not a phone'],records}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
