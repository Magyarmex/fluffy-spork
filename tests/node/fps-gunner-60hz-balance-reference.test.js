'use strict';
/* Frame-rate repair must preserve the established 60Hz Gunner handling, not
 * merely make 30Hz match by silently changing the reference class balance.
 * This is the actual 49-overlay Game.update / Game.tryFire path, not a toy
 * timer model. No enemies or targets are present: emitted volleys, not DPS. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const reference={
  twin:        {volleys:15,heat:.245,heatPeak:.35866666666666736},
  minigun:     {volleys:24,heat:.144,heatPeak:.184},
  shotgun:     {volleys:5, heat:.16766666666666666,heatPeak:.24},
  tempest:     {volleys:73,heat:1.18,heatPeak:1.18},
  needlestorm: {volleys:22,heat:.0226,heatPeak:.0546},
  breachlord:  {volleys:5, heat:0,heatPeak:.24},
  flakmaster:  {volleys:4, heat:0,heatPeak:.24},
};
function run(cls,seed){return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;
  g.setClass(p,cls);
  g.tanks=[p];g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];
  g.status='playing';g.paused=false;
  g.input.firing=true;g.input.autofire=false;g.input.mouseActive=false;
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  let volleys=0,heatPeak=0;
  const tryFire=g.tryFire;
  g.tryFire=function(t){const before=this.bullets.length;
    const out=tryFire.apply(this,arguments);
    if(t===p&&this.bullets.length>before)volleys++;
    return out;
  };
  for(let tick=0;tick<240;tick++){
    g.update(1/60);
    heatPeak=Math.max(heatPeak,p.__v17Heat||0);
  }
  const result={volleys,heat:p.__v17Heat||0,heatPeak};
  g.destroy();return result;
});}
function approx(a,b,name){assert.ok(Math.abs(a-b)<1e-8,`${name}: ${a} != ${b}`);}
for(const [cls,expected] of Object.entries(reference)){
  test(`60Hz ${cls} firing/heat golden reference survives FPS fixes`,()=>{
    for(const seed of [1517800,1517802]){
      const actual=run(cls,seed);
      assert.equal(actual.volleys,expected.volleys,`${cls} emitted volleys`);
      approx(actual.heat,expected.heat,`${cls} final heat`);
      approx(actual.heatPeak,expected.heatPeak,`${cls} peak heat`);
    }
  });
}
