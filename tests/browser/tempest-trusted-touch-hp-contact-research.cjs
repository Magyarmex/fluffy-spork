'use strict';
// #648 RESEARCH ONLY: trusted Chromium right-stick -> actual composed Tempest
// projectile -> preplaced tank HP contact. This controlled geometry is not a
// natural match, short-pulse FPS comparison, or physical-device latency.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:390,height:780},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const start=Game.prototype.start,fire=Game.prototype.tryFire,damage=Game.prototype.damageTank;
   window.__novaTempestHp={births:[],hits:[],events:[],targetReady:false};
   Game.prototype.start=function(...args){
    if(!this.__novaDecorativeWorld)window.__novaTempestHpGame=this;
    return start.apply(this,args);
   };
   Game.prototype.tryFire=function(t,...args){
    const before=this.bullets.length,out=fire.call(this,t,...args);
    if(this===window.__novaTempestHpGame&&t===this.player&&this.bullets.length>before){
     const report=window.__novaTempestHp;
     const born=this.bullets.slice(before);
     report.births.push(...born.map(b=>({id:b.id,ownerId:b.ownerId,at:performance.now(),
      gameTime:this.time,x:b.x,y:b.y,vx:b.vx,vy:b.vy})));
    }
    return out;
   };
   Game.prototype.damageTank=function(t,...args){
    const before=t.hp,out=damage.call(this,t,...args);
    if(this===window.__novaTempestHpGame&&t===window.__novaTempestHpTarget&&t.hp<before){
     window.__novaTempestHp.hits.push({at:performance.now(),gameTime:this.time,
      damage:before-t.hp,sourceId:args[1],remainingHp:t.hp});
    }
    return out;
   };
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])
    document.addEventListener(type,e=>{
     if(e.pointerType==='touch')window.__novaTempestHp.events.push({
      type,trusted:e.isTrusted,at:performance.now(),pointerId:e.pointerId});
    },{capture:true,passive:true});
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  const canvas=page.locator('canvas.absolute.inset-0');
  await canvas.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>window.__novaTempestHpGame?.status==='playing',null,{timeout:20000});
  await page.locator('.nv-loading').waitFor({state:'hidden',timeout:20000});
  const setup=await page.evaluate(()=>{
   const g=window.__novaTempestHpGame,p=g.player;
   if(!p)throw Error('no playable player');
   g.setClass(p,'tempest');p.fireCd=0;
   Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:10,droneRespawnT:Infinity});
   g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;
   const target=g.tanks.find(t=>t!==p&&t.ai);
   if(!target)throw Error('no real AI target available');
   Object.assign(target,{cls:'scout',isPlayer:true,alive:true,x:75,y:-43,
    vx:0,vy:0,hp:100000,maxHp:100000,spawnShieldT:0,shieldT:0,
    bulwarkT:0,tauntT:0,cloakT:0,r:26});
   window.__novaTempestHpTarget=target;
   window.__novaTempestHp.targetReady=true;
   window.__novaTempestHp.targetAt={x:target.x,y:target.y,at:performance.now()};
   g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.shapeById)g.shapeById.clear();
   if(g.hash?.clear)g.hash.clear();
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
   g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;g.spawnDrone=()=>null;
   g.input.autofire=false;g.input.mouseActive=false;g.input.firing=false;
   return {playerId:p.id,targetId:target.id,cls:p.cls};
  });
  assert.equal(setup.cls,'tempest');
  const box=await canvas.boundingBox();
  assert.ok(box&&box.width>200&&box.height>200);
  const origin={x:box.x+box.width*.72,y:box.y+box.height*.68,
   id:42,radiusX:1,radiusY:1,force:1};
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[origin]});
  await page.waitForFunction(()=>window.__novaTempestHpGame?.input?.aim?.active===true,null,{timeout:5000});
  assert.equal(await page.evaluate(()=>window.__novaTempestHp.births.length),0,
   'centered touch must not create Tempest projectile');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
   {...origin,x:origin.x+35,y:origin.y-20}]});
  await page.waitForFunction(()=>window.__novaTempestHp.births.length>0,null,{timeout:12000});
  // Release as soon as the first actual shot is witnessed; the target must
  // still take damage from an already-existing projectile, not held autofire.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>window.__novaTempestHp.hits.length>0,null,{timeout:12000});
  // A valid projectile can hit after release; a *new* player volley cannot.
  // Observe beyond Tempest's base reload so a stuck firing flag is exposed.
  await page.waitForTimeout(180);
  await page.waitForFunction(()=>{const i=window.__novaTempestHpGame?.input;
   return i&&!i.aim.active&&!i.firing&&i.stickId.aim===-1;},null,{timeout:5000});
  const report=await page.evaluate(()=>({
   ...window.__novaTempestHp,
   playerId:window.__novaTempestHpGame.player.id,
   targetId:window.__novaTempestHpTarget.id,
   aimActive:window.__novaTempestHpGame.input.aim.active,
   firing:window.__novaTempestHpGame.input.firing
  }));
  assert.ok(report.events.length>=3&&report.events.every(e=>e.trusted),
   'browser must deliver trusted down/move/up touch events');
  const press=report.events.find(e=>e.type==='pointerdown');
  const deflect=report.events.find(e=>e.type==='pointermove');
  assert.ok(press&&deflect&&press.at<=deflect.at,
   'trusted touch press must precede the firing deflection');
  assert.ok(report.targetReady&&report.targetAt,'target must be preplaced before any projectile');
  assert.ok(report.births.some(b=>b.ownerId===report.playerId),
   'trusted deflection must create a real player-owned projectile');
  assert.ok(report.targetAt.at<report.births[0].at,
   'target geometry must precede the measured projectile, not follow its trajectory');
  assert.ok(report.hits.some(h=>h.sourceId===report.playerId&&h.damage>0),
   'real composed Tempest projectile must reduce aligned target HP');
  assert.ok(report.births.every(b=>b.at>=deflect.at),
   'player projectile must not predate the trusted firing deflection');
  assert.ok(report.hits.every(h=>h.at>=report.births[0].at),
   'target HP loss must not predate the first player projectile');
  assert.ok(report.hits[0].at>=report.births[0].at,
   'physical HP contact cannot predate projectile birth');
  const release=report.events.find(e=>e.type==='pointerup'||e.type==='pointercancel');
  assert.ok(release&&release.trusted,'release must be a trusted browser event');
  assert.equal(deflect.pointerId,press.pointerId,
   'firing deflection must belong to the pressed touch');
  assert.equal(release.pointerId,press.pointerId,
   'release must belong to the same touch that fired');
  assert.ok(deflect.at<=release.at,
   'touch release must not predate firing deflection');
  assert.ok(report.births.every(b=>b.at<=release.at),
   'no new Tempest projectile may be born after touch release');
  assert.equal(report.aimActive,false);
  assert.equal(report.firing,false);
  assert.equal(errors.length,0,'no browser page errors: '+JSON.stringify(errors));
  console.log('NOVA_TEMPEST_TRUSTED_TOUCH_REAL_HP '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
