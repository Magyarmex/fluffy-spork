'use strict';
/* Exact 49-overlay Game: the later Zero Churn owner must not modify the
 * previous real-match performance snapshot while the War Room simulates. */
const test=require('node:test'),assert=require('node:assert/strict');
const prior=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(prior===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prior;
test('decorative War Room cannot mutate prior live-game diagnostic object',()=>{
 withSeed(1517802,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  g.sfx.muted=true;g.__novaDecorativeWorld=true;
  const saved={fps:60,frameP95Ms:17.5,battlefieldQueries:999,
   battlefieldAvgCandidates:4.25,entityHashBucketCreates:77};
  g.__testWindow.__NOVA_PERF_LAST__=saved;
  const expected={...saved};
  for(let i=0;i<3;i++)g.update(1/12);
  assert.deepEqual(saved,expected,
   'a decorative update must not alter live-match performance counters');
  assert.equal(g.__testWindow.__NOVA_PERF_LAST__,saved,
   'decorative updates must preserve the live-match snapshot identity');
 });
});
