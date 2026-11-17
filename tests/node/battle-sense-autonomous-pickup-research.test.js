'use strict';
// Research-only: Battle Sense + real autonomous AI steering and real powerup
// arbitration, with scripted rival motion. This is NOT a natural combat match.
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function arm(hz,direction,safeLayout='west',classOnly=false,speedStat=8,rivalY=1120,preObserve=false,forcePlanAtSpawn=false){
 return withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const rival=g.player,bot=g.tanks.find(t=>t!==rival&&t.ai);
   assert.ok(bot&&bot.ai,'requires a real AI tank');
   const ai=g.__testWindow.__novaMakeRequire('')('game/ai');
   assert.equal(typeof ai.updateAI,'function');
   g.tanks=[bot,rival];g.__novaFairVisibleTanks=g.tanks;
   // The actual engine also resolves targets through tankById. A reduced
   // research roster must not leave removed tanks available as ghost targets.
   assert.ok(g.tankById instanceof Map,'requires canonical tank ID registry');
   g.tankById.clear();
   for(const tank of g.tanks){
    assert.ok(tank?.id!=null&&!g.tankById.has(tank.id),'unique research tank ID');
    g.tankById.set(tank.id,tank);
   }
   assert.equal(g.tankById.size,2);
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash?.clear)g.hash.clear();
   Object.assign(bot,{cls:'guard',x:1000,y:1000,vx:0,vy:0,angle:0,
    alive:true,hp:20,maxHp:100,spawnShieldT:0,shieldT:0,
    perk:null,gene:null,hasteT:0,stats:{...bot.stats,speed:0}});
   bot.ai.__v181Think=0;bot.ai.__v181BiasW=0;bot.ai.__v181ResourceId=null;
   Object.assign(rival,{cls:'guard',x:direction===1?1120:1280,y:rivalY,
    vx:0,vy:0,alive:true,hp:20,maxHp:100,
    spawnShieldT:0,shieldT:0,stampedeT:0,hasteT:0,
    perk:null,gene:null,stats:{...rival.stats,speed:speedStat}});
   g.hasLineOfSight=()=>true;g.status='playing';
   const near={id:99001,kind:'powerup',type:'heal',x:1400,y:1120,ttl:20,born:0};
   // Equal initial 650-unit distance, different angle relative to the near-heal chase.
   // South stays inside the 760-unit consideration radius longer than west.
   const safe={id:99002,kind:'powerup',type:'heal',
    x:safeLayout==='south'?1000:350,y:safeLayout==='south'?350:1000,ttl:20,born:0};
   g.powerups=preObserve?[]:[near,safe];
   const arrivals=[],originalApply=g.applyPowerup;
   g.applyPowerup=function(t,type){
    arrivals.push({who:t===bot?'bot':'rival',type,time:+g.time.toFixed(3),
     x:+t.x.toFixed(1),y:+t.y.toFixed(1)});
    return originalApply.apply(this,arguments);
   };
   const rivalSpeed=g.tankSpeed(rival),dt=1/hz;
   let firstChoice=null,changes=0,prevChoice=null,maxConfirmed=0,maxFast=0,firstSafeAt=null,firstNearAt=null,confirmedAtSpawn=null,fastAtSpawn=null,spawnSnapshot=null;
   const trace=[];let previousConfirmed=0,previousMode=null,previousResource=null,previousSafeEligible=true,previousNearEligible=true,previousThink=Infinity;
   for(let frame=0;frame<Math.round(12*hz);frame++){
    g.time=frame*dt;
    // In the delayed-spawn causal pair, run an identical observation prelude
    // for both policies, then remove only the class-only policy's witness at
    // spawn. This prevents different pre-spawn combat steering from changing
    // tank geometry and masquerading as an information advantage.
    if(classOnly&&(!preObserve||frame>=hz))delete bot.ai.__v181RivalSpeedWitness;
    // Let real public rival movement be witnessed before a delayed pickup spawn.
    // This tests prior observation without granting hidden speed; both arms share the same prelude.
    if(preObserve&&frame===hz){
     const prior=bot.ai.__v181RivalSpeedWitness?.[String(rival.id)];
     confirmedAtSpawn=prior?.confirmed||0;
     fastAtSpawn=+(prior?.fast||0).toFixed(3);
     const safeDist=Math.hypot(safe.x-bot.x,safe.y-bot.y);
     // Preserve exact floating-point geometry for causal equality, rather
     // than rounding away a small but tactically decisive eligibility shift.
     spawnSnapshot={botX:bot.x,botY:bot.y,
      rivalX:rival.x,rivalY:rival.y,
      safeDist,nearDist:Math.hypot(near.x-bot.x,near.y-bot.y),
      safeEligible:safeDist<=760,
      nextThink:bot.ai.__v181Think,mode:bot.ai.__v181Mode??null,
      // Direct AI steering does not advance the whole projectile simulation.
      // Record any retained bullets and their read-only lane-risk effect so
      // the scripted fixture cannot silently masquerade as full Game.update.
      bulletCount:g.bullets.length,
      nearLaneRisk:g.__testWindow.__NOVA_BATTLE_SENSE_TEST__.laneRisk(g,near.x,near.y,bot.id,bot),
      safeLaneRisk:g.__testWindow.__NOVA_BATTLE_SENSE_TEST__.laneRisk(g,safe.x,safe.y,bot.id,bot)};
     g.powerups=[near,safe];
     // Research intervention: only the timing of the first pickup-aware
     // strategic plan changes; no tank position, speed or pickup is edited.
     if(forcePlanAtSpawn)bot.ai.__v181Think=0;
    }
    const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT__;
    g.__novaFairVisibleTanks=(!fair||fair.inGameplayViewport(g,bot,rival))
     ?[bot,rival]:[bot];
    /* Class-only control forgets motion history before every planning tick, without changing public class speed, navigation, pickups or combat code. */
    ai.updateAI(bot,g,dt); // Actual overlaid AI steering, not a scripted bot vector.
    const witness=bot.ai.__v181RivalSpeedWitness?.[String(rival.id)];
    // Pre-spawn observation is shared setup, not class-only policy evidence.
    if(witness&&!classOnly){maxConfirmed=Math.max(maxConfirmed,witness.confirmed||0);
     maxFast=Math.max(maxFast,witness.fast||0);}
    const choice=bot.ai.__v181Mode==='resource'?(bot.ai.__v181ResourceId??null):null;
    if(choice===99002&&firstSafeAt===null)firstSafeAt=+g.time.toFixed(3);
    if(choice===99001&&firstNearAt===null)firstNearAt=+g.time.toFixed(3);
    if(firstChoice===null&&choice!==null)firstChoice=choice;
    if(prevChoice!==null&&choice!==prevChoice)changes++;
    // Event-driven, bounded diagnostic: distinguish inference from AI choice and steering.
    // Capture only meaningful transitions plus a low-rate heartbeat, not every frame.
    const confirmed=witness?.confirmed||0,mode=bot.ai.__v181Mode??null,resource=mode==='resource'?(bot.ai.__v181ResourceId??null):null;
    const currentThink=bot.ai.__v181Think||0;
    const planTick=frame===0||currentThink>previousThink+dt*.5;
    const safeEligible=Math.hypot(safe.x-bot.x,safe.y-bot.y)<=760;
    const nearEligible=Math.hypot(near.x-bot.x,near.y-bot.y)<=760;
    if(trace.length<80&&(confirmed!==previousConfirmed||mode!==previousMode||resource!==previousResource||safeEligible!==previousSafeEligible||nearEligible!==previousNearEligible||(planTick&&g.time<=2.2)||frame%Math.max(1,Math.round(hz/2))===0)){
     trace.push({at:+g.time.toFixed(3),confirmed,fast:+(witness?.fast||0).toFixed(2),mode,resource,
      botX:+bot.x.toFixed(1),botY:+bot.y.toFixed(1),rivalX:+rival.x.toFixed(1),
      safeDist:+Math.hypot(safe.x-bot.x,safe.y-bot.y).toFixed(1),
      nearDist:+Math.hypot(near.x-bot.x,near.y-bot.y).toFixed(1),
      safeEligible,nearEligible,planTick,
      nextThink:+(bot.ai.__v181Think||0).toFixed(3),
      powerups:g.powerups.map(p=>p.id)});
    }
    previousConfirmed=confirmed;previousMode=mode;previousResource=resource;
    previousSafeEligible=safeEligible;previousNearEligible=nearEligible;previousThink=currentThink;
    prevChoice=choice;
    const desiredX=g.time<.7?direction:Math.sign(near.x-rival.x);
    const desiredY=g.time<.7?0:Math.sign(near.y-rival.y);
    // The real movement owner accepts velocity components, not a normalized stick.
    // Normalize diagonal scripted pursuit so a baseline rival cannot move at
    // sqrt(2) times its legal speed and masquerade as a witnessed upgrade.
    const desiredLength=Math.hypot(desiredX,desiredY)||1;
    g.moveTank(rival,desiredX/desiredLength*rivalSpeed,desiredY/desiredLength*rivalSpeed,dt);
    assert.ok(Math.hypot(rival.vx||0,rival.vy||0)<=rivalSpeed+1e-5,
     'scripted rival cannot exceed its legal tankSpeed by moving diagonally');
    g.updatePowerups(dt);
    if(arrivals.some(a=>a.who==='bot'))break;
   }
   return {hz,direction,safeLayout,classOnly,speedStat,rivalY,preObserve,forcePlanAtSpawn,confirmedAtSpawn,fastAtSpawn,spawnSnapshot,firstChoice,changes,firstNearAt,firstSafeAt,
    maxConfirmed,maxFast:+maxFast.toFixed(3),
    botPickup:arrivals.find(a=>a.who==='bot')||null,
    rivalPickup:arrivals.find(a=>a.who==='rival')||null,
    botX:+bot.x.toFixed(1),botY:+bot.y.toFixed(1),trace};
  }finally{g.destroy();}
 });
}
// Current Battle Sense already carries fractional planning time, and now
// samples rival movement before pickup scoring. The old research-only carry
// intervention and class-only reset-after-update were no longer valid controls.
test('composed autonomous witnessed-rival pickup steering at 30/60 Hz',()=>{
 const results=[];
 for(const hz of [30,60])for(const direction of [-1,1])
  for(const safeLayout of ['west','south'])for(const speedStat of [0,8])
   for(const classOnly of [true,false])
    results.push(arm(hz,direction,safeLayout,classOnly,speedStat));
 assert.equal(results.length,32);
 // The main 32 arms are straight-line (rival y equals near-heal y).
 // Explicitly exercise the diagonal command that exposed the latent harness
 // overspeed risk, at both frame rates and without a private speed upgrade.
 const diagonal=[arm(30,1,'west',false,0,1080),arm(60,1,'west',false,0,1080)];
 assert.ok(diagonal.every(r=>r.maxConfirmed>=3),
  'diagonal controls must acquire three real visible movement observations');
 assert.ok(diagonal.every(r=>r.maxFast<=124*1.001),
  'diagonal baseline movement must never certify an illegal speed upgrade');
 console.log('COMPOSED_RIVAL_DIAGONAL_NEGATIVE_CONTROLS '+JSON.stringify(diagonal.map(({trace,...summary})=>summary)));
 assert.ok(results.every(r=>Number.isFinite(r.botX)&&Number.isFinite(r.botY)));
 assert.ok(results.filter(r=>r.classOnly).every(r=>r.maxConfirmed===0),
  'class-only controls must not accumulate sustained speed evidence');
 assert.ok(results.filter(r=>!r.classOnly).every(r=>r.maxConfirmed>=3),
  'witnessed controls must actually acquire three public movement samples');
 assert.ok(results.filter(r=>!r.classOnly&&r.speedStat===0).every(r=>r.maxFast<=124*1.001),
  'baseline-speed negative controls must not fabricate a witnessed upgrade');
 for(const result of results)console.log('COMPOSED_RIVAL_AUTONOMOUS_PICKUP_ARM '+JSON.stringify(result));
 const negativeControls=[];
 for(const r of results.filter(x=>x.speedStat===0&&x.classOnly)){
  const witnessed=results.find(x=>x.speedStat===0&&!x.classOnly&&x.hz===r.hz&&x.direction===r.direction&&x.safeLayout===r.safeLayout);
  negativeControls.push({hz:r.hz,direction:r.direction,safeLayout:r.safeLayout,
   classOnlyPickup:r.botPickup?.time??null,witnessedPickup:witnessed.botPickup?.time??null,
   classOnlyFirstChoice:r.firstChoice,witnessedFirstChoice:witnessed.firstChoice});
 }
 console.log('COMPOSED_RIVAL_BASE_SPEED_NEGATIVE_CONTROLS '+JSON.stringify(negativeControls));
 console.log('COMPOSED_RIVAL_AUTONOMOUS_PICKUP_RESEARCH '+JSON.stringify(results.map(({trace,...summary})=>summary)));
 // This is still scripted rival motion, not a natural combat survival trial.
});

test('pre-observation versus simultaneous heal spawn: autonomous matched pairs',()=>{
 const results=[];
 for(const hz of [30,60])for(const preObserve of [false,true])
  for(const classOnly of [true,false])
   results.push(arm(hz,1,'west',classOnly,8,1120,preObserve));
 assert.equal(results.length,8);
 assert.ok(results.filter(r=>!r.classOnly).every(r=>r.maxConfirmed>=3),
  'witnessed policy must obtain legitimate public movement samples in both spawn schedules');
 assert.ok(results.filter(r=>r.preObserve&&!r.classOnly).every(r=>r.confirmedAtSpawn>=3&&r.fastAtSpawn>124),
  'pre-observed fast rivals must have certified public acceleration before the heal spawn');
 assert.ok(results.filter(r=>r.preObserve&&r.classOnly).every(r=>r.confirmedAtSpawn===0),
  'pre-observed class-only controls must have no movement certification at spawn');
 assert.ok(results.filter(r=>r.classOnly).every(r=>r.maxConfirmed===0),
  'class-only controls cannot retain movement witnesses');
 // Both delayed-spawn policies must reach the same physical world state before
 // the pickups exist. Otherwise any apparent benefit could come from different
 // starting geometry rather than legitimate prior observation of rival speed.
 for(const hz of [30,60]){
  const baseline=results.find(r=>r.hz===hz&&r.preObserve&&r.classOnly);
  const witnessed=results.find(r=>r.hz===hz&&r.preObserve&&!r.classOnly);
  assert.deepEqual(witnessed.spawnSnapshot,baseline.spawnSnapshot,
   'pre-observation controls must share exact spawn-time tank/pickup geometry');
  assert.equal(baseline.confirmedAtSpawn,0);
  assert.ok(witnessed.confirmedAtSpawn>=3&&witnessed.fastAtSpawn>124);
  console.log('COMPOSED_RIVAL_MATCHED_SPAWN_CAUSAL_PAIR '+JSON.stringify({hz,
   spawnSnapshot:witnessed.spawnSnapshot,
   // Only the near-spawn decision window is needed to distinguish a late
   // planning tick from a rival-speed scoring problem.
   classOnlyEarlyTrace:baseline.trace.filter(p=>p.at>=.9&&p.at<=2.2).slice(0,18),
   witnessedEarlyTrace:witnessed.trace.filter(p=>p.at>=.9&&p.at<=2.2).slice(0,18),
   classOnly:{firstChoice:baseline.firstChoice,firstSafeAt:baseline.firstSafeAt,
    botPickup:baseline.botPickup,firstNearAt:baseline.firstNearAt},
   witnessed:{firstChoice:witnessed.firstChoice,firstSafeAt:witnessed.firstSafeAt,
    botPickup:witnessed.botPickup,firstNearAt:witnessed.firstNearAt}}));
 }
 for(const r of results)assert.ok(Number.isFinite(r.botX)&&Number.isFinite(r.botY));
 console.log('COMPOSED_RIVAL_PREOBSERVATION_RESEARCH '+JSON.stringify(results.map(({trace,...summary})=>summary)));
 // Exploratory: do not assert a win before paired gameplay outcomes support it.
});

// Research-only timing intervention: does an immediate pickup-aware plan at
// the same legitimate spawn geometry rescue a safer-heal decision? This is
// not a proposed gameplay cadence change and does not simulate human fun.
test('matched delayed-spawn heal choice isolates first planning-tick latency',()=>{
 const results=[];
 for(const hz of [30,60])for(const forcePlanAtSpawn of [false,true])
  for(const classOnly of [true,false])
   results.push(arm(hz,1,'west',classOnly,8,1120,true,forcePlanAtSpawn));
 for(const hz of [30,60]){
  const group=results.filter(r=>r.hz===hz);
  for(const r of group){
   assert.deepEqual(r.spawnSnapshot,group[0].spawnSnapshot,
    'planning-tick intervention must not alter spawn geometry or prior AI timer');
   assert.ok(Number.isFinite(r.botX)&&Number.isFinite(r.botY));
  }
  assert.ok(group.filter(r=>!r.classOnly).every(r=>r.confirmedAtSpawn>=3&&r.fastAtSpawn>124));
  assert.ok(group.filter(r=>r.classOnly).every(r=>r.confirmedAtSpawn===0));
 }
 console.log('COMPOSED_RIVAL_SPAWN_PLAN_LATENCY_RESEARCH '+JSON.stringify(results.map(({trace,...summary})=>summary)));
 // Report negative outcomes too. Do not assert an acquisition advantage.
});
