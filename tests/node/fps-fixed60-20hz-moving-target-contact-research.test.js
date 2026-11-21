'use strict';
// #799/#648: research-only 20Hz moving-target contact gate for the real
// 49-overlay Game. A static dummy or no-target volley count cannot prove
// projectile birth/collision chronology during low-refresh presentation.
// This is not an Android CPU, touch-latency or shipping scheduler gate.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=
  require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
const STEP=1/60,TICKS=240,PERIOD=1.37,AMP=26,PHASE=.19;
function run(cls,seed,schedule){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);p.stats.reload=cls==='minigun'?1:3;
  const target=g.tanks.find(t=>t!==p);
  assert.ok(target,'actual composed Game needs a target');
  Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,
   droneRespawnT:Infinity});
  Object.assign(target,{cls:'scout',isPlayer:true,alive:true,x:200,
   y:AMP*Math.sin(2*Math.PI*PHASE/PERIOD),vx:0,vy:0,
   hp:1000000,maxHp:1000000,gene:null,perk:null,
   spawnShieldT:0,shieldT:0,bulwarkT:0,tauntT:0,cloakT:0});
  g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
  g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];g.orbs=[];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;g.input.autofire=false;
  g.input.mouseActive=false;g.input.moveVec=()=>({x:0,y:0});
  let updates=0,volleys=0,hits=0,damage=0;
  const originalDrones=g.updateDrones,originalFire=g.tryFire,
   originalDamage=g.damageTank,nearest=g.nearestTank;
  let assistVetoes=0;
  g.nearestTank=function(x,y,radius,except){
   if(except===p.id&&radius===480&&x===p.x&&y===p.y){
    assistVetoes++;return null;
   }
   return nearest.apply(this,arguments);
  };
  g.updateDrones=function(dt){
   const out=originalDrones.apply(this,arguments);
   updates++;
   const y=AMP*Math.sin(2*Math.PI*(updates*STEP+PHASE)/PERIOD);
   const dy=y-target.y;
   target.vx=0;target.vy=dy/dt;
   this.moveTank(target,0,dy/dt,dt);
   assert.ok(Math.abs(target.y-y)<1e-4,'target physical movement diverged');
   return out;
  };
  g.tryFire=function(t){
   const before=this.bullets.length,out=originalFire.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return out;
  };
  g.damageTank=function(t){
   const before=t.hp,out=originalDamage.apply(this,arguments);
   if(t===target&&t.hp<before){
    assert.equal(arguments[2],p.id);
    hits++;damage+=before-t.hp;
   }
   return out;
  };
  let owner=null,callback=null,now=1000;
  try{
   if(schedule!=='native'){
    const timeline=new ChronologicalInput(g.input);
    owner=new FixedStepRafOwner(g,timeline,{timeline,startMs:1000},{
     now:()=>now,request:fn=>(callback=fn,1),
     cancel:()=>{callback=null},render:()=>{},maxSteps:4
    });
    owner.start();
   }
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   g.input.firing=true;
   if(schedule==='native'){
    for(let i=0;i<TICKS;i++)g.update(STEP);
   }else{
    const gaps=schedule==='uniform20'?Array(80).fill(50):
     Array.from({length:40},()=>[95,5]).flat();
    let elapsed=0;
    for(const gap of gaps){
     elapsed+=gap;now=1000+elapsed;
     const fn=callback;assert.equal(typeof fn,'function');
     callback=null;fn(now);
    }
    assert.equal(elapsed,4000);
    assert.equal(owner.ticks,TICKS,'20Hz must execute all 240 updates');
    assert.equal(owner.droppedMs,0,'healthy 20Hz must not discard time');
    assert.equal(owner.droppedFrames,0);
   }
   assert.equal(updates,TICKS);
   assert.ok(volleys>0&&hits>0&&damage>0,'real moving-target damage required');
   assert.ok(assistVetoes>0,'manual aim must not silently track target');
   return {volleys,hits,damage:+damage.toFixed(5),
    targetHp:+target.hp.toFixed(5),targetY:+target.y.toFixed(5),
    world:digest(physical(g)),draws:draws(),spin:p.fireSpin||0,
    heat:p.__v17Heat||0,fireCd:p.fireCd,
    projectiles:digest(g.bullets.map(b=>
     [b.id,b.ownerId,b.dmg,b.ttl,b.x,b.y,b.vx,b.vy]))};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}
test('bounded 20Hz uniform and 95/5ms RAF preserve moving-target Gunner collision chronology',()=>{
 for(const cls of ['minigun','needlestorm'])
  for(const seed of [1517800,1517802]){
   const native=run(cls,seed,'native');
   for(const schedule of ['uniform20','bursty20'])
    assert.deepEqual(run(cls,seed,schedule),native,
     cls+' seed='+seed+' schedule='+schedule);
  }
});
