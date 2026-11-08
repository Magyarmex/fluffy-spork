'use strict';
/* #610 / #648: legal Gunner upgrade cliffs in the actual composed Game.
 * Do not infer target DPS or player outcomes from isolated emitted volleys.
 * A formula-only model suggested integer-tick cliffs; this test asks the
 * real 49-overlay runtime rather than assuming the model is correct. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
function run(seed,cls,reload,hz,seconds=8){return withSeed(seed,()=>{
 const g=bootGame(),p=g.player;g.sfx.muted=true;
 g.setClass(p,cls);g.tanks=[p];g.tankById=new Map([[p.id,p]]);
 g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
 if(g.shapeById)g.shapeById.clear();
 if(g.hash&&g.hash.clear)g.hash.clear();
 g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
 g.crasherTimer=Infinity;g.aiRespawns=[];
 g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
 p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
 g.status='playing';g.paused=false;
 p.stats.reload=reload;
 g.input.firing=true;g.input.autofire=false;
 g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
 let volleys=0,heatPeak=0;const first=[];
 const original=g.tryFire;
 g.tryFire=function(t){const before=this.bullets.length;
  const result=original.apply(this,arguments);
  if(t===p&&this.bullets.length>before){volleys++;if(first.length<4)first.push(+this.time.toFixed(7));}
  return result;};
 for(let i=0;i<seconds*hz;i++){
  g.update(1/hz);
  assert.equal(g.tanks.length,1,'no AI tank contamination');
  assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,'no shape/drone contamination');
  heatPeak=Math.max(heatPeak,p.__v17Heat||0);
 }
 const out={cls,reload,hz,seconds,volleys,first,heat:p.__v17Heat||0,heatPeak,
  stability:p.__v17Stability==null?1:p.__v17Stability,fireCd:p.fireCd};
 g.destroy();return out;
});}

test('composed 60Hz baseline Minigun and Needle Storm retain existing 4s goldens',()=>{
 for(const seed of [1517800,1517802]){
  assert.equal(run(seed,'minigun',0,60,4).volleys,24);
  assert.equal(run(seed,'needlestorm',0,60,4).volleys,22);
 }
});

test('legal Minigun and Needle Storm reload cliffs are observed without invented goldens',()=>{
 const cases={minigun:[0,1,3,4],needlestorm:[2,3,4,5]};
 const rows=[];
 for(const [cls,levels] of Object.entries(cases))for(const reload of levels)for(const hz of [30,60,120]){
  const a=run(1517800,cls,reload,hz),b=run(1517802,cls,reload,hz);
  assert.equal(a.volleys,b.volleys,`${cls} reload ${reload} hz ${hz}: seed count mismatch`);
  assert.deepEqual(a.first,b.first,`${cls}: first-shot timing must be seed-invariant`);
  for(const key of ['heat','heatPeak','stability','fireCd'])assert.ok(Number.isFinite(a[key]),key);
  assert.ok(a.volleys>0);
  rows.push({cls,reload,hz,volleys:a.volleys,first:a.first,heat:+a.heat.toFixed(5),
   heatPeak:+a.heatPeak.toFixed(5)});
 }
 // This is a falsification census, not a mandate to preserve any cadence cliff.
 console.log('GUNNER_LEGAL_RELOAD_CENSUS '+JSON.stringify(rows));
});
