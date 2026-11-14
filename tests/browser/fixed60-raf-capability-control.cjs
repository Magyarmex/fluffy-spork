'use strict';
// Research-only Chromium host capability check. This measures a blank page,
// not the physical display, GPU completion, or the composed Game. Its result
// selects the least invasive launch flags for the separate same-process Game
// + blank-page experiment; failure is reported as an inconclusive host, never
// as a 90Hz Game pass.
const {chromium}=require('playwright');
const {summarizeRaf}=require('../research/fixed60-raf-capability.cjs');
const modes=[
 {name:'default',extraArgs:[]},
 {name:'gpu-vsync',extraArgs:['--disable-gpu-vsync']}
];
async function measure(mode){
 const browser=await chromium.launch({headless:true,args:[
  '--disable-dev-shm-usage','--no-sandbox','--disable-frame-rate-limit',...mode.extraArgs
 ]});
 try{
  const context=await browser.newContext({viewport:{width:320,height:700},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  try{
   const page=await context.newPage();
   await page.goto('about:blank');
   const raw=await page.evaluate(async durationMs=>{
    const measure=async controlled=>{
     const intervals=[];let previous=null,gateNext=null;
     const started=performance.now();
     await new Promise(resolve=>{
      const tick=ts=>{
       if(controlled){
        if(gateNext===null)gateNext=ts;
        if(ts+0.2<gateNext){requestAnimationFrame(tick);return;}
        gateNext+=1000/90;
       }
       if(previous!==null)intervals.push(ts-previous);
       previous=ts;
       if(ts-started>=durationMs)resolve();else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
     });
     return {intervals,measuredMs:performance.now()-started};
    };
    return {native:await measure(false),controlled90Hz:await measure(true)};
   },1600);
   const nativeRaf=summarizeRaf(raw.native.intervals,raw.native.measuredMs);
   const blankRaf=summarizeRaf(raw.controlled90Hz.intervals,raw.controlled90Hz.measuredMs);
   return {mode:mode.name,nativeRaf,blankRaf,supports90Hz:blankRaf.supports90Hz};
  }finally{await context.close();}
 }finally{await browser.close();}
}
(async()=>{
 const results=[];
 for(const mode of modes)results.push(await measure(mode));
 const selected=results.find(result=>result.supports90Hz)||results[0];
 console.log('NOVA_FIXED60_RAF_CAPABILITY_CONTROL '+JSON.stringify({
  researchOnly:true,control:'about:blank requestAnimationFrame',
  acceptance:{hzMin:80,hzMax:100,p95MsBelow:15},
  results,selectedMode:selected.mode,hostSupports90Hz:selected.supports90Hz
 }));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
