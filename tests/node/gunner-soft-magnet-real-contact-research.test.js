'use strict';
/* Research-only #624: compare actual projectile contact from hard snap,
 * bounded soft magnet, and manual aiming in the composed Game.
 * No shipping gameplay change. */
const test=require('node:test'),assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const softBearing=(requested,target)=>{
 const delta=wrap(requested-target);
 return wrap(requested-delta*.45*Math.exp(-((delta/.06)**2)));
};
function trial(seed,cls,hz,scenario,policy){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const p=g.player,t=g.tanks.find(x=>x!==p);assert.ok(t);
   g.sfx.muted=true;g.setClass(p,cls);
   Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
   p.stats.reload=cls==='minigun'?1:3;
   Object.assign(t,{cls:'scout',isPlayer:true,alive:true,x:200,
    y:scenario==='moving'?-35:0,vx:0,vy:0,hp:1000000,maxHp:1000000,
    gene:null,perk:null,spawnShieldT:0,shieldT:0,bulwarkT:0,
    tauntT:0,cloakT:0});
   g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
   g.tanks=[p,t];g.tankById=new Map([[p.id,p],[t.id,t]]);
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash&&g.hash.clear)g.hash.clear();
   if(g.shapeById)g.shapeById.clear();
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
   g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;
   g.spawnAITank=()=>null;g.spawnDrone=()=>null;
   g.status='playing';g.paused=false;
   g.input.autofire=false;g.input.aim.active=true;
   const nearest=g.nearestTank,originalDrones=g.updateDrones;
   let eligible=0,queries=0,movementWitness=0,hits=0,damage=0,volleys=0,maxTrajectoryDrift=0;
   g.nearestTank=function(x,y,r,exclude){
    const found=nearest.apply(this,arguments);
    if(exclude===p.id&&r===480&&x===p.x&&y===p.y){
     queries++;if(found===t)eligible++;
     if(policy!=='hard')return null;
    }
    return found;
   };
   g.updateDrones=function(dt){
    if(scenario==='moving'){
     t.vx=0;t.vy=45;
     this.moveTank(t,0,45,dt);
     if(t.__novaLinearMoveValid===true&&t.__novaLinearMoveEpoch===this.time)
      movementWitness++;
    }
    return originalDrones.apply(this,arguments);
   };
   const originalDamage=g.damageTank,originalFire=g.tryFire;
   g.damageTank=function(victim){
    const before=victim.hp,out=originalDamage.apply(this,arguments);
    if(victim===t&&victim.hp<before){hits++;damage+=before-victim.hp;}
    return out;
   };
   g.tryFire=function(tank){
    const before=this.bullets.length,out=originalFire.apply(this,arguments);
    if(tank===p&&this.bullets.length>before)volleys++;
    return out;
   };
   const activeTicks=4*hz,drainTicks=2*hz;
   for(let i=0;i<activeTicks+drainTicks;i++){
    // Identical requested physical bearing across policies: 0.08-rad lead
    // against the moving Scout; stationary controls use both 0.008-rad
    // micro-error and 0.12-rad wide error to expose accessibility loss.
    const targetBearing=Math.atan2(t.y-p.y,t.x-p.x);
    // Physical stick intent follows the same nominal path in all arms,
    // even if hit knockback changes the real target's subsequent position.
    const nominalY=scenario==='moving'?-35+45*i/hz:0;
    const requested=wrap(Math.atan2(nominalY,200)+
     (scenario==='moving'?.08:scenario==='stationary-wide'?.12:.008));
    const effective=policy==='soft'?softBearing(requested,targetBearing):requested;
    g.input.aim.dx=40*Math.cos(effective);
    g.input.aim.dy=40*Math.sin(effective);
    g.input.firing=i<activeTicks;
    g.update(1/hz);
    const expectedY=scenario==='moving'?-35+45*(i+1)/hz:0;
    maxTrajectoryDrift=Math.max(maxTrajectoryDrift,Math.hypot(t.x-200,t.y-expectedY));
   }
   assert.ok(queries>0,'shipping assist must be consulted');
   assert.equal(eligible,queries,'target must be publicly eligible throughout');
   if(scenario==='moving')assert.equal(movementWitness,activeTicks+drainTicks,
    'moving-body certificate must survive every composed update');
   assert.ok(Number.isFinite(damage)&&damage>=0);
   assert.ok(hits>=0&&volleys>0);
   return {seed,cls,hz,scenario,policy,hits,volleys,
    damage:+damage.toFixed(4),eligible,movementWitness,
    maxTrajectoryDrift:+maxTrajectoryDrift.toFixed(4)};
  }finally{g.destroy();}
 });
}
test('opt-in soft magnet contact and stationary-error controls use real composed Game',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm'])
  for(const hz of [30,60])
   for(const scenario of ['stationary','stationary-wide','moving']){
    const arms=['hard','soft','manual'].map(policy=>trial(1517800,cls,hz,scenario,policy));
    assert.equal(new Set(arms.map(x=>x.volleys)).size,1,
     'aim policy must not alter weapon firing cadence');
    assert.ok(arms.every(x=>x.damage>=0&&Number.isFinite(x.damage)));
    assert.ok(arms.every(x=>x.eligible>0));
    rows.push({cls,hz,scenario,arms});
   }
 assert.equal(rows.length,12);
 console.log('SOFT_MAGNET_REAL_CONTACT_RESEARCH '+JSON.stringify(rows));
});
