'use strict';
/* #799: adjacent-Hz rotary firing cliffs may be fragile to small RAF jitter.
 * Source-executed 49-overlay Game, no target; deterministic schedules are
 * research stimuli, not measured phone frame histories or desired goldens. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const SECONDS=6;
function schedule(hz,amplitude){
 const n=SECONDS*hz;let x=799,weights=[];
 for(let i=0;i<n;i++){
  x=(Math.imul(1664525,x)+1013904223)>>>0;
  weights.push(1+amplitude*(2*x/4294967296-1));
 }
 const total=weights.reduce((a,b)=>a+b,0);
 const dts=weights.map(w=>SECONDS*w/total);
 assert.equal(dts.length,n);
 assert.ok(dts.every(dt=>dt>0&&dt<1/30),'no production dt cap or catch-up');
 assert.ok(Math.abs(dts.reduce((a,b)=>a+b,0)-SECONDS)<1e-9);
 return dts;
}
function run(cls,reload,seed,dts){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;
  g.setClass(p,cls);p.stats.reload=reload;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;g.input.autofire=false;
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  g.input.firing=true;g.input.mouseActive=false;
  let volleys=0;const fire=g.tryFire,start=g.time;
  g.tryFire=function(t){
   const before=this.bullets.length,out=fire.apply(this,arguments);
   if(t===p&&this.bullets.length>before)volleys++;
   return out;
  };
  try{
   for(const dt of dts)g.update(dt);
   assert.ok(Math.abs(g.time-start-SECONDS)<1e-7,'matched simulated time');
   assert.equal(g.tanks.length,1);
   assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0);
   return {volleys,finalSpin:+(p.fireSpin||0).toFixed(6),
    heat:+(p.__v17Heat||0).toFixed(6),fireCd:+p.fireCd.toFixed(6)};
  }finally{g.destroy()}
 });
}
test('composed Gunner 61/74Hz cadence responds to deterministic small frame jitter',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]])
  for(const hz of [61,74])
   for(const [label,amplitude] of [['constant',0],['uniform-cv5',0.0866],
     ['uniform-cv10',0.1732]]){
    const dts=schedule(hz,amplitude);
    const first=run(cls,reload,1517800,dts);
    const second=run(cls,reload,1517802,dts);
    assert.deepEqual(first,second,'no-target cadence must be seed-independent');
    assert.ok(first.volleys>0);
    rows.push({cls,reload,hz,label,...first});
   }
 assert.equal(rows.length,12);
 console.log('GUNNER_ADJACENT_JITTER_RESEARCH '+JSON.stringify(rows));
});
