'use strict';
// Research-only real-browser witness: trusted touch delivery -> real player
// projectile birth in the shipping React/Game path. NOT first Canvas render,
// GPU presentation, or physical touch-to-photon latency.
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
   Game.prototype.update=function(...args){
    if(!this.__novaDecorativeWorld)window.__novaBirthGame=this;
    return originalUpdate.apply(this,args);
   };
   const originalTryFire=Game.prototype.tryFire;
   window.__novaBirths=[];
   Game.prototype.tryFire=function(t,...args){
    const before=this.bullets.length;
    const result=originalTryFire.call(this,t,...args);
    if(t&&t.isPlayer&&this.bullets.length>before)
     window.__novaBirths.push({at:performance.now(),gameTime:this.time});
    return result;
   };
   window.__novaTouchDelivery=[];
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
    document.addEventListener(type,e=>{
     if(e.pointerType==='touch')
      window.__novaTouchDelivery.push({type,at:performance.now(),trusted:e.isTrusted});
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
  });
  const box=await canvas.boundingBox();
  assert.ok(box&&box.width>200&&box.height>200);
  const origin={x:box.x+box.width*.72,y:box.y+box.height*.68,
   id:42,radiusX:1,radiusY:1,force:1};
  const extended={...origin,x:origin.x+Math.min(35,box.width*.12),y:origin.y-30};
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[extended]});
  await page.waitForFunction(()=>window.__novaBirths.length>0,null,{timeout:12000});
  const during=await page.evaluate(()=>{
   const g=window.__novaBirthGame;
   return {aimActive:g.input.aim.active,aimOwner:g.input.stickId.aim,
    firing:g.input.firing,shots:window.__novaBirths.slice(),
    events:window.__novaTouchDelivery.slice()};
  });
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[extended]});
  assert.equal(during.aimActive,true,'trusted right touch must own the aim stick');
  assert.equal(during.aimOwner,42,'real touch ownership must retain its pointer id');
  assert.equal(during.firing,true,'extended right touch must request fire');
  assert.ok(during.events.every(e=>e.trusted),'all recorded touches must be browser trusted');
  const down=during.events.find(e=>e.type==='pointerdown');
  const move=during.events.find(e=>e.type==='pointermove');
  assert.ok(down&&move,'real touch press and extension must be delivered');
  const birth=during.shots[0];
  assert.ok(Number.isFinite(birth.at)&&Number.isFinite(birth.gameTime));
  assert.ok(birth.at>=move.at,'projectile cannot predate the delivered aim extension');
  const delay=birth.at-move.at;
  assert.ok(delay>=0&&delay<12000,'a held touch must eventually produce a real projectile');
  assert.deepEqual(errors,[],'the real game must not throw');
  console.log('NOVA_TOUCH_TO_PROJECTILE_BIRTH '+JSON.stringify({
   viewport:'320x700',trusted:true,deliveryToBirthMs:Math.round(delay*1000)/1000,
   birthGameTime:birth.gameTime,projectilesObserved:during.shots.length,
   notMeasured:['first Canvas renderer submission','GPU presentation','physical photon latency']
  }));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
