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
     for(const rival of rivals)rival.x+=(i%8<4?30:-30);
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

test('composed planning snapshot reports repeated contest CPU savings without a timing gate',()=>{
 const report=withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const bot=g.tanks.find(t=>t?.ai&&!t.isPlayer);
   assert.ok(bot,'requires composed AI');
   const ai=g.__testWindow.__novaMakeRequire('')('game/ai');
   const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
   const h=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
   Object.assign(bot,{id:99000,cls:'guard',x:1000,y:1000,hp:20,maxHp:100,alive:true});
   bot.ai={};
   const rivals=Array.from({length:13},(_,i)=>({id:99001+i,cls:'guard',x:1030+i*10,y:1010,alive:true,hp:100,maxHp:100,vx:0,vy:0,angle:0,stats:{speed:0}}));
   g.tanks=[bot,...rivals];g.__novaFairVisibleTanks=g.tanks;
   g.hasLineOfSight=()=>true;g.powerups=[];g.time=10;g.status='playing';
   ai.updateAI(bot,g,.2);
   const snap=bot.ai.__v181RivalSpeedSnapshot;
   assert.ok(snap?.speeds.some(s=>s?.target===rivals[0]),'composed AI must create a valid snapshot');
   /* Benchmark the instant after strategic planning, before the old movement owner runs. */
   bot.x=snap.ownerX;bot.y=snap.ownerY;
   const p={id:'heal',type:'heal',x:1450,y:1000};
   const N=3000;
   function measure(cached){
    if(cached)bot.ai.__v181RivalSpeedSnapshot=snap;
    else delete bot.ai.__v181RivalSpeedSnapshot;
    const t0=performance.now();let checksum=0;
    for(let i=0;i<N;i++)checksum+=h.resourceContest(g,bot,p,450,classes);
    assert.ok(Number.isFinite(checksum));return (performance.now()-t0)/N*1000;
   }
   measure(false);measure(true);
   const uncached=[],cached=[];
   for(let k=0;k<5;k++){
    if(k%2){cached.push(measure(true));uncached.push(measure(false));}
    else{uncached.push(measure(false));cached.push(measure(true));}
   }
   /* Two-heal selection measures actual repeated contender work, but still excludes snapshot creation and natural combat. */
   g.powerups=[p,{id:'safe',type:'heal',x:350,y:1000}];
   const CHOICE_N=1000;
   function choice(cached){
    if(cached)bot.ai.__v181RivalSpeedSnapshot=snap;
    else delete bot.ai.__v181RivalSpeedSnapshot;
    const t0=performance.now();let checksum=0;
    for(let i=0;i<CHOICE_N;i++)checksum+=(h.chooseResource(g,bot,classes)?.id==='safe'?1:0);
    assert.ok(Number.isFinite(checksum));return {us:(performance.now()-t0)/CHOICE_N*1000,checksum};
   }
   const offChoice=[],onChoice=[];
   choice(false);choice(true);
   for(let k=0;k<6;k++){
    /* Alternate order: the cached arm must not always inherit the second measurement's JIT/thermal state. */
    const first=choice(k%2===1),second=choice(k%2===0);
    const off=k%2===1?second:first,on=k%2===1?first:second;
    assert.equal(off.checksum,on.checksum,'snapshot cannot change the selected healing pickup');
    offChoice.push(off.us);onChoice.push(on.us);
   }
   return {rivals:13,iterationsPerArm:N,uncachedMedianUs:+median(uncached).toFixed(3),
    cachedMedianUs:+median(cached).toFixed(3),
    ratio:+(median(cached)/Math.max(1e-9,median(uncached))).toFixed(3),
    twoHealIterations:CHOICE_N,twoHealUncachedMedianUs:+median(offChoice).toFixed(3),
    twoHealCachedMedianUs:+median(onChoice).toFixed(3),
    twoHealRatio:+(median(onChoice)/Math.max(1e-9,median(offChoice))).toFixed(3)};
  }finally{g.destroy();}
 });
 console.log('COMPOSED_RIVAL_SNAPSHOT_CPU_RESEARCH '+JSON.stringify(report));
});
