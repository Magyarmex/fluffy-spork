'use strict';
// Source-executed shipping Game: witnessed speed must derive from real movement,
// not a fabricated tank position. This is not a natural-match win-rate claim.
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
test('real composed moveTank supplies public rival movement witnesses at 30/60 Hz',()=>{
 const reports=[];
 for(const hz of [30,60])reports.push(withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const rival=g.player,bot=g.tanks.find(t=>t!==rival&&t.ai);
   assert.ok(bot,'requires a live AI observer');
   const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
   const h=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
   assert.equal(typeof h.resourceContest,'function');
   g.tanks=[bot,rival];g.__novaFairVisibleTanks=g.tanks;
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.hash?.clear)g.hash.clear();
   Object.assign(bot,{cls:'guard',x:0,y:0,alive:true});
   bot.ai={};Object.assign(rival,{cls:'guard',x:100,y:0,alive:true,
    vx:0,vy:0,spawnShieldT:0,shieldT:0});
   const originalSpeed=g.tankSpeed,originalLOS=g.hasLineOfSight;
   g.hasLineOfSight=()=>true;
   g.tankSpeed=t=>{
    if(t===rival)throw Error('private rival speed queried');
    return originalSpeed.call(g,t);
   };
   const p={id:'heal',type:'heal',x:400,y:0};
   g.time=0;h.resourceContest(g,bot,p,400,classes);
   const dt=1/hz;
   for(let frame=1;frame<=hz;frame++){
    g.time=frame*dt;
    g.moveTank(rival,180,0,dt);
    if(frame%(hz/5)===0)h.resourceContest(g,bot,p,400,classes);
   }
   const w=bot.ai.__v181RivalSpeedWitness?.[String(rival.id)];
   assert.ok(w?.confirmed>=2,'must witness repeated actual movement');
   assert.ok(rival.x>200,'rival must physically move');
   assert.doesNotThrow(()=>JSON.stringify(bot),'witnesses must not corrupt persistence');
   return {hz,confirmed:w.confirmed,x:+rival.x.toFixed(3)};
  }finally{g.destroy();}
 }));
 assert.equal(reports.length,2);
 console.log('COMPOSED_RIVAL_MOTION_WITNESS '+JSON.stringify(reports));
});
