'use strict';
// Research-only real-browser witness: trusted touch delivery -> real player
// projectile birth and the first projectile-core Canvas fill in the shipping
// React/Game path. Includes backing-store pixel verification; NOT GPU presentation or physical touch-to-photon latency.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 const context=await browser.newContext({viewport:{width:320,height:700},
  deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const originalUpdate=Game.prototype.update;
   window.__novaAimExtensionAt=null;
   window.__novaFirstFireSample=null;
   Game.prototype.update=function(...args){
    if(!this.__novaDecorativeWorld){
     window.__novaBirthGame=this;
     if(window.__novaAimExtensionAt!==null&&!window.__novaFirstFireSample&&
        this.input.firing&&this.input.aim.active)
      window.__novaFirstFireSample={at:performance.now(),gameTime:this.time};
    }
    return originalUpdate.apply(this,args);
   };
   const originalTryFire=Game.prototype.tryFire;
   window.__novaBirths=[];
   window.__novaBirthIds=[];
   window.__novaCanvasSubmit=[];
   // Exact shipping game/render bullet-core signature:
   // ctx.arc(b.x,b.y,br*0.55,0,TAU); ctx.fill() under lighter/white.
   // This excludes unrelated Canvas draws and does not claim GPU display.
   const canvasProto=CanvasRenderingContext2D.prototype;
   const originalArc=canvasProto.arc,originalFill=canvasProto.fill;
   let pendingBulletCore=false,pendingCenter=null;
   canvasProto.arc=function(x,y,r,start,end,...rest){
    pendingBulletCore=false;pendingCenter=null;
    const g=window.__novaBirthGame;
    if(g&&g.status==='playing'&&window.__novaAimExtensionAt!==null&&
       window.__novaBirths.length>0&&window.__novaCanvasSubmit.length===0&&
       this.canvas?.matches?.('canvas.absolute.inset-0')&&
       this.globalCompositeOperation==='lighter'&&this.fillStyle==='#ffffff'&&
       Math.abs(start)<1e-8&&Math.abs(end-Math.PI*2)<1e-6){
     pendingBulletCore=g.bullets.some(b=>{
      if(!b||b.beam||b.ownerId!==g.player.id||
         !window.__novaBirthIds.includes(b.id))return false;
      const hpFrac=b.maxHp?Math.max(.18,Math.min(1,(b.hp??b.maxHp)/b.maxHp)):1;
      const br=b.r*(.72+hpFrac*.28);
      return Math.abs(x-b.x)<1e-6&&Math.abs(y-b.y)<1e-6&&
       Math.abs(r-br*.55)<1e-6;
     });
    }
    if(pendingBulletCore)pendingCenter={x,y};
    return originalArc.call(this,x,y,r,start,end,...rest);
   };
   canvasProto.fill=function(...args){
    const matched=pendingBulletCore&&window.__novaCanvasSubmit.length===0;
    const center=matched?this.getTransform().transformPoint(pendingCenter):null;
    pendingBulletCore=false;pendingCenter=null;
    const result=originalFill.apply(this,args);
    if(matched){
     const g=window.__novaBirthGame;
     const px=Math.max(0,Math.min(this.canvas.width-1,Math.floor(center.x)));
     const py=Math.max(0,Math.min(this.canvas.height-1,Math.floor(center.y)));
     const paintAt=performance.now(); // Capture before synchronous GPU/Canvas readback.
     const rgba=Array.from(this.getImageData(px,py,1,1).data);
     const rasterReadMs=performance.now()-paintAt;
     window.__novaCanvasSubmit.push({at:paintAt,method:'bullet-core-fill',
      gameTime:g.time,rgba,rasterReadMs});
    }
    return result;
   };
   Game.prototype.tryFire=function(t,...args){
    const before=this.bullets.length;
    const result=originalTryFire.call(this,t,...args);
    if(!this.__novaDecorativeWorld&&this===window.__novaBirthGame&&
       t&&t.isPlayer&&this.bullets.length>before){
     window.__novaBirthIds.push(...this.bullets.slice(before).map(b=>b.id));
     window.__novaBirths.push({at:performance.now(),gameTime:this.time});
    }
    return result;
   };
   window.__novaTouchDelivery=[];
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
    document.addEventListener(type,e=>{
     if(e.pointerType==='touch'){
      const at=performance.now();
      window.__novaTouchDelivery.push({type,at,trusted:e.isTrusted});
      if(type==='pointermove'&&window.__novaAimExtensionAt===null)
       window.__novaAimExtensionAt=at;
     }
    },{capture:true,passive:true});
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>window.__novaBirthGame?.status==='playing',null,{timeout:20000});
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  await page.evaluate(()=>{
   const g=window.__novaBirthGame;
   g.input.autofire=false;g.player.spawnShieldT=20;
   // Eliminate prior AUTO cooldown as a confound in this single-shot timing
   // witness. Do not modify class reload, projectile physics or firing logic.
   g.player.fireCd=0;
   window.__novaBirths.length=0; // Exclude any pre-interaction AUTO shots.
   window.__novaBirthIds.length=0;
   window.__novaCanvasSubmit.length=0; // Exclude pre-interaction draw activity.
   window.__novaFirstFireSample=null;
   window.__novaAimExtensionAt=null;
  });
  const box=await canvas.boundingBox();
  assert.ok(box&&box.width>200&&box.height>200);
  const origin={x:box.x+box.width*.72,y:box.y+box.height*.68,
   id:42,radiusX:1,radiusY:1,force:1};
  const extended={...origin,x:origin.x+Math.min(35,box.width*.12),y:origin.y-30};
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
  // Centered right-stick ownership is not a fire command. This also ensures
  // the measured projectile follows deliberate extension, not the initial tap.
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>window.__novaBirths.length),0,
   'a centered touch must not create a projectile');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[extended]});
  await page.waitForFunction(()=>window.__novaBirths.length>0,null,{timeout:12000});
  const during=await page.evaluate(()=>{
   const g=window.__novaBirthGame;
   return {aimActive:g.input.aim.active,aimOwner:g.input.stickId.aim,
    firing:g.input.firing,firstFireSample:window.__novaFirstFireSample,
    shots:window.__novaBirths.slice(),
    events:window.__novaTouchDelivery.slice()};
  });
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[extended]});
  assert.equal(during.aimActive,true,'trusted right touch must own the aim stick');
  // Chromium remaps CDP contact ids to DOM pointerId values; asserting the
  // CDP-supplied id (42) would confuse transport identity with DOM ownership.
  assert.ok(Number.isInteger(during.aimOwner)&&during.aimOwner>=0,
   'the right stick must retain a real DOM pointer owner');
  assert.equal(during.firing,true,'extended right touch must request fire');
  assert.ok(during.events.every(e=>e.trusted),'all recorded touches must be browser trusted');
  const down=during.events.find(e=>e.type==='pointerdown');
  const move=during.events.find(e=>e.type==='pointermove');
  assert.ok(down&&move,'real touch press and extension must be delivered');
  const birth=during.shots[0];
  await page.waitForFunction(()=>window.__novaCanvasSubmit.length>0,null,{timeout:12000});
  const canvasSubmit=await page.evaluate(()=>window.__novaCanvasSubmit[0]);
  assert.ok(canvasSubmit.rgba.length===4&&
   canvasSubmit.rgba.slice(0,3).every(c=>c>=200)&&canvasSubmit.rgba[3]>=200,
   'actual player projectile core must produce a bright opaque backing pixel');
  assert.ok(Number.isFinite(canvasSubmit.at)&&canvasSubmit.at>=birth.at,
   'the exact player projectile core fill must follow projectile birth');
  assert.ok(Number.isFinite(birth.at)&&Number.isFinite(birth.gameTime));
  assert.ok(during.firstFireSample&&Number.isFinite(during.firstFireSample.at),
   'the actual Game.update must observe held fire before projectile birth');
  assert.ok(during.firstFireSample.at>=move.at,
   'simulation application cannot predate the delivered aim extension');
  assert.ok(birth.at>=during.firstFireSample.at,
   'projectile birth cannot predate the first fire-sampling Game.update');
  const delay=birth.at-move.at;
  const inputToSample=during.firstFireSample.at-move.at;
  const sampleToBirth=birth.at-during.firstFireSample.at;
  assert.ok(delay>=0&&delay<12000,'a held touch must eventually produce a real projectile');
  assert.deepEqual(errors,[],'the real game must not throw');
  console.log('NOVA_TOUCH_TO_PROJECTILE_BIRTH '+JSON.stringify({
   viewport:'320x700',trusted:true,deliveryToBirthMs:Math.round(delay*1000)/1000,
   deliveryToSimulationMs:Math.round(inputToSample*1000)/1000,
   simulationToBirthMs:Math.round(sampleToBirth*1000)/1000,
   birthGameTime:birth.gameTime,projectilesObserved:during.shots.length,
   deliveryToCanvasSubmitMs:Math.round((canvasSubmit.at-move.at)*1000)/1000,
   birthToCanvasSubmitMs:Math.round((canvasSubmit.at-birth.at)*1000)/1000,
   canvasMethod:canvasSubmit.method,canvasCoreRgba:canvasSubmit.rgba,
   rasterReadMs:Math.round(canvasSubmit.rasterReadMs*1000)/1000,
   notMeasured:['GPU presentation','physical photon latency']
  }));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
