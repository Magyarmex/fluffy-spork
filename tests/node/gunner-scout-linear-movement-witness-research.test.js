'use strict';
/* #799: qualify the actual Battlefield Scout movement witness before
 * attributing Gunner hit differences to moving-body collision.
 * This is source-executed 49-overlay Game coverage, not a damage-parity
 * claim and not a production movement change. */
const test=require('node:test'),assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;

function witness(seed,hz){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const p=g.player,t=g.tanks.find(x=>x!==p);
   assert.ok(t,'composed Game must contain a target');
   g.sfx.muted=true;
   g.tanks=[p,t];g.tankById=new Map([[p.id,p],[t.id,t]]);
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash&&g.hash.clear)g.hash.clear();
   t.cls='scout';t.isPlayer=true;t.alive=true;
   t.x=200;t.y=-30;t.vx=0;t.vy=60;
   t.spawnShieldT=0;t.shieldT=0;
   const dt=1/hz,startX=t.x,startY=t.y;
   g.moveTank(t,0,60,dt);
   const moved=Math.hypot(t.x-startX,t.y-startY);
   assert.ok(moved>0,'the real moveTank path must move the Scout');
   assert.equal(t.__novaLinearMoveEpoch,g.time);
   assert.equal(t.__novaLinearMoveCalls,1);
   assert.equal(t.__novaLinearMoveValid,true,
    'single unobstructed velocity-consistent Scout move should be witnessed');
   assert.equal(t.__novaLinearMoveDt,dt);
   assert.equal(t.__novaLinearMoveStartX,startX);
   assert.equal(t.__novaLinearMoveStartY,startY);
   assert.equal(t.__novaLinearMoveEndX,t.x);
   assert.equal(t.__novaLinearMoveEndY,t.y);
   const first={x:t.x,y:t.y,moved:+moved.toFixed(6)};
   // A second move in the same epoch must invalidate the linear certificate;
   // the resolver must never infer a single straight trajectory from it.
   g.moveTank(t,0,60,dt);
   assert.equal(t.__novaLinearMoveCalls,2);
   assert.equal(t.__novaLinearMoveValid,false);
   return {seed,hz,dt,first,secondMoveInvalidated:true};
  }finally{g.destroy();}
 });
}

test('real Scout movement certifies one segment and rejects two same-epoch moves',()=>{
 const rows=[];
 for(const seed of [1517800,1517802])
  for(const hz of [30,60,120])rows.push(witness(seed,hz));
 assert.equal(rows.length,6);
 console.log('SCOUT_MOVING_BODY_WITNESS_RESEARCH '+JSON.stringify(rows));
});

test('composed Game.update preserves the Scout witness at the bullet phase',()=>{
 const rows=[];
 for(const seed of [1517800,1517802])for(const hz of [30,60,120]){
  rows.push(withSeed(seed,()=>{
   const g=bootGame();if(!g.player)g.redeploy();
   try{
    const p=g.player,t=g.tanks.find(x=>x!==p);
    assert.ok(t);
    g.sfx.muted=true;
    g.tanks=[p,t];g.tankById=new Map([[p.id,p],[t.id,t]]);
    g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
    g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
    if(g.hash&&g.hash.clear)g.hash.clear();
    t.cls='scout';t.isPlayer=true;t.alive=true;
    t.x=200;t.y=-30;t.vx=0;t.vy=60;
    t.spawnShieldT=0;t.shieldT=0;
    g.status='playing';g.paused=false;
    g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
    g.crasherTimer=Infinity;g.aiRespawns=[];
    g.spawnShape=()=>null;g.spawnPowerup=()=>null;
    g.spawnAITank=()=>null;g.spawnDrone=()=>null;
    p.spawnShieldT=0;p.droneRespawnT=Infinity;
    g.input.firing=false;g.input.autofire=false;
    let observed=null;
    // Move during the drones phase, before the core rebuilds its spatial
    // hash. Moving at updateBullets would leave the hash stale and produce
    // a misleading collision fixture.
    const oldDrones=g.updateDrones,oldBullets=g.updateBullets;
    let sx=t.x,sy=t.y;
    g.updateDrones=function(dt){
     sx=t.x;sy=t.y;this.moveTank(t,0,60,dt);
     return oldDrones.apply(this,arguments);
    };
    g.updateBullets=function(dt){
     observed={time:this.time,epoch:t.__novaLinearMoveEpoch,
      valid:t.__novaLinearMoveValid,calls:t.__novaLinearMoveCalls,
      dt:t.__novaLinearMoveDt,
      dx:t.x-sx,dy:t.y-sy};
     return oldBullets.apply(this,arguments);
    };
    g.update(1/hz);
    assert.ok(observed,'real Game.update must execute the projectile phase');
    assert.equal(observed.epoch,observed.time);
    assert.equal(observed.valid,true);
    assert.equal(observed.calls,1);
    assert.equal(observed.dt,1/hz);
    assert.ok(Math.abs(observed.dx)<1e-6);
    assert.ok(Math.abs(observed.dy-60/hz)<1e-6);
    return {seed,hz,dy:+observed.dy.toFixed(6),epoch:observed.epoch};
   }finally{g.destroy();}
  }));
 }
 assert.equal(rows.length,6);
 console.log('SCOUT_GAME_UPDATE_BULLET_PHASE_WITNESS '+JSON.stringify(rows));
});

test('Gunner projectiles encounter a Scout moving through real Game.moveTank',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm'])
  for(const hz of [30,60,120])
   for(const seed of [1517800,1517802]){
    rows.push(withSeed(seed,()=>{
     const g=bootGame();if(!g.player)g.redeploy();
     try{
      const p=g.player,t=g.tanks.find(x=>x!==p);
      assert.ok(t);
      g.sfx.muted=true;g.setClass(p,cls);
      p.x=0;p.y=0;p.vx=0;p.vy=0;p.angle=0;
      p.stats.reload=cls==='minigun'?1:3;
      p.spawnShieldT=0;p.droneRespawnT=Infinity;
      g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
      Object.assign(t,{cls:'scout',isPlayer:true,alive:true,
       x:200,y:-40,vx:0,vy:60,hp:1000000,maxHp:1000000,
       gene:null,perk:null,spawnShieldT:0,shieldT:0,bulwarkT:0,
       tauntT:0,cloakT:0});
      g.tanks=[p,t];g.tankById=new Map([[p.id,p],[t.id,t]]);
      g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
      g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
      if(g.hash&&g.hash.clear)g.hash.clear();
      g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
      g.crasherTimer=Infinity;g.aiRespawns=[];
      g.spawnShape=()=>null;g.spawnPowerup=()=>null;
      g.spawnAITank=()=>null;g.spawnDrone=()=>null;
      g.status='playing';g.paused=false;
      g.input.autofire=false;g.input.firing=true;
      g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
      let witnessed=0,invalid=0,hits=0,damage=0;
      const originalDrones=g.updateDrones;
      const originalBullets=g.updateBullets,originalDamage=g.damageTank;
      g.updateDrones=function(dt){
       t.vx=0;t.vy=60;
       this.moveTank(t,0,60,dt);
       return originalDrones.apply(this,arguments);
      };
      g.updateBullets=function(dt){
       if(t.__novaLinearMoveValid===true&&
          t.__novaLinearMoveEpoch===this.time&&
          t.__novaLinearMoveCalls===1)witnessed++;
       else invalid++;
       return originalBullets.apply(this,arguments);
      };
      g.damageTank=function(victim){
       const hp=victim.hp,result=originalDamage.apply(this,arguments);
       if(victim===t&&victim.hp<hp){hits++;damage+=hp-victim.hp;}
       return result;
      };
      const ticks=2*hz;
      for(let i=0;i<ticks;i++)g.update(1/hz);
      assert.equal(witnessed,ticks,
       'every unobstructed Scout movement must have a real per-tick certificate');
      assert.equal(invalid,0);
      assert.ok(Number.isFinite(t.x)&&Number.isFinite(t.y));
      assert.ok(Number.isFinite(damage)&&damage>=0);
      assert.ok(t.y>-40,'target must advance physically, not teleport each frame');
      return {seed,cls,hz,witnessed,hits,damage:+damage.toFixed(4),
       endX:+t.x.toFixed(4),endY:+t.y.toFixed(4)};
     }finally{g.destroy();}
    }));
   }
 assert.equal(rows.length,12);
 console.log('GUNNER_REAL_MOVING_SCOUT_DAMAGE_RESEARCH '+JSON.stringify(rows));
});
