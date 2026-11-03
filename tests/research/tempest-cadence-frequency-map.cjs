'use strict';
/* Research harness for #648: find cadence aliasing, not merely 30/60 differences.
 * Direct Game.update(1/hz) is NOT the production RAF scheduler: production caps
 * frame dt at 1/30 and may perform bounded recovery. Frequencies below 30Hz
 * are synthetic large-step stress tests, NOT measured 20-25 FPS gameplay.
 * Uses the actual materialized Game and every HTML-ordered overlay.
 * No gameplay patches or synthetic reload formula. Run from repository root:
 * node tests/research/tempest-cadence-frequency-map.cjs
 * NOVA_FREQ_HZ=20,30,60 NOVA_FREQ_RELOAD=4,5 NOVA_FREQ_SEEDS=1517800 node ...
 */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('./audio-rng-causal-pilot.cjs');
const parseList=(name,defaultValues,min,max)=>{
 const value=process.env[name];const arr=value?value.split(',').map(x=>Number(x.trim())):defaultValues;
 if(!arr.length||arr.some(x=>!Number.isInteger(x)||x<min||x>max))
  throw new Error(`${name} must be comma-separated integers in [${min},${max}]`);
 return [...new Set(arr)];
};
const hzList=parseList('NOVA_FREQ_HZ',[20,24,25,30,33,40,48,50,60,75,90,120],10,240);
const reloadList=parseList('NOVA_FREQ_RELOAD',[0,3,4,5,8],0,8);
const seeds=parseList('NOVA_FREQ_SEEDS',[1517800,1517802,1517810],0,2147483647);
const seconds=Number(process.env.NOVA_FREQ_SECONDS||8);
if(!Number.isInteger(seconds)||seconds<1||seconds>30)throw new Error('NOVA_FREQ_SECONDS must be 1..30');
function measure(seed,hz,reload){return withSeed(seed,()=>{
 const g=bootGame(),p=g.player;g.sfx.muted=true;
 g.setClass(p,'tempest');g.tanks=[p];g.tankById=new Map([[p.id,p]]);
 g.shapes=[];g.drones=[];g.powerups=[];
 g.input.aim.active=true;g.input.aim.dx=40;g.input.firing=true;g.input.autofire=false;
 p.stats.reload=reload;
 let volleys=0,heatPeak=0;const shotTimes=[],postShotCooldowns=[];const oldFire=g.tryFire;
 g.tryFire=function(t){const before=this.bullets.length;const result=oldFire.apply(this,arguments);
  if(t===p&&this.bullets.length>before){volleys++;shotTimes.push(this.time);postShotCooldowns.push(p.fireCd);}return result;};
 for(let i=0;i<seconds*hz;i++){
  g.update(1/hz);heatPeak=Math.max(heatPeak,p.__v17Heat||0);
 }
 const out={seed,hz,reload,seconds,volleys,heat:p.__v17Heat||0,heatPeak,
  fireCd:p.fireCd,lateShotCooldown:postShotCooldowns.length?+postShotCooldowns[postShotCooldowns.length-1].toFixed(7):null,
  lateCooldownVsStep:postShotCooldowns.length?+(postShotCooldowns[postShotCooldowns.length-1]-1/hz).toFixed(7):null,firstShotTimes:shotTimes.slice(0,16).map(n=>+n.toFixed(7)),
  firstIntervals:shotTimes.slice(1,16).map((n,i)=>+(n-shotTimes[i]).toFixed(7))};
 g.destroy();return out;
});}
const results=[];for(const seed of seeds)for(const reload of reloadList)for(const hz of hzList)
 results.push(measure(seed,hz,reload));
const ref=new Map(results.filter(r=>r.hz===60).map(r=>[`${r.seed}:${r.reload}`,r.volleys]));
for(const r of results){const baseline=ref.get(`${r.seed}:${r.reload}`);
 r.deltaVs60=baseline==null?null:r.volleys-baseline;
 r.pctVs60=baseline==null?null:+((r.volleys/baseline-1)*100).toFixed(2);
}
console.log(JSON.stringify({method:'composed production Game, held aim, isolated no-target',
 source:'current local materialized index.html plus ordered overlays',
 caveat:'direct Game.update(1/hz), not RAF; below 30Hz is synthetic stress only',seconds,seeds,hzList,reloadList,results},null,2));
