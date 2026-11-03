'use strict';
/* #648: reproducible, research-only cost attribution for chronological Gunner
 * simulation. Run: node tests/research/gunner-hotpath-profile.cjs
 * This instruments the composed Game, not an isolated weapon model. It does
 * NOT patch production, assert timing thresholds, or estimate Android FPS.
 * The no-fire arm is a negative control for baseline simulation overhead.
 */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {bootGame,withSeed}=require('./audio-rng-causal-pilot.cjs');
const METHODS=['updateBullets','updateDrones','updatePowerups','updateOrbs'];
function run(seed,hz,fire,seconds=5){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.setClass(p,'tempest');
  if(fire){p.stats.reload=8;p.perk='alacrity';g.useAbility(p);}
  g.input.aim.active=true;g.input.aim.dx=40;
  g.input.firing=fire;g.input.autofire=false;
  const methods=Object.fromEntries(METHODS.map(k=>[k,{calls:0,ms:0}]));
  let shots=0;
  const oldFire=g.tryFire;
  g.tryFire=function(t){
   const n=this.bullets.length;
   const result=oldFire.apply(this,arguments);
   if(t===p)shots+=Math.max(0,this.bullets.length-n);
   return result;
  };
  for(const key of METHODS){
   const old=g[key];if(typeof old!=='function')continue;
   g[key]=function(){
    const start=performance.now();
    try{return old.apply(this,arguments);}
    finally{methods[key].calls++;methods[key].ms+=performance.now()-start;}
   };
  }
  const start=performance.now();
  for(let i=0;i<seconds*hz;i++)g.update(1/hz);
  const elapsedMs=performance.now()-start;
  const result={seed,hz,fire,seconds,shots,draws:draws(),elapsedMs,
   methods,projectilesAlive:g.bullets.length};
  g.destroy();return result;
 });
}
function median(values){
 const sorted=values.slice().sort((a,b)=>a-b);
 return sorted[Math.floor(sorted.length/2)];
}
const seeds=[1517800,1517802,1517810],rows=[];
for(let pass=0;pass<3;pass++){
 const configs=[];
 for(const seed of seeds)for(const hz of [30,60])
  for(const fire of [false,true])configs.push({seed,hz,fire});
 if(pass===1)configs.reverse();
 else if(pass===2)configs.sort((a,b)=>a.hz-b.hz||Number(b.fire)-Number(a.fire)||b.seed-a.seed);
 for(const c of configs)rows.push({...run(c.seed,c.hz,c.fire),pass});
}
const summary=[];
for(const hz of [30,60])for(const fire of [false,true]){
 const group=rows.filter(r=>r.hz===hz&&r.fire===fire);
 assert.equal(group.length,9);
 if(!fire)assert.ok(group.every(r=>r.shots===0),'no-fire control must not fire');
 if(fire)assert.ok(group.every(r=>r.shots===(hz===30?150:297)),
  'legal Overheat/Alacrity projectile reference changed: inspect game truth');
 summary.push({hz,fire,
  medianTotalMs:median(group.map(r=>r.elapsedMs)),
  medianBulletMs:median(group.map(r=>r.methods.updateBullets.ms)),
  medianDroneMs:median(group.map(r=>r.methods.updateDrones.ms)),
  medianShots:median(group.map(r=>r.shots)),
  minTotalMs:Math.min(...group.map(r=>r.elapsedMs)),
  maxTotalMs:Math.max(...group.map(r=>r.elapsedMs))});
}
console.log(JSON.stringify({
 method:'composed 49-overlay Game, 3 seeds x 3 passes; reverse/sorted-order controls',
 limits:'Node VM wall time, not phone FPS. GC/JIT/order noise; method times may nest. No gameplay modification.',
 summary,rows
},null,2));
