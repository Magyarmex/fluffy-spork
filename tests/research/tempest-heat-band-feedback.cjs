'use strict';
/* Research-only #648: compare a feedback-controlled Tempest vent against
 * sustained fire in the actual composed 49-overlay Game. This is not a
 * recommendation for automated player firing or a real touch-latency test.
 * Inputs are sampled at the start of each simulation update, as in the
 * current shipping Game; no extra subframe updates are inserted. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('./audio-rng-causal-pilot.cjs');
const seed=1517800, duration=20, reloads=[4,8];
const schedules={native30:[4],native60:[2],native120:[1],irregular:[1,3,2,1,3,2,1,3]};
function run(reload,name,pattern,policy){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;
  g.setClass(p,'tempest');g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];
  // Unlike merely clearing arrays, prevent the core's half-second shape
  // replenishment, powerup timer and elite/AI respawns during this isolation.
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  // Tempest itself owns three ESCORT drones in the shipping class definition.
  // Disable their respawn explicitly for a truly no-target cadence trial.
  p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
  p.stats.reload=reload;g.input.aim.active=true;g.input.aim.dx=40;
  g.input.autofire=false;
  const out={seed,reload,schedule:name,policy,frames:0,updates:0,volleys:0,
   apexVolleys:0,redlineVolleys:0,vents:0,ventSeconds:0,fireSeconds:0,
   bandSeconds:0,peakHeat:0,heatIntegral:0,spinIntegral:0,
   lastHeat:0,lastSpin:0,firstVentAt:null,worldLeaks:0,firstLeak:null};
  const original=g.tryFire;g.tryFire=function(t){
   const before=this.bullets.length,result=original.apply(this,arguments);
   if(t===p&&this.bullets.length>before){
    out.volleys++;
    const h=p.__v17Heat||0,s=p.__v17Stability??1;
    if(Math.max(0,1-Math.abs(h-.56)/.36)>.58&&s>.52)out.apexVolleys++;
    if(h>.90)out.redlineVolleys++;
   }
   return result;
  };
  try{
   let ticks=0,index=0,venting=false;
   while(ticks<duration*120){
    const slice=Math.min(pattern[index++%pattern.length],duration*120-ticks);
    const heat=p.__v17Heat||0;
    if(policy!=='continuous'){
     const high=policy==='bandTight'?.65:.69,low=policy==='bandTight'?.50:.47;
     if(!venting&&heat>=high){venting=true;out.vents++;if(out.firstVentAt===null)out.firstVentAt=ticks/120;}
     if(venting&&heat<=low)venting=false;
    }
    const fire=policy==='continuous'||!venting;
    g.input.firing=fire;g.input.aim.dx=fire?40:0;
    g.update(slice/120);
    if(g.tanks.length!==1||g.shapes.length||g.drones.length||g.powerups.length){
     out.worldLeaks++;
     if(!out.firstLeak)out.firstLeak={atTick:ticks,tanks:g.tanks.length,
      shapes:g.shapes.length,drones:g.drones.length,powerups:g.powerups.length,
      firstShapeType:g.shapes[0]?.type,firstOtherTank:g.tanks.find(t=>t!==p)?.cls};
    }
    const dt=slice/120,h=p.__v17Heat||0;
    if(fire)out.fireSeconds+=dt;else out.ventSeconds+=dt;
    if(h>=.409&&h<=.711)out.bandSeconds+=dt;
    out.peakHeat=Math.max(out.peakHeat,h);
    out.heatIntegral+=h*dt;out.spinIntegral+=(p.fireSpin||0)*dt;
    ticks+=slice;out.frames++;out.updates++;
   }
   out.lastHeat=+(p.__v17Heat||0).toFixed(5);
   out.lastSpin=+(p.fireSpin||0).toFixed(5);
   for(const key of ['fireSeconds','ventSeconds','bandSeconds','peakHeat','heatIntegral','spinIntegral'])
    out[key]=+out[key].toFixed(5);
   return out;
  }finally{g.destroy();}
 });
}
const results=[];
for(const reload of reloads)for(const [name,pattern] of Object.entries(schedules))
 for(const policy of ['continuous','bandWide','bandTight'])results.push(run(reload,name,pattern,policy));
console.log(JSON.stringify({method:'actual composed Game; deterministic seed; no targets; frame-start feedback',duration,results,
 caveats:['feedback policies have perfect heat readout, unlike human player','fixed aim and no targets cannot measure hit quality or survival','variable-step chronology differs across schedules','no physical touch or input-to-photon measurement','not a gameplay patch']},null,2));
