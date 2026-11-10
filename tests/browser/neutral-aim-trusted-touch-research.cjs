'use strict';
// Research-only: real Chromium touch drives the canonical 49-overlay Game aim
// path. This is an input-ownership witness, not a desired aim-policy golden.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:568,height:700},
  deviceScaleFactor:2,isMobile:true,hasTouch:true,serviceWorkers:'block'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
  await deploy.waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const oldUpdate=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaNeutralTouchGame=this;
    return oldUpdate.apply(this,arguments);
   };
   const oldFire=Game.prototype.tryFire;
   window.__novaNeutralTouchBirths=[];
   Game.prototype.tryFire=function(t){
    const n=this.bullets.length,out=oldFire.apply(this,arguments);
    if(this===window.__novaNeutralTouchGame&&t===this.player&&this.bullets.length>n){
     const b=this.bullets[n];
     if(window.__novaNeutralTouchBirths.length<8)
      window.__novaNeutralTouchBirths.push({time:this.time,
       bearing:Math.atan2(b.vy,b.vx),x:b.x,y:b.y});
    }
    return out;
   };
  });
  await deploy.click();
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>window.__novaNeutralTouchGame?.status==='playing',null,{timeout:30000});
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  const setup=await page.evaluate(()=>{
   const g=window.__novaNeutralTouchGame,p=g.player;
   const rivals=g.tanks.filter(t=>t!==p);
   if(rivals.length<2)throw Error('need initialized real rival tanks');
   g.sfx.muted=true;g.setClass(p,'scout');
   Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,fireCd:0,spawnShieldT:0,hp:100});
   p.stats.reload=0;
   for(const [t,x,y] of [[rivals[0],120,70],[rivals[1],240,40]]){
    Object.assign(t,{x,y,vx:0,vy:0,alive:true,isPlayer:true,
     hp:100,maxHp:100,spawnShieldT:0,shieldT:0,cloakT:0,cls:'scout'});
   }
   g.tanks=[p,...rivals.slice(0,2)];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.shapes=[];g.drones=[];g.bullets=[];g.orbs=[];g.powerups=[];
   if(g.shapeById)g.shapeById.clear();
   g.spawnShape('circle',true);
   const c=g.shapes[0];if(!c)throw Error('missing real Circle');
   Object.assign(c,{x:160,y:0,vx:0,vy:0,spin:0,wanderT:Infinity});
   if(g.shapeById)g.shapeById.set(c.id,c);
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;
   g.eliteTimer=Infinity;g.crasherTimer=Infinity;
   g.spawnShape=()=>null;g.spawnAITank=()=>null;g.spawnPowerup=()=>null;
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   g.hasLineOfSight=()=>true;
   g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;
   g.input.autofire=false;g.input.firing=false;g.input.mouseActive=false;
   window.__novaNeutralTouchCircle=c;window.__novaNeutralTouchBirths=[];
   return {time:g.time,circleHp:c.hp,player:p.id,off:rivals[0].id,aligned:rivals[1].id};
  });
  const box=await canvas.boundingBox();
  assert.ok(box&&box.width>250&&box.height>300,'real gameplay canvas');
  const start={x:box.x+box.width*.78,y:box.y+box.height*.68,
   id:42,radiusX:1,radiusY:1,force:1};
  const moved={...start,x:start.x+Math.min(38,box.width*.08)};
  const hit=await page.evaluate(p=>document.elementFromPoint(p.x,p.y)
   ?.matches?.('canvas.absolute.inset-0'),start);
  assert.equal(hit,true,'trusted thumb must land on actual gameplay canvas');
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[moved]});
  await page.waitForFunction(()=>window.__novaNeutralTouchGame?.input?.aim?.active===true,
   null,{timeout:10000});
  const held=await page.evaluate(()=>{
   const g=window.__novaNeutralTouchGame;
   return {owner:g.input.stickId.aim,dx:g.input.aim.dx,dy:g.input.aim.dy,
    time:g.time};
  });
  assert.ok(held.dx>9&&Math.abs(held.dy)<3,'physical eastward stick gesture');
  await page.waitForFunction(start=>{
   const g=window.__novaNeutralTouchGame;
   return g&&g.time>=start+1.2&&window.__novaNeutralTouchBirths.length>=2;
  },held.time,{timeout:20000});
  const result=await page.evaluate(()=>{
   const g=window.__novaNeutralTouchGame,c=window.__novaNeutralTouchCircle;
   return {time:g.time,owner:g.input.stickId.aim,active:g.input.aim.active,
    raw:g.input.aimVec(g.input.moveVec()),
    circleHp:c.hp,alignedHp:g.tanks[2].hp,
    births:window.__novaNeutralTouchBirths};
  });
  assert.equal(result.active,true,'same trusted touch retains aim');
  assert.equal(result.owner,held.owner,'touch owner never changes');
  assert.ok(result.births.length>=2,'real player projectiles emitted');
  assert.ok(result.births.some(b=>b.bearing>0.01&&b.bearing<0.22),
   'real right-stick input reaches the shipped unique-hostile rescue');
  assert.ok(result.raw.x>0&&Math.abs(result.raw.y)<0.1,
   'raw eastward player intent remains separate from assisted gun bearing');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>window.__novaNeutralTouchGame?.input?.aim?.active===false,
   null,{timeout:10000});
  assert.deepEqual(errors,[],'no browser page errors');
  console.log('NOVA_NEUTRAL_TRUSTED_TOUCH '+JSON.stringify({setup,held,result}));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
