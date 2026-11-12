'use strict';
// #799: opt-in fixed60 versus native 60Hz in an actual moving-target damage
// encounter. This is a research gate, not a production scheduler switch or
// a physical-phone CPU/latency claim.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const TICKS=360,DT=1/60;
function encounter(cls,seed,fixed30,playerMoveY=0){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);p.stats.reload=cls==='minigun'?1:3;
  const target=g.tanks.find(t=>t!==p);
  assert.ok(target,'composed Game must supply an opponent');
  Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
  g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
  Object.assign(target,{cls:'scout',isPlayer:true,alive:true,
   x:200,y:0,vx:0,vy:0,hp:1000000,maxHp:1000000,
   gene:null,perk:null,spawnShieldT:0,shieldT:0,bulwarkT:0,tauntT:0,cloakT:0});
  g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;
  g.input.autofire=false;g.input.mouseActive=false;
  // Fixed manual aim prevents the shipping assist from tracking the target
  // and silently removing the intended moving-hit/miss comparison.
  const nearest=g.nearestTank;let vetoes=0;
  g.nearestTank=function(x,y,radius,except){
   if(except===p.id&&radius===480&&x===p.x&&y===p.y){
    vetoes++;return null;
   }
   return nearest.apply(this,arguments);
  };
  g.input.moveVec=()=>({x:0,y:playerMoveY});
  let simulatedTime=0;
  let updates=0,travel=0,volleys=0,hits=0,damage=0;
  const births=[],contacts=[];
  // A previous tick's collision velocity is not permission for the next
  // tank-AI integration to move the scripted target a second time. Preserve
  // its physical velocity for same-tick collision, then reset before the
  // next real Game.update (as in the existing moving-target research).
  const originalUpdate=g.update;
  g.update=function(dt){target.vx=0;target.vy=0;
   simulatedTime+=dt;
   const out=originalUpdate.apply(this,arguments);
   const expected=26*Math.sin(2*Math.PI*(simulatedTime+.19)/1.37);
   assert.ok(Math.abs(target.y-expected)<1e-4,
    'post-update target trajectory must match world time');
   return out;
  };
  const originalDrones=g.updateDrones;
  g.updateDrones=function(dt){
   const result=originalDrones.apply(this,arguments);
   const desired=26*Math.sin(2*Math.PI*(simulatedTime+.19)/1.37);
   const dy=desired-target.y;
   target.vx=0;target.vy=dy/dt;
   this.moveTank(target,0,dy/dt,dt);
   travel+=Math.abs(dy);updates++;
   assert.ok(Math.abs(target.y-desired)<1e-4,
    'target must move through the real Battlefield owner before indexing');
   return result;
  };
  // Start at the prescribed motion phase, without a one-tick teleport.
  target.y=26*Math.sin(2*Math.PI*.19/1.37);
  const fire=g.tryFire,damageTank=g.damageTank;
  g.tryFire=function(t){
   const before=this.bullets.length,out=fire.apply(this,arguments);
   if(t===p&&this.bullets.length>before){
    volleys++;
    if(births.length<8){
     const b=this.bullets[this.bullets.length-1];
     births.push([+this.time.toFixed(6),+b.x.toFixed(5),
      +b.y.toFixed(5),+b.vx.toFixed(5),+b.vy.toFixed(5)]);
    }
   }
   return out;
  };
  g.damageTank=function(t){
   const before=t.hp,out=damageTank.apply(this,arguments);
   if(t===target&&t.hp<before){
    assert.equal(arguments[2],p.id,'damage must belong to player projectile');
    hits++;damage+=before-t.hp;
    if(contacts.length<8)contacts.push([+this.time.toFixed(6),
     +(before-t.hp).toFixed(5),+target.y.toFixed(5)]);
   }
   return out;
  };
  let owner=null,callback=null,now=1000;
  try{
   if(fixed30){
    const timeline=new ChronologicalInput(g.input);
    owner=new FixedStepRafOwner(g,timeline,{timeline,startMs:1000},{
     now:()=>now,request:fn=>(callback=fn,1),
     cancel:()=>{callback=null},render:()=>{},maxSteps:2
    });
    owner.start();
   }
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   g.input.firing=true;
   if(fixed30){
    for(let frame=1;frame<=TICKS/2;frame++){
     now=1000+frame*1000/30;
     const fn=callback;assert.equal(typeof fn,'function','RAF ownership');
     callback=null;fn(now);
    }
    assert.equal(owner.ticks,TICKS,'all fixed60 ticks must execute');
    assert.equal(owner.droppedMs,0,'healthy 30Hz must not lose time');
    assert.equal(owner.droppedFrames,0);
   }else for(let tick=0;tick<TICKS;tick++)g.update(DT);
   assert.equal(updates,TICKS,'every real Game tick must move the target');
   assert.ok(playerMoveY===0?Math.abs(p.y)<1e-6:p.y>5,
    'player movement must follow the real Game owner');
   assert.ok(travel>50,'target must cross the projectile corridor');
   assert.ok(volleys>0&&hits>0&&damage>0,'real damage required');
   assert.ok(vetoes>0,'manual aim assist veto must execute');
   assert.equal(g.tanks.length,2,'no respawn contamination');
   assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0);
   return {cls,seed,volleys,hits,damage:+damage.toFixed(5),
    births,contacts,travel:+travel.toFixed(5),
    targetY:+target.y.toFixed(5),playerY:+p.y.toFixed(5),
    remainingBullets:g.bullets.length,
    heat:+(p.__v17Heat||0).toFixed(6),
    spin:+(p.fireSpin||0).toFixed(6)};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}
test('fixed60 30Hz presentation preserves real moving-target Gunner HP and projectile births',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm'])
  for(const seed of [1517800,1517802]){
   const reference=encounter(cls,seed,false);
   const recovered=encounter(cls,seed,true);
   assert.deepEqual(recovered,reference,
    cls+' seed '+seed+' moving-target contact diverged');
   const movingReference=encounter(cls,seed,false,.025);
   const movingFixed=encounter(cls,seed,true,.025);
   assert.deepEqual(movingFixed,movingReference,
    cls+' seed '+seed+' moving-player birth/contact diverged');
   assert.ok(movingReference.births.some((b,i)=>
    Math.abs(b[2]-reference.births[i][2])>.1),
    'real player movement must change projectile muzzle origin');
   rows.push({cls,seed,damage:reference.damage,hits:reference.hits,
    movingDamage:movingReference.damage,movingHits:movingReference.hits,
    playerEndY:movingReference.playerY,
    volleys:reference.volleys,travel:reference.travel});
  }
 console.log('GUNNER_FIXED60_MOVING_TARGET_DAMAGE_PARITY '+JSON.stringify(rows));
});
