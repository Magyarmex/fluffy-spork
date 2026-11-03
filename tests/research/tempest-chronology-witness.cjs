'use strict';
/* #648: inspect chronological projectile births at 30Hz and 60Hz.
 * Research only. This is a direct Game.update schedule, not measured FPS.
 * Run: node tests/research/tempest-chronology-witness.cjs
 */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {bootGame,withSeed}=require('./audio-rng-causal-pilot.cjs');
const seeds=[1517800,1517802,1517810],classes=['tempest','minigun'];
const seconds=5;
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const round=x=>Number.isFinite(x)?+x.toFixed(7):x;
function run(seed,cls,mode){return withSeed(seed,draws=>{
 const g=bootGame(),p=g.player;
 g.sfx.muted=true;g.setClass(p,cls);
 g.tanks=[p];g.tankById=new Map([[p.id,p]]);
 g.shapes=[];g.drones=[];g.powerups=[];
 g.input.aim.active=true;g.input.aim.dx=40;g.input.firing=true;g.input.autofire=false;
 p.stats.reload=8;p.perk='alacrity';g.useAbility(p);
 const births=[];const old=g.tryFire;
 g.tryFire=function(t){
  const before=this.bullets.length;
  const result=old.apply(this,arguments);
  if(t===p)for(let i=before;i<this.bullets.length;i++){
   const b=this.bullets[i];births.push({time:round(this.time),
    x:round(b.x),y:round(b.y),angle:round(b.angle),
    vx:round(b.vx),vy:round(b.vy),id:b.id});
  }
  return result;
 };
 for(let frame=0;frame<seconds*30;frame++){
  if(mode==='coarse30')g.update(1/30);
  else {g.update(1/60);g.update(1/60);}
 }
 const state={time:round(g.time),player:{x:round(p.x),y:round(p.y),
  angle:round(p.angle),fireCd:round(p.fireCd),heat:round(p.__v17Heat||0)},
  bullets:g.bullets.map(b=>[b.id,round(b.x),round(b.y),round(b.vx),round(b.vy),round(b.ttl)]),
  rngDraws:draws()};
 const out={seed,cls,mode,volleyCount:births.length,
  birthHash:digest(births),stateHash:digest(state),births,state};
 g.destroy();return out;
 });}
const intervalCounts=births=>{\n const bins=new Map();for(const b of births){const k=Math.max(0,Math.ceil(Math.round(b.time*60)/2));bins.set(k,(bins.get(k)||0)+1);}\n return {intervalsWithTwoOrMore:[...bins.values()].filter(n=>n>=2).length,\n  maxBirthsInInterval:Math.max(0,...bins.values())};\n};\nconst report=[];
for(const seed of seeds)for(const cls of classes){
 const coarse=run(seed,cls,'coarse30');
 const split=run(seed,cls,'split60');
 const native=run(seed,cls,'native60');
 assert.equal(JSON.stringify(split.births),JSON.stringify(native.births),'split60 must reproduce native 60Hz projectile births');
 assert.equal(JSON.stringify(split.state),JSON.stringify(native.state),'split60 must reproduce native 60Hz physical state');
 const firstMismatch=coarse.births.findIndex((b,i)=>JSON.stringify(b)!==JSON.stringify(native.births[i]));
 report.push({seed,cls,seconds,coarse30:coarse.volleyCount,coarseIntervalBirths:intervalCounts(coarse.births),\n  referenceIntervalBirths:intervalCounts(native.births),
  native60:native.volleyCount,split60:split.volleyCount,
  firstBirthMismatch:firstMismatch===-1&&coarse.births.length!==native.births.length?
   Math.min(coarse.births.length,native.births.length):firstMismatch,
  coarseBirthHash:coarse.birthHash,referenceBirthHash:native.birthHash,
  coarseStateHash:coarse.stateHash,referenceStateHash:native.stateHash,
  referenceRngDraws:native.state.rngDraws,coarseRngDraws:coarse.state.rngDraws});
}
console.log(JSON.stringify({method:'composed Game, isolated held aim; direct 30Hz versus two 60Hz updates per presentation frame',
 caveat:'synthetic update schedule, not browser FPS or actual target damage',report},null,2));
