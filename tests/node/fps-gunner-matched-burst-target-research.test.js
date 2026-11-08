'use strict';
/* #799: measure legal rotary-Gunner firing and actual neutral damage under
 * identical wall-clock burst edges in the composed shipping Game. Research
 * observations are NOT balance goldens or physical-device measurements.
 * Held-fire 50/59/61/73/74/75/90Hz arms test abrupt integer-step
 * boundaries, including 60->61 and 73->74Hz. More refresh need not
 * improve rotary spin-up. These are nominal Game.update rates, not
 * measurements of a real display's frame pacing. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const EPS=1e-9;
function run(seed,cls,reload,hz,policy,targeted){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;
  g.setClass(p,cls);p.x=1000;p.y=1000;p.vx=0;p.vy=0;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);g.__novaTerrain=[];
  const neutral=g.shapes.find(s=>s.type==='square')||g.shapes[0];
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;p.stats.reload=reload;
  g.input.autofire=false;g.input.mouseActive=false;
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  g.input.moveVec=()=>({x:0,y:0});
  // Keep the target stationary; do not mock damage, collision or projectile updates.
  let victim=null,damage=0,hits=0;
  if(targeted){
   assert.ok(neutral,'composed Game must supply a neutral target fixture');
   victim={...neutral,kind:'shape',type:'square',
    id:987654,x:p.x+175,y:p.y,r:24,hp:1000000,maxHp:1000000,
    vx:0,vy:0,born:0,wanderT:Infinity,dead:false};
   g.shapes=[victim];
   if(g.shapeById)g.shapeById.set(victim.id,victim);
  }
  const targetStart=victim?{x:victim.x,y:victim.y}:null;
  const damageShape=g.damageShape;
  g.damageShape=function(s,...args){
   const before=s.hp,ret=damageShape.call(this,s,...args);
   if(s===victim){hits++;damage+=Math.max(0,before-s.hp);}
   return ret;
  };
  const shotTimes=[],births=[],tryFire=g.tryFire;
  g.tryFire=function(t){
   const before=this.bullets.length,ret=tryFire.apply(this,arguments);
   if(t===p&&this.bullets.length>before){
    shotTimes.push(+this.time.toFixed(7));
    if(births.length<6){
     const b=this.bullets[before];
     births.push([+b.x.toFixed(3),+b.y.toFixed(3)]);
    }
   }
   return ret;
  };
  const seconds=6,frame=1/hz,period=policy.on+policy.off;
  const startGameTime=g.time;
  let now=0,spinIntegral=0,heatIntegral=0,stabilityIntegral=0;
  let redline=0,firingDuty=0,updates=0,splitEdges=0;
  // Split presentation frames at the SAME absolute input-event timestamps
  // for all rates; do not silently extend a press to the next 30Hz frame.
  for(let f=0;f<seconds*hz;f++){
   const end=(f+1)*frame;
   while(now<end-EPS){
    // Normalize near cycle edges to avoid a zero-length update caused by
    // floating-point modulo (e.g. 1.6 % .8 ~= .7999999999999999).
    const cycle=Math.floor((now+EPS)/period);
    const phase=now-cycle*period;
    const firing=phase<policy.on-EPS;
    const boundary=cycle*period+(firing?policy.on:period);
    const next=Math.min(end,boundary);
    const dt=next-now;
    assert.ok(dt>EPS,'no zero-length simulation step');
    g.input.firing=firing;
    if(firing)firingDuty+=dt;
    g.update(dt);updates++;
    spinIntegral+=(p.fireSpin||0)*dt;
    heatIntegral+=(p.__v17Heat||0)*dt;
    stabilityIntegral+=(p.__v17Stability==null?1:p.__v17Stability)*dt;
    if((p.__v17Heat||0)>=1.18-EPS)redline+=dt;
    now=next;
    if(next<end-EPS)splitEdges++;
   }
  }
  assert.ok(Math.abs(now-seconds)<1e-7);
  assert.ok(Math.abs((g.time-startGameTime)-seconds)<1e-6,'real Game elapsed time');
  const expectedDuty=policy.name==='held'?6:policy.name==='one-on-quarter-off'?5:3.2;
  assert.ok(Math.abs(firingDuty-expectedDuty)<1e-7,'identical firing duty at all refresh rates');
  assert.equal(g.tanks.length,1,'no AI contamination');
  assert.equal(g.shapes.length,targeted?1:0,'no neutral respawn contamination');
  assert.equal(g.drones.length+g.powerups.length,0,'no drone/powerup contamination');
  const result={seed,cls,reload,hz,policy:policy.name,targeted,
   volleys:shotTimes.length,first:shotTimes.slice(0,5),births,
   hits,damage:+damage.toFixed(5),spin:+(spinIntegral/seconds).toFixed(5),
   heat:+(heatIntegral/seconds).toFixed(5),
   stability:+(stabilityIntegral/seconds).toFixed(5),
   redline:+redline.toFixed(5),firingDuty:+firingDuty.toFixed(6),
   targetTravel:victim?+Math.hypot(victim.x-targetStart.x,victim.y-targetStart.y).toFixed(4):null,
   finalSpin:+(p.fireSpin||0).toFixed(5),updates,splitEdges};
  g.destroy();return result;
 });
}
test('legal rotary Gunner matched-time bursts reveal actual neutral damage and spin',()=>{
 const policies=[
  {name:'held',on:6,off:0},
  {name:'one-on-quarter-off',on:1,off:.25},
  {name:'short-equal-bursts',on:.4,off:.4}
 ];
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  for(const policy of policies)for(const hz of (policy.name==='held'?
   [30,50,59,60,61,73,74,75,90,120]:[30,60,120])){
   const noTarget=run(1517800,cls,reload,hz,policy,false);
   const target=run(1517800,cls,reload,hz,policy,true);
   const repeat=run(1517802,cls,reload,hz,policy,false);
   const targetRepeat=run(1517802,cls,reload,hz,policy,true);
   assert.deepEqual(noTarget.first,repeat.first,'seed-independent first firing times');
   assert.equal(noTarget.volleys,repeat.volleys,'seed-independent isolated cadence');
   assert.ok(noTarget.volleys>0);
   assert.equal(target.volleys,noTarget.volleys,'target must not alter isolated firing cadence');
   assert.equal(targetRepeat.volleys,repeat.volleys,'second seed target must not alter cadence');
   assert.ok(target.hits>0&&target.damage>0,'first seeded target must receive real damage');
   assert.ok(targetRepeat.hits>0&&targetRepeat.damage>0,'second seeded target must receive real damage');
   assert.ok(target.damage<=1000000,'damage cannot exceed target HP');
   assert.ok(noTarget.spin>=0&&noTarget.spin<=1);
   assert.ok(target.spin>=0&&target.spin<=1);
   assert.ok(noTarget.heat>=0&&target.heat>=0);
   assert.ok(noTarget.redline>=0&&noTarget.redline<=6);
   assert.ok(target.redline>=0&&target.redline<=6);
   rows.push({cls,reload,hz,policy:policy.name,
    isolated:noTarget.volleys,targetVolleys:target.volleys,
    hits:target.hits,damage:target.damage,
    hitsSeed2:targetRepeat.hits,damageSeed2:targetRepeat.damage,
    spinNoTarget:noTarget.spin,spinTarget:target.spin,
    heatNoTarget:noTarget.heat,heatTarget:target.heat,
    stabilityNoTarget:noTarget.stability,stabilityTarget:target.stability,
    targetTravel:target.targetTravel,targetTravelSeed2:targetRepeat.targetTravel,
    firingDuty:target.firingDuty,
    redline:target.redline,splitEdges:target.splitEdges,
    first:noTarget.first,births:target.births});
  }
 }
 assert.equal(rows.length,32);
 console.log('GUNNER_MATCHED_BURST_TARGET_RESEARCH '+JSON.stringify(rows));
});
