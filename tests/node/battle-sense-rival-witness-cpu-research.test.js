'use strict';
// Research-only composed Battle Sense CPU probe. Not a physical Android benchmark,
// not a stable performance golden, and never a gameplay balancing assertion.
const test=require('node:test'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

function median(a){const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)];}
test('composed 13-rival pickup contest reports steady-state witness overhead',()=>{
 const report=withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const bot=g.tanks.find(t=>t?.ai&&!t.isPlayer);
   assert.ok(bot,'requires real composed Game AI');
   const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
   const h=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
   const originalSpeed=g.tankSpeed;
   Object.assign(bot,{id:99000,cls:'guard',x:1000,y:1000,hp:20,maxHp:100,alive:true,
    stats:{...bot.stats,speed:0}});
   bot.ai={};
   const rivals=Array.from({length:13},(_,i)=>({id:99001+i,cls:'guard',
    x:1020+i*12,y:1010,alive:true,stats:{speed:8},vx:0,vy:0}));
   g.tanks=[bot,...rivals];g.__novaFairVisibleTanks=g.tanks;
   g.hasLineOfSight=()=>true;
   const p={id:'heal',type:'heal',x:1450,y:1000};
   let privateCalls=0;
   g.tankSpeed=t=>{if(t!==bot){privateCalls++;throw Error('private rival speed read');}
    return originalSpeed.call(g,t);};
   // Establish all thirteen legitimate witnessed speed histories before timing.
   g.time=0;h.resourceContest(g,bot,p,450,classes);
   for(let i=1;i<=3;i++){
    g.time=i*.2;for(const rival of rivals)rival.x+=32;
    h.resourceContest(g,bot,p,450,classes);
   }
   const witnesses=bot.ai.__v181RivalSpeedWitness;
   assert.equal(Object.keys(witnesses||{}).length,13);
   assert.ok(rivals.every(r=>witnesses[String(r.id)].confirmed===3));
   const witnessAI=bot.ai;
   const N=4000;
   function sample(on){
    bot.ai=on?witnessAI:null;
    const t0=performance.now();
    let sum=0;
    for(let i=0;i<N;i++)sum+=h.resourceContest(g,bot,p,450,classes);
    const ms=performance.now()-t0;
    assert.ok(Number.isFinite(sum)&&Number.isFinite(ms));
    return ms/N*1000; // microseconds per contest, on this CI runner only
   }
   // Warm both paths and alternate order to reduce one-sided JIT/thermal bias.
   sample(false);sample(true);
   const off=[],on=[];
   for(let k=0;k<6;k++){
    if(k%2){on.push(sample(true));off.push(sample(false));}
    else{off.push(sample(false));on.push(sample(true));}
   }
   // More representative paired two-heal strategic selection, including both
   // candidate scans and their shared public rival contacts. Still CI CPU only.
   g.powerups=[p,{id:'safe',type:'heal',x:350,y:1000}];
   const CHOICE_N=1200;
   function sampleChoice(on){
    bot.ai=on?witnessAI:null;
    const t0=performance.now();let checksum=0;
    for(let i=0;i<CHOICE_N;i++)checksum+=(h.chooseResource(g,bot,classes)?.id==='safe'?1:0);
    const us=(performance.now()-t0)/CHOICE_N*1000;
    assert.ok(Number.isFinite(us)&&Number.isFinite(checksum));return us;
   }
   sampleChoice(false);sampleChoice(true);
   const choiceOff=[],choiceOn=[];
   for(let k=0;k<4;k++){
    if(k%2){choiceOn.push(sampleChoice(true));choiceOff.push(sampleChoice(false));}
    else{choiceOff.push(sampleChoice(false));choiceOn.push(sampleChoice(true));}
   }
   // Advance public time and positions between observations. The frozen-time
   // microbench above excludes the actual sample-update path; this companion
   // measures that path without treating CI timing as a device performance gate.
   const movingN=600,movingOff=[],movingOn=[];
   function sampleMoving(on){
    bot.ai=on?witnessAI:null;
    const t0=performance.now();let checksum=0;
    for(let i=0;i<movingN;i++){
     g.time+=.2;
     for(const rival of rivals)rival.x+=30;
     checksum+=h.resourceContest(g,bot,p,450,classes);
    }
    const us=(performance.now()-t0)/movingN*1000;
    assert.ok(Number.isFinite(us)&&Number.isFinite(checksum));
    return us;
   }
   sampleMoving(false);sampleMoving(true);
   for(let k=0;k<4;k++){
    if(k%2){movingOn.push(sampleMoving(true));movingOff.push(sampleMoving(false));}
    else{movingOff.push(sampleMoving(false));movingOn.push(sampleMoving(true));}
   }
   bot.ai=witnessAI;
   assert.equal(privateCalls,0);
   return {rivals:13,iterationsPerArm:N,rounds:6,
    classOnlyMedianUs:+median(off).toFixed(4),
    witnessMedianUs:+median(on).toFixed(4),
    ratio:+(median(on)/Math.max(1e-9,median(off))).toFixed(3),
    twoHealChoiceIterations:CHOICE_N,
    twoHealClassOnlyMedianUs:+median(choiceOff).toFixed(4),
    twoHealWitnessMedianUs:+median(choiceOn).toFixed(4),
    twoHealRatio:+(median(choiceOn)/Math.max(1e-9,median(choiceOff))).toFixed(3),
    movingTimeIterationsPerArm:movingN,
    movingTimeClassOnlyMedianUs:+median(movingOff).toFixed(4),
    movingTimeWitnessMedianUs:+median(movingOn).toFixed(4),
    movingTimeRatio:+(median(movingOn)/Math.max(1e-9,median(movingOff))).toFixed(3),
    privateCalls};
  }finally{g.destroy();}
 });
 console.log('COMPOSED_RIVAL_WITNESS_CPU_RESEARCH '+JSON.stringify(report));
});
