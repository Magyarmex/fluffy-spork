'use strict';
// Research-only Chromium host capability check. This measures a blank page,
// not the physical display, GPU completion, or the composed Game. Its result
// selects the least invasive launch flags for the separate same-process Game
// + blank-page experiment; failure is reported as an inconclusive host, never
// as a 90Hz Game pass.
const {chromium}=require('playwright');
const modes=[
 {name:'default',extraArgs:[]},
 {name:'gpu-vsync',extraArgs:['--disable-gpu-vsync']}
];
async function measure(mode){
 const browser=await chromium.launch({headless:true,args:[
  '--disable-dev-shm-usage','--no-sandbox','--disable-frame-rate-limit',...mode.extraArgs
 ]});
 try{
  const page=await browser.newPage();
  await page.goto('about:blank');
  const sample=await page.evaluate(async durationMs=>{
   const intervals=[];let previous=null;const started=performance.now();
   await new Promise(resolve=>{
    const tick=ts=>{
     if(previous!==null)intervals.push(ts-previous);
     previous=ts;
     if(ts-started>=durationMs)resolve();else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
   });
   const sorted=intervals.slice(3).sort((a,b)=>a-b);
   const total=sorted.reduce((sum,value)=>sum+value,0);
   const p95=sorted.length?sorted[Math.ceil(.95*sorted.length)-1]:null;
   const median=sorted.length?sorted[Math.floor((sorted.length-1)/2)]:null;
   const hz=sorted.length&&total>0?sorted.length*1000/total:null;
   return {frames:intervals.length,measuredMs:performance.now()-started,
    hz,p95,median,min:sorted.length?sorted[0]:null,
    max:sorted.length?sorted[sorted.length-1]:null,
    supports90Hz:Number.isFinite(hz)&&hz>=80&&hz<=100&&p95<15};
  },2200);
  return {mode:mode.name,...sample};
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
