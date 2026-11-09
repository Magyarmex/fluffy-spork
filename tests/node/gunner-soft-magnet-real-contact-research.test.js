'use strict';
/* Research-only #624: compare actual projectile contact from hard snap,
 * bounded soft magnet, and manual aiming in the composed Game.
 * No shipping gameplay change. */
const test=require('node:test'),assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
function rngDivergence(a,b){
 assert.equal(a.rngDrawsBeforeCombat,b.rngDrawsBeforeCombat,
  'matched arms must enter combat at the same random-stream offset');
 assert.equal(a.rngTrace.length,b.rngTrace.length);
 const i=a.rngTrace.findIndex((n,j)=>n!==b.rngTrace[j]);
 return i<0?null:i;
}
// Research-only visible-history gate; identity switches cannot inherit speed.
function visibleMotionIntent(requested,bearing,now,prior){
 if(!now||!prior||!now.visible||!prior.visible||prior.id!==now.id)return false;
 const dt=now.at-prior.at;
 if(!(dt>0&&dt<=.2))return false;
 // Tangential motion relative to the observed sight ray, not global Y motion.
 const dx=(now.x-prior.x)/dt,dy=(now.y-prior.y)/dt;
 const lateral=-Math.sin(bearing)*dx+Math.cos(bearing)*dy;
 const signedLead=wrap(requested-bearing);
 return Math.abs(lateral)>20&&lateral*signedLead>0&&Math.abs(signedLead)>.01;
}
function smoothstep(x,lo,hi){
 const t=Math.max(0,Math.min(1,(x-lo)/(hi-lo)));
 return t*t*(3-2*t);
}
function visibleMotionWeight(requested,bearing,now,prior){
 if(!now||!prior||!now.visible||!prior.visible||now.id!==prior.id)return 0;
 const dt=now.at-prior.at;
 if(!(dt>0&&dt<=.2))return 0;
 const dx=(now.x-prior.x)/dt,dy=(now.y-prior.y)/dt;
 const lateral=-Math.sin(bearing)*dx+Math.cos(bearing)*dy;
 const lead=wrap(requested-bearing);
 if(lateral*lead<=0||Math.abs(lead)>=.22)return 0;
 return smoothstep(Math.abs(lateral),15,40)*smoothstep(Math.abs(lead),.01,.04);
}
const softBearing=(requested,target)=>{
 const delta=wrap(requested-target);
 return wrap(requested-delta*.45*Math.exp(-((delta/.06)**2)));
};
function trial(seed,cls,hz,scenario,policy,direction=1,leadMode='fixed'){
 return withSeed(seed,draws=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const p=g.player,t=g.tanks.find(x=>x!==p);assert.ok(t);
   g.sfx.muted=true;g.setClass(p,cls);
   Object.assign(p,{x:0,y:0,vx:0,vy:0,angle:0,spawnShieldT:0,droneRespawnT:Infinity});
   p.stats.reload=cls==='minigun'?1:3;
   Object.assign(t,{cls:'scout',isPlayer:true,alive:true,x:200,
    y:scenario==='moving'?-35*direction:0,vx:0,vy:0,hp:1000000,maxHp:1000000,
    gene:null,perk:null,spawnShieldT:0,shieldT:0,bulwarkT:0,
    tauntT:0,cloakT:0});
   g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=800;g.h=600;
   g.tanks=[p,t];g.tankById=new Map([[p.id,p],[t.id,t]]);
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash&&g.hash.clear)g.hash.clear();
   if(g.shapeById)g.shapeById.clear();
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
   g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;
   g.spawnAITank=()=>null;g.spawnDrone=()=>null;
   g.status='playing';g.paused=false;
   g.input.autofire=false;g.input.aim.active=true;
   const nearest=g.nearestTank,originalDrones=g.updateDrones;
   let eligible=0,queries=0,movementWitness=0,hits=0,damage=0,volleys=0,maxTrajectoryDrift=0;
   let tick=-1,firstHitTick=null,leadStartDeg=null,leadEndDeg=null;
   let previousVisible=null,adaptiveSoftTicks=0,adaptiveHardTicks=0,adaptiveUseSoft=false,smoothWeightSum=0;
   const rngTrace=[],rngDrawsBeforeCombat=draws();
   g.nearestTank=function(x,y,r,exclude){
    const found=nearest.apply(this,arguments);
    if(exclude===p.id&&r===480&&x===p.x&&y===p.y){
     queries++;if(found===t)eligible++;
     if(policy!=='hard'&&!(policy==='adaptive'&&!adaptiveUseSoft))return null;
    }
    return found;
   };
   g.updateDrones=function(dt){
    if(scenario==='moving'){
     t.vx=0;t.vy=45*direction;
     this.moveTank(t,0,45*direction,dt);
     if(t.__novaLinearMoveValid===true&&t.__novaLinearMoveEpoch===this.time)
      movementWitness++;
    }
    return originalDrones.apply(this,arguments);
   };
   const originalDamage=g.damageTank,originalFire=g.tryFire;
   g.damageTank=function(victim){
    const before=victim.hp,out=originalDamage.apply(this,arguments);
    if(victim===t&&victim.hp<before){
     if(firstHitTick===null)firstHitTick=tick;
     hits++;damage+=before-victim.hp;
    }
    return out;
   };
   g.tryFire=function(tank){
    const before=this.bullets.length,out=originalFire.apply(this,arguments);
    if(tank===p&&this.bullets.length>before)volleys++;
    return out;
   };
   const activeTicks=4*hz,drainTicks=2*hz;
   for(let i=0;i<activeTicks+drainTicks;i++){
    tick=i;
    // Identical requested physical bearing across policies: 0.08-rad lead
    // against the moving Scout; stationary controls use both 0.008-rad
    // micro-error and 0.12-rad wide error to expose accessibility loss.
    const targetBearing=Math.atan2(t.y-p.y,t.x-p.x);
    // Physical stick intent follows the same nominal path in all arms,
    // even if hit knockback changes the real target's subsequent position.
    const nominalY=scenario==='moving'?direction*(-35+45*i/hz):0;
    let requested=wrap(Math.atan2(nominalY,200)+
     (scenario==='moving'?.08*direction:scenario==='stationary-wide'?.12:.008));
    if(scenario==='moving'&&leadMode==='underlead')requested=wrap(Math.atan2(nominalY,200)-.04*direction);
    if(scenario==='moving'&&leadMode==='overlead')requested=wrap(Math.atan2(nominalY,200)+.20*direction);
    if(scenario==='moving'&&leadMode==='intercept'){
     // Public straight-line geometry reference, not a gameplay auto-lead.
     // Keep the nominal physical input independent of damage knockback.
     const speed=cls==='minigun'?480:690,vy=45*direction;
     const a=vy*vy-speed*speed,b=2*nominalY*vy,c=200*200+nominalY*nominalY;
     const discriminant=b*b-4*a*c;
     assert.ok(discriminant>0);
     const flight=(-b-Math.sqrt(discriminant))/(2*a);
     assert.ok(flight>0&&Number.isFinite(flight));
     requested=Math.atan2(nominalY+vy*flight,200);
    }
    if(scenario==='moving'){
     const leadDeg=wrap(requested-Math.atan2(nominalY,200))*180/Math.PI;
     if(i===0)leadStartDeg=+leadDeg.toFixed(4);
     if(i===activeTicks-1)leadEndDeg=+leadDeg.toFixed(4);
    }
    // Research-only: use observed position history, not target velocity or future state.
    const visible={id:t.id,x:t.x,y:t.y,at:i/hz,visible:true};
    const adaptiveGate=visibleMotionIntent(requested,targetBearing,visible,previousVisible);
    const weight=visibleMotionWeight(requested,targetBearing,visible,previousVisible);
    previousVisible=visible;
    const useSoft=policy==='soft'||(policy==='adaptive'&&adaptiveGate);
    if(policy==='smooth')smoothWeightSum+=weight;
    if(policy==='adaptive'){
     adaptiveUseSoft=useSoft;
     useSoft?adaptiveSoftTicks++:adaptiveHardTicks++;
    }
    const effective=policy==='smooth'?(Math.abs(wrap(requested-targetBearing))<.22?
     wrap(targetBearing+weight*wrap(softBearing(requested,targetBearing)-targetBearing)):requested):
     (useSoft?softBearing(requested,targetBearing):requested);
    g.input.aim.dx=40*Math.cos(effective);
    g.input.aim.dy=40*Math.sin(effective);
    g.input.firing=i<activeTicks;
    g.update(1/hz);
    rngTrace.push(draws());
    const expectedY=scenario==='moving'?direction*(-35+45*(i+1)/hz):0;
    maxTrajectoryDrift=Math.max(maxTrajectoryDrift,Math.hypot(t.x-200,t.y-expectedY));
   }
   assert.ok(queries>0,'shipping assist must be consulted');
   assert.equal(eligible,queries,'target must be publicly eligible throughout');
   if(scenario==='moving')assert.equal(movementWitness,activeTicks+drainTicks,
    'moving-body certificate must survive every composed update');
   assert.ok(Number.isFinite(damage)&&damage>=0);
   assert.ok(hits>=0&&volleys>0);
   const result={seed,cls,hz,scenario,policy,direction,leadMode,leadStartDeg,leadEndDeg,hits,volleys,
    damage:+damage.toFixed(4),firstHitSec:firstHitTick===null?null:+((firstHitTick+1)/hz).toFixed(5),eligible,movementWitness,
    rngDrawsBeforeCombat,rngDrawsEnd:draws(),
    maxTrajectoryDrift:+maxTrajectoryDrift.toFixed(4),adaptiveSoftTicks,adaptiveHardTicks,smoothWeightSum:+smoothWeightSum.toFixed(4)};
   // Preserve full chronology for in-test comparisons without bloating CI JSON.
   Object.defineProperty(result,'rngTrace',{value:rngTrace});
   return result;
  }finally{g.destroy();}
 });
}
test('opt-in soft magnet contact and stationary-error controls use real composed Game',()=>{
 const rows=[];
 for(const cls of ['minigun','needlestorm'])
  for(const hz of [30,60])
   for(const scenario of ['stationary','stationary-wide','moving']){
    const arms=['hard','soft','manual'].map(policy=>trial(1517800,cls,hz,scenario,policy));
    assert.equal(new Set(arms.map(x=>x.volleys)).size,1,
     'aim policy must not alter weapon firing cadence');
    assert.ok(arms.every(x=>x.damage>=0&&Number.isFinite(x.damage)));
    assert.ok(arms.every(x=>x.eligible>0));
    rows.push({cls,hz,scenario,arms,
     rngDivergenceTicks:{soft:rngDivergence(arms[0],arms[1]),
      manual:rngDivergence(arms[0],arms[2])}});
   }
 assert.equal(rows.length,12);
 console.log('SOFT_MAGNET_REAL_CONTACT_RESEARCH '+JSON.stringify(rows));
});

// Directional and seed controls are intentionally descriptive: damage is not
// asserted to improve until independent player-value and device evidence exists.
test('soft-magnet moving-target contact is counterbalanced by direction and seed',()=>{
 const rows=[];
 for(const seed of [1517800,1517801])
  for(const direction of [-1,1])
   for(const cls of ['minigun','needlestorm'])
    for(const hz of [30,60]){
     const arms=['hard','soft','manual'].map(policy=>
      trial(seed,cls,hz,'moving',policy,direction));
     assert.equal(new Set(arms.map(x=>x.volleys)).size,1,
      'policy must not alter firing cadence within a matched trial');
     assert.ok(arms.every(x=>x.eligible>0&&x.movementWitness===6*hz),
      'target must remain publicly eligible and physically moving');
     assert.ok(arms.every(x=>x.maxTrajectoryDrift<1e-5),
      'target movement must not depend on aim policy or damage');
     rows.push({seed,direction,cls,hz,arms,
      rngDivergenceTicks:{soft:rngDivergence(arms[0],arms[1]),
       manual:rngDivergence(arms[0],arms[2])}});
    }
 assert.equal(rows.length,16);
 console.log('SOFT_MAGNET_DIRECTIONAL_CONTACT_RESEARCH '+JSON.stringify(rows));
});

// A fixed 0.08-rad lead is not equally appropriate for 480 and 690 unit/s
// projectiles. This reference uses each class's speed and the public nominal
// Scout trajectory to avoid mistaking overlead/underlead for assist quality.
test('soft-magnet contact with class-specific geometric intercept inputs',()=>{
 const rows=[];
 for(const seed of [1517800,1517801])
  for(const direction of [-1,1])
   for(const cls of ['minigun','needlestorm'])
    for(const hz of [30,60]){
     const arms=['hard','soft','manual'].map(policy=>
      trial(seed,cls,hz,'moving',policy,direction,'intercept'));
     assert.equal(new Set(arms.map(x=>x.volleys)).size,1);
     assert.ok(arms.every(x=>x.eligible>0&&x.movementWitness===6*hz));
     assert.ok(arms.every(x=>x.maxTrajectoryDrift<1e-5));
     rows.push({seed,direction,cls,hz,arms,
      rngDivergenceTicks:{soft:rngDivergence(arms[0],arms[1]),
       manual:rngDivergence(arms[0],arms[2])}});
    }
 assert.equal(rows.length,16);
 console.log('SOFT_MAGNET_INTERCEPT_CONTACT_RESEARCH '+JSON.stringify(rows));
});

 // This experimental gate is not shipping gameplay or a production acceptance rule.
 test('visible-motion intent gate preserves stationary snap and measures moving lead',()=>{
  const rows=[];
  for(const cls of ['minigun','needlestorm'])
   for(const hz of [30,60])
    for(const scenario of ['stationary-wide','moving'])
     for(const direction of (scenario==='moving'?[-1,1]:[1])){
      const arms=['hard','soft','adaptive','smooth'].map(policy=>
       trial(1517800,cls,hz,scenario,policy,direction,'intercept'));
      assert.equal(new Set(arms.map(x=>x.volleys)).size,1);
      assert.equal(rngDivergence(arms[0],arms[2]),null);
      if(scenario==='stationary-wide'){
       assert.equal(arms[2].adaptiveSoftTicks,0);
       assert.equal(arms[2].damage,arms[0].damage);
       assert.equal(arms[3].damage,arms[0].damage);
      }else{
       assert.ok(arms[2].adaptiveSoftTicks>0);
       assert.ok(arms[3].smoothWeightSum>0);
       assert.ok(arms[2].adaptiveHardTicks>0);
      }
      rows.push({cls,hz,scenario,direction,arms});
     }
  assert.equal(rows.length,12);
  console.log('VISIBLE_MOTION_AIM_INTENT_RESEARCH '+JSON.stringify(rows));
 });

 // Negative control: a player aiming behind a moving target must not be
 // classified as intentional predictive lead just because the target moves.
 test('visible-motion gate does not soften deliberate underlead',()=>{
  for(const cls of ['minigun','needlestorm'])
   for(const hz of [30,60])
    for(const direction of [-1,1]){
     const hard=trial(1517801,cls,hz,'moving','hard',direction,'underlead');
     const adaptive=trial(1517801,cls,hz,'moving','adaptive',direction,'underlead');
     const smooth=trial(1517801,cls,hz,'moving','smooth',direction,'underlead');
     assert.equal(adaptive.adaptiveSoftTicks,0);
     assert.equal(adaptive.damage,hard.damage);
     assert.equal(smooth.damage,hard.damage);
     assert.equal(smooth.smoothWeightSum,0);
     assert.equal(rngDivergence(hard,adaptive),null);
    }
 });

test('visible-motion intent history expires and uses sight-relative motion',()=>{
 const prior={id:1,x:200,y:0,at:0,visible:true};
 assert.equal(visibleMotionIntent(.08,0,{id:1,x:200,y:1,at:1/60,visible:true},prior),true);
 assert.equal(visibleMotionIntent(.08,0,{id:2,x:200,y:1,at:1/60,visible:true},prior),false);
 assert.equal(visibleMotionIntent(.08,0,{id:1,x:200,y:0,at:1/60,visible:true},prior),false);
 assert.equal(visibleMotionIntent(-.08,0,{id:1,x:200,y:1,at:1/60,visible:true},prior),false);
 assert.equal(visibleMotionIntent(.08,0,{id:1,x:200,y:20,at:1,visible:true},prior),false);
 assert.equal(visibleMotionIntent(.08,0,{id:1,x:200,y:1,at:1/60,visible:false},prior),false);
 // Pure radial approach is not predictive lateral motion.
 assert.equal(visibleMotionIntent(.08,0,{id:1,x:199,y:0,at:1/60,visible:true},prior),false);
 // Rotating the sight ray by 90 degrees rotates the eligible lateral axis.
 assert.equal(visibleMotionIntent(Math.PI/2+.08,Math.PI/2,{id:1,x:199,y:0,at:1/60,visible:true},prior),true);
});

test('continuous visible-motion weight has bounded threshold response',()=>{
 const prior={id:1,x:200,y:0,at:0,visible:true};
 const weight=(speed,lead=.08)=>visibleMotionWeight(lead,0,
  {id:1,x:200,y:speed/60,at:1/60,visible:true},prior);
 assert.equal(weight(0),0);
 assert.equal(weight(15),0);
 assert.equal(weight(40),1);
 assert.equal(weight(45,-.08),0);
 assert.equal(weight(45,.005),0);
 let previous=weight(0),maxJump=0;
 for(let speed=.1;speed<=50;speed+=.1){
  const current=weight(speed);
  maxJump=Math.max(maxJump,Math.abs(current-previous));
  previous=current;
 }
 assert.ok(maxJump<.007,'speed threshold must not recreate a hard snap');
 assert.equal(visibleMotionWeight(.08,0,{id:2,x:200,y:1,at:1/60,visible:true},prior),0);
});

 // Intent cannot be inferred from target movement alone: a large forward
 // overlead can be a player error. Preserve this as a descriptive falsifier.
 test('moving-target overlead exposes false-positive intent risk',()=>{
  const rows=[];
  for(const direction of [-1,1]){
   const arms=['hard','adaptive','smooth'].map(policy=>
    trial(1517801,'minigun',30,'moving',policy,direction,'overlead'));
   assert.equal(new Set(arms.map(x=>x.volleys)).size,1);
   assert.ok(arms[1].adaptiveSoftTicks>0&&arms[2].smoothWeightSum>0);
   rows.push({direction,arms});
  }
  console.log('VISIBLE_MOTION_OVERLEAD_RISK '+JSON.stringify(rows));
 });
