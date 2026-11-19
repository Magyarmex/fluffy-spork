'use strict';
/* #648: diagnostic, real 49-overlay Tempest shot-state chronology.
 * Captures the post-shot heat/cooldown that the composed Gunner + Apex
 * wrappers actually produce, rather than inferring cadence from counts.
 * Research data are not balance goldens or device-performance claims. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const band=h=>Math.max(0,1-Math.abs(h-.56)/.36);
function run(seed,reload,hz){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;
  g.setClass(p,'tempest');p.x=1000;p.y=1000;p.vx=0;p.vy=0;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.__novaTerrain=[];g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;p.stats.reload=reload;
  g.input.autofire=false;g.input.mouseActive=false;g.input.firing=true;
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  g.input.moveVec=()=>({x:0,y:0});
  const shots=[],original=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length;
   const pre={heat:t.__v17Heat||0,cd:t.fireCd||0,stability:t.__v17Stability??1,spin:t.fireSpin||0};
   const ret=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before){
    const heat=p.__v17Heat||0,stability=p.__v17Stability??1;
    shots.push({time:this.time,pre,heat,stability,spin:p.fireSpin||0,cd:p.fireCd,
     apex:p.__v171ApexMeter,boost:band(heat)>.58&&stability>.52,
     redline:heat>.90,projectiles:this.bullets.length-before});
   }
   return ret;
  };
  try{
   for(let i=0;i<6*hz;i++)g.update(1/hz);
   assert.equal(g.tanks.length,1);
   assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0);
   assert.ok(shots.length>0);
   for(let i=0;i<shots.length;i++){
    const s=shots[i];
    assert.ok(Number.isFinite(s.time)&&Number.isFinite(s.cd)&&s.cd>0);
    assert.ok(s.heat>=0&&s.heat<=1.18+1e-9);
    assert.ok(s.stability>=0&&s.stability<=1+1e-9);
    assert.ok(s.spin>=0&&s.spin<=1+1e-9);
    assert.ok(s.spin>=s.pre.spin-1e-9,'a firing event must not reduce rotary spin');
    assert.ok(s.projectiles>=1);
    assert.ok(Math.abs(s.apex-band(s.heat))<1e-9,
     'Apex meter must use post-Gunner shot heat');
    if(i)assert.ok(s.time>shots[i-1].time,'shots must be chronological');
   }
   const summary={seed,reload,hz,volleys:shots.length,
    boost:shots.filter(s=>s.boost).length,
    redline:shots.filter(s=>s.redline).length,
    cooldownAbove30HzTick:shots.filter(s=>s.cd>1/30+1e-9).length,
    redlineAbove30HzTick:shots.filter(s=>s.redline&&s.cd>1/30+1e-9).length,
    redlineAtOrBelow30HzTick:shots.filter(s=>s.redline&&s.cd<=1/30+1e-9).length,
    first:shots.slice(0,6).map(s=>({
     time:+s.time.toFixed(5),preHeat:+s.pre.heat.toFixed(5),
     heat:+s.heat.toFixed(5),cd:+s.cd.toFixed(5),
     stability:+s.stability.toFixed(5),preSpin:+s.pre.spin.toFixed(5),
     spin:+s.spin.toFixed(5),boost:s.boost,redline:s.redline
    })),
    finalHeat:+(p.__v17Heat||0).toFixed(5),
    finalCd:+(p.fireCd||0).toFixed(5)};
   return summary;
  }finally{g.destroy();}
 });
}
test('Tempest legal reload builds expose composed per-shot heat and cooldown chronology',()=>{
 const rows=[];
 for(const reload of [0,4,5,8])for(const hz of [30,60,120]){
  const a=run(1517800,reload,hz),b=run(1517802,reload,hz);
  assert.deepEqual({...a,seed:0},{...b,seed:0},
   'isolated deterministic chronology must not depend on world seed');
  rows.push(a);
 }
 assert.equal(rows.length,12);
 console.log('TEMPEST_SHOT_STATE_TRACE '+JSON.stringify(rows));
});
