'use strict';
/* Research-only #701: a causal *visual* intervention in the real composed Game.
 * Does not patch shipping code, change weapon cadence or claim a CPU saving.
 * A/A is mandatory: instrumentation must not alter the physical world or RNG.
 * A/B burns the same cosmetic draws as the omitted ordinary trail, so any
 * physical difference falsifies the proposed safe intervention. */
const test=require('node:test');
const assert=require('node:assert/strict');
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed,digest,physical}=
  require('../research/audio-rng-causal-pilot.cjs');

function run(seed,hz,mode){
 return withSeed(seed,draws=>{
  const g=bootGame();
  const originalParticles=g.addParticles;
  const originalBullets=g.updateBullets;
  let insideBullets=false,ordinaryTrailCalls=0,suppressed=0,allCalls=0;
  try{
   g.sfx.muted=true;g.sfx.startMusic=()=>{};
   g.setClass(g.player,'tempest');
   g.input.autofire=false;g.input.firing=true;
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   g.updateBullets=function(...args){
    insideBullets=true;
    try{return originalBullets.apply(this,args);}
    finally{insideBullets=false;}
   };
   g.addParticles=function(...args){
    allCalls++;
    const trail=insideBullets && args.length>=6 &&
      args[3]===1 && args[4]===20 && args[5]==='glow';
    if(trail)ordinaryTrailCalls++;
    if(trail && mode==='suppress'){
     suppressed++;
     // Shipping's one-particle glow draws angle, velocity, life and size.
     // A/A and A/B total-draw assertions below must detect any mismatch.
     for(let i=0;i<4;i++)g.cosmeticRandom();
     return;
    }
    return originalParticles.apply(this,args);
   };
   for(let i=0;i<hz*2;i++)g.update(1/hz);
   return {seed,hz,mode,hash:digest(physical(g)),draws:draws(),
    ordinaryTrailCalls,suppressed,allCalls,cosmeticState:g.__novaCosmeticRngState,activeParticles:
      (g.parts||[]).filter(p=>p && p.active).length};
  }finally{
   g.addParticles=originalParticles;g.updateBullets=originalBullets;
   g.destroy();
  }
 });
}
test('ordinary projectile glow suppression is physically and RNG transparent in composed Game',()=>{
 for(const hz of [30,60,120])for(const seed of [1517800,1517802]){
  const baseline=run(seed,hz,'baseline');
  const instrumented=run(seed,hz,'instrument');
  const suppressed=run(seed,hz,'suppress');
  assert.ok(baseline.ordinaryTrailCalls>0,'real Tempest must emit ordinary trails');
  assert.equal(baseline.ordinaryTrailCalls,instrumented.ordinaryTrailCalls);
  assert.equal(baseline.hash,instrumented.hash,'A/A instrumentation must be inert');
  assert.equal(baseline.draws,instrumented.draws,'A/A must not consume RNG');
  assert.equal(suppressed.suppressed,suppressed.ordinaryTrailCalls);
  assert.equal(suppressed.ordinaryTrailCalls,baseline.ordinaryTrailCalls);
  assert.equal(suppressed.cosmeticState,baseline.cosmeticState,
   'suppression must preserve dedicated cosmetic RNG state');
  assert.equal(suppressed.draws,baseline.draws,
   'omitted glow must preserve the cosmetic RNG sequence');
  assert.equal(suppressed.hash,baseline.hash,
   'cosmetic-only suppression must not change physical gameplay');
  console.log('PROJECTILE_TRAIL_CAUSAL '+JSON.stringify({
   seed,hz,ordinaryTrailCalls:baseline.ordinaryTrailCalls,
   suppressed:suppressed.suppressed,
   baselineParticles:baseline.activeParticles,
   suppressedParticles:suppressed.activeParticles,
   physicalParity:true,rngParity:true,
   caveat:'Node composed Game, not browser FPS or human visual-quality evidence'
  }));
 }
});
