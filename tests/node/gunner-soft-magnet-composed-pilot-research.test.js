'use strict';
// Research-only #624: no shipping gameplay change. The proposed continuous
// magnet is compared with hard snap and manual aim in the actual composed Game.
const test=require('node:test'),assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;
function wrap(a){return Math.atan2(Math.sin(a),Math.cos(a));}
function softBearing(requested,target){
 const d=wrap(requested-target);
 return wrap(requested-d*.55*Math.exp(-((d/.06)**2)));
}
function sample(seed,hz,requested,mode){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const p=g.player,t=g.tanks.find(x=>x!==p);assert.ok(t);
   g.sfx.muted=true;g.setClass(p,'minigun');
   Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
   Object.assign(t,{cls:'scout',isPlayer:true,alive:true,x:200,y:0,vx:0,vy:0,
    spawnShieldT:0,shieldT:0,cloakT:0,tauntT:0,bulwarkT:0});
   g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
   g.tanks=[p,t];g.tankById=new Map([[p.id,p],[t.id,t]]);
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash&&g.hash.clear)g.hash.clear();
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
   g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;
   g.spawnAITank=()=>null;g.spawnDrone=()=>null;
   g.status='playing';g.paused=false;
   g.input.autofire=false;g.input.firing=false;g.input.aim.active=true;
   const effective=mode==='soft'?softBearing(requested,0):requested;
   g.input.aim.dx=40*Math.cos(effective);
   g.input.aim.dy=40*Math.sin(effective);
   if(mode!=='hard'){
    // Only suppress the shipping assist lookup. Real Game.update still owns
    // aim smoothing, steering, and the rest of the world simulation.
    const original=g.nearestTank;
    g.nearestTank=function(x,y,r,exclude){
     if(exclude===p.id&&r===480&&x===p.x&&y===p.y)return null;
     return original.apply(this,arguments);
    };
   }
   g.update(1/hz);
   return p.angle;
  }finally{g.destroy();}
 });
}
test('continuous soft magnet preserves lead, damps small errors and avoids a hard boundary',()=>{
 const deg=x=>x*Math.PI/180;
 assert.equal(softBearing(0,0),0);
 for(const sign of [-1,1]){
  assert.ok(Math.abs(softBearing(sign*deg(.5),0))<deg(.3));
  assert.ok(Math.abs(softBearing(sign*deg(7),0))>deg(6.8));
  assert.ok(Math.abs(wrap(softBearing(sign*deg(30),0)-sign*deg(30)))<1e-8);
 }
 assert.ok(Math.abs(wrap(softBearing(.221,0)-softBearing(.219,0)))<.003);
 assert.ok(Math.abs(wrap(softBearing(-Math.PI+.01,Math.PI-.01)-(-Math.PI+.01)))<.02);
});
test('shipping hard snap versus opt-in soft and manual bearing in composed Game',()=>{
 const rows=[];
 for(const seed of [1517800,1517802])for(const hz of [30,60,120])
  for(const requested of [-.12,-.015,0,.015,.12,.219,.221]){
   const hard=sample(seed,hz,requested,'hard');
   const soft=sample(seed,hz,requested,'soft');
   const manual=sample(seed,hz,requested,'manual');
   assert.ok(Number.isFinite(soft));
   assert.ok(Math.abs(soft)<=Math.abs(manual)+1e-6);
   if(Math.abs(requested)>.10&&Math.abs(requested)<.20)
    assert.ok(Math.abs(soft)>Math.abs(hard)+1e-4,'preserve deliberate lead');
   if(Math.abs(requested)<.02&&requested!==0)
    assert.ok(Math.abs(soft)<Math.abs(manual),'damp micro-error');
   rows.push({seed,hz,requested,hard:+hard.toFixed(5),
    soft:+soft.toFixed(5),manual:+manual.toFixed(5)});
  }
 assert.equal(rows.length,42);
 console.log('SOFT_MAGNET_COMPOSED_PILOT '+JSON.stringify(rows));
});
