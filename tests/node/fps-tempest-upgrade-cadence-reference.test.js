'use strict';
/* Preserve established 60Hz Tempest cadence across real build modifiers.
 * A coarse-frame negative-cooldown carry can appear to fix stock Tempest at
 * 30Hz while overfiring upgraded Tempest. Stock 60Hz goldens alone cannot
 * catch that regression. Uses the composed 49-overlay Game. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const cases={
 stock:{count:153,setup(){}},
 reload3:{count:162,setup(p){p.stats.reload=3;}},
 reload7:{count:236,setup(p){p.stats.reload=7;}},
 reload12:{count:239,setup(p){p.stats.reload=12;}},
 reload20:{count:248,setup(p){p.stats.reload=20;}},
 alacrity:{count:160,setup(p){p.perk='alacrity';}},
 gunnerGene:{count:117,setup(p){p.gene='gunner';}},
 initialOverheat:{count:188,setup(p){p.overheatT=3;}},
 initialHeat:{count:150,setup(p){p.__v17Heat=.8;}}
};
function arm(seed,hz,setup){return withSeed(seed,()=>{
 const g=bootGame(),p=g.player;g.sfx.muted=true;
 g.setClass(p,'tempest');g.tanks=[p];g.tankById=new Map([[p.id,p]]);
 g.shapes=[];g.drones=[];g.powerups=[];
 g.input.aim.active=true;g.input.aim.dx=40;g.input.firing=true;g.input.autofire=false;
 setup(p,g);let volleys=0;const original=g.tryFire;
 g.tryFire=function(t){const n=this.bullets.length;const result=original.apply(this,arguments);
  if(t===p&&this.bullets.length>n)volleys++;return result;};
 for(let i=0;i<8*hz;i++)g.update(1/hz);
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
