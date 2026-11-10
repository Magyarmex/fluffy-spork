'use strict';
// RESEARCH ONLY: opt-in fixed60 owner in the actual shipping React/Game path.
// Measures real Chromium Game.update and renderer JavaScript; not physical
// touch-to-photon, GPU presentation or a production scheduler promotion.
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
 const context=await browser.newContext({viewport:{width:320,height:700},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const errors=[];
 try{
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(String(e.stack||e)));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
  await deploy.waitFor({state:'visible',timeout:45000});
  await page.addScriptTag({path:path.resolve(__dirname,
   '../../nova-updates/fixed60-research-browser.js')});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const renderMod=window.__novaMakeRequire('')('game/render');
   const baseStart=Game.prototype.start;
   window.__novaFixedResearch={births:0,updates:[],renders:[],errors:[]};
   const profile=window.__novaFixedResearch;
   const baseUpdate=Game.prototype.update;
   Game.prototype.update=function(...args){
    if(this!==window.__novaFixedGame)return baseUpdate.apply(this,args);
    const at=performance.now();
    try{return baseUpdate.apply(this,args);}
    finally{profile.updates.push(performance.now()-at);}
   };
   const baseRender=renderMod.render;
   renderMod.render=function(...args){
    if(args[0]!==window.__novaFixedGame)return baseRender.apply(this,args);
    const at=performance.now();
    try{return baseRender.apply(this,args);}
    finally{profile.renders.push(performance.now()-at);}
   };
   const baseFire=Game.prototype.tryFire;
   Game.prototype.tryFire=function(t,...args){
    const before=this.bullets.length,out=baseFire.call(this,t,...args);
    if(this===window.__novaFixedGame&&t===this.player&&this.bullets.length>before)
     profile.births+=this.bullets.length-before;
    return out;
   };
   Game.prototype.start=function(...args){
    if(this.__novaDecorativeWorld)return baseStart.apply(this,args);
    if(window.__novaFixedPilot)throw Error('unexpected second playable fixed60 owner');
    window.__novaFixedGame=this;
    // Execute the composed shipping start wrappers (including Settings'
    // active-game registration), then cancel ONLY the core Game RAF before
    // its first callback. This avoids bypassing legitimate start side effects.
    const result=baseStart.apply(this,args);
    const shippingRaf=this.raf;
    if(!Number.isInteger(shippingRaf)||shippingRaf<=0)
     throw Error('shipping Game.start did not schedule its expected RAF');
    cancelAnimationFrame(shippingRaf);
    this.raf=null;
    const pilot=window.__novaFixed60Research.createFixedStepBrowserPilot(this,{
     window,document,clock:performance,
     request:fn=>requestAnimationFrame(fn),
     cancel:id=>cancelAnimationFrame(id),
     render:(g,w,h)=>renderMod.render(g,w,h),
     maxSteps:2,backlogExtraTicks:2});
    window.__novaFixedPilot=pilot;
    pilot.start();
    return result;
   };
  });
  await deploy.click();
  await page.waitForFunction(()=>window.__novaFixedGame?.status==='playing'&&
   window.__novaFixedPilot?.owner?.started,null,{timeout:30000});
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:20000});
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  await page.evaluate(()=>{
   const g=window.__novaFixedGame;
   g.input.autofire=false;g.input.firing=false;
   g.player.fireCd=0;g.player.spawnShieldT=10;
   window.__novaFixedResearch.births=0;
  });
  const box=await canvas.boundingBox();
  assert.ok(box&&box.width>200&&box.height>200);
  const cdp=await context.newCDPSession(page);
  const origin={x:box.x+box.width*.72,y:box.y+box.height*.68,
   id:42,radiusX:1,radiusY:1,force:1};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
  await page.waitForTimeout(120);
  const centered=await page.evaluate(()=>{
   const g=window.__novaFixedGame;
   return {owner:g.input.stickId.aim,active:g.input.aim.active,
    births:window.__novaFixedResearch.births};
  });
  assert.equal(centered.active,true,'centered trusted touch must own aim');
  assert.ok(centered.owner>=0,'aim must have an actual pointer owner');
  assert.equal(centered.births,0,'centered touch must not fire');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
   {...origin,x:origin.x+Math.min(34,box.width*.1),y:origin.y-20}]});
  await page.waitForFunction(()=>window.__novaFixedResearch.births>0,null,{timeout:12000});
  const held=await page.evaluate(()=>{
   const g=window.__novaFixedGame;
   return {owner:g.input.stickId.aim,active:g.input.aim.active,
    dx:g.input.aim.dx,dy:g.input.aim.dy,births:window.__novaFixedResearch.births};
  });
  assert.equal(held.owner,centered.owner,'moving touch must retain aim ownership');
  assert.equal(held.active,true);
  assert.ok(held.births>0,'real Game must emit player-owned projectile');
  assert.ok(Math.hypot(held.dx,held.dy)>5,'real analog extension must be sampled');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(150);
  const report=await page.evaluate(()=>{
   const g=window.__novaFixedGame,p=window.__novaFixedPilot;
   const values=a=>{const s=[...a].sort((x,y)=>x-y);
    return {n:s.length,p95:s.length?s[Math.ceil(.95*s.length)-1]:null};};
   return {ticks:p.owner.ticks,droppedMs:p.owner.droppedMs,
    productionRafActive:!!g.raf,pilotStarted:p.owner.started,
    aimActive:g.input.aim.active,aimOwner:g.input.stickId.aim,
    updates:values(window.__novaFixedResearch.updates),
    renders:values(window.__novaFixedResearch.renders),
    births:window.__novaFixedResearch.births,
    runtimeScripts:document.querySelectorAll('script[src*="nova-updates/"]').length};
  });
  assert.equal(report.aimActive,false,'release must clear aim');
  assert.equal(report.productionRafActive,false,'never run two RAF owners');
  assert.equal(report.pilotStarted,true,'research owner must remain active');
  assert.ok(report.ticks>0&&report.updates.n>0);
  assert.ok(report.renders.n>0&&Number.isFinite(report.renders.p95));
  assert.ok(Number.isFinite(report.updates.p95));
  assert.ok(report.runtimeScripts>=49,'actual shipping overlays must be loaded');
  assert.deepEqual(errors,[],'browser errors');
  console.log('NOVA_FIXED60_CHROMIUM_OWNER_TOUCH '+JSON.stringify(report));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
