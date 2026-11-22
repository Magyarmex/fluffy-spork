'use strict';
/* #799 RESEARCH ONLY: matched wall-clock fire/release policies in the actual
 * composed NOVA Game. This does NOT change the runtime or freeze FPS cliffs. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

const SECONDS=8;
function schedule(hz){
 const steps=[];
 for(let i=0;i<SECONDS*hz;i++)steps.push(1/hz);
 return steps;
}
function irregular(){
 // Deliberately nonuniform presentation cadence; identical 8s simulated time.
 const pattern=[1/30,1/120,1/40,1/80];
 const steps=[];let elapsed=0,i=0;
 while(elapsed<SECONDS-1e-10){
  const dt=Math.min(pattern[i++%pattern.length],SECONDS-elapsed);
  steps.push(dt);elapsed+=dt;
 }
 return steps;
}
function held(t){return true;}
function longBurst(t){return ((t+1e-8)%1.25)<1;}
function shortBurst(t){return ((t+1e-8)%.8)<.4;}
// Input changes must occur at the same physical times in every cadence.
// Split simulation intervals at input edges rather than allowing 30Hz to
// observe a release up to 33ms later than 120Hz.
function splitAtInputEdges(steps,policy){
 if(policy===held)return steps;
 const period=policy===longBurst?1.25:.8,on=policy===longBurst?1:.4;
 const edges=[];
 for(let base=0;base<SECONDS-1e-9;base+=period){
  if(base+on<SECONDS-1e-9)edges.push(base+on);
  if(base+period<SECONDS-1e-9)edges.push(base+period);
 }
 const result=[];let time=0,edge=0;
 for(const dt of steps){
  const end=time+dt;
  while(edge<edges.length&&edges[edge]<end-1e-9){
   if(edges[edge]>time+1e-9)result.push(edges[edge]-time);
   time=edges[edge++];
  }
  if(end>time+1e-9)result.push(end-time);
  time=end;
 }
 return result;
}
function run(seed,cls,reload,steps,policy){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;
  steps=splitAtInputEdges(steps,policy);
  try{
   g.sfx.muted=true;g.sfx.startMusic=()=>{};
   g.setClass(p,cls);g.tanks=[p];g.tankById=new Map([[p.id,p]]);
   g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
   if(g.shapeById)g.shapeById.clear();
   if(g.hash&&g.hash.clear)g.hash.clear();
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
   g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
   p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
   g.status='playing';g.paused=false;p.stats.reload=reload;
   g.input.autofire=false;g.input.aim.active=true;
   g.input.aim.dx=40;g.input.aim.dy=0;
   let volleys=0,spinSum=0,heatSum=0,heatPeak=0,spinPeak=0,t=0;
   const initialGameTime=g.time;
   const births=[],original=g.tryFire;
   g.tryFire=function(tank){
    const before=this.bullets.length;
    const result=original.apply(this,arguments);
    if(tank===p&&this.bullets.length>before){
     volleys++;
     births.push(+this.time.toFixed(6));
    }
    return result;
   };
   for(const dt of steps){
    assert.ok(dt>0&&dt<=1/30+1e-10);
    g.input.firing=policy(t);
    g.update(dt);
    t+=dt;
    spinSum+=(p.fireSpin||0)*dt;
    heatPeak=Math.max(heatPeak,p.__v17Heat||0);
    heatSum+=(p.__v17Heat||0)*dt;
    spinPeak=Math.max(spinPeak,p.fireSpin||0);
    assert.equal(g.tanks.length,1);
   }
   assert.ok(Math.abs(t-SECONDS)<1e-8,'all arms simulate the same 8 seconds');
   assert.ok(Math.abs((g.time-initialGameTime)-SECONDS)<1e-6,
    'composed Game time must advance by exactly the matched duration');
   return {volleys,births,spin:+(p.fireSpin||0).toFixed(5),
    spinMean:+(spinSum/SECONDS).toFixed(5),
    spinPeak:+spinPeak.toFixed(5),
    heat:+(p.__v17Heat||0).toFixed(5),
    heatMean:+(heatSum/SECONDS).toFixed(5),
    heatPeak:+heatPeak.toFixed(5),
    stability:+(p.__v17Stability==null?1:p.__v17Stability).toFixed(5),
    fireCd:+p.fireCd.toFixed(5),updates:steps.length};
  }finally{g.destroy();}
 });
}
test('input event boundaries preserve exactly matched held/release time across all schedules',()=>{
 const policies=[[held,8],[longBurst,6.5],[shortBurst,4]];
 for(const [policy,expectedOn] of policies)
  for(const steps of [schedule(30),schedule(60),schedule(120),irregular()]){
   const split=splitAtInputEdges(steps,policy);
   let time=0,onTime=0;
   for(const dt of split){
    assert.ok(dt>0&&dt<=1/30+1e-9,'no negative or oversized update');
    if(policy(time))onTime+=dt;
    time+=dt;
   }
   assert.ok(Math.abs(time-SECONDS)<1e-8,'exact matched wall-clock duration');
   assert.ok(Math.abs(onTime-expectedOn)<1e-8,'same physical fire duration');
  }
});
test('legal rotary builds: matched held and burst policies expose cadence sensitivity without invented goldens',()=>{
 const policies={held,longBurst,shortBurst};
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  for(const [policyName,policy] of Object.entries(policies)){
   for(const [cadence,steps] of [['30Hz',schedule(30)],['60Hz',schedule(60)],
     ['120Hz',schedule(120)],['irregular',irregular()]]){
    const a=run(1517800,cls,reload,steps,policy);
    const b=run(1517802,cls,reload,steps,policy);
    assert.deepEqual(a,b,'isolated no-target chronology should be seed invariant');
    assert.ok(a.volleys>0&&a.births.length===a.volleys);
    for(let i=1;i<a.births.length;i++)assert.ok(a.births[i]>=a.births[i-1]);
    for(const key of ['spin','spinMean','spinPeak','heat','heatMean','heatPeak','stability','fireCd'])
     assert.ok(Number.isFinite(a[key]),key);
    rows.push({cls,reload,policy:policyName,cadence,...a,
     firstBirths:a.births.slice(0,8),births:undefined});
   }
  }
 }
 console.log('GUNNER_BURST_CHRONOLOGY_RESEARCH '+JSON.stringify(rows));
});
