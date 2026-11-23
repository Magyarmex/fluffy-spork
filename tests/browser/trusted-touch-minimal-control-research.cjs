'use strict';
// #799: same-runner negative control for trusted CDP touch event batching.
// This deliberately contains NO NOVA runtime. Do not infer physical Android
// input latency or Game causality from its output.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');
const phases=[100,80,65,65,80,100];
const html=String.raw`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body style="margin:0"><canvas style="width:320px;height:700px;touch-action:none"></canvas><script>
window.__research={events:[],frames:[],scale:100};
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
 document.addEventListener(type,e=>{
  if(e.pointerType==='touch')window.__research.events.push({
   type,at:performance.now(),stamp:e.timeStamp,trusted:e.isTrusted
  });
 },{capture:true,passive:true});
let prev=0;
function frame(t){
 if(prev)window.__research.frames.push(t-prev);prev=t;
 const s=window.__research.scale/100,w=Math.round(640*s),h=Math.round(1400*s);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 ctx.clearRect(0,0,w,h);
 for(let i=0;i<350;i++){
  ctx.fillStyle=i%2?'#457':'#abc';
  ctx.fillRect((i*137)%w,(i*71)%h,20,20);
 }
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
<\/script></body></html>`;
const median=a=>a.length?[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)]:null;
const round=n=>n==null?null:+n.toFixed(2);
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const results=[];
 try{
  const context=await browser.newContext({viewport:{width:320,height:700},
   deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const page=await context.newPage();
  await page.setContent(html);
  const cdp=await context.newCDPSession(page);
  const origin={x:230,y:450,id:41,radiusX:1,radiusY:1,force:1};
  const moved={...origin,x:260,y:420};
  try{
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   for(let phase=0;phase<phases.length;phase++){
    const scale=phases[phase];
    await page.evaluate(s=>{window.__research.scale=s;window.__research.events=[];
     window.__research.frames=[];},scale);
    await page.waitForTimeout(180);
    for(let trial=0;trial<8;trial++){
     const down=cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
     const move=cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});
     await new Promise(resolve=>setTimeout(resolve,40));
     const up=cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
     await Promise.all([down,move,up]);
     await page.waitForTimeout(120);
    }
    const data=await page.evaluate(()=>window.__research);
    const trials=[];
    for(let i=0;i<data.events.length;i+=3){
     const triple=data.events.slice(i,i+3);
     assert.deepEqual(triple.map(e=>e.type),['pointerdown','pointermove','pointerup'],
      'minimal fixture must deliver each complete touch gesture');
     assert.ok(triple.every(e=>e.trusted),'browser events must be trusted');
     const move=triple[1],up=triple[2];
     trials.push({deliveredHoldMs:round(up.at-move.at),
      stampedHoldMs:round(up.stamp-move.stamp),
      moveAgeMs:round(move.at-move.stamp)});
    }
    assert.equal(trials.length,8,'each phase must have eight complete gestures');
    results.push({phase,scale,trials,compressed:trials.filter(t=>t.deliveredHoldMs<=1.4).length,
     medianDeliveredHoldMs:round(median(trials.map(t=>t.deliveredHoldMs))),
     medianStampedHoldMs:round(median(trials.map(t=>t.stampedHoldMs))),
     medianMoveAgeMs:round(median(trials.map(t=>t.moveAgeMs))),
     medianRafGapMs:round(median(data.frames))});
    console.log('NOVA_TOUCH_MINIMAL_CONTROL '+JSON.stringify(results.at(-1)));
   }
  }finally{
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:1}).catch(()=>{});
   await context.close();
  }
  assert.deepEqual(results.map(r=>r.scale),phases);
  fs.mkdirSync('artifacts/browser',{recursive:true});
  fs.writeFileSync('artifacts/browser/touch-minimal-control-research.json',
   JSON.stringify({researchOnly:true,runner:'Playwright Chromium CDP synthetic CPU x4',
    protocol:'concurrent down/move, 40ms host delay, release, same as NOVA research',
    results,caveats:['not the composed NOVA game','not an Android device',
     'canvas workload is not equivalent to NOVA render/compositor',
     'a negative control on one runner cannot prove causality',
     'browser event timestamps are not hardware touch timestamps']},null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
