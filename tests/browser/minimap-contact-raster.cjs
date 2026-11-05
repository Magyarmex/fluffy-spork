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
    const old=ctx.fillRect;let suppressed=0,keylineCalls=0,targetDotCalls=0;
    ctx.fillRect=function(x,y,w,h){
     if(w===3&&h===3&&Math.abs(x-dotX)<.01&&Math.abs(y-dotY)<.01)targetDotCalls++;
     if((w===7&&h===7&&Math.abs(x-(dotX-2))<.01&&Math.abs(y-(dotY-2))<.01)||
        (w===5&&h===5&&Math.abs(x-(dotX-1))<.01&&Math.abs(y-(dotY-1))<.01)){
      keylineCalls++;
      if(skipKeyline){suppressed++;return;}
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
    return {url:scaled.toDataURL('image/png'),backingUrl:backing.toDataURL('image/png'),center,neighbors,contrast,suppressed,keylineCalls,targetDotCalls};
   }
   const keyed=raster(false),bare=raster(true);
   // Crowded natural-combat proxy: preserve real Game rendering, but place
   // another public rival and an ordinary powerup within the keyline radius.
   // This is a deliberately adverse visibility scene, not encounter frequency.
   enemies[1].x=70;enemies[1].y=0;
   g.powerups.push({type:'health',x:75,y:0});
   const crowded=raster(false);
   return {width:innerWidth,dpr:devicePixelRatio,backing:[backing.width,backing.height],
    enemyColor:target.color,keyed,bare,crowded};
  });
  assert.equal(result.width,width);
  assert.equal(result.dpr,dpr);
  assert.deepEqual(result.backing,[216,216],'shipping minimap backing geometry changed');
  assert.equal(result.bare.suppressed,2,'actual isolated rival keyline must be present');
  assert.equal(result.keyed.keylineCalls,2,'isolated rival must receive both keyline layers');
  assert.equal(result.crowded.keylineCalls,0,'crowded rival must not cover adjacent public contacts with a keyline');
  for(const mode of ['keyed','bare','crowded'])
   assert.ok(result[mode].targetDotCalls>=1,mode+' must still paint the actual public rival');
  assert.notEqual(result.keyed.url,result.bare.url,'keyline must change actual 60px browser raster');
  const out=path.join('artifacts','browser');fs.mkdirSync(out,{recursive:true});
  for(const mode of ['keyed','bare','crowded']){
   fs.writeFileSync(path.join(out,'minimap-raster-'+width+'-dpr'+dpr+'-'+mode+'.png'),
    Buffer.from(result[mode].url.split(',')[1],'base64'));
   delete result[mode].url;
   // Retain only on the browser side until independent CSS composition finishes.
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
  // Capture immutable backing PNGs *during* each real Game draw. Repainting
  // the same paused canvas later is not a reliable browser capture boundary.
  // Compare independent DOM surfaces, not stale in-place compositor snapshots.
  await page.evaluate(async ({keyed,bare,crowded})=>{
   for(const [mode,url,left] of [['keyed',keyed,0],['bare',bare,70],['crowded',crowded,140]]){
    const im=new Image();im.src=url;await im.decode();
    const el=document.createElement('canvas');el.id='nova-minimap-css-'+mode;
    el.width=216;el.height=216;el.style.cssText=
      'position:fixed;top:110px;left:'+left+'px;width:60px;height:60px;z-index:99999;image-rendering:auto';
    el.getContext('2d').drawImage(im,0,0);
    document.body.appendChild(el);
   }
  },{keyed:result.keyed.backingUrl,bare:result.bare.backingUrl,crowded:result.crowded.backingUrl});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const cloneKeyed=await page.locator('#nova-minimap-css-keyed').screenshot({
   path:path.join(out,'minimap-css-clone-'+width+'-dpr'+dpr+'-keyed.png')});
  const cloneBare=await page.locator('#nova-minimap-css-bare').screenshot({
   path:path.join(out,'minimap-css-clone-'+width+'-dpr'+dpr+'-bare.png')});
  const cloneCrowded=await page.locator('#nova-minimap-css-crowded').screenshot({
   path:path.join(out,'minimap-css-clone-'+width+'-dpr'+dpr+'-crowded.png')});
  assert.notDeepEqual(cloneCrowded,cloneKeyed,'crowded public contacts must change the real CSS-composited map');
  assert.notDeepEqual(cloneKeyed,cloneBare,
   'independent CSS-composited 60px copies of real Game paint must differ');
  // Measure the *composited device-pixel* image, not only a fixed 60x60
  // offscreen downsample. DPR 2/3 must analyze 120/180 physical pixels.
  const displayed=await page.evaluate(async ({keyed,bare,crowded,dpr})=>{
   async function measure(base64){
    const image=new Image();image.src='data:image/png;base64,'+base64;
    await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0);
    const w=canvas.width,h=canvas.height,data=ctx.getImageData(0,0,w,h).data;
    const pixel=(x,y)=>{const i=(y*w+x)*4;return [...data.slice(i,i+3)];};
    const x=Math.floor(w/2),y=Math.floor(h/2),r=Math.max(1,Math.round(4*dpr));
    const center=pixel(x,y),neighbors=[pixel(x-r,y),pixel(x+r,y),pixel(x,y-r),pixel(x,y+r)];
    const contrast=Math.max(...neighbors.map(p=>Math.hypot(...center.map((v,i)=>v-p[i]))));
    return {width:w,height:h,center,contrast};
   }
   return {keyed:await measure(keyed),bare:await measure(bare),crowded:await measure(crowded)};
  },{keyed:cloneKeyed.toString('base64'),bare:cloneBare.toString('base64'),crowded:cloneCrowded.toString('base64'),dpr});
  for(const mode of ['keyed','bare','crowded']){
   assert.equal(displayed[mode].width,60*dpr,'CSS capture must use actual device pixel width');
   assert.equal(displayed[mode].height,60*dpr,'CSS capture must use actual device pixel height');
  }
  assert.notDeepEqual(displayed.keyed.center,displayed.bare.center,
   'keyline must affect the real DPR-scaled contact-center pixels');
  // No threshold is imposed on crowded readability: report the measured
  // pixels before selecting any visual intervention or claiming human benefit.
  result.displayed=displayed;
  delete result.keyed.backingUrl;delete result.bare.backingUrl;delete result.crowded.backingUrl;
  console.log('NOVA_MINIMAP_COMPOSITOR '+JSON.stringify({width,dpr,
   independentBackings:true,crowdedContact:true,sameOwner:ownership.same}));
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
