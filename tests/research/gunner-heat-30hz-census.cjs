'use strict';
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('./audio-rng-causal-pilot.cjs');
const classes=['twin','minigun','shotgun','tempest','needlestorm','breachlord','flakmaster'];
function run(cls,seed,hz,seconds=4){return withSeed(seed,()=>{
 const g=bootGame(),p=g.player;
 g.setClass(p,cls);g.tanks=[p];g.tankById=new Map([[p.id,p]]);g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];
 // Zero Churn retains a shape-id index after clearing the live array.
 if(g.shapeById)g.shapeById.clear();
 // Core rebuilds this spatial hash after firing; clear ghost targets before the first shot.
 if(g.hash&&g.hash.clear)g.hash.clear();
 // Keep the census a controlled no-target Gunner heat experiment.
 g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
 g.crasherTimer=Infinity;g.aiRespawns=[];
 g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
 p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
 g.status='playing';g.paused=false;
 g.input.firing=true;g.input.autofire=false;g.input.mouseActive=false;
 g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
 let volleys=0,heatPeak=0;const original=g.tryFire;
 g.tryFire=function(t){const n=this.bullets.length,r=original.apply(this,arguments);if(t===p&&this.bullets.length>n)volleys++;return r;};
 for(let tick=0;tick<seconds*hz;tick++){
  g.update(1/hz);
  if(g.tanks.length!==1||g.shapes.length||g.drones.length||g.powerups.length)
   throw Error('Gunner heat census leaked combat entities');
  heatPeak=Math.max(heatPeak,p.__v17Heat||0);
 }
 const out={cls,hz,volleys,heat:p.__v17Heat||0,heatPeak,stability:p.__v17Stability,fireCd:p.fireCd,stepLeak:g.__v17FiringStepDt};
 g.destroy();return out;
});}
if(require.main===module)for(const cls of classes)for(const hz of [30,60,120])console.log(JSON.stringify(run(cls,1517800,hz)));
module.exports={run,classes};
