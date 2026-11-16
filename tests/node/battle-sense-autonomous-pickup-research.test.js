'use strict';
// Research-only: Battle Sense + real autonomous AI steering and real powerup
// arbitration, with scripted rival motion. This is NOT a natural combat match.
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function arm(hz,direction,safeLayout='west',classOnly=false,speedStat=8){
 return withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const rival=g.player,bot=g.tanks.find(t=>t!==rival&&t.ai);
   assert.ok(bot&&bot.ai,'requires a real AI tank');
   const ai=g.__testWindow.__novaMakeRequire('')('game/ai');
   assert.equal(typeof ai.updateAI,'function');
   g.tanks=[bot,rival];g.__novaFairVisibleTanks=g.tanks;
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash?.clear)g.hash.clear();
   Object.assign(bot,{cls:'guard',x:1000,y:1000,vx:0,vy:0,angle:0,
    alive:true,hp:20,maxHp:100,spawnShieldT:0,shieldT:0,
    perk:null,gene:null,hasteT:0,stats:{...bot.stats,speed:0}});
   bot.ai.__v181Think=0;bot.ai.__v181BiasW=0;bot.ai.__v181ResourceId=null;
   Object.assign(rival,{cls:'guard',x:direction===1?1120:1280,y:1120,
    vx:0,vy:0,alive:true,hp:20,maxHp:100,
    spawnShieldT:0,shieldT:0,stampedeT:0,hasteT:0,
    perk:null,gene:null,stats:{...rival.stats,speed:speedStat}});
   g.hasLineOfSight=()=>true;g.status='playing';
   const near={id:99001,kind:'powerup',type:'heal',x:1400,y:1120,ttl:20,born:0};
   // Equal initial 650-unit distance, different angle relative to the near-heal chase.
   // South stays inside the 760-unit consideration radius longer than west.
   const safe={id:99002,kind:'powerup',type:'heal',
    x:safeLayout==='south'?1000:350,y:safeLayout==='south'?350:1000,ttl:20,born:0};
   g.powerups=[near,safe];
   const arrivals=[],originalApply=g.applyPowerup;
   g.applyPowerup=function(t,type){
    arrivals.push({who:t===bot?'bot':'rival',type,time:+g.time.toFixed(3),
     x:+t.x.toFixed(1),y:+t.y.toFixed(1)});
    return originalApply.apply(this,arguments);
   };
   const rivalSpeed=g.tankSpeed(rival),dt=1/hz;
   let firstChoice=null,changes=0,prevChoice=null,maxConfirmed=0,maxFast=0,firstSafeAt=null,firstNearAt=null;
   const trace=[];let previousConfirmed=0,previousMode=null,previousResource=null,previousSafeEligible=true,previousNearEligible=true,previousThink=Infinity;
   for(let frame=0;frame<Math.round(12*hz);frame++){
    g.time=frame*dt;
    const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT__;
    g.__novaFairVisibleTanks=(!fair||fair.inGameplayViewport(g,bot,rival))
     ?[bot,rival]:[bot];
    /* Class-only control forgets motion history before every planning tick, without changing public class speed, navigation, pickups or combat code. */
    if(classOnly)delete bot.ai.__v181RivalSpeedWitness;
    ai.updateAI(bot,g,dt); // Actual overlaid AI steering, not a scripted bot vector.
    const witness=bot.ai.__v181RivalSpeedWitness?.[String(rival.id)];
    if(witness){maxConfirmed=Math.max(maxConfirmed,witness.confirmed||0);
     maxFast=Math.max(maxFast,witness.fast||0);}
    const choice=bot.ai.__v181Mode==='resource'?(bot.ai.__v181ResourceId??null):null;
    if(choice===99002&&firstSafeAt===null)firstSafeAt=+g.time.toFixed(3);
    if(choice===99001&&firstNearAt===null)firstNearAt=+g.time.toFixed(3);
    if(firstChoice===null&&choice!==null)firstChoice=choice;
    if(prevChoice!==null&&choice!==prevChoice)changes++;
    // Event-driven, bounded diagnostic: distinguish inference from AI choice and steering.
    // Capture only meaningful transitions plus a low-rate heartbeat, not every frame.
    const confirmed=witness?.confirmed||0,mode=bot.ai.__v181Mode??null,resource=bot.ai.__v181ResourceId??null;
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
    g.moveTank(rival,desiredX*rivalSpeed,desiredY*rivalSpeed,dt);
    g.updatePowerups(dt);
    if(arrivals.some(a=>a.who==='bot'))break;
   }
   return {hz,direction,safeLayout,classOnly,speedStat,firstChoice,changes,firstNearAt,firstSafeAt,
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
 assert.ok(results.every(r=>Number.isFinite(r.botX)&&Number.isFinite(r.botY)));
 assert.ok(results.filter(r=>r.classOnly).every(r=>r.maxConfirmed===0),
  'class-only controls must not accumulate sustained speed evidence');
 assert.ok(results.filter(r=>!r.classOnly).every(r=>r.maxConfirmed>=3),
  'witnessed controls must actually acquire three public movement samples');
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
