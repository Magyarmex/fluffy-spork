'use strict';
// #1025 RESEARCH ONLY. Prototype public *physical* crowding as an alternative
// to reading other bots' private target slots. No gameplay wiring.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function publicPressure(g,observer,target,{radius=260,cap=3,metrics=null}={}){
 const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT_TEST__;
 let count=0;
 for(const q of g.tanks){
  if(metrics)metrics.bodyChecks=(metrics.bodyChecks||0)+1;
  if(!q||q.id===observer.id||q.id===target.id||q.alive===false||
     !(q.hp>0)||!Number.isFinite(q.x)||!Number.isFinite(q.y))continue;
  // Same-team bodies are not attackers merely because they are nearby.
  if(typeof g.areAllies==='function'&&g.areAllies(q,target))continue;
  if(typeof g.areHostile==='function'&&!g.areHostile(q,target))continue;
  // Visibility is from the deciding observer, not global team knowledge.
  if(!fair.inGameplayViewport(g,observer,q))continue;
  // Physical proximity is public; private AI target IDs and postures are not.
  if(Math.hypot(q.x-target.x,q.y-target.y)>radius)continue;
  if(++count>=cap)break;
 }
 return count;
}
function scene(){
 const g=bootGame(),fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT_TEST__;
 const bots=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
 assert.ok(bots.length>=4);
 const [observer,left,right,other]=bots.slice(0,4);
 for(const [i,t] of [observer,left,right,other].entries()){
  Object.assign(t,{x:i===1?-100:i===2?100:i===3?2000:0,
   y:i===3?2000:0,hp:100,maxHp:100,alive:true,
   spawnShieldT:0,cls:'twin',tier:1});
  Object.assign(t.ai,{state:i===3?'hunt':'wander',__v1112TargetId:-1,
   __v1105TargetId:-1,__v180TargetId:-1,targetId:-1,
   __v180Posture:null,__v180LastAttacker:-1});
 }
 g.tanks=[observer,left,right,other];
 g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
 g.w=800;g.h=600;g.cam.zoom=1;g.time=10;
 g.areAllies=()=>false;g.areHostile=()=>true;
 return {g,fair,observer,left,right,other};
}
test('public physical pressure is invariant to an offscreen bot private target slot',()=>{
 withSeed(1517800,()=>{
  const s=scene();
  try{
   const {g,fair,observer,left,right,other}=s;
   assert.equal(fair.inGameplayViewport(g,observer,other),false);
   const before=[publicPressure(g,observer,left),publicPressure(g,observer,right)];
   other.ai.__v1112TargetId=left.id;
   assert.deepEqual([publicPressure(g,observer,left),publicPressure(g,observer,right)],before);
   other.ai.__v1112TargetId=right.id;
   assert.deepEqual([publicPressure(g,observer,left),publicPressure(g,observer,right)],before);
   // This is a prototype invariant, not a claim that the shipped scorer
   // already obeys it. The shipped private-slot leak has a separate witness.
   console.log('NOVA_PUBLIC_PRESSURE_PROTOTYPE '+JSON.stringify({before,
    hiddenDistance:Math.hypot(other.x-observer.x,other.y-observer.y)}));
  }finally{s.g.destroy();}
 });
});
test('a visible physical participant changes only the nearby target pressure',()=>{
 withSeed(1517802,()=>{
  const s=scene();
  try{
   const {g,observer,left,right,other}=s;
   const baseline=[publicPressure(g,observer,left),publicPressure(g,observer,right)];
   assert.deepEqual(baseline,[1,1],
    'each visible opposing target is near the other in this deliberately tight fixture');
   // Move the third participant inside the viewport and near left, but
   // beyond the pressure radius of right.
   other.x=-330;other.y=0;
   assert.deepEqual([publicPressure(g,observer,left),publicPressure(g,observer,right)],[2,1]);
   other.alive=false;
   assert.deepEqual([publicPressure(g,observer,left),publicPressure(g,observer,right)],baseline);
  }finally{s.g.destroy();}
 });
});

test('public proximity cannot count a visible teammate as pressure on its ally',()=>{
 withSeed(1517808,()=>{
  const s=scene();
  try{
   const {g,observer,left,right,other}=s;
   other.x=-330;other.y=0;
   assert.equal(publicPressure(g,observer,left),2,'baseline physical crowd');
   const original=g.areAllies;
   g.areAllies=(a,b)=>a===other&&b===left||a===left&&b===other;
   assert.equal(publicPressure(g,observer,left),1,
    'visible allied body is not an attacker merely by proximity');
   assert.equal(publicPressure(g,observer,right),1,
    'unrelated visible candidate retains ordinary pressure');
   g.areAllies=original;
   const hostile=g.areHostile;
   g.areHostile=(a,b)=>!(a===other&&b===left||a===left&&b===other);
   assert.equal(publicPressure(g,observer,left),1,
    'neutral bystander is not a hostile commitment either');
   g.areHostile=hostile;
  }finally{s.g.destroy();}
 });
});

test('negative control: mere proximity falsely counts a passive bystander',()=>{
 withSeed(1517810,()=>{
  const s=scene();
  try{
   const {g,fair,observer,left,other}=s;
   other.x=-330;other.y=0;other.ai.state='idle';
   other.ai.__v1112TargetId=-1;
   assert.equal(publicPressure(g,observer,left),2,
    'physical proxy counts the nearby but passive bystander');
   assert.equal(fair.saturation(g,left.id,observer.id),0,
    'current private-slot scorer excludes an idle non-attacker');
   // This intentionally falsifies treating proximity as verified attack
   // commitment. A production replacement needs observed fire/trajectory
   // or a better bounded public witness before changing target scores.
  }finally{s.g.destroy();}
 });
});

function publicProjectileThreat(g,observer,target,{horizon=.35,margin=28,metrics=null}={}){
 const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT__;
 for(const b of g.bullets||[]){
  if(metrics)metrics.bulletChecks=(metrics.bulletChecks||0)+1;
  if(!b||b.dead||!(b.ttl>0)||!Number.isFinite(b.x)||
     !Number.isFinite(b.y)||!Number.isFinite(b.vx)||
     !Number.isFinite(b.vy))continue;
  // No owner target slot or hidden attacker location is consulted.
  if(!fair.inGameplayWorldPoint(g,observer,b.x,b.y))continue;
  const speed2=b.vx*b.vx+b.vy*b.vy;
  if(speed2<1)continue;
  const t=((target.x-b.x)*b.vx+(target.y-b.y)*b.vy)/speed2;
  if(!(t>=0&&t<=Math.min(horizon,b.ttl)))continue;
  const miss=Math.hypot(target.x-(b.x+b.vx*t),
   target.y-(b.y+b.vy*t));
  if(miss<=margin+(Number(target.r)||0))return 1;
 }
 return 0;
}
test('public projectile trajectory distinguishes an actual short-horizon threat from passive proximity',()=>{
 withSeed(1517812,()=>{
  const s=scene();
  try{
   const {g,observer,left,right,other}=s;
   other.x=-330;other.y=0;other.ai.state='idle';
   assert.equal(publicPressure(g,observer,left),2);
   g.bullets=[];
   assert.equal(publicProjectileThreat(g,observer,left),0);
   g.bullets=[{x:-200,y:0,vx:400,vy:0,ttl:1,dead:false}];
   assert.equal(publicProjectileThreat(g,observer,left),1);
   assert.equal(publicProjectileThreat(g,observer,right),0,
    'farther candidate is beyond the explicit short prediction horizon');
   // A visually hidden projectile must not grant privileged pressure data.
   g.bullets[0].x=450;g.bullets[0].vx=-2000;
   assert.ok((left.x-450)/-2000<=.35,
    'offscreen shot would geometrically reach target within horizon');
   assert.equal(publicProjectileThreat(g,observer,left),0);
  }finally{s.g.destroy();}
 });
});

test('negative control: trajectory-only pressure overcounts an occluded bullet',()=>{
 withSeed(1517814,()=>{
  const s=scene();
  try{
   const {g,observer,left}=s;
   g.bullets=[{x:-200,y:0,vx:400,vy:0,ttl:1,dead:false}];
   g.hasLineOfSight=()=>false;
   assert.equal(publicProjectileThreat(g,observer,left),1,
    'naive trajectory projection ignores an intervening permanent wall');
   // Explicitly a falsifying witness: before promotion, require the actual
   // Battlefield swept collision/occlusion owner, not a cheap geometry guess.
  }finally{s.g.destroy();}
 });
});

test('trajectory witness rejects departing, expired and near-miss projectiles',()=>{
 withSeed(1517816,()=>{
  const s=scene();
  try{
   const {g,observer,left}=s;
   const bullet={x:-200,y:0,vx:400,vy:0,ttl:1,dead:false};
   g.bullets=[bullet];
   assert.equal(publicProjectileThreat(g,observer,left),1);
   bullet.vx=-400;
   assert.equal(publicProjectileThreat(g,observer,left),0,'departing shot');
   bullet.vx=400;bullet.ttl=.1;
   assert.equal(publicProjectileThreat(g,observer,left),0,'expires before contact');
   bullet.ttl=1;bullet.y=70;
   assert.equal(publicProjectileThreat(g,observer,left),0,'trajectory misses target');
   bullet.y=0;bullet.dead=true;
   assert.equal(publicProjectileThreat(g,observer,left),0,'already removed projectile');
  }finally{s.g.destroy();}
 });
});

test('natural composed match samples public-pressure candidate incidence without changing AI',()=>{
 for(const seed of [1517800,1517802]){
  withSeed(seed,()=>{
   const g=bootGame();
   try{
    g.sfx.muted=true;g.sfx.startMusic=()=>{};
    g.status='playing';g.paused=false;
    const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT_TEST__;
    const stats={seed,frames:0,visiblePairs:0,privateAssignments:0,
     proximityPositive:0,projectilePositive:0,witnessPositive:0,
     bodyChecks:0,bulletChecks:0,eligiblePairs:0,nearestPairDistance:null};
    for(let frame=0;frame<720;frame++){
     g.update(1/60);stats.frames++;
     if(frame%30!==0)continue;
     const observers=g.tanks.filter(t=>t&&t.ai&&t.alive!==false);
     for(const observer of observers)for(const target of g.tanks){
      if(!target||target===observer||target.alive===false)continue;
      if(typeof g.areAllies==='function'&&g.areAllies(observer,target))continue;
      // Diagnose zero-witness natural samples without pretending distant
      // enemies are visible or changing the Fair Engagement viewport gate.
      const distance=Math.hypot(target.x-observer.x,target.y-observer.y);
      if(Number.isFinite(distance)){
       stats.eligiblePairs++;
       stats.nearestPairDistance=stats.nearestPairDistance===null?
        distance:Math.min(stats.nearestPairDistance,distance);
      }
      if(!fair.inGameplayViewport(g,observer,target))continue;
      stats.visiblePairs++;
      if(fair.saturation(g,target.id,observer.id)>0)stats.privateAssignments++;
      if(publicPressure(g,observer,target,{metrics:stats})>0)stats.proximityPositive++;
      if(publicProjectileThreat(g,observer,target,{metrics:stats})>0)stats.projectilePositive++;
      if(existingShotWitnessPressure(g,observer,target)>0)stats.witnessPositive++;
     }
    }
    assert.equal(stats.frames,720,'natural game must execute the full sample');
    console.log('NOVA_PUBLIC_PRESSURE_NATURAL_RESEARCH '+JSON.stringify(stats));
    // Descriptive incidence only; neither a causal AI-balance result nor a
    // performance/device benchmark. No gameplay logic is patched.
   }finally{g.destroy();}
  });
 }
});

function movingProjectileThreat(g,observer,target,observedVelocity,{horizon=.35,margin=28}={}){
 if(!observedVelocity||!Number.isFinite(observedVelocity.vx)||
    !Number.isFinite(observedVelocity.vy))return 0;
 const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT__;
 for(const b of g.bullets||[]){
  if(!b||b.dead||!(b.ttl>0)||!Number.isFinite(b.x)||
     !Number.isFinite(b.y)||!Number.isFinite(b.vx)||
     !Number.isFinite(b.vy)||!fair.inGameplayWorldPoint(g,observer,b.x,b.y))continue;
  // Caller must derive velocity from *witnessed* public positions; never
  // read the target's private exact physics velocity from Game state.
  const tvx=observedVelocity.vx,tvy=observedVelocity.vy;
  const vx=b.vx-tvx,vy=b.vy-tvy,v2=vx*vx+vy*vy;
  if(v2<1)continue;
  const dx=target.x-b.x,dy=target.y-b.y;
  const t=(dx*vx+dy*vy)/v2;
  if(!(t>=0&&t<=Math.min(horizon,b.ttl)))continue;
  if(Math.hypot(dx-vx*t,dy-vy*t)<=margin+(Number(target.r)||0))return 1;
 }
 return 0;
}
test('moving public target can cross a shot lane that static trajectory misses',()=>{
 withSeed(1517818,()=>{
  const s=scene();
  try{
   const {g,observer,left}=s;
   Object.assign(left,{x:-100,y:70,vx:0,vy:-280,r:0});
   g.bullets=[{x:-200,y:0,vx:400,vy:0,ttl:1,dead:false}];
   assert.equal(publicProjectileThreat(g,observer,left),0,
    'stationary proxy misses a target crossing the lane');
   assert.equal(movingProjectileThreat(g,observer,left,{vx:0,vy:-280}),1,
    'relative public velocity predicts the crossing within 250ms');
   left.vy=280;
   assert.equal(movingProjectileThreat(g,observer,left,{vx:0,vy:-280}),1,
    'unwitnessed exact target velocity change cannot affect cached public estimate');
   assert.equal(movingProjectileThreat(g,observer,left,{vx:0,vy:280}),0,
    'moving away from the lane is not the same threat');
  }finally{s.g.destroy();}
 });
});

test('real composed AI update wrapper is sensitive to hidden private assignment',()=>{
 function run(arm,hiddenAlive=true){
  return withSeed(1517820,()=>{
   const s=scene();
   try{
    const {g,fair,observer,left,right,other}=s;
    const ai=g.__testWindow.__novaMakeRequire('')('game/ai');
    const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
    const baseline=fair.chooseTarget(g,classes,observer,observer.ai,g.time);
    assert.ok(baseline===left||baseline===right);
    other.ai.__v1112TargetId=arm===0?baseline.id:(baseline===left?right:left).id;
    other.alive=hiddenAlive;
    const publicBefore=JSON.stringify(g.tanks.map(t=>[t.id,t.x,t.y,t.hp,t.alive]));
    observer.ai.__v1112NextThink=-1;
    observer.ai.__v1112TargetId=-1;
    observer.ai.__v1112InjectedId=-1;
    ai.updateAI(observer,g,1/60);
    return {chosen:observer.ai.__v1112TargetId,
     publicBefore,expected:arm===0?(baseline===left?right:left).id:baseline.id};
   }finally{s.g.destroy();}
  });
 }
 const a=run(0),b=run(1);
 assert.equal(a.publicBefore,b.publicBefore,
  'the two real AI wrapper arms must have identical public tank state');
 assert.equal(a.chosen,a.expected);
 assert.equal(b.chosen,b.expected);
 assert.notEqual(a.chosen,b.chosen,
  'actual shipping AI wrapper changes target from invisible private AI slot');
 const deadA=run(0,false),deadB=run(1,false);
 assert.equal(deadA.chosen,deadB.chosen,
  'dead hidden AI assignments must not affect real wrapper target choice');
});

function existingShotWitnessPressure(g,observer,target,{maxAge=1.25,cone=.95}={}){
 const a=observer&&observer.ai,now=Number(g.time);
 if(!a||!Number.isFinite(now)||!Number.isFinite(a.__v181ObservedShotAt)||
    now-a.__v181ObservedShotAt<0||now-a.__v181ObservedShotAt>maxAge||
    !Number.isFinite(a.__v181ObservedShotAngle))return 0;
 const shooter=g.getTank&&g.getTank(a.__v181ObservedShotId);
 const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT_TEST__;
 if(!shooter||shooter===observer||shooter===target||shooter.alive===false||
    !fair.inGameplayViewport(g,observer,shooter)||
    !fair.inGameplayViewport(g,observer,target)||
    (typeof g.hasLineOfSight==='function'&&
     (!g.hasLineOfSight(observer.x,observer.y,shooter.x,shooter.y,3)||
      !g.hasLineOfSight(shooter.x,shooter.y,target.x,target.y,3))))return 0;
 const angle=Math.atan2(target.y-shooter.y,target.x-shooter.x);
 return Math.cos(angle-a.__v181ObservedShotAngle)>=cone?1:0;
}
test('existing observer-owned Battle Sense shot witness can inform public pressure without new bullet scan',()=>{
 withSeed(1517822,()=>{
  const s=scene();
  try{
   const {g,observer,left,right,other}=s;
   other.x=0;other.y=-200;
   // Controlled open lane: isolate witness semantics from seeded terrain.
   g.hasLineOfSight=()=>true;
   const angle=Math.atan2(left.y-other.y,left.x-other.x);
   Object.assign(observer.ai,{__v181ObservedShotId:other.id,
    __v181ObservedShotAt:9.9,__v181ObservedShotAngle:angle});
   assert.equal(existingShotWitnessPressure(g,observer,left),1);
   assert.equal(existingShotWitnessPressure(g,observer,right),0);
   other.ai.__v1112TargetId=right.id;
   assert.equal(existingShotWitnessPressure(g,observer,left),1,
    'the shooter private target slot is irrelevant to observed shot geometry');
   observer.ai.__v181ObservedShotAt=8;
   assert.equal(existingShotWitnessPressure(g,observer,left),0,
    'old observed fire cannot become permanent target pressure');
   observer.ai.__v181ObservedShotAt=9.9;
   g.hasLineOfSight=()=>false;
   assert.equal(existingShotWitnessPressure(g,observer,left),0,
    'lost line of sight cannot authorize current shooter coordinates');
   g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===other.x&&ay===other.y&&
    bx===left.x&&by===left.y);
   assert.equal(existingShotWitnessPressure(g,observer,left),0,
    'shot-to-target cover blocks ordinary direct-pressure inference');
   g.hasLineOfSight=()=>true;other.x=2000;
   assert.equal(existingShotWitnessPressure(g,observer,left),0,
    'the prototype refuses to use a hidden shooter current position');
  }finally{s.g.destroy();}
 });
});
