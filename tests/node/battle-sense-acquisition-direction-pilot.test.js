'use strict';
// Research-only paired scripted pickup races through the composed Game's
// movement and actual powerup arbitration. This is NOT autonomous match AI:
// movement follows the pickup selected by Battle Sense, while the rival's
// initial commitment and later turn are deliberately controlled.
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function arm(hz,direction,policy){
 return withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const rival=g.player,bot=g.tanks.find(t=>t!==rival&&t.ai);
   assert.ok(bot,'requires a real AI observer');
   const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
   const h=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
   assert.equal(typeof h.chooseResource,'function');
   g.tanks=[bot,rival];g.__novaFairVisibleTanks=g.tanks;
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash?.clear)g.hash.clear();
   Object.assign(bot,{cls:'guard',x:1000,y:1000,vx:0,vy:0,
    alive:true,hp:20,maxHp:100,spawnShieldT:0,shieldT:0,
    perk:null,hasteT:0,stats:{...bot.stats,speed:0}});
   bot.ai={};
   Object.assign(rival,{cls:'guard',x:direction===1?920:1280,y:1120,
    vx:0,vy:0,alive:true,hp:20,maxHp:100,
    spawnShieldT:0,shieldT:0,stampedeT:0,hasteT:0,
    perk:'speed',stats:{...rival.stats,speed:8}});
   g.hasLineOfSight=()=>true;
   g.status='playing';
   const near={id:99001,kind:'powerup',type:'heal',x:1400,y:1120,ttl:20,born:0};
   const safe={id:99002,kind:'powerup',type:'heal',x:460,y:1000,ttl:20,born:0};
   g.powerups=[near,safe];const arrivals=[];
   const originalApply=g.applyPowerup,originalSpeed=g.tankSpeed;
   g.applyPowerup=function(t,type){arrivals.push({who:t===bot?'bot':'rival',
    type,time:+g.time.toFixed(3),x:+t.x.toFixed(2)});
    return originalApply.apply(this,arguments);};
   const botSpeed=originalSpeed.call(g,bot);
   const rivalSpeed=originalSpeed.call(g,rival);
   let selected=null,firstChoice=null,changes=0,oldChoice=null;
   const dt=1/hz;
   for(let frame=0;frame<Math.round(8*hz);frame++){
    g.time=frame*dt;
    if(frame%Math.round(hz/5)===0){
     const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT__;
     g.__novaFairVisibleTanks=(!fair||fair.inGameplayViewport(g,bot,rival))
      ?[bot,rival]:[bot];
     // The only policy difference is whether this observer may retain
     // legitimate witnessed movement across strategic decisions.
     if(policy==='class')delete bot.ai.__v181RivalSpeedWitness;
     g.tankSpeed=t=>{
      if(t===rival)throw Error('private rival speed read during pickup choice');
      return originalSpeed.call(g,t);
     };
     try{selected=h.chooseResource(g,bot,classes);}
     finally{g.tankSpeed=originalSpeed;}
     const id=selected?.id??null;
     if(firstChoice===null&&id!==null)firstChoice=id;
     if(oldChoice!==null&&id!==oldChoice)changes++;
     oldChoice=id;
    }
    if(selected&&g.powerups.includes(selected)){
     const dx=selected.x-bot.x,dy=selected.y-bot.y,m=Math.hypot(dx,dy)||1;
     g.moveTank(bot,dx/m*botSpeed,dy/m*botSpeed,dt);
    }else g.moveTank(bot,0,0,dt);
    const desiredX=g.time<.7?direction:Math.sign(near.x-rival.x);
    const desiredY=g.time<.7?0:Math.sign(near.y-rival.y);
    g.moveTank(rival,desiredX*rivalSpeed,desiredY*rivalSpeed,dt);
    g.updatePowerups(dt);
    if(arrivals.some(a=>a.who==='bot'))break;
   }
   return {hz,direction,policy,firstChoice,changes,
    botPickup:arrivals.find(a=>a.who==='bot')||null,
    rivalPickup:arrivals.find(a=>a.who==='rival')||null,
    finalBot:{x:+bot.x.toFixed(1),y:+bot.y.toFixed(1)}};
  }finally{g.destroy();}
 });
}

test('paired composed movement and pickup arbitration research at 30/60 Hz',()=>{
 const results=[];
 for(const hz of [30,60])for(const direction of [-1,1])
  for(const policy of ['class','witness'])results.push(arm(hz,direction,policy));
 assert.equal(results.length,8);
 assert.ok(results.every(r=>Number.isFinite(r.finalBot.x)&&Number.isFinite(r.finalBot.y)));
 console.log('COMPOSED_RIVAL_PICKUP_RACE_RESEARCH '+JSON.stringify(results));
 // This is a diagnostic, not a success golden. Acceptance requires comparing
 // real autonomous AI steering, collision damage, health and physical CPU.
});
