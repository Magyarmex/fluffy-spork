'use strict';
// Real composed-Game parity gate for the research-only ordinary projectile-trail intervention.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,physical,digest}=require('../research/audio-rng-causal-pilot.cjs');
function arm(seed,mode){
 return withSeed(seed,draws=>{
  const g=bootGame();
  g.sfx.muted=true;
  g.setClass(g.player,'tempest');
  g.player.stats.reload=8;
  g.player.perk='alacrity';
  g.useAbility(g.player);
  g.player.hp=1e6;
  g.input.aim.active=true;
  g.input.aim.dx=40;g.input.aim.dy=0;
  g.input.firing=true;g.input.autofire=false;
  const initial=digest(physical(g));
  let inside=false,trails=0,suppressed=0;
  const originalParticles=g.addParticles,originalBullets=g.updateBullets;
  g.addParticles=function(...args){
   if(inside&&args[3]===1&&args[4]===20&&args[5]==='glow'){
    trails++;
    if(mode==='suppressed'){
     for(let i=0;i<4;i++)this.cosmeticRandom();
     suppressed++;return;
    }
   }
   return originalParticles.apply(this,args);
  };
  g.updateBullets=function(...args){
   inside=true;
   try{return originalBullets.apply(this,args)}
   finally{inside=false}
  };
  for(let i=0;i<120;i++){
   g.update(1/60);
   assert.equal(g.paused,false,'evolution must not censor physical parity');
   assert.equal(g.status,'playing','death must not censor physical parity');
  }
  const result={initial,final:digest(physical(g)),gameplayDraws:draws(),
   cosmeticState:g.__novaCosmeticRngState,trails,suppressed,
   activeParts:g.parts.filter(p=>p.active).length,
   projectileCount:g.bullets.length};
  g.destroy();
  return result;
 });
}
test('ordinary trail suppression preserves complete physical Game state and RNG across seeded Tempest combat',()=>{
 for(const seed of [1517800,1517802,1517810]){
  const sham=arm(seed,'sham'),muted=arm(seed,'suppressed');
  assert.equal(sham.initial,muted.initial,'initial composed world must match');
  assert.ok(sham.trails>0,'actual Tempest must create ordinary trails');
  assert.equal(sham.trails,muted.trails,'same simulated combat must reach same trail gates');
  assert.equal(sham.suppressed,0);
  assert.equal(muted.suppressed,muted.trails);
  assert.equal(sham.final,muted.final,'visual intervention must not alter physical state');
  assert.equal(sham.gameplayDraws,muted.gameplayDraws,'gameplay RNG must remain identical');
  assert.equal(sham.cosmeticState,muted.cosmeticState,'cosmetic RNG must remain aligned');
  assert.ok(sham.activeParts>=muted.activeParts,
   'suppression must not increase active visual particles');
 }
});
