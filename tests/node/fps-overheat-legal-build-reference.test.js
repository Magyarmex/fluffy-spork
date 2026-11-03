'use strict';
/* Protect legal five-second Overheat + Alacrity firing behavior against unsafe
 * frame-rate repairs. This is the actual 49-overlay Game and its real
 * useAbility owner, not a cooldown-only toy. #648 remains unresolved:
 * DO NOT treat the current 30Hz underfire as a desired golden reference.
 * High-refresh overfire is bounded without locking a flawed 30Hz count. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const cases=[
  {cls:'tempest',reload:4,expected60:295},
  {cls:'tempest',reload:8,expected60:297},
  {cls:'minigun',reload:8,expected60:290},
];
function run(seed,cls,reload,hz){return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;
  g.setClass(p,cls);
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  p.stats.reload=reload;p.perk='alacrity';
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  g.input.firing=true;g.input.autofire=false;
  g.useAbility(p);
  assert.ok(p.overheatT>=4.99,`${cls}: actual Overheat ability did not activate`);
  let volleys=0;const original=g.tryFire;
  g.tryFire=function(t){const before=this.bullets.length;
    const result=original.apply(this,arguments);
    if(t===p&&this.bullets.length>before)volleys++;
    return result;
  };
  for(let i=0;i<5*hz;i++)g.update(1/hz);
  const out={volleys,heat:p.__v17Heat||0,fireCd:p.fireCd};
  g.destroy();return out;
});}
for(const {cls,reload,expected60} of cases){
 test(`${cls} reload ${reload} + Alacrity + actual Overheat preserves 60Hz legal firing reference`,()=>{
  for(const seed of [1517800,1517802]){
    const reference=run(seed,cls,reload,60);
    const highRefresh=run(seed,cls,reload,120);
    assert.equal(reference.volleys,expected60,`60Hz reference seed ${seed}`);
    assert.ok(highRefresh.volleys<=reference.volleys+5,
      `high-refresh overfire: ${highRefresh.volleys} vs ${reference.volleys}`);
    assert.ok(Number.isFinite(reference.heat)&&Number.isFinite(highRefresh.heat));
    assert.ok(Number.isFinite(reference.fireCd)&&Number.isFinite(highRefresh.fireCd));
  }
 });
}
