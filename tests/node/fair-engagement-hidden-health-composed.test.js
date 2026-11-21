'use strict';
// Exercise the actual materialized engine and HTML-ordered 49 overlays.
// Offscreen health is private even when the Game still owns the tank object.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

test('composed Fair Engagement scoring cannot read an offscreen tank HP',()=>withSeed(1094,()=>{
  const g=bootGame();
  let target,oldHp;
  try {
    const bots=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
    assert.ok(bots.length>=2,'real Game must contain AI targets');
    const observer=bots[0];target=bots[1];
    observer.x=0;observer.y=0;target.x=1900;target.y=0;
    g.w=800;g.h=600;g.cam.zoom=1;
    oldHp=Object.getOwnPropertyDescriptor(target,'hp');
    Object.defineProperty(target,'hp',{configurable:true,
      get(){throw Error('composed Game leaked offscreen health');}});
    const C={lineageForClass:()=> 'gunner'};
    assert.equal(g.__testFair.scoreTarget(g,C,observer,observer.ai,target,g.time),-Infinity);
    assert.doesNotThrow(()=>g.__testFair.chooseTarget(g,C,observer,observer.ai,g.time));
  } finally {
    if(target&&oldHp)Object.defineProperty(target,'hp',oldHp);
    g.destroy();
  }
}));
