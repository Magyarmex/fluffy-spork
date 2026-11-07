'use strict';
/* Preserve established 60Hz Tempest cadence across legal build modifiers.
 * A coarse-frame negative-cooldown carry can appear to fix stock Tempest at
 * 30Hz while overfiring upgraded Tempest. Stock 60Hz goldens alone cannot
 * catch that regression. Uses the composed 49-overlay Game. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const cases={
 stock:{count:153,setup(){}},
 reload1:{count:155,setup(p){p.stats.reload=1;}},
 reload2:{count:159,setup(p){p.stats.reload=2;}},
 reload3:{count:162,setup(p){p.stats.reload=3;}},
 reload4:{count:163,setup(p){p.stats.reload=4;}},
 reload5:{count:234,setup(p){p.stats.reload=5;}},
 reload7:{count:236,setup(p){p.stats.reload=7;}},
 reload8:{count:236,setup(p){p.stats.reload=8;}},
 alacrity:{count:160,setup(p){p.perk='alacrity';}},
 gunnerGene:{count:117,setup(p){p.gene='gunner';}},
 initialOverheat:{count:188,setup(p){p.overheatT=3;}},
 initialHeat:{count:150,setup(p){p.__v17Heat=.8;}}
};
function arm(seed,hz,setup){return withSeed(seed,()=>{
 const g=bootGame(),p=g.player;g.sfx.muted=true;
 g.setClass(p,'tempest');g.tanks=[p];g.tankById=new Map([[p.id,p]]);
 g.shapes=[];g.drones=[];g.powerups=[];
 // Zero Churn retains a shape-id index after clearing the live array.
 if(g.shapeById)g.shapeById.clear();
 // Keep the 60Hz golden genuinely no-target: the core replenishes neutral
 // shapes and Tempest's native ESCORT drones unless explicitly suppressed.
 g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
 g.crasherTimer=Infinity;g.aiRespawns=[];
 g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
 p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
 g.input.aim.active=true;g.input.aim.dx=40;g.input.firing=true;g.input.autofire=false;
 setup(p,g);let volleys=0;const original=g.tryFire;
 g.tryFire=function(t){const n=this.bullets.length;const result=original.apply(this,arguments);
  if(t===p&&this.bullets.length>n)volleys++;return result;};
 for(let i=0;i<8*hz;i++){
  g.update(1/hz);
  assert.equal(g.tanks.length,1,'isolated Tempest must have only player tank');
  assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,'isolated Tempest must have no targets');
 }
 const out={volleys,heat:p.__v17Heat||0,fireCd:p.fireCd};g.destroy();return out;
});}
for(const [name,{count,setup}] of Object.entries(cases)){
 test('Tempest '+name+' preserves 60Hz eight-second cadence and cannot overfire at 30Hz',()=>{
  for(const seed of [1517800,1517802,1517810]){
   const reference=arm(seed,60,setup),coarse=arm(seed,30,setup);
   assert.equal(reference.volleys,count,name+' 60Hz reference, seed '+seed);
   assert.ok(coarse.volleys<=reference.volleys+1,
    name+' 30Hz emitted '+coarse.volleys+' vs 60Hz '+reference.volleys+'; reject coarse carry overfire');
   assert.ok(Number.isFinite(reference.heat)&&Number.isFinite(coarse.heat));
   assert.ok(Number.isFinite(reference.fireCd)&&Number.isFinite(coarse.fireCd));
  }
 });
}
