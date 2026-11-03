'use strict';
// Real 49-overlay composed game: the DPR research pilot must not mutate any
// world state, RNG history, Input or canvas backing size. Not a device test.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {AdaptiveDprPilot}=require('../research/adaptive-dpr-pilot.cjs');
test('DPR research decisions are read-only in the actual materialized game',()=>{
 for(const seed of [1517800,1517802,1517810])withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;
  try {
   const render=g.__testWindow.__novaMakeRequire('')('game/render').render;
   for(let i=0;i<12;i++){g.update(1/60);render(g,g.w,g.h);}
   const snapshot=g.novaPerfSnapshot();
   const before=digest(physical(g)),rngBefore=draws();
   const canvasBefore={width:g.canvas.width,height:g.canvas.height};
   const pilot=new AdaptiveDprPilot();
   for(let i=0;i<20;i++)pilot.observe(snapshot,i*1000);
   assert.equal(digest(physical(g)),before,'gameplay state must remain untouched');
   assert.equal(draws(),rngBefore,'research decision must consume no gameplay RNG');
   assert.deepEqual({width:g.canvas.width,height:g.canvas.height},canvasBefore,
    'the pilot must not silently resize the actual game');
  } finally {g.destroy();}
 });
});
