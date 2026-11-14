'use strict';
/* #799: research-only target HP gate for the opt-in whole-Game fixed60 owner.
 * A no-target volley/digest match does not prove real moving-body contact
 * parity. The same composed Game owns projectile physics in both arms. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const TICKS=240, STEP=1/60, PHASE=.19, PERIOD=1.37, AMP=26;
function run(seed,cls,reload,presentationHz){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  if(!p)throw Error('composed Game must supply player');
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);
  const target=g.tanks.find(t=>t!==p);
  assert.ok(target,'composed Game must supply target');
  Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
  Object.assign(target,{cls:'scout',isPlayer:true,alive:true,
   x:200,y:AMP*Math.sin(2*Math.PI*PHASE/PERIOD),vx:0,vy:0,
   hp:1000000,maxHp:1000000,gene:null,perk:null,
   spawnShieldT:0,shieldT:0,bulwarkT:0,tauntT:0,cloakT:0});
  g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
  g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
  // Keep manual eastward aim; nearest-target assist would follow the moving
  // Scout inside its cone and hide misses caused by actual shot geometry.
  let aimAssistVetoes=0;
  const nearest=g.nearestTank;
  g.nearestTank=function(x,y,radius,except){
   if(except===p.id&&radius===480&&x===p.x&&y===p.y){
    aimAssistVetoes++;return null;
   }
   return nearest.apply(this,arguments);
  };
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];g.orbs=[];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;p.stats.reload=reload;
  let updates=0,volleys=0,hits=0,damage=0;
  const originalDrones=g.updateDrones,originalFire=g.tryFire,
   originalDamage=g.damageTank;
  g.updateDrones=function(dt){
   const result=originalDrones.apply(this,arguments);
   updates++;
   const y=AMP*Math.sin(2*Math.PI*(updates*STEP+PHASE)/PERIOD);
   const dy=y-target.y;
   target.vx=0;target.vy=dy/dt;
   this.moveTank(target,0,dy/dt,dt);
   assert.ok(Math.abs(target.y-y)<1e-4,'real target movement owner diverged');
   return result;
  };
  g.tryFire=function(t){
   const n=this.bullets.length,result=originalFire.apply(this,arguments);
   if(t===p&&this.bullets.length>n)volleys++;
   return result;
  };
  g.damageTank=function(t){
   const hp=t.hp,result=originalDamage.apply(this,arguments);
   if(t===target&&t.hp<hp){
    assert.equal(arguments[2],p.id,'target HP must be player-owned damage');
    hits++;damage+=hp-t.hp;
   }
   return result;
  };
  let owner=null,now=1000,callback=null;
  try{
   if(presentationHz!==60){
    const timeline=new ChronologicalInput(g.input);
    const bridge={timeline,startMs:1000};
    owner=new FixedStepRafOwner(g,timeline,bridge,{
     now:()=>now,request:fn=>{callback=fn;return 1},
     cancel:()=>{callback=null},render:()=>{},maxSteps:2
    });
    owner.start();
   }
   g.input.mouseActive=false;
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   g.input.firing=true;g.input.autofire=false;
   if(owner){
    for(let frame=1;frame<=TICKS*presentationHz/60;frame++){
     now=1000+frame*1000/presentationHz;
     const next=callback;
     assert.equal(typeof next,'function','fixed60 RAF ownership');
     callback=null;next(now);
    }
    assert.equal(owner.ticks,TICKS,'all canonical ticks must execute');
    assert.equal(owner.droppedMs,0,'healthy presentation must not drop time');
    assert.equal(owner.droppedFrames,0);
   }else for(let tick=0;tick<TICKS;tick++)g.update(STEP);
   assert.equal(updates,TICKS,'every update must move target through real owner');
   assert.equal(g.tanks.length,2,'no AI respawn');
   assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,'no ecology');
   assert.ok(volleys>0&&hits>0&&damage>0,'real projectile damage required');
   assert.ok(aimAssistVetoes>0,'manual-aim veto must run in actual Game');
   assert.ok(Math.abs(g.time-4)<1e-5,'same simulated time');
   return {volleys,hits,aimAssistVetoes,damage:+damage.toFixed(5),
    targetHp:+target.hp.toFixed(5),targetY:+target.y.toFixed(5),
    hash:digest(physical(g)),draws:draws(),
    heat:p.__v17Heat||0,spin:p.fireSpin||0,fireCd:p.fireCd};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}
test('fixed60 30/61/120Hz presentation preserves moving-target HP and full physical state',()=>{
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]])
  for(const seed of [1517800,1517802]){
   const native=run(seed,cls,reload,60);
   for(const hz of [30,61,120]){
    const fixed=run(seed,cls,reload,hz);
    assert.deepEqual(fixed,native,
     cls+' seed '+seed+' fixed60 at '+hz+'Hz must preserve moving-target HP, shot count and physical state');
   }
  }
});
