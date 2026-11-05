'use strict';
/* Research-only #648: measure actual composed-game Tempest cadence under
 * irregular frame intervals, not merely constant 30/60Hz.
 * This deliberately does NOT assert parity: native variable-step combat is
 * known to underfire, and its existing 60Hz behavior is the reference.
 * Run: node tests/research/tempest-irregular-cadence-pilot.cjs
 * Optional: NOVA_JITTER_SEEDS=1517800,1517802 NOVA_JITTER_RELOAD=0,4,8
 */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('./audio-rng-causal-pilot.cjs');
const parse=(name,fallback,min,max)=>{
 const values=(process.env[name]||fallback).split(',').map(s=>Number(s.trim()));
 if(!values.length||values.some(n=>!Number.isInteger(n)||n<min||n>max))
  throw new Error(name+' must contain integers in ['+min+','+max+']');
 return [...new Set(values)];
};
const seeds=parse('NOVA_JITTER_SEEDS','1517800,1517802,1517810',0,2147483647);
const reloads=parse('NOVA_JITTER_RELOAD','0,4,5,8',0,8);
const TICKS=960; // exactly 8 simulated seconds at a 120Hz integer timebase
const patterns={
 native30:[4],native60:[2],native120:[1],
 mixedSlow:[2,4,1,1,2,2],mixedFast:[1,3,2,1,3,2],
 bursty:[4,1,1,2,2,2],alternating:[1,4,1,2,2,2]
};
function schedule(pattern){
 const out=[];let elapsed=0,i=0;
 while(elapsed<TICKS){
  const ticks=Math.min(pattern[i++%pattern.length],TICKS-elapsed);
  out.push(ticks);elapsed+=ticks;
 }
 if(elapsed!==TICKS)throw new Error('bad schedule');
 return out;
}
function run(seed,reload,name,steps){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;
  g.setClass(p,'tempest');g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];
  g.input.aim.active=true;g.input.aim.dx=40;g.input.firing=true;g.input.autofire=false;
  p.stats.reload=reload;
  let volleys=0,peakHeat=0,peakCooldown=0;
  const shotTimes=[],shotAngles=[],shotHeats=[];const original=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length;
   const result=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before){volleys++;shotTimes.push(this.time);shotAngles.push(p.angle);shotHeats.push(p.__v17Heat||0);}
   return result;
  };
  try{
   for(const ticks of steps){
    g.update(ticks/120);
    peakHeat=Math.max(peakHeat,p.__v17Heat||0);
    peakCooldown=Math.max(peakCooldown,p.fireCd||0);
   }
   return {seed,reload,name,frames:steps.length,volleys,
    heat:+(p.__v17Heat||0).toFixed(6),peakHeat:+peakHeat.toFixed(6),
    fireCd:+(p.fireCd||0).toFixed(6),peakCooldown:+peakCooldown.toFixed(6),
    firstShots:shotTimes.slice(0,8).map(n=>+n.toFixed(6)),
    lastShots:shotTimes.slice(-8).map(n=>+n.toFixed(6)),
    firstShotAngles:shotAngles.slice(0,8).map(n=>+n.toFixed(6)),
    firstShotHeats:shotHeats.slice(0,8).map(n=>+n.toFixed(6))};
  }finally{g.destroy();}
 });
}
const all=[];
for(const seed of seeds)for(const reload of reloads){
 const cohort=Object.entries(patterns).map(([name,pattern])=>run(seed,reload,name,schedule(pattern)));
 const reference=cohort.find(r=>r.name==='native60');
 for(const r of cohort){
  r.deltaVs60=r.volleys-reference.volleys;
  r.pctVs60=+((r.volleys/reference.volleys-1)*100).toFixed(2);
  all.push(r);
 }
}
console.log(JSON.stringify({method:'actual materialized 49-overlay Game; held aim/fire; no targets',
 caveats:['research-only, no browser input event timestamps','all schedules cover exactly 8 simulated seconds','variable dt changes world update chronology, not merely presentation FPS','no player-facing patch'],patterns,seeds,reloads,results:all},null,2));
