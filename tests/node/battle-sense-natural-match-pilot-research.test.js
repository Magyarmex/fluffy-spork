'use strict';
// Research-only natural-world pilot. Unlike the scripted acquisition fixture,
// the actual composed Game runs its AI, neutral ecology, combat and pickups.
// It is not a statistically powered balance claim or an Android FPS test.
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {playPublicPrelude}=require('../research/redeploy-public-prelife.cjs');

function arm(seed,hz,classOnly){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   assert.ok(g.player?.alive&&g.status==='playing');
   const initial=JSON.stringify((g.tanks||[]).map(t=>[
    t.id,t.cls,+t.x.toFixed(3),+t.y.toFixed(3),t.hp,t.alive]));
   const arrivals=[],apply=g.applyPowerup;
   g.applyPowerup=function(t,type){
    arrivals.push({ai:!!t?.ai,type,at:+g.time.toFixed(3)});
    return apply.apply(this,arguments);
   };
   if(classOnly){
    // Intervention only: erase speed observations before every simulation
    // update. The same public class speeds, world, AI, combat and inputs run.
    // A single frame cannot accumulate the three required witness intervals.
    const update=g.update;
    g.update=function(dt){
     for(const t of this.tanks||[])if(t?.ai&&t.ai.__v181RivalSpeedWitness)
      delete t.ai.__v181RivalSpeedWitness;
     return update.call(this,dt);
    };
   }
   const result=playPublicPrelude(g,hz,10,g.__testFair);
   return {seed,hz,classOnly,initial,elapsed:result.elapsed,
    playerHp:result.hpAfter,playerDeath:result.naturalDeath,
    playerScore:result.scoreEarned,neutralXP:result.neutralXPEarned,
    changedEnemies:result.changedEnemies,changedShapes:result.changedShapes,
    pickups:arrivals.length,aiHeals:arrivals.filter(a=>a.ai&&a.type==='heal').length,
    firstAiHeal:arrivals.find(a=>a.ai&&a.type==='heal')?.at??null};
  }finally{g.destroy();}
 });
}
test('natural composed match pilot compares class-only and witnessed-speed AI',()=>{
 const reports=[];
 for(const seed of [1517800,1517854])for(const hz of [30,60]){
  const baseline=arm(seed,hz,true),witnessed=arm(seed,hz,false);
  assert.equal(baseline.initial,witnessed.initial,
   'paired arms must begin with identical public world state');
  assert.ok(Number.isFinite(baseline.playerHp)&&Number.isFinite(witnessed.playerHp));
  reports.push({seed,hz,classOnly:baseline,witnessed});
 }
 console.log('COMPOSED_RIVAL_NATURAL_MATCH_PILOT '+JSON.stringify(reports.map(p=>({
  seed:p.seed,hz:p.hz,
  classOnly:{...p.classOnly,initial:undefined},
  witnessed:{...p.witnessed,initial:undefined}
 }))));
 assert.equal(reports.length,4);
});
