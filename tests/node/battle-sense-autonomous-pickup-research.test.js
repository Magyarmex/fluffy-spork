'use strict';
// Research-only: Battle Sense + real autonomous AI steering and real powerup
// arbitration, with scripted rival motion. This is NOT a natural combat match.
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function arm(hz,direction,policy){
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
    perk:null,gene:null,stats:{...rival.stats,speed:8}});
   g.hasLineOfSight=()=>true;g.status='playing';
   const near={id:99001,kind:'powerup',type:'heal',x:1400,y:1120,ttl:20,born:0};
   const safe={id:99002,kind:'powerup',type:'heal',x:350,y:1000,ttl:20,born:0};
   g.powerups=[near,safe];
   const arrivals=[],originalApply=g.applyPowerup;
   g.applyPowerup=function(t,type){
    arrivals.push({who:t===bot?'bot':'rival',type,time:+g.time.toFixed(3),
     x:+t.x.toFixed(1),y:+t.y.toFixed(1)});
    return originalApply.apply(this,arguments);
   };
   const rivalSpeed=g.tankSpeed(rival),dt=1/hz;
   let firstChoice=null,changes=0,prevChoice=null,maxConfirmed=0,maxFast=0,firstSafeAt=null,firstNearAt=null;
   for(let frame=0;frame<Math.round(12*hz);frame++){
    g.time=frame*dt;
    const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT__;
    g.__novaFairVisibleTanks=(!fair||fair.inGameplayViewport(g,bot,rival))
     ?[bot,rival]:[bot];
    if(policy==='class')delete bot.ai.__v181RivalSpeedWitness;
    ai.updateAI(bot,g,dt); // Actual overlaid AI steering, not a scripted bot vector.
    const witness=bot.ai.__v181RivalSpeedWitness?.[String(rival.id)];
    if(witness){maxConfirmed=Math.max(maxConfirmed,witness.confirmed||0);
     maxFast=Math.max(maxFast,witness.fast||0);}
    const choice=bot.ai.__v181Mode==='resource'?(bot.ai.__v181ResourceId??null):null;
    if(choice===99002&&firstSafeAt===null)firstSafeAt=+g.time.toFixed(3);
    if(choice===99001&&firstNearAt===null)firstNearAt=+g.time.toFixed(3);
    if(firstChoice===null&&choice!==null)firstChoice=choice;
    if(prevChoice!==null&&choice!==prevChoice)changes++;
    prevChoice=choice;
    const desiredX=g.time<.7?direction:Math.sign(near.x-rival.x);
    const desiredY=g.time<.7?0:Math.sign(near.y-rival.y);
    g.moveTank(rival,desiredX*rivalSpeed,desiredY*rivalSpeed,dt);
    g.updatePowerups(dt);
    if(arrivals.some(a=>a.who==='bot'))break;
   }
   return {hz,direction,policy,firstChoice,changes,firstNearAt,firstSafeAt,
    maxConfirmed,maxFast:+maxFast.toFixed(3),
    botPickup:arrivals.find(a=>a.who==='bot')||null,
    rivalPickup:arrivals.find(a=>a.who==='rival')||null,
    botX:+bot.x.toFixed(1),botY:+bot.y.toFixed(1)};
  }finally{g.destroy();}
 });
}
test('paired composed autonomous AI pickup steering research at 30/60 Hz',()=>{
 const results=[];
 for(const hz of [30,60])for(const direction of [-1,1])
  for(const policy of ['class','witness'])results.push(arm(hz,direction,policy));
 assert.equal(results.length,8);
 assert.ok(results.every(r=>Number.isFinite(r.botX)&&Number.isFinite(r.botY)));
 console.log('COMPOSED_RIVAL_AUTONOMOUS_PICKUP_RESEARCH '+JSON.stringify(results));
 // Diagnostic only: combat, terrain and actual player input are not modeled.
});
