'use strict';
/* #701 research-only causal control in the actual composed Game.
 * No production VFX/weapon changes; Node is not a browser FPS benchmark.
 * Preserve the independent cosmetic RNG stream when omitting a trail. */
const test=require('node:test');
const assert=require('node:assert/strict');
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed,digest,physical}=
  require('../research/audio-rng-causal-pilot.cjs');

function run(seed,hz,mode){
 return withSeed(seed,draws=>{
  const g=bootGame(),originalParticles=g.addParticles,
    originalBullets=g.updateBullets;
  let insideBullets=false,ordinaryTrailCalls=0,suppressed=0;
  try{
   g.sfx.muted=true;g.sfx.startMusic=()=>{};
   g.setClass(g.player,'tempest');
   g.input.autofire=false;g.input.firing=true;
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   if(mode!=='baseline'){
    g.updateBullets=function(...args){
     insideBullets=true;
     try{return originalBullets.apply(this,args);}
     finally{insideBullets=false;}
    };
    g.addParticles=function(...args){
     const trail=insideBullets && args[3]===1 &&
       args[4]===20 && args[5]==='glow';
     if(trail)ordinaryTrailCalls++;
     if(trail && mode==='suppress'){
      suppressed++;
      // Shipping addParticles uses four *cosmetic* draws per ordinary glow.
      for(let i=0;i<4;i++)g.cosmeticRandom();
      return;
     }
     return originalParticles.apply(this,args);
    };
   }
   for(let i=0;i<hz*2;i++)g.update(1/hz);
   return {seed,hz,mode,hash:digest(physical(g)),draws:draws(),
    cosmeticState:g.__novaCosmeticRngState,ordinaryTrailCalls,suppressed,
    activeParticles:(g.parts||[]).filter(p=>p&&p.active).length};
  }finally{
   g.addParticles=originalParticles;
   g.updateBullets=originalBullets;
   g.destroy();
  }
 });
}
test('ordinary trail suppression preserves physical state and both RNG streams',()=>{
 for(const hz of [30,60,120])for(const seed of [1517800,1517802]){
  const baseline=run(seed,hz,'baseline');
  const instrumented=run(seed,hz,'instrument');
  const suppressed=run(seed,hz,'suppress');
  assert.equal(baseline.ordinaryTrailCalls,0,'baseline must be uninstrumented');
  assert.ok(instrumented.ordinaryTrailCalls>0,'real Tempest must emit trails');
  assert.equal(baseline.hash,instrumented.hash,'A/A physical parity');
  assert.equal(baseline.draws,instrumented.draws,'A/A gameplay RNG parity');
  assert.equal(baseline.cosmeticState,instrumented.cosmeticState,'A/A cosmetic RNG parity');
  assert.equal(suppressed.suppressed,instrumented.ordinaryTrailCalls);
  assert.equal(suppressed.ordinaryTrailCalls,instrumented.ordinaryTrailCalls);
  assert.equal(suppressed.cosmeticState,baseline.cosmeticState,
   'omitted glows must preserve cosmetic RNG chronology');
  assert.equal(suppressed.draws,baseline.draws,'gameplay RNG chronology');
  assert.equal(suppressed.hash,baseline.hash,'physical gameplay parity');
  console.log('PROJECTILE_TRAIL_CAUSAL '+JSON.stringify({
   seed,hz,ordinaryTrailCalls:instrumented.ordinaryTrailCalls,
   suppressed:suppressed.suppressed,
   baselineParticles:baseline.activeParticles,
   suppressedParticles:suppressed.activeParticles,
   physicalParity:true,rngParity:true,
   caveat:'Node composed Game, not browser FPS or visual quality evidence'
  }));
 }
});
