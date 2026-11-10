'use strict';
// Research-only Chromium lifecycle smoke for the actual 49-overlay Game.
// Synthetic telemetry deliberately tests resize ownership, NOT FPS benefit.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const pilotSource=fs.readFileSync('tests/research/fps-adaptive-dpr.cjs','utf8');
const slow={frameSamples:120,fps:32,frameP95Ms:45,updateP95Ms:9,
 renderP95Ms:6,simulationPacePct:70};
const improved={frameSamples:120,fps:55,frameP95Ms:22,updateP95Ms:5,
 renderP95Ms:4,simulationPacePct:95};
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:320,height:700},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const errors=[];
 try{
  // Install before React loads; no shipping files or game owners are changed.
  await context.addInitScript({content:
   '(function(){const module={exports:{}};'+pilotSource+
   ';window.__novaDprResearchFactory=module.exports.createAdaptiveDprPilot;})();'});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
  await deploy.waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const original=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaDprResearchGame=this;
    return original.apply(this,arguments);
   };
  });
  await deploy.click();
  await page.waitForFunction(()=>window.__novaDprResearchGame?.status==='playing',
   {timeout:30000});
  const report=await page.evaluate(async({slow,improved})=>{
   const g=window.__novaDprResearchGame;
   if(typeof window.__novaDprResearchFactory!=='function')
    throw Error('research pilot injection failed');
   g.quality='low';g.resize();
   const initial={dpr:g.dpr,w:g.w,h:g.h,backing:[g.canvas.width,g.canvas.height],
    gameTime:g.time};
   if(initial.dpr!==1.5)throw Error('expected low-quality DPR 1.5');
   const pilot=window.__novaDprResearchFactory(g,{visible:()=>true});
   const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const raster=()=>{
    const ctx=g.canvas.getContext('2d'),w=g.canvas.width,h=g.canvas.height;
    const data=ctx.getImageData(0,0,w,h).data;
    let opaque=0;
    for(let i=3;i<data.length;i+=4*97)if(data[i]>0)opaque++;
    return {width:w,height:h,opaqueSamples:opaque};
   };
   await frame();
   const before=raster();
   pilot.sample(0,slow);const started=pilot.sample(1000,slow);
   await frame();
   const probing={dpr:g.dpr,kind:started.kind,raster:raster()};
   let accepted;
   for(let t=1500;t<=7000;t+=500)accepted=pilot.sample(t,improved);
   await frame();
   const low={dpr:g.dpr,kind:accepted.kind,raster:raster()};
   let restored;
   for(let t=7500;t<=15500;t+=500)restored=pilot.sample(t,null);
   await frame();
   const after={dpr:g.dpr,kind:restored.kind,raster:raster(),
    gameTime:g.time,css:[g.w,g.h],phase:pilot.state.phase};
   pilot.stop();
   return {initial,before,probing,low,after};
  },{slow,improved});
  assert.equal(report.probing.kind,'probe-started');
  assert.equal(report.probing.dpr,1);
  assert.equal(report.low.kind,'probe-accepted');
  assert.equal(report.low.dpr,1);
  assert.deepEqual([report.probing.raster.width,report.probing.raster.height],
   [Math.round(report.initial.w),Math.round(report.initial.h)]);
  assert.deepEqual([report.low.raster.width,report.low.raster.height],
   [Math.round(report.initial.w),Math.round(report.initial.h)]);
  assert.equal(report.after.kind,'low-no-evidence-rollback');
  assert.equal(report.after.dpr,1.5);
  assert.deepEqual(report.after.css,[report.initial.w,report.initial.h]);
  assert.deepEqual([report.before.width,report.before.height],report.initial.backing);
  assert.deepEqual([report.after.raster.width,report.after.raster.height],report.initial.backing);
  for(const sample of [report.before,report.probing.raster,report.low.raster,report.after.raster])
   assert.ok(sample.opaqueSamples>0,'Canvas must paint opaque pixels after resize');
  assert.ok(report.after.gameTime>report.initial.gameTime,'real Game must continue updating');
  assert.equal(errors.length,0,'page errors: '+errors.join('; '));
  console.log('NOVA_ADAPTIVE_DPR_COMPOSED_BROWSER '+JSON.stringify(report));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
