'use strict';
/* Research only: #799 matched simulated-time burst policies in the actual
 * composed 49-overlay Game. No targets or production changes. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
function run(seed,cls,reload,hz,policy,seconds=4){return withSeed(seed,()=>{
 const g=bootGame(),p=g.player;g.sfx.muted=true;
 g.setClass(p,cls);g.tanks=[p];g.tankById=new Map([[p.id,p]]);
 g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
 if(g.shapeById)g.shapeById.clear();
 if(g.hash&&g.hash.clear)g.hash.clear();
 g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
 g.crasherTimer=Infinity;g.aiRespawns=[];
 g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
 p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
 g.status='playing';g.paused=false;p.stats.reload=reload;
 g.input.autofire=false;g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
 let volleys=0,spinSum=0,heatPeak=0,offShots=0,on=true;
 const original=g.tryFire;
 g.tryFire=function(t){const before=this.bullets.length;
  const result=original.apply(this,arguments);
  if(t===p&&this.bullets.length>before){volleys++;if(!on)offShots++;}
  return result;};
 for(let i=0;i<seconds*hz;i++){
  const t=i/hz;
  on=policy==='held'||(policy==='long-burst'?t%1.25<1:t%.8<.4);
  g.input.firing=on;
  g.update(1/hz);
  assert.equal(g.tanks.length,1,'no AI tank contamination');
  assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,'no neutral/drone contamination');
  spinSum+=p.fireSpin||0;heatPeak=Math.max(heatPeak,p.__v17Heat||0);
 }
 const out={cls,reload,hz,policy,seconds,volleys,offShots,
  spin:+(p.fireSpin||0).toFixed(5),
  spinMean:+(spinSum/(seconds*hz)).toFixed(5),
  heatPeak:+heatPeak.toFixed(5)};
 g.destroy();return out;
});}
test('legal rotary builds expose held vs burst cadence at matched simulated time',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]])
  for(const policy of ['held','long-burst','short-burst'])
   for(const hz of [30,60,120]){
    const a=run(1517800,cls,reload,hz,policy);
    const b=run(1517802,cls,reload,hz,policy);
    assert.deepEqual(a,b,'no-target cadence must be independent of seeded world');
    assert.equal(a.offShots,0,'release must not create delayed player volleys');
    assert.ok(a.volleys>0&&a.volleys<=secondsUpperBound(a.seconds,hz));
    assert.ok(Number.isFinite(a.spin)&&Number.isFinite(a.heatPeak));
    rows.push(a);
   }
 console.log('GUNNER_BURST_CADENCE_CENSUS '+JSON.stringify(rows));
});
function secondsUpperBound(seconds,hz){return seconds*hz;}
