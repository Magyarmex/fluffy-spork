'use strict';
/* #799 research: moving-target counterfactual to the stationary target fixture.
 * Target motion is externally prescribed and identical at every wall-clock
 * timestamp; real Game projectile collision and damage remain authoritative.
 * This is not an AI match, not production balance, and not an FPS golden.
 * Compare against the separate stationary-target experiment. */
/* #799 research: compare actual player-owned rotary projectile damage under
 * identical wall-clock fire edges but different irregular presentation steps.
 * This is a characterization test, NOT a new balance golden or scheduler.
 * No production code changes; retain the numerical evidence in CI output. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const EPS=1e-9;
const SECONDS=6;
function frames(mode){
 if(mode==='native60')return Array.from({length:360},()=>1/60);
 if(mode==='cluster30')return Array.from({length:180},()=>1/30);
 if(mode==='alternating40_120')return Array.from({length:180},()=>[1/40,1/120]).flat();
 throw Error('unknown presentation mode');
}
function trial(seed,cls,reload,mode,offset,amplitude,motionPeriod=1.6,motionPhase=0,drainSeconds=0,playerMoveY=0){
 assert.ok(motionPeriod>0&&Number.isFinite(motionPhase),'valid independent target motion');
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player;g.sfx.muted=true;g.setClass(p,cls);
  const target=g.tanks.find(t=>t!==p);
  assert.ok(target,'shipping Game must supply a target');
  Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
  // A seeded camera may start far from the fixture; normalize public visibility.
  g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
  Object.assign(target,{cls:'scout',isPlayer:true,alive:true,
   x:200,y:0,vx:0,vy:0,hp:1000000,maxHp:1000000,
   gene:null,perk:null,spawnShieldT:0,shieldT:0,bulwarkT:0,tauntT:0,cloakT:0});
  g.tanks=[p,target];g.tankById=new Map([[p.id,p],[target.id,target]]);
  // Keep the exact manual eastward stick bearing in both counterfactual arms.
  // Shipping nearest-target assist otherwise tracks the oscillating Scout
  // (within its 0.22-rad cone), hiding the intended movement/miss effect.
  let aimAssistVetoes=0;
  const nearest=g.nearestTank;
  g.nearestTank=function(x,y,radius,except){
   if(except===p.id&&radius===480&&x===p.x&&y===p.y){
    aimAssistVetoes++;return null;
   }
   return nearest.apply(this,arguments);
  };
  g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;p.stats.reload=reload;
  g.input.autofire=false;g.input.mouseActive=false;
  g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
  // Genuine Game movement owner integrates this constant analog input.
  g.input.moveVec=()=>({x:0,y:playerMoveY});
  let volleys=0,hits=0,damage=0,firstBirths=[],firstHits=[];
  const originalFire=g.tryFire,originalDamage=g.damageTank;
  g.tryFire=function(t){
   const n=this.bullets.length,result=originalFire.apply(this,arguments);
   if(t===p&&this.bullets.length>n){
    volleys++;
    if(firstBirths.length<5){
     const b=this.bullets[this.bullets.length-1];
     firstBirths.push({time:+this.time.toFixed(6),targetY:+target.y.toFixed(4),
      x:+b.x.toFixed(4),y:+b.y.toFixed(4)});
    }
   }
   return result;
  };
  g.damageTank=function(t){
   const before=t.hp,result=originalDamage.apply(this,arguments);
   if(t===target&&t.hp<before){
    assert.equal(arguments[2],p.id,'damage must be player-owned');
    hits++;damage+=before-t.hp;
    if(firstHits.length<5)firstHits.push({time:+this.time.toFixed(6),
     targetY:+target.y.toFixed(4),applied:+(before-t.hp).toFixed(4)});
   }
   return result;
  };
  let now=0,updates=0,onTime=0,edges=0,travel=0,peakOffset=0,previousY=0;
  let targetMoveSteps=0,expectedNextY=0;
  const droneStep=g.updateDrones;
  g.updateDrones=function(dt){
   const result=droneStep.apply(this,arguments);
   // Integrate the scripted, bounded target displacement through the REAL
   // Battlefield moveTank owner BEFORE the Game rebuilds its spatial hash.
   // Moving only inside updateBullets would leave the hash at the old Y and
   // introduce false misses unrelated to firing chronology.
   const dy=expectedNextY-target.y;
   target.vx=0;target.vy=dy/dt;
   this.moveTank(target,0,dy/dt,dt);
   targetMoveSteps++;
   return result;
  };
  const initialTime=g.time;
  try{
   for(const frame of frames(mode)){
    const end=now+frame;
    while(now<end-EPS){
     // Every mode samples the same .5s-on/.3s-off edges, offset by a controlled phase
     // from frame zero so input events actually split presentation frames.
     const cycle=Math.floor((now+offset+EPS)/.8);
     const phase=now+offset-cycle*.8;
     const firing=phase<.5-EPS;
     const boundary=cycle*.8+(firing?.5:.8)-offset;
     const next=Math.min(end,boundary);
     const dt=next-now;
     assert.ok(dt>EPS,'input-event split must progress');
     // Normalize the physical target at the exact beginning of each step.
     // This keeps initial geometry tied to world time, not prior AI drift.
     target.x=200;target.y=amplitude*Math.sin(2*Math.PI*(now+motionPhase)/motionPeriod);
     target.vx=0;target.vy=0;
     expectedNextY=amplitude*Math.sin(2*Math.PI*(next+motionPhase)/motionPeriod);
     g.input.firing=firing;
     if(firing)onTime+=dt;
     g.update(dt);updates++;
     // The real moveTank/Battlefield owner must arrive at the same scripted
     // endpoint; no after-collision teleport or silent geometry correction.
     const y=expectedNextY;
     assert.ok(Math.abs(target.y-y)<1e-4,
      'real moving-body integration diverged from prescribed world-time path');
     travel+=Math.abs(y-previousY);
     previousY=y;
     peakOffset=Math.max(peakOffset,Math.abs(y));
     now=next;
     if(next<end-EPS)edges++;
    }
   }
   assert.ok(Math.abs(now-SECONDS)<1e-7,'same wall time');
   assert.ok(Math.abs(g.time-initialTime-SECONDS)<1e-6,'same simulated time');
   assert.ok(Math.abs(onTime-3.9)<1e-7,'same exact fire duty');
   assert.equal(g.tanks.length,2,'no extra tanks');
   assert.equal(g.shapes.length+g.drones.length+g.powerups.length,0,'no ecology contamination');
   assert.equal(targetMoveSteps,updates,'each Game update must integrate one real target movement');
   assert.ok(aimAssistVetoes>0,'manual-aim assist veto must execute in composed Game');
   assert.ok(volleys>0&&hits>0&&damage>0,'real projectile damage required');
   assert.ok(hits<=volleys,'ordinary single-target rotary shots');
   assert.ok(Number.isFinite(damage)&&damage<=1000000);
   const windowDamage=damage,windowHits=hits,windowBullets=g.bullets.length;
   // Resolve already-born rounds without allowing another shot. Continue
   // the same prescribed moving-body path through the real Battlefield owner
   // rather than freezing the Scout at an artificially favorable hit position.
   // Keep this separate from the six-second firing-window measurement.
   if(drainSeconds>0){
    assert.equal(drainSeconds,2,'bounded no-fire projectile drain');
    g.input.firing=false;g.input.aim.active=false;
    for(let i=0;i<120;i++){
     const next=SECONDS+(i+1)/60;
     expectedNextY=amplitude*Math.sin(2*Math.PI*(next+motionPhase)/motionPeriod);
     g.update(1/60);
     assert.ok(Math.abs(target.y-expectedNextY)<1e-4,
      'no-fire drain must preserve real moving-body trajectory');
    }
    assert.ok(Math.abs(g.time-initialTime-SECONDS-drainSeconds)<1e-5,
     'drain must advance exactly two seconds of real Game updates');
    assert.ok(damage>=windowDamage&&hits>=windowHits,
     'no-fire drain cannot undo applied target damage');
   }
   return {seed,cls,reload,mode,offset,amplitude,motionPeriod,motionPhase,updates,edges,volleys,hits,
    targetMoveSteps,
    ...(playerMoveY?{playerMoveY,playerEndY:+p.y.toFixed(5)}:{}),
    aimAssistVetoes,
    travel:+travel.toFixed(4),peakOffset:+peakOffset.toFixed(4),
    damage:+damage.toFixed(4),
    ...(drainSeconds?{windowDamage:+windowDamage.toFixed(4),
     windowHits,windowBullets,drainDamage:+(damage-windowDamage).toFixed(4),
     drainHits:hits-windowHits,remainingBullets:g.bullets.length}:{}),
    onTime:+onTime.toFixed(5),firstBirths,firstHits,
    heat:+(p.__v17Heat||0).toFixed(5),spin:+(p.fireSpin||0).toFixed(5)};
  }finally{g.destroy();}
 });
}
test('matched moving-target chronology measures real rotary damage under irregular frames',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  for(const seed of [1517800,1517802]){
   for(const offset of [.007,.012])
    for(const mode of ['native60','cluster30','alternating40_120']){
     const row=trial(seed,cls,reload,mode,offset,26);
     const repeat=trial(seed,cls,reload,mode,offset,26);
     assert.deepEqual(row,repeat,'seeded composed simulation must reproduce');
     assert.ok(row.peakOffset>25.9&&row.travel>50,'target must actually traverse the projectile corridor');
     const stationary=trial(seed,cls,reload,mode,offset,0);
     assert.equal(stationary.peakOffset,0,'stationary control cannot move');
     assert.equal(stationary.travel,0,'stationary control cannot drift');
     assert.equal(stationary.onTime,row.onTime,'matched physical input duty');
     rows.push({...row,stationaryDamage:stationary.damage,
      stationaryHits:stationary.hits,
      damageDelta:+(row.damage-stationary.damage).toFixed(4)});
    }
  }
 }
 assert.equal(rows.length,24);
 for(const row of rows)assert.equal(row.onTime,3.9);
 assert.ok(rows.some(row=>row.damageDelta!==0),
  'moving-target arm must change at least one real HP outcome versus stationary control');
 console.log('GUNNER_MOVING_TARGET_REAL_DAMAGE '+JSON.stringify(rows));
});

/* Independent motion-period/phase control: the original 1.6-second path shares
 * a rational period with the 0.8-second fire cycle. A 1.37-second period
 * and nonzero starting phase test whether real moving-target contact remains
 * measurable without that artificial synchronization. No damage goldens. */
test('unsynchronized target motion retains real projectile damage evidence',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  for(const mode of ['native60','cluster30','alternating40_120']){
   const moving=trial(1517800,cls,reload,mode,.007,26,1.37,.19);
   const repeat=trial(1517800,cls,reload,mode,.007,26,1.37,.19);
   const stationary=trial(1517800,cls,reload,mode,.007,0,1.37,.19);
   assert.deepEqual(moving,repeat,'unsynchronized path must reproduce exactly');
   assert.ok(moving.peakOffset>25&&moving.travel>50,'physical motion must cross corridor');
   assert.equal(stationary.travel,0,'stationary control must not drift');
   assert.equal(moving.onTime,stationary.onTime,'same input history');
   assert.equal(moving.updates,stationary.updates,'same update schedule');
   rows.push({cls,mode,movingDamage:moving.damage,stationaryDamage:stationary.damage,
    movingHits:moving.hits,stationaryHits:stationary.hits});
  }
 }
 assert.equal(rows.length,6);
 console.log('GUNNER_UNSYNC_MOVING_TARGET_REAL_DAMAGE '+JSON.stringify(rows));
});

/* Phase sensitivity: the 1.37s unsynchronized path is still only one phase.
 * Sweep four distinct starting phases at identical target amplitude and
 * firing input, reporting per-mode ranges rather than freezing FPS goldens.
 * This guards against drawing a broad fairness conclusion from one alignment.
 * Actual Game movement, swept collision and applied HP remain authoritative. */
test('unsynchronized moving-target damage reports phase sensitivity without FPS goldens',()=>{
 const rows=[];
 // Quarter-period spacing covers positive/negative extrema and crossings.
 const phases=[.03,.3725,.715,1.0575];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  for(const phase of phases){
   const schedule=[];
   for(const mode of ['native60','cluster30','alternating40_120']){
    const row=trial(1517802,cls,reload,mode,.007,26,1.37,phase);
    assert.equal(row.onTime,3.9,'identical fire duty');
    assert.ok(row.travel>50&&row.peakOffset>25,'target must cross projectile corridor');
    schedule.push({mode,damage:row.damage,hits:row.hits,volleys:row.volleys,
     firstShotTargetY:row.firstBirths[0].targetY,
     heat:row.heat,spin:row.spin});
   }
   rows.push({cls,phase,schedule});
  }
 }
 assert.equal(rows.length,8,'both legal rotary builds across four independent phases');
 for(const cls of ['minigun','needlestorm']){
  const subset=rows.filter(row=>row.cls===cls);
  assert.equal(new Set(subset.map(row=>row.phase)).size,4);
  const byMode=Object.fromEntries(['native60','cluster30','alternating40_120'].map(mode=>{
   const samples=subset.map(row=>row.schedule.find(s=>s.mode===mode));
   assert.equal(new Set(samples.map(s=>s.firstShotTargetY)).size,4,
    'phase variation must change actual target geometry at first shot');
   const damage=samples.map(s=>s.damage);
   return [mode,{min:Math.min(...damage),max:Math.max(...damage),
    mean:+(damage.reduce((a,b)=>a+b,0)/damage.length).toFixed(4)}];
  }));
  console.log('GUNNER_UNSYNC_PHASE_SENSITIVITY '+JSON.stringify({cls,period:1.37,byMode}));
 }
 console.log('GUNNER_UNSYNC_PHASE_ROWS '+JSON.stringify(rows));
});

/* #799: a six-second cutoff can mislabel in-flight rounds as misses.
 * Keep the firing-window result and the no-fire tail separately measurable.
 * The target continues its same real moving-body path during the tail;
 * the composed Game still owns projectile collision and applied HP. */
test('Gunner moving-target damage separates firing window from projectile drain',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  for(const mode of ['native60','cluster30','alternating40_120']){
   const args=[1517802,cls,reload,mode,.007,26,1.37,.3725];
   const before=trial(...args);
   const after=trial(...args,2);
   assert.equal(after.windowDamage,before.damage,'tail cannot alter recorded window HP');
   assert.equal(after.windowHits,before.hits,'tail cannot alter recorded window hit count');
   assert.equal(after.volleys,before.volleys,'no-fire tail must not spawn volleys');
   assert.ok(after.drainDamage>=0&&after.drainHits>=0,'drain damage is nonnegative');
   assert.ok(after.remainingBullets<=after.windowBullets,
    'tail must not create additional bullets');
   rows.push({cls,mode,windowDamage:after.windowDamage,
    drainDamage:after.drainDamage,totalDamage:after.damage,
    windowBullets:after.windowBullets,remainingBullets:after.remainingBullets});
  }
 }
 assert.equal(rows.length,6);
 console.log('GUNNER_PROJECTILE_DRAIN_DAMAGE '+JSON.stringify(rows));
});

/* #799: move the PLAYER through the shipping Game.moveTank owner while
 * preserving the same right-stick bearing and real moving-target collision.
 * This is a controlled constant-analog input, not a natural evasive pilot.
 * Compare applied HP and projectile birth positions; no FPS damage goldens. */
test('Gunner moving-player chronology changes real shot origins without synthetic teleports',()=>{
 const rows=[];
 for(const [cls,reload] of [['minigun',1],['needlestorm',3]]){
  for(const seed of [1517800,1517802]){
   for(const mode of ['native60','cluster30','alternating40_120']){
    const args=[seed,cls,reload,mode,.007,26,1.37,.3725,0];
    const still=trial(...args,0);
    const moving=trial(...args,.025);
    const repeat=trial(...args,.025);
    assert.deepEqual(moving,repeat,'real player motion must replay deterministically');
    assert.equal(moving.onTime,still.onTime,'identical physical firing duty');
    assert.equal(moving.updates,still.updates,'identical simulation schedule');
    assert.equal(moving.volleys,still.volleys,
     'pure player translation must not alter this isolated rotary firing census');
    assert.ok(moving.playerEndY>5&&Number.isFinite(moving.playerEndY),
     'Game.moveTank must produce meaningful real hull displacement');
    assert.ok(moving.firstBirths.some((birth,i)=>
     Math.abs(birth.y-still.firstBirths[i].y)>.1),
     'real player movement must change at least one actual projectile origin');
    rows.push({cls,seed,mode,playerEndY:moving.playerEndY,
     movingDamage:moving.damage,stationaryPlayerDamage:still.damage,
     movingHits:moving.hits,stationaryPlayerHits:still.hits,
     movingBirths:moving.firstBirths,stationaryBirths:still.firstBirths});
   }
  }
 }
 assert.equal(rows.length,12);
 console.log('GUNNER_MOVING_PLAYER_REAL_DAMAGE '+JSON.stringify(rows));
});
