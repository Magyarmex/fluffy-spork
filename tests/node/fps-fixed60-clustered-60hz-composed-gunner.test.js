'use strict';
// #799/#648: a constructed [4,1,1] / 120Hz presentation pattern has
// exactly 480 frames and eight seconds of wall time, yet variable-step
// Gunner cadence diverges from uniform 60Hz. This is a fixed-step
// *research* gate, not a device latency or production promotion claim.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=
  require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function run(cls,seed,clustered,targeted=false){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,cls);p.stats.reload=cls==='minigun'?1:3;
  p.x=1000;p.y=1000;p.vx=0;p.vy=0;
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  const sample=g.shapes.find(s=>s.type==='square')||g.shapes[0];
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  let damage=0;
  if(targeted){
   assert.ok(sample,'composed Game must supply a neutral shape template');
   const victim={...sample,kind:'shape',type:'square',id:987654,
    x:p.x+175,y:p.y,r:24,hp:1000000,maxHp:1000000,
    vx:0,vy:0,born:0,wanderT:Infinity,dead:false};
   g.shapes=[victim];
   if(g.shapeById)g.shapeById.set(victim.id,victim);
   const damageShape=g.damageShape;
   g.damageShape=function(shape,...args){
    const before=shape.hp,out=damageShape.call(this,shape,...args);
    if(shape===victim)damage+=Math.max(0,before-shape.hp);
    return out;
   };
  }
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  p.droneRespawnT=Infinity;
  g.status='playing';g.paused=false;g.input.autofire=false;
  g.input.mouseActive=false;g.input.aim.active=true;
  g.input.aim.dx=40;g.input.aim.dy=0;g.input.firing=true;
  g.input.moveVec=()=>({x:0,y:0});
  let volleys=0;const fire=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length,result=fire.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return result;
  };
  let owner=null,callback=null,now=1000;
  try{
   if(!clustered){
    for(let i=0;i<480;i++)g.update(1/60);
   }else{
    const timeline=new ChronologicalInput(g.input);
    owner=new FixedStepRafOwner(g,timeline,{timeline,startMs:1000},{
     now:()=>now,request:fn=>(callback=fn,1),
     cancel:()=>{callback=null},render:()=>{},maxSteps:2
    });
    owner.start();
    // Re-arm after the research timeline's initial reset.
    g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
    g.input.firing=true;
    let subticks=0;
    for(let frame=0;frame<480;frame++){
     subticks+=[4,1,1][frame%3];
     now=1000+subticks*1000/120;
     const fn=callback;assert.equal(typeof fn,'function');
     callback=null;fn(now);
    }
    assert.equal(subticks,960);
    assert.equal(owner.ticks,480);
    assert.equal(owner.droppedFrames,0);
    assert.equal(owner.droppedMs,0);
   }
   assert.ok(volleys>0);
   if(targeted)assert.ok(damage>0,'canonical target must take real damage');
   return {volleys,damage:+damage.toFixed(5),world:digest(physical(g)),draws:draws(),
    heat:p.__v17Heat||0,spin:p.fireSpin||0,fireCd:p.fireCd,
    shotIndex:p.__v17ShotIndex,barrelIdx:p.barrelIdx,
    bulletSignature:digest(g.bullets.map(b=>
     [b.id,b.ownerId,b.dmg,b.pen,b.r,b.ttl,b.vx,b.vy]))};
  }finally{if(owner)owner.stop();g.destroy();}
 });
}
test('clustered mean-60Hz presentation preserves complete fixed60 Gunner chronology',()=>{
 for(const cls of ['minigun','needlestorm'])
  for(const seed of [1517800,1517802])
   for(const targeted of [false,true]){
    const native=run(cls,seed,false,targeted);
    const clustered=run(cls,seed,true,targeted);
    assert.deepEqual(clustered,native,
     cls+' seed='+seed+' targeted='+targeted);
  }
});
