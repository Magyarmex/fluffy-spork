'use strict';
// Acceptance against the shipping React + 48-overlay game, not an isolated
// canvas mock: last-known migration must survive the live 4.4s signal and
// remain legible at the real 60 CSS-pixel portrait minimap scale.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:320,height:568},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game,old=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaMigrationMemoryGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaMigrationMemoryGame?.status==='playing'&&
   !!window.__novaMigrationMemoryGame.__lfState,{timeout:30000});
  const result=await page.evaluate(()=>{
   const g=window.__novaMigrationMemoryGame,st=g.__lfState;
   if(!g.mm||!g.mmCtx||!window.__NOVA_LIVING_FRONT_INTERNAL__)
    throw Error('shipping minimap or Living Front not wired');
   g.setPaused(true);
   const original={time:g.time,signal:st.signal,bloomMemory:st.bloomMemory,
    migrationMemory:st.migrationMemory,directorEnabled:st.directorEnabled};
   const cssWidth=g.mm.getBoundingClientRect().width;
   if(Math.abs(cssWidth-60)>2)throw Error('expected real 60px CSS minimap: '+cssWidth);
   const down=document.createElement('canvas');down.width=60;down.height=60;
   const dc=down.getContext('2d');
   const sample=()=>{
    g.drawMinimap();
    const raw=new Uint8Array(g.mmCtx.getImageData(0,0,216,216).data);
    dc.clearRect(0,0,60,60);dc.drawImage(g.mm,0,0,60,60);
    return{raw,css:new Uint8Array(dc.getImageData(0,0,60,60).data)};
   };
   const count=(a,b,step,threshold)=>{
    let n=0;for(let i=0;i<a.length;i+=step){
     let d=0;for(let k=0;k<Math.min(3,step);k++)d=Math.max(d,Math.abs(a[i+k]-b[i+k]));
     if(d>threshold)n++;
    }return n;
   };
   try{
    g.time=105;st.signal=null;st.bloomMemory=null;st.directorEnabled=true;
    st.migrationMemory=null;const baseline=sample();
    st.migrationMemory={from:5,to:6,announcedAt:100,until:116};
    const afterimage=sample();
    const rawChanged=count(baseline.raw,afterimage.raw,4,18);
    const cssChanged=count(baseline.css,afterimage.css,4,18);
    if(rawChanged<35||cssChanged<7)
     throw Error('stale route is not legible in real minimap: '+JSON.stringify({rawChanged,cssChanged}));
    g.time=116;const expired=sample();
    if(count(baseline.raw,expired.raw,4,2)!==0)
     throw Error('expired migration route still rendered');
    g.time=105;st.signal={type:'BLOOM',sector:9,started:104,until:109};
    st.migrationMemory=null;const liveBaseline=sample();
    st.migrationMemory={from:5,to:6,announcedAt:100,until:116};
    const liveWithMemory=sample();
    if(count(liveBaseline.raw,liveWithMemory.raw,4,2)!==0)
     throw Error('stale migration overpainted a live BLOOM');
    st.signal=null;st.directorEnabled=false;
    const disabled=sample();
    if(count(baseline.raw,disabled.raw,4,2)!==0)
     throw Error('disabled Director still renders migration history');
    return{realShippingGame:true,cssWidth,rawChanged,cssChanged,
     expiredClean:true,liveSignalPriority:true,disabledClean:true};
   }finally{
    g.time=original.time;st.signal=original.signal;
    st.bloomMemory=original.bloomMemory;
    st.migrationMemory=original.migrationMemory;
    st.directorEnabled=original.directorEnabled;
   }
  });
  assert.deepEqual(errors,[],'no browser runtime errors');
  const dir=path.join('artifacts','browser');fs.mkdirSync(dir,{recursive:true});
  await page.screenshot({path:path.join(dir,'migration-route-memory-mobile.png')});
  console.log('NOVA_MIGRATION_ROUTE_MEMORY '+JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
