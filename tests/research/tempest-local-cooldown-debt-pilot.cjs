'use strict';
/* Research-only #648: falsify a cheap alternative to globally running fixed60.
 * A continuous held-fire Tempest may lose fractional cooldown time when a
 * variable-step frame crosses zero. This pilot carries only that frame's
 * overshoot into the next reload, after the first real shot.
 * NO shipping Game methods or production files are modified.
 * This is NOT a proposed balance change: 60Hz cadence may also change.
 */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('./audio-rng-causal-pilot.cjs');
const TICKS=960; // eight seconds on a 120Hz integer timebase
const patterns={
 native30:[4],native60:[2],native120:[1],
 mixed:[2,4,1,1,2,2],bursty:[4,1,1,2,2,2]
};
function schedule(pattern){
 const out=[];let elapsed=0,i=0;
 while(elapsed<TICKS){
  const n=Math.min(pattern[i++%pattern.length],TICKS-elapsed);
  out.push(n);elapsed+=n;
 }
 return out;
}
function run(seed,reload,steps,carry){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;
  g.setClass(p,'tempest');g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];
  g.input.aim.active=true;g.input.aim.dx=40;g.input.firing=true;g.input.autofire=false;
  p.stats.reload=reload;
  const original=g.tryFire;
  let previousDt=0,volleys=0,carriedMs=0,firstShot=null,peakHeat=0,negativeAfterShot=0;
  g.tryFire=function(t){
   const before=this.bullets.length,oldCd=t.fireCd;
   const result=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before){
    if(firstShot==null)firstShot=this.time;
    // Only an already established uninterrupted held-fire sequence qualifies.
    // Never bank an idle-ready cooldown or grant multiple shots in one update.
    if(carry&&volleys>0&&oldCd<0){
     const debt=Math.min(previousDt,Math.max(0,-oldCd));
     t.fireCd-=debt;carriedMs+=debt*1000;
     if(t.fireCd<0)negativeAfterShot++;
    }
    volleys++;
   }
   return result;
  };
  try{
   for(const ticks of steps){
    const dt=ticks/120;
    g.update(dt);
    previousDt=dt;
    peakHeat=Math.max(peakHeat,p.__v17Heat||0);
   }
   return {volleys,firstShot:+firstShot.toFixed(6),
    heat:+(p.__v17Heat||0).toFixed(6),
    peakHeat:+peakHeat.toFixed(6),
    fireCd:+p.fireCd.toFixed(6),
    carriedMs:+carriedMs.toFixed(3),negativeAfterShot};
  }finally{g.destroy();}
 });
}
function experiment(){
 const rows=[];
 for(const seed of [1517800,1517802])for(const reload of [0,4,8]){
  for(const [name,pattern] of Object.entries(patterns)){
   const steps=schedule(pattern);
   const baseline=run(seed,reload,steps,false);
   const candidate=run(seed,reload,steps,true);
   rows.push({seed,reload,name,frames:steps.length,
    simulatedTicks:steps.reduce((a,b)=>a+b,0),
    baseline,candidate,deltaVolleys:candidate.volleys-baseline.volleys});
  }
 }
 return {method:'real 49-overlay composed Tempest; continuous held fire; local post-volley cooldown debt only',
  researchOnly:true,productionModified:false,
  caveats:['No enemies, movement, touch, pause or natural encounter exposure',
   'A local debt carry changes the existing 60Hz reference and may increase heat/recoil',
   'No same-frame multi-volley support; one update still fires at most once',
   'Never ship without preserving canonical 60Hz balance and validating all classes'],
  rows};
}
if(require.main===module)console.log(JSON.stringify(experiment(),null,2));
module.exports={experiment,schedule};
