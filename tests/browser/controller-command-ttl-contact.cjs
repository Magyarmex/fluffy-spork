'use strict';
// Actual 48-overlay Chromium game: commanded Controller drone contact must
// resolve before a projectile's physical TTL, without bypassing cover or
// inventing a hit beyond expiry. No mocked Game/physics implementations.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const viewport of [{width:900,height:700},{width:320,height:568}]){
   const page=await browser.newPage({viewport,deviceScaleFactor:2});
   const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
   try{
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first()
     .waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const original=Game.prototype.update;
     Game.prototype.update=function(){
      if(!this.__novaDecorativeWorld)window.__novaCommandTTLGame=this;
      return original.apply(this,arguments);
     };
    });
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForFunction(()=>window.__novaCommandTTLGame?.status==='playing',
     null,{timeout:30000});
    const results=await page.evaluate(()=>{
     const g=window.__novaCommandTTLGame;
     if(!g?.player||!g.__novaBattlefield||!g.spawnDrone)
      throw Error('real 48-overlay game not available');
     g.setPaused(true);
     const owner=g.player;
     const cases=[];
     for(const hz of [30,60,120,240]){
      for(const targetX of [20,24]){
       g.setClass(owner,'carrier');
       owner.x=-200;owner.y=0;owner.vx=0;owner.vy=0;
       owner.alive=true;owner.droneRespawnT=999;
       owner.spawnShieldT=0;owner.swarmT=0;
       g.tanks=[owner];g.tankById=new Map([[owner.id,owner]]);
       g.drones=[];g.spawnDrone(owner,0);
       const d=g.drones[0];
       if(!d)throw Error('real carrier failed to spawn a drone');
       Object.assign(d,{x:targetX,y:0,r:8,speed:200,hp:30,maxHp:30,
        attackCd:999,retargetT:999,__novaPhase:'form',
        __novaPhaseT:0,__novaCommitted:false});
       g.shapes=[];g.orbs=[];g.powerups=[];g.aiRespawns=[];
       g.bullets=[{id:g.nextId++,kind:'bullet',ownerId:999999,
        x:0,y:0,vx:2500,vy:0,r:3,dmg:20,ttl:.004,
        pen:0,hits:0,dead:false,shell:false,beam:false,
        splash:0,color:'#fff'}];
       g.__novaTerrain=[];delete g.__novaBattlefieldIndex;
       g.shapeTimer=999;g.powerupTimer=999;g.eliteTimer=999;
       g.hudTimer=999;g.time=120;g.status='playing';
       g.input.aim.active=true;g.input.aim.dx=50;g.input.aim.dy=0;
       g.input.move.active=false;g.input.firing=false;
       g.input.autofire=false;g.input.mouseActive=false;
       g.update(1/hz);
       cases.push({hz,targetX,hp:d.hp,certified:
        d.__novaChronoCommandBoundedEpoch===g.__novaShapeSweepEpoch,
        overlays:document.querySelectorAll('script[src*="nova-updates/"]').length});
      }
     }
     return cases;
    });
    for(const c of results){
     assert.ok(c.overlays>=48,'shipping overlay composition intact');
     if(c.targetX===20){
      assert.equal(c.certified,true,'real Controller command movement certified '+JSON.stringify(c));
      assert.equal(c.hp,10,'real hostile projectile damages drone before TTL '+JSON.stringify(c));
     }else{
      assert.equal(c.hp,30,'beyond-TTL drone remains unharmed '+JSON.stringify(c));
     }
    }
    assert.deepEqual(errors,[],'no Chromium page errors');
    console.log('NOVA_CONTROLLER_COMMAND_TTL '+JSON.stringify({viewport,results}));
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
