'use strict';
/* #799 / #648: real composed-Game burst-policy census for legal rotary
 * reload upgrades. This is a diagnostic gate, NOT a desired FPS balance
 * golden. Input phase is defined in simulated seconds, never per frame.
 * All assertions concern correctness/fixture integrity; numerical fairness
 * differences are printed so that future fixes can be evaluated honestly. */
const test=require('node:test');
const assert=require('node:assert/strict');
const old=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(old===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=old;

const policies={
 held:{on:8,off:0},
 long:{on:1,off:.25},
 short:{on:.4,off:.4}
};
function activeAtTick(tick,policy){
 // Exact 120Hz integer event clock: decimal modulo can lose an entire
 // firing tick at 0.8/1.6s boundaries on nominally matched FPS arms.
 if(policy.off===0)return true;
 const on=Math.round(policy.on*120),off=Math.round(policy.off*120);
 return tick%(on+off)<on;
}
function trial(seed,cls,reload,hz,policyName){
 return withSeed(seed,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  const p=g.player;
  g.sfx.muted=true;
  g.setClass(p,cls);
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  p.droneRespawnT=Infinity;
  g.status='playing';g.paused=false;
  p.stats.reload=reload;
  g.input.autofire=false;
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  const policy=policies[policyName],dt=1/hz,seconds=8;
  let volleys=0,projectiles=0,nominalDamage=0,spinSum=0,heatSum=0,spinPeak=0,heatPeak=0;
  let firedDuringRelease=0,activeTicks=0;
  const times=[],original=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length;
   const result=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before){
    volleys++;
    const emitted=this.bullets.slice(before).filter(b=>b&&b.ownerId===p.id);
    projectiles+=emitted.length;
    nominalDamage+=emitted.reduce((sum,b)=>sum+(Number.isFinite(b.dmg)?b.dmg:0),0);
    if(!this.input.firing)firedDuringRelease++;
    if(times.length<6)times.push(+this.time.toFixed(7));
   }
   return result;
  };
  for(let i=0;i<seconds*hz;i++){
   const active=activeAtTick(i*(120/hz),policy);
   g.input.firing=active;
   if(active)activeTicks++;
   g.update(dt);
   assert.equal(g.tanks.length,1,'AI contamination');
   assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,
    'neutral or drone contamination');
   const spin=p.fireSpin||0,heat=p.__v17Heat||0;
   assert.ok(Number.isFinite(spin)&&Number.isFinite(heat));
   spinSum+=spin;heatSum+=heat;
   spinPeak=Math.max(spinPeak,spin);heatPeak=Math.max(heatPeak,heat);
  }
  const out={cls,reload,hz,policy:policyName,volleys,projectiles,
   nominalDamage:+nominalDamage.toFixed(4),
   activeTicks,activeSeconds:+(activeTicks/hz).toFixed(6),first:times,spin:+(p.fireSpin||0).toFixed(5),
   spinMean:+(spinSum/(seconds*hz)).toFixed(5),
   spinPeak:+spinPeak.toFixed(5),
   stability:+(p.__v17Stability==null?1:p.__v17Stability).toFixed(5),
   recoil:+(p.__v17Recoil||0).toFixed(5),
   heat:+(p.__v17Heat||0).toFixed(5),
   heatMean:+(heatSum/(seconds*hz)).toFixed(5),
   heatPeak:+heatPeak.toFixed(5),firedDuringRelease};
  g.destroy();
  return out;
 });
}
test('burst policies preserve seeded deterministic input ownership and report legal upgrade cliffs',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm']){
  const reload=cls==='minigun'?1:3;
  for(const policy of Object.keys(policies)){
   for(const hz of [30,60,120]){
    const a=trial(1517800,cls,reload,hz,policy);
    const b=trial(1517802,cls,reload,hz,policy);
    assert.deepEqual(a,b,'same no-target experiment must not depend on RNG seed');
    assert.equal(a.firedDuringRelease,0,'release must not create a new volley');
    assert.ok(a.volleys>0&&a.activeTicks>0);
    if(policy==='held'&&hz===60){
     assert.equal(a.volleys,cls==='minigun'?92:102,
      'preserve observed 60Hz no-target baseline; not an FPS parity target');
    }
    rows.push(a);
   }
  }
 }
 console.log('GUNNER_BURST_CADENCE_CENSUS '+JSON.stringify(rows));
});
test('burst phase uses physical seconds rather than frame counts',()=>{
 for(const policy of ['long','short']){
  const exposures=[];
  for(const hz of [30,60,120]){
   let active=0;
   for(let i=0;i<8*hz;i++)active+=+activeAtTick(i*(120/hz),policies[policy]);
   exposures.push(active/hz);
   const duty=policies[policy].on/(policies[policy].on+policies[policy].off);
   assert.ok(Math.abs(active/(8*hz)-duty)<.025,
    'phase sampling must approximate declared physical duty cycle');
  }
  assert.equal(new Set(exposures).size,1,
   'same physical firing exposure across all frame-rate arms');
 }
});
