'use strict';
// Research-only natural-world pilot. Unlike the scripted acquisition fixture,
// the actual composed Game runs its AI, neutral ecology, combat and pickups.
// It is not a statistically powered balance claim or an Android FPS test.
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {playPublicPrelude}=require('../research/redeploy-public-prelife.cjs');

function arm(seed,hz,classOnly){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   assert.ok(g.player?.alive&&g.status==='playing');
   const initial=JSON.stringify((g.tanks||[]).map(t=>[
    t.id,t.cls,+t.x.toFixed(3),+t.y.toFixed(3),t.hp,t.alive]));
   const arrivals=[],apply=g.applyPowerup;
   g.applyPowerup=function(t,type){
    arrivals.push({ai:!!t?.ai,type,at:+g.time.toFixed(3)});
    return apply.apply(this,arguments);
   };
   // Apply the same wrapper and roster scan to both arms so the timing
   // comparison does not charge only the class-only control for test overhead.
   // In that arm, erase observer speed histories before each frame; one frame
   // cannot accumulate the three required witnessed intervals.
   const update=g.update;
   g.update=function(dt){
    for(const t of this.tanks||[])if(t?.ai&&classOnly&&t.ai.__v181RivalSpeedWitness)
     delete t.ai.__v181RivalSpeedWitness;
    return update.call(this,dt);
   };
   const result=playPublicPrelude(g,hz,10,g.__testFair);
   const perf=typeof g.novaPerfSnapshot==='function'?g.novaPerfSnapshot():{};
   return {seed,hz,classOnly,initial,elapsed:result.elapsed,
    updateMs:+Number(perf.updateMs||0).toFixed(3),
    updatePeakMs:+Number(perf.updatePeakMs||0).toFixed(3),
    terrainQueries:Number(perf.terrainQueries||0),
    playerHp:result.hpAfter,playerDeath:result.naturalDeath,
    playerScore:result.scoreEarned,neutralXP:result.neutralXPEarned,
    changedEnemies:result.changedEnemies,changedShapes:result.changedShapes,
    pickups:arrivals.length,aiHeals:arrivals.filter(a=>a.ai&&a.type==='heal').length,
    firstAiHeal:arrivals.find(a=>a.ai&&a.type==='heal')?.at??null};
  }finally{g.destroy();}
 });
}
test('natural composed match pilot compares class-only and witnessed-speed AI',()=>{
 const reports=[];
 for(const seed of [1517800,1517854])for(const hz of [30,60]){
  const baseline=arm(seed,hz,true),witnessed=arm(seed,hz,false);
  assert.equal(baseline.initial,witnessed.initial,
   'paired arms must begin with identical public world state');
  assert.ok(Number.isFinite(baseline.playerHp)&&Number.isFinite(witnessed.playerHp));
  reports.push({seed,hz,classOnly:baseline,witnessed});
 }
 console.log('COMPOSED_RIVAL_NATURAL_MATCH_PILOT '+JSON.stringify(reports.map(p=>({
  seed:p.seed,hz:p.hz,
  classOnly:{...p.classOnly,initial:undefined},
  witnessed:{...p.witnessed,initial:undefined}
 }))));
 assert.equal(reports.length,4);
});

// Opportunity-conditioned pilot: the unconditioned 10s world produced zero
// pickups in all four paired arms. Keep actual Game.update, AI movement,
// projectile combat, neutral ecology and powerup arbitration; seed only the
// initial open-field geometry and two legitimate heal pickups.
// The rival is ~311 units from the near heal: public-class scoring can
// prefer that heal, whereas sustained observed speed can favor the safe heal.
// A distant player reduces unrelated player-specific aggro in this paired test. No scripted
// winner or manual tank steering. This is still NOT natural-match prevalence.
function contestedArm(seed,hz,classOnly,speedStat,safeDistance=650,rivalStart={x:1180,y:1340}){
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const bots=(g.tanks||[]).filter(t=>t?.ai&&!t.isPlayer);
   assert.ok(bots.length>=2,'requires two real autonomous opponents');
   const [observer,rival]=bots;
   g.tanks=[g.player,observer,rival];
   // Keep the composed game's ID lookup in sync with its reduced research
   // roster. A stale owner in tankById can otherwise affect damage, drones,
   // target selection and attribution even though that tank was removed.
   assert.ok(g.tankById instanceof Map,'requires canonical tank ID registry');
   g.tankById.clear();
   for(const tank of g.tanks){
    assert.ok(tank&&tank.id!=null,'research tank must have an ID');
    assert.ok(!g.tankById.has(tank.id),'research roster IDs must be unique');
    g.tankById.set(tank.id,tank);
   }
   assert.equal(g.tankById.size,g.tanks.length);
   // Do not seed Fair Engagement's contact cache from the test harness.
   // The real Game.update must establish visible contacts itself.
   delete g.__novaFairVisibleTanks;
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash?.clear)g.hash.clear();
   Object.assign(observer,{cls:'guard',x:1000,y:1000,vx:0,vy:0,
    hp:20,maxHp:100,alive:true,spawnShieldT:0,shieldT:0,
    hasteT:0,stampedeT:0,perk:null,gene:null,tier:1,stats:{...observer.stats,speed:0}});
   Object.assign(rival,{cls:'guard',x:rivalStart.x,y:rivalStart.y,vx:0,vy:0,
    hp:20,maxHp:100,alive:true,spawnShieldT:0,shieldT:0,
    hasteT:0,stampedeT:0,perk:null,gene:null,tier:1,stats:{...rival.stats,speed:speedStat}});
   Object.assign(g.player,{x:1900,y:1900,vx:0,vy:0,spawnShieldT:0});
   const rivalInitiallyVisible=!!g.__testFair?.inGameplayViewport(g,observer,rival);
   const observerViewport=g.__testFair?.viewportHalfExtents(g);
   // Preserve the canonical autonomous AI's movement, aim and cadence
   // fields. Replacing ai with {} leaves wanderA undefined, feeds NaN to
   // moveTank, and crashes Living Front's sector accounting on the next tick.
   // Only force a fresh legitimate decision from each existing AI owner.
   assert.ok(observer.ai&&rival.ai,'requires initialized canonical AI state');
   observer.ai.thinkT=0;rival.ai.thinkT=0;
   observer.ai.__v181Think=0;rival.ai.__v181Think=0;
   observer.ai.state='wander';rival.ai.state='wander';
   observer.ai.targetId=-1;rival.ai.targetId=-1;
   g.hasLineOfSight=()=>true;
   g.status='playing';
   const safeX=1000-safeDistance;
   g.powerups=[
    {id:99091,kind:'powerup',type:'heal',x:1400,y:1120,ttl:20,born:g.time},
    {id:99092,kind:'powerup',type:'heal',x:safeX,y:1000,ttl:20,born:g.time}
   ];
   assert.ok(Math.abs(Math.hypot(safeX-observer.x,1000-observer.y)-safeDistance)<1e-9,
    'horizon research must preserve exact spawn-time straight-line distance');
   const initial=JSON.stringify(g.tanks.map(t=>[t.id,t.cls,t.x,t.y,t.hp,t.stats.speed]));
   const arrivals=[],apply=g.applyPowerup;
   g.applyPowerup=function(t,type){
    arrivals.push({who:t===observer?'observer':t===rival?'rival':'player',
     type,at:+g.time.toFixed(3)});
    return apply.apply(this,arguments);
   };
   const update=g.update;
   g.update=function(dt){
    if(classOnly)for(const t of this.tanks||[])
     if(t?.ai&&t.ai.__v181RivalSpeedWitness)
      delete t.ai.__v181RivalSpeedWitness;
    return update.call(this,dt);
   };
   const start=g.time;
   let maxConfirmed=0,maxFast=0,firstChoice=null,firstSafeAt=null;
   let observerDeathAt=null,minObserverHp=observer.hp,firstObserverHealAt=null;
   const planTrace=[];let previousChoice,previousConfirmed=-1,previousThink=Infinity,previousSafeEligible=true;
   for(let i=0;i<Math.round(8*hz)&&g.status==='playing'&&g.player.alive;i++){
    // The ecology's sector grid requires finite entity coordinates. Report
    // the first invalid entity rather than obscuring a fixture failure as an
    // unrelated sectorTick crash. Do not sanitize or alter live simulation.
    for(const [kind,entities] of [['tank',g.tanks],['shape',g.shapes]])
     for(const entity of entities||[])
      if(entity&&entity.hp>0&&(!Number.isFinite(entity.x)||!Number.isFinite(entity.y)))
       assert.fail('nonfinite '+kind+' before tick '+i+': '+JSON.stringify({
        id:entity.id,cls:entity.cls,type:entity.type,x:entity.x,y:entity.y,
        vx:entity.vx,vy:entity.vy,ai:entity.ai&&Object.keys(entity.ai).slice(0,15)}));
    // Pre-update position/HP are closer to the AI planning inputs than
    // the post-update sample, which includes movement, regen and arbitration.
    const preUpdateSafeDist=Math.hypot(safeX-observer.x,1000-observer.y);
    const preUpdateHp=observer.hp,preUpdateMaxHp=observer.maxHp;
    g.update(1/hz);
    minObserverHp=Math.min(minObserverHp,observer.hp);
    if(observerDeathAt===null&&(!observer.alive||observer.hp<=0))
     observerDeathAt=+(g.time-start).toFixed(3);
    if(firstObserverHealAt===null){
     const firstHeal=arrivals.find(a=>a.who==='observer'&&a.type==='heal');
     if(firstHeal)firstObserverHealAt=+(firstHeal.at-start).toFixed(3);
    }
    const witness=observer.ai.__v181RivalSpeedWitness?.[String(rival.id)];
    maxConfirmed=Math.max(maxConfirmed,witness?.confirmed||0);
    maxFast=Math.max(maxFast,witness?.fast||0);
    const choice=observer.ai.__v181Mode==='resource'?observer.ai.__v181ResourceId:null;
    if(firstChoice===null&&choice!=null)firstChoice=choice;
    if(firstSafeAt===null&&choice===99092)firstSafeAt=+(g.time-start).toFixed(3);
    // Sample real post-update decisions, not a second chooseResource call
    // that could mutate route caches or change the autonomous policy.
    const think=Number(observer.ai.__v181Think);
    const planTick=Number.isFinite(think)&&think>previousThink+1/hz*.5;
    const safeEligible=Math.hypot(safeX-observer.x,1000-observer.y)<=760;
    if(planTrace.length<48&&(i===0||choice!==previousChoice||maxConfirmed!==previousConfirmed||safeEligible!==previousSafeEligible||planTick&&g.time-start<=2.2)){
     planTrace.push({at:+(g.time-start).toFixed(3),choice,
      confirmed:witness?.confirmed||0,fast:+(witness?.fast||0).toFixed(2),
      nearDist:+Math.hypot(1400-observer.x,1120-observer.y).toFixed(2),
      safeDist:+Math.hypot(safeX-observer.x,1000-observer.y).toFixed(2),
      // This open-field fixture has no occlusion. Optimistic heal utility
      // excludes route, projectile and rival-contest penalties, so it is an
      // upper bound, not a second call into the stateful resource planner.
      safeEligible,
      preUpdateSafeDist:+preUpdateSafeDist.toFixed(2),
      preUpdateSafeEligible:preUpdateSafeDist<=760,
      preUpdateSafeOptimisticScore:+(2.5*(1-Math.max(0,Math.min(1,
       preUpdateHp/Math.max(1,preUpdateMaxHp))))-preUpdateSafeDist/900).toFixed(3),
      safeOptimisticScore:+(2.5*(1-Math.max(0,Math.min(1,observer.hp/Math.max(1,observer.maxHp))))-
       Math.hypot(safeX-observer.x,1000-observer.y)/900).toFixed(3),
      hp:+observer.hp.toFixed(2),mode:observer.ai.__v181Mode||null,
      planTick});
    }
    previousChoice=choice;previousConfirmed=maxConfirmed;previousThink=think;previousSafeEligible=safeEligible;
   }
   const perf=typeof g.novaPerfSnapshot==='function'?g.novaPerfSnapshot():{};
   return {seed,hz,classOnly,speedStat,safeDistance,rivalInitiallyVisible,
    observerViewport,initial,maxConfirmed,
    maxFast:+maxFast.toFixed(3),firstChoice,firstSafeAt,planTrace,
    elapsed:+(g.time-start).toFixed(3),arrivals,
    observerHp:+observer.hp.toFixed(2),rivalHp:+rival.hp.toFixed(2),
    observerAlive:!!observer.alive,observerDeathAt,firstObserverHealAt,
    minObserverHp:+minObserverHp.toFixed(2),
    observerX:+observer.x.toFixed(2),observerY:+observer.y.toFixed(2),
    remainingHeals:g.powerups.filter(p=>p.type==='heal').length,
    updateMs:+Number(perf.updateMs||0).toFixed(3)};
  }finally{g.destroy();}
 });
}

test('opportunity-conditioned autonomous composed heal pilot reports real pickup arbitration',()=>{
 const results=[];
 for(const hz of [30,60])for(const speedStat of [0,8]){
  const baseline=contestedArm(1517800,hz,true,speedStat);
  const witnessed=contestedArm(1517800,hz,false,speedStat);
  assert.equal(baseline.initial,witnessed.initial,
   'paired autonomous arms must start from identical tank geometry and public stats');
  assert.ok([baseline,witnessed].every(a=>Number.isFinite(a.observerX)&&Number.isFinite(a.observerHp)
   &&Number.isFinite(a.minObserverHp)
   &&(a.observerDeathAt===null||Number.isFinite(a.observerDeathAt))
   &&(a.firstObserverHealAt===null||Number.isFinite(a.firstObserverHealAt))));
  results.push({hz,speedStat,classOnly:baseline,witnessed});
 }
 console.log('COMPOSED_RIVAL_AUTONOMOUS_CONTESTED_HEAL_PILOT '+JSON.stringify(results));
 assert.equal(results.length,4);
});

// Controlled boundary probe: vary only the safe heal's initial distance.
// These are opportunity-conditioned full Game.update arms, not an assertion
// that extending the horizon is good. The actual AI and Terrain owners retain
// their canonical 760-unit limits and their normal bounded reaction timing.
test('full-game critical-heal horizon boundary research at 759/761/850 units',()=>{
 const rows=[];
 for(const hz of [30,60])for(const safeDistance of [759,761,850]){
  const baseline=contestedArm(1517800,hz,true,8,safeDistance);
  const witnessed=contestedArm(1517800,hz,false,8,safeDistance);
  assert.equal(baseline.initial,witnessed.initial,
   'paired horizon arms must share identical initial tank geometry');
  for(const arm of [baseline,witnessed]){
   assert.equal(arm.safeDistance,safeDistance);
   assert.equal(arm.planTrace[0]?.preUpdateSafeEligible,safeDistance<=760,
    'initial AI planning eligibility must actually straddle the 760u cutoff');
   assert.ok(Number.isFinite(arm.observerX)&&Number.isFinite(arm.observerY));
   assert.ok(arm.firstObserverHealAt===null||arm.firstObserverHealAt>=0);
   assert.ok(arm.observerDeathAt===null||arm.observerDeathAt>=0);
  }
  rows.push({hz,safeDistance,classOnly:{firstChoice:baseline.firstChoice,
   firstSafeAt:baseline.firstSafeAt,firstObserverHealAt:baseline.firstObserverHealAt,
   observerDeathAt:baseline.observerDeathAt,observerHp:baseline.observerHp,
   firstPlan:baseline.planTrace[0]||null,
   lastEligiblePlan:baseline.planTrace.filter(p=>p.preUpdateSafeEligible&&p.planTick).at(-1)||null},
   witnessed:{firstChoice:witnessed.firstChoice,firstSafeAt:witnessed.firstSafeAt,
   firstObserverHealAt:witnessed.firstObserverHealAt,observerDeathAt:witnessed.observerDeathAt,
   observerHp:witnessed.observerHp,maxConfirmed:witnessed.maxConfirmed,
   maxFast:witnessed.maxFast,firstPlan:witnessed.planTrace[0]||null,
   lastEligiblePlan:witnessed.planTrace.filter(p=>p.preUpdateSafeEligible&&p.planTick).at(-1)||null}});
 }
 console.log('COMPOSED_RIVAL_CRITICAL_HEAL_HORIZON_BOUNDARY '+JSON.stringify(rows));
 assert.equal(rows.length,6);
});

// Mechanistic falsifier: put the rival ~200u from the contested heal so the
// class-only public-speed contest penalty is already strong enough for the
// 759u safe heal to win on the first ordinary AI plan. At 761u that same
// candidate is excluded before scoring. The rival uses fully autonomous
// steering and real pickup arbitration; no scripted winner or instant plan.
test('full-game heal horizon cutoff can change initial choice against a credible contender',()=>{
 const rows=[];
 for(const hz of [30,60])for(const safeDistance of [759,761]){
  const classOnly=contestedArm(1517800,hz,true,0,safeDistance,{x:1390,y:920});
  const witnessed=contestedArm(1517800,hz,false,0,safeDistance,{x:1390,y:920});
  assert.equal(classOnly.initial,witnessed.initial,
   'same public initial tank geometry across policies');
  for(const arm of [classOnly,witnessed]){
   assert.equal(arm.safeDistance,safeDistance);
   assert.equal(arm.rivalInitiallyVisible,true,
    'credible rival must be within the actual observer gameplay viewport');
   assert.equal(arm.planTrace[0]?.preUpdateSafeEligible,safeDistance<=760,
    'credible-contender arms must straddle the actual first-plan horizon');
   assert.ok(Number.isFinite(arm.observerX)&&Number.isFinite(arm.observerHp));
  }
  rows.push({hz,safeDistance,classOnly:{firstChoice:classOnly.firstChoice,
   firstSafeAt:classOnly.firstSafeAt,firstObserverHealAt:classOnly.firstObserverHealAt,
   observerDeathAt:classOnly.observerDeathAt,observerHp:classOnly.observerHp,
   firstPlan:classOnly.planTrace[0]||null,
   decisions:classOnly.planTrace.filter(p=>p.choice!==null).map(p=>({at:p.at,choice:p.choice,
    safeEligible:p.preUpdateSafeEligible,nearDist:p.nearDist,safeDist:p.safeDist}))},
   witnessed:{firstChoice:witnessed.firstChoice,firstSafeAt:witnessed.firstSafeAt,
   firstObserverHealAt:witnessed.firstObserverHealAt,observerDeathAt:witnessed.observerDeathAt,
   observerHp:witnessed.observerHp,firstPlan:witnessed.planTrace[0]||null,
   decisions:witnessed.planTrace.filter(p=>p.choice!==null).map(p=>({at:p.at,choice:p.choice,
    safeEligible:p.preUpdateSafeEligible,nearDist:p.nearDist,safeDist:p.safeDist}))}});
 }
 console.log('COMPOSED_RIVAL_CREDIBLE_CONTEST_HORIZON '+JSON.stringify(rows));
 assert.equal(rows.length,4);
});
