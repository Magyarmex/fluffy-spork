'use strict';
// Research-only Chromium raster audit of the *composed shipping Game* minimap.
// The 216px backing map is presented at 60 CSS pixels. Do not mistake this
// deterministic screenshot/contrast pilot for physical-phone recognition.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
async function run(browser,width,dpr){
 const context=await browser.newContext({viewport:{width,height:568},deviceScaleFactor:dpr,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const old=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld&&this.player)window.__novaMinimapAuditGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaMinimapAuditGame?.status==='playing',null,{timeout:30000});
  await page.waitForFunction(()=>window.__novaMinimapAuditGame?.time>0.25,null,{timeout:15000});
  // The shipping React loading veil outlives Game.status='playing'.
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  // Capture an untouched real-match contact distribution before constructing
  // the isolated A/B scene. This is observational, not a gameplay assertion.
  const naturalOut=path.join('artifacts','browser');
  fs.mkdirSync(naturalOut,{recursive:true});
  await page.locator('canvas[width="216"][height="216"]').first().screenshot({
   path:path.join(naturalOut,'minimap-natural-'+width+'-dpr'+dpr+'.png')});
  const result=await page.evaluate(()=>{
   const g=window.__novaMinimapAuditGame;
   // Freeze world updates without mounting the opaque React PAUSED veil;
   // otherwise element screenshots would measure the veil, not live HUD pixels.
   g.paused=true;
   const enemies=g.tanks.filter(t=>t.alive&&!t.isPlayer);
   if(!g.player||enemies.length<2||!g.mmCtx?.canvas)throw Error('live composed Game/minimap missing');
   const target=enemies[0];
   g.player.x=-1800;g.player.y=-1800;
   enemies.forEach((t,i)=>{t.x=1300+(i%4)*180;t.y=1200+Math.floor(i/4)*180;});
   target.x=0;target.y=0;
   g.shapes.forEach((s,i)=>{s.x=-1800+(i%12)*35;s.y=1400+Math.floor(i/12)*35;});
   g.powerups.length=0;
   const backing=g.mmCtx.canvas,ctx=g.mmCtx;
   const dotX=106.5,dotY=106.5; // (0+2250)*216/4500 - 1.5
   function raster(skipKeyline){
    const old=ctx.fillRect;let suppressed=0;
    if(skipKeyline)ctx.fillRect=function(x,y,w,h){
     if((w===7&&h===7&&Math.abs(x-(dotX-2))<.01&&Math.abs(y-(dotY-2))<.01)||
        (w===5&&h===5&&Math.abs(x-(dotX-1))<.01&&Math.abs(y-(dotY-1))<.01)){
      suppressed++;return;
     }
     return old.apply(this,arguments);
    };
    try{g.drawMinimap();}finally{ctx.fillRect=old;}
    const scaled=document.createElement('canvas');scaled.width=60;scaled.height=60;
    const sc=scaled.getContext('2d');sc.imageSmoothingEnabled=true;
    sc.drawImage(backing,0,0,60,60);
    const data=sc.getImageData(0,0,60,60).data;
    const x=30,y=30;
    const pixel=(xx,yy)=>{const i=(yy*60+xx)*4;return [...data.slice(i,i+3)];};
    const center=pixel(x,y),neighbors=[pixel(26,30),pixel(34,30),pixel(30,26),pixel(30,34)];
    const contrast=Math.max(...neighbors.map(p=>Math.hypot(...center.map((v,i)=>v-p[i]))));
    return {url:scaled.toDataURL('image/png'),center,neighbors,contrast,suppressed};
   }
   window.__novaMinimapPaint=function(skipKeyline){
    const old=ctx.fillRect;
    if(skipKeyline)ctx.fillRect=function(x,y,w,h){
     if((w===7&&h===7&&Math.abs(x-(dotX-2))<.01&&Math.abs(y-(dotY-2))<.01)||
        (w===5&&h===5&&Math.abs(x-(dotX-1))<.01&&Math.abs(y-(dotY-1))<.01))return;
     return old.apply(this,arguments);
    };
    try{g.drawMinimap();}finally{ctx.fillRect=old;}
   };
   const keyed=raster(false),bare=raster(true);
   return {width:innerWidth,dpr:devicePixelRatio,backing:[backing.width,backing.height],
    enemyColor:target.color,keyed,bare};
  });
  assert.equal(result.width,width);
  assert.equal(result.dpr,dpr);
  assert.deepEqual(result.backing,[216,216],'shipping minimap backing geometry changed');
  assert.equal(result.bare.suppressed,2,'actual isolated rival keyline must be present');
  assert.notEqual(result.keyed.url,result.bare.url,'keyline must change actual 60px browser raster');
  const out=path.join('artifacts','browser');fs.mkdirSync(out,{recursive:true});
  for(const mode of ['keyed','bare']){
   fs.writeFileSync(path.join(out,'minimap-raster-'+width+'-dpr'+dpr+'-'+mode+'.png'),
    Buffer.from(result[mode].url.split(',')[1],'base64'));
   delete result[mode].url;
  }
  const visible=page.locator('canvas[width="216"][height="216"]').first();
  assert.equal(await visible.count(),1,'real 216px minimap canvas must be mounted in React');
  const ownership=await visible.evaluate(el=>({
   same:el===window.__novaMinimapAuditGame.mm,
   box:el.getBoundingClientRect().toJSON(),
   covering:document.elementFromPoint(el.getBoundingClientRect().x+30,el.getBoundingClientRect().y+30)?.tagName
  }));
  assert.equal(ownership.same,true,'sampled DOM canvas must be the real Game minimap');
  assert.ok(Math.abs(ownership.box.width-60)<1,'minimap must actually display at 60 CSS px');
  const flush=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>window.__novaMinimapPaint(false));
  const rawKeyed=await visible.evaluate(el=>el.toDataURL('image/png'));
  await flush();
  const cssKeyed=await visible.screenshot({path:path.join(out,'minimap-css-'+width+'-dpr'+dpr+'-keyed.png')});
  await page.evaluate(()=>window.__novaMinimapPaint(true));
  const rawBare=await visible.evaluate(el=>el.toDataURL('image/png'));
  await flush();
  const cssBare=await visible.screenshot({path:path.join(out,'minimap-css-'+width+'-dpr'+dpr+'-bare.png')});
  assert.notEqual(rawKeyed,rawBare,'real DOM minimap backing pixels must differ');
  // Chromium can retain a stale composited surface for repeated screenshots
  // of an in-place mutated, paused canvas. Build two independent DOM canvases
  // from the exact real Game backing PNGs, with the shipping 60px CSS footprint,
  // and capture both in one stable composition instead of accepting a stale A/B.
  await page.evaluate(async ({keyed,bare})=>{
   for(const [mode,url,left] of [['keyed',keyed,0],['bare',bare,70]]){
    const im=new Image();im.src=url;await im.decode();
    const el=document.createElement('canvas');el.id='nova-minimap-css-'+mode;
    el.width=216;el.height=216;el.style.cssText=
      'position:fixed;top:110px;left:'+left+'px;width:60px;height:60px;z-index:99999;image-rendering:auto';
    el.getContext('2d').drawImage(im,0,0);
    document.body.appendChild(el);
   }
  },{keyed:rawKeyed,bare:rawBare});
  await flush();
  const cloneKeyed=await page.locator('#nova-minimap-css-keyed').screenshot({
   path:path.join(out,'minimap-css-clone-'+width+'-dpr'+dpr+'-keyed.png')});
  const cloneBare=await page.locator('#nova-minimap-css-bare').screenshot({
   path:path.join(out,'minimap-css-clone-'+width+'-dpr'+dpr+'-bare.png')});
  assert.notDeepEqual(cloneKeyed,cloneBare,
   'independent CSS-composited 60px copies of real Game paint must differ');
  console.log('NOVA_MINIMAP_COMPOSITOR '+JSON.stringify({width,dpr,
   liveInPlaceScreenshotChanged:!cssKeyed.equals(cssBare),sameOwner:ownership.same}));
  await page.screenshot({path:path.join(out,'minimap-raster-'+width+'-dpr'+dpr+'-game.png')});
  assert.deepEqual(errors,[],'shipping Chromium runtime errors');
  console.log('NOVA_MINIMAP_CHROMIUM_RASTER '+JSON.stringify(result));
 }finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{for(const width of [280,320])for(const dpr of [1,2,3])await run(browser,width,dpr);}
 finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
