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
   // Record real neutral damage rather than inferring hits from a stale shape reference.
   window.__novaNeutralTouchHits=[];
   window.__novaNeutralTouchTankHits=[];
   const originalDamageTank=g.damageTank;
   g.damageTank=function(t,damage,srcId){
    if(t===window.__novaNeutralTouchAligned)window.__novaNeutralTouchTankHits.push({
     time:this.time,hpBefore:t.hp,damage:Number(damage)||0,srcId});
    return originalDamageTank.apply(this,arguments);
   };
   const originalDamageShape=g.damageShape;
   g.damageShape=function(shape,damage,ix,iy){
    if(shape===window.__novaNeutralTouchCircle){
     window.__novaNeutralTouchHits.push({time:this.time,
      hpBefore:shape.hp,damage:Number(damage)||0,x:shape.x,y:shape.y});
    }
    return originalDamageShape.apply(this,arguments);
   };
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
   window.__novaNeutralTouchCircle=c;
   window.__novaNeutralTouchAligned=rivals[1];
   window.__novaNeutralTouchBirths=[];
   return {time:g.time,circleHp:c.hp,player:p.id,off:rivals[0].id,aligned:rivals[1].id,
    scoutLevel:p.level,scoutDamage:p.stats.damage,scoutReload:p.stats.reload};
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
    circleHp:g.shapes.some(s=>s.id===c.id)?c.hp:0,
    circleDestroyed:!g.shapes.some(s=>s.id===c.id),
    circleHits:window.__novaNeutralTouchHits,
    alignedHits:window.__novaNeutralTouchTankHits,
    playerXP:g.player.xp,playerScore:g.player.score,
    alignedHp:window.__novaNeutralTouchAligned.hp,
    births:window.__novaNeutralTouchBirths};
  });
  assert.equal(result.active,true,'same trusted touch retains aim');
  assert.equal(result.owner,held.owner,'touch owner never changes');
  assert.ok(result.births.length>=2,'real player projectiles emitted');
  assert.ok(result.circleHits.every(h=>Number.isFinite(h.hpBefore)&&Number.isFinite(h.damage)),
   'neutral damage instrumentation must record finite physical collision values');
  assert.ok(result.alignedHits.every(h=>Number.isFinite(h.hpBefore)&&Number.isFinite(h.damage)),
   'hostile damage instrumentation must record finite physical collision values');
  assert.ok(result.births.some(b=>b.bearing>0.01&&b.bearing<0.22),
   'real right-stick input reaches the shipped unique-hostile rescue');
  assert.ok(result.raw.x>0&&Math.abs(result.raw.y)<0.1,
   'raw eastward player intent remains separate from assisted gun bearing');
  // A second gesture is a deliberate hostile-aim positive control. It shares
  // the same browser-trusted pointer but is NOT a matched-world damage A/B.
  const enemyStart=await page.evaluate(()=>{
   const g=window.__novaNeutralTouchGame,t=window.__novaNeutralTouchAligned;
   t.hp=100;t.alive=true;t.spawnShieldT=0;
   g.bullets=[];g.player.fireCd=0;
   window.__novaNeutralTouchBirths=[];
   window.__novaNeutralTouchTankHits=[];
   return g.time;
  });
  const enemyMove={...moved,y:moved.y+Math.min(7,box.height*.01)};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[enemyMove]});
  await page.waitForFunction(()=>window.__novaNeutralTouchGame?.input?.aim?.dy>3,
   null,{timeout:10000});
  await page.waitForFunction(start=>{
   const g=window.__novaNeutralTouchGame;
   return g&&g.time>=start+1.1&&window.__novaNeutralTouchBirths.length>=2;
  },enemyStart,{timeout:20000});
  const enemyIntent=await page.evaluate(()=>{
   const g=window.__novaNeutralTouchGame;
   return {owner:g.input.stickId.aim,raw:g.input.aimVec(g.input.moveVec()),
    births:window.__novaNeutralTouchBirths,
    hits:window.__novaNeutralTouchTankHits,
    remainingHp:window.__novaNeutralTouchAligned.hp};
  });
  assert.equal(enemyIntent.owner,held.owner,
   'same physical pointer retains right-stick ownership through hostile gesture');
  assert.ok(enemyIntent.raw.x>.8&&enemyIntent.raw.y>.08,
   'trusted diagonal thumb reports deliberate hostile-facing aim');
  assert.ok(enemyIntent.births.some(b=>b.bearing>.10&&b.bearing<.24),
   'real projectiles follow deliberate hostile-facing thumb direction');
  assert.ok(enemyIntent.hits.length>0&&enemyIntent.remainingHp<100,
   'deliberate hostile gesture must deal actual composed-game damage');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>window.__novaNeutralTouchGame?.input?.aim?.active===false,
   null,{timeout:10000});
  assert.deepEqual(errors,[],'no browser page errors');
  console.log('NOVA_NEUTRAL_TRUSTED_TOUCH '+JSON.stringify({setup,held,result,enemyIntent}));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
