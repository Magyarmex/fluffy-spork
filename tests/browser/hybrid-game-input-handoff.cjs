'use strict';
// Shipping React + Chromium hybrid-device regression. Use browser-trusted
// mouse input and CDP touch events, not calls to mocked Input handlers.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 const context=await browser.newContext({viewport:{width:800,height:600},hasTouch:true,isMobile:false});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const update=Game.prototype.update;
   Game.prototype.update=function(dt){
    if(!this.__novaDecorativeWorld)window.__novaHybridGame=this;
    return update.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>window.__novaHybridGame?.status==='playing',null,{timeout:20000});
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  await page.evaluate(()=>{
   const g=window.__novaHybridGame;
   g.input.autofire=false;g.player.spawnShieldT=20;
  });
  const box=await canvas.boundingBox();
  assert.ok(box&&box.width>300&&box.height>300);
  const left={x:box.x+box.width*.20,y:box.y+box.height*.68,id:17,radiusX:1,radiusY:1,force:1};
  const right={x:box.x+box.width*.78,y:box.y+box.height*.68};
  const cdp=await context.newCDPSession(page);
  const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  const state=()=>page.evaluate(()=>{
   const i=window.__novaHybridGame.input;
   return {touchSeen:i.touchSeen,mouseActive:i.mouseActive,firing:i.firing,
    move:i.move.active,aim:i.aim.active,moveId:i.stickId.move,aimId:i.stickId.aim};
  });
  // A real touch must claim the left stick and release it without sticky fire.
  await touch('touchStart',[left]);
  assert.equal((await state()).move,true,'touch starts movement');
  await touch('touchEnd',[]);
  assert.equal((await state()).move,false,'touch release clears movement');
  // A genuine mouse must reclaim the same Game session immediately, even
  // though the core Input.touchSeen flag was set by the previous touch.
  await page.mouse.move(right.x,right.y);
  await page.mouse.down({button:'left'});
  const mouse=await state();
  assert.equal(mouse.mouseActive,true,'real mouse reclaimed hybrid input');
  assert.equal(mouse.firing,true,'physical primary mouse button fires');
  assert.equal(mouse.move,false,'no phantom touch movement');
  await page.mouse.up({button:'left'});
  assert.equal((await state()).firing,false,'mouse release stops firing');
  // Switching back to touch cannot inherit mouse firing or mouse ownership.
  await touch('touchStart',[left]);
  const again=await state();
  assert.equal(again.move,true,'touch reclaims movement');
  assert.equal(again.mouseActive,false,'touch clears previous mouse owner');
  assert.equal(again.firing,false,'left touch does not invent a shot');
  await touch('touchCancel',[]);
  const end=await state();
  assert.equal(end.move,false);assert.equal(end.aim,false);assert.equal(end.firing,false);
  assert.deepEqual(errors,[],'no uncaught browser errors');
  console.log('NOVA_HYBRID_GAME_INPUT '+JSON.stringify({mouse,again,end}));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
