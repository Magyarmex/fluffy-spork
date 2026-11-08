'use strict';
// #799: opt-in whole-Game fixed60 research at adjacent presentation rates.
// These are deterministic RAF schedules, NOT physical-device measurements.
// Do not freeze native variable-dt cliffs as desirable balance goldens.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=
  require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');

const SECONDS=6, TICKS=SECONDS*60;
function run(cls,seed,hz,targeted=false){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);p.x=1000;p.y=1000;p.vx=0;p.vy=0;p.stats.reload=
    cls==='minigun'?1:3;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);g.__novaTerrain=[];
  const shape=g.shapes.find(s=>s.type==='square')||g.shapes[0];
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
  let victim=null,damage=0;
  if(targeted){
   assert.ok(shape);
   victim={...shape,kind:'shape',type:'square',id:987654,
    x:p.x+175,y:p.y,r:24,hp:1000000,maxHp:1000000,
    vx:0,vy:0,born:0,wanderT:Infinity,dead:false};
   g.shapes=[victim];
   if(g.shapeById)g.shapeById.set(victim.id,victim);
   const originalDamage=g.damageShape;
   g.damageShape=function(s,...args){
    const before=s.hp,result=originalDamage.call(this,s,...args);
    if(s===victim)damage+=Math.max(0,before-s.hp);
    return result;
   };
  }
  g.status='playing';g.paused=false;g.input.autofire=false;
  g.input.mouseActive=false;g.input.aim.active=true;
  g.input.aim.dx=40;g.input.aim.dy=0;g.input.firing=true;
  g.input.moveVec=()=>({x:0,y:0});
  let volleys=0;const originalFire=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length,result=originalFire.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return result;
  };
  let owner=null,callback=null,now=1000;
  try{
   if(hz===60){
    for(let i=0;i<TICKS;i++)g.update(1/60);
   }else{
    const timeline=new ChronologicalInput(g.input);
    const bridge={timeline,startMs:1000};
    owner=new FixedStepRafOwner(g,timeline,bridge,{
     now:()=>now,request:fn=>(callback=fn,1),
     cancel:()=>{callback=null},render:()=>{},maxSteps:2
    });
    owner.start();
    for(let frame=1;frame<=SECONDS*hz;frame++){
     now=1000+frame*1000/hz;
     const fn=callback;assert.equal(typeof fn,'function');
     callback=null;fn(now);
    }
    assert.equal(owner.ticks,TICKS,'exact fixed60 simulation tick count');
    assert.equal(owner.droppedFrames,0,'healthy refresh must not drop ticks');
    assert.equal(owner.droppedMs,0);
   }
   assert.equal(g.tanks.length,1);
   assert.equal(g.shapes.length,targeted?1:0);
   assert.equal(g.drones.length+g.powerups.length,0);
   assert.ok(volleys>0);
   if(targeted)assert.ok(damage>0,'target must take actual collision damage');
   return {volleys,damage:+damage.toFixed(5),hash:digest(physical(g)),
    draws:draws(),heat:p.__v17Heat||0,spin:p.fireSpin||0,
    fireCd:p.fireCd,shotIndex:p.__v17ShotIndex||0};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}
test('fixed60 removes 60-to-61 and 73-to-74 Gunner chronology cliffs in composed Game',()=>{
 for(const cls of ['minigun','needlestorm'])
  for(const seed of [1517800,1517802])
   for(const targeted of [false,true]){
    const reference=run(cls,seed,60,targeted);
    for(const hz of [30,59,61,73,74,75,120]){
     const actual=run(cls,seed,hz,targeted);
     assert.deepEqual(actual,reference,
      `${cls} seed ${seed} target ${targeted} at ${hz}Hz`);
    }
   }
});
