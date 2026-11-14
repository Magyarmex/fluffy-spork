'use strict';
/* #799: research-only, actual composed Game Gunner burst chronology.
 * Keep 60Hz as a comparison baseline, not a permanent balance golden.
 * No-target emitted volleys are NOT target DPS or natural-match evidence. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

const SECONDS=8;
const POLICIES={
 held:()=>true,
 '1s-on-250ms-off':t=>(t%1.25)<1,
 '400ms-on-400ms-off':t=>(t%0.8)<0.4,
 '400ms-on-400ms-off-phase200ms':t=>((t+0.2)%0.8)<0.4
};
function run(seed,cls,reload,hz,policy){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.setClass(p,cls);
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  p.droneRespawnT=Infinity;
  g.status='playing';g.paused=false;p.stats.reload=reload;
  g.input.autofire=false;g.input.aim.active=true;
  g.input.aim.dx=40;g.input.aim.dy=0;
  const shots=[];let spinSum=0,spinPeak=0,heatPeak=0,heatSum=0,activeTicks=0;
  const original=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length;
   const result=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before)shots.push(+this.time.toFixed(8));
   return result;
  };
  try{
   for(let i=0;i<SECONDS*hz;i++){
    // Input is sampled at the beginning of each actual Game.update. This
    // deliberately exposes phase aliasing; it does NOT emulate sub-tick edges.
    const t=i/hz;
    const active=POLICIES[policy](t+1e-10);
    g.input.firing=active;
    if(active)activeTicks++;
    g.update(1/hz);
    assert.equal(g.tanks.length,1,'AI tank contamination');
    assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,'neutral contamination');
    const spin=p.fireSpin||0,heat=p.__v17Heat||0;
    assert.ok(Number.isFinite(spin)&&Number.isFinite(heat));
    spinSum+=spin;heatSum+=heat;
    spinPeak=Math.max(spinPeak,spin);heatPeak=Math.max(heatPeak,heat);
   }
   assert.ok(Math.abs(g.time-SECONDS)<1e-5,'equal simulated time');
   assert.ok(shots.every((t,i)=>i===0||t>=shots[i-1]),'shot chronology');
   return {cls,reload,hz,policy,volleys:shots.length,
    firstShots:shots.slice(0,8),lastShots:shots.slice(-4),
    activeTicks,activeSeconds:+(activeTicks/hz).toFixed(6),
    volleysPerActiveSecond:+(shots.length/(activeTicks/hz)).toFixed(6),spinMean:+(spinSum/(SECONDS*hz)).toFixed(6),
    spinPeak:+spinPeak.toFixed(6),spinFinal:+(p.fireSpin||0).toFixed(6),
    heatMean:+(heatSum/(SECONDS*hz)).toFixed(6),
    heatPeak:+heatPeak.toFixed(6),heatFinal:+(p.__v17Heat||0).toFixed(6)};
  }finally{g.destroy();}
 });
}

test('legal rotary builds: held and phase-controlled timestamped bursts at 30/60/120Hz',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]])
  for(const policy of Object.keys(POLICIES))
   for(const hz of [30,60,120]){
    const a=run(1517800,cls,reload,hz,policy);
    const b=run(1517802,cls,reload,hz,policy);
    assert.deepEqual(a,b,'no-target firing must be independent of seed');
    assert.ok(a.volleys>0,'weapon must fire');
    if(policy.startsWith('400ms-on-400ms-off'))
     assert.equal(a.activeSeconds,4,'phase-controlled bursts must preserve equal firing time');
    rows.push(a);
   }
 // The known held-fire cliffs are diagnostics, not acceptance goldens.
 // A fix should update these observations rather than freeze bad behavior.
 console.log('GUNNER_TIMESTAMPED_BURST_CENSUS '+JSON.stringify(rows));
});
