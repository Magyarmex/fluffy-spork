'use strict';
/* #648: measure the composed shipping Game around LEGAL Tempest reload thresholds.
 * This is a no-target firing chronology probe, NOT measured hit DPS.
 * Applied Power Parity caps each player stat at eight. No production behavior is patched. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function trial(seed,reload,hz){return withSeed(seed,()=>{
 const g=bootGame(),p=g.player;g.sfx.muted=true;
 g.setClass(p,'tempest');
 g.tanks=[p];g.tankById=new Map([[p.id,p]]);
 g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
 if(g.shapeById)g.shapeById.clear();
 if(g.hash&&g.hash.clear)g.hash.clear();
 g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
 g.crasherTimer=Infinity;g.aiRespawns=[];
 g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
 p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
 p.stats.reload=reload;
 g.status='playing';g.paused=false;
 g.input.firing=true;g.input.autofire=false;
 g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
 let volleys=0;const first=[];
 const original=g.tryFire;
 g.tryFire=function(t){const before=this.bullets.length;
  const out=original.apply(this,arguments);
  if(t===p&&this.bullets.length>before){volleys++;if(first.length<4)first.push(+this.time.toFixed(7));}
  return out;};
 for(let i=0;i<8*hz;i++){
  g.update(1/hz);
  assert.equal(g.tanks.length,1,'no enemy tank contamination');
  assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,'no neutral or drone contamination');
 }
 const result={reload,hz,volleys,first,heat:p.__v17Heat||0,fireCd:p.fireCd};
 g.destroy();return result;
});}

test('composed Tempest reload thresholds 4/5 and 7/8 remain measurable across 30/60/120Hz',()=>{
 const levels=[4,5,7,8],rates=[30,60,120],seeds=[1517800,1517802];
 const byKey=new Map();
 for(const reload of levels)for(const hz of rates){
  const a=trial(seeds[0],reload,hz),b=trial(seeds[1],reload,hz);
  assert.equal(a.volleys,b.volleys,`seed-invariant firing count reload=${reload} hz=${hz}`);
  assert.deepEqual(a.first,b.first,'first firing timestamps must be seed-invariant');
  assert.ok(a.volleys>0&&Number.isFinite(a.heat)&&Number.isFinite(a.fireCd));
  byKey.set(`${reload}:${hz}`,a);
 }
 assert.equal(byKey.get('4:60').volleys,163,'existing 60Hz reload4 reference');
 assert.equal(byKey.get('5:60').volleys,234,'existing 60Hz reload5 reference');
 assert.equal(byKey.get('5:60').volleys-byKey.get('4:60').volleys,71,
  'preserve the established reload4-to-5 discontinuity until a deliberate balance fix');
 // The 9/10 progression hypothesis is invalid: Applied Power Parity caps at 8.
 // Keep this diagnostic on legal builds; it is not a DPS or encounter estimate.
 console.log('TEMPEST_RELOAD_THRESHOLD_RESEARCH '+JSON.stringify(
  [...byKey.values()].map(({reload,hz,volleys,first,heat})=>({
   reload,hz,volleys,first,heat:+heat.toFixed(5)}))));
});


test('Applied Power Parity rejects an illegal ninth Tempest reload point',()=>{
 withSeed(1517800,()=>{
  const g=bootGame(),p=g.player;
  g.setClass(p,'tempest');p.stats.reload=8;g.statPoints=1;
  g.upgradeStat('reload');
  assert.equal(p.stats.reload,8,'reload cannot advance past the legal cap');
  assert.equal(g.statPoints,1,'rejected upgrade must not spend a point');
  g.destroy();
 });
});
