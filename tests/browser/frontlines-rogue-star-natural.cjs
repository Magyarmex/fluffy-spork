'use strict';
/* Research-only natural Rogue Star exposure audit in the exact materialized
 * browser game. No forced age, invulnerability, spawning, Star relocation,
 * ecology manipulation, or Director override. A scripted visible-information
 * Scout may die; early death is right-censoring, not a zero-event proof. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const layouts=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'];
const layout=Number(process.env.NOVA_LAYOUT_INDEX||0);
const seed=Number(process.env.NOVA_SEED_INDEX||0);
assert.ok(Number.isInteger(layout)&&layout>=0&&layout<3);
assert.ok(Number.isInteger(seed)&&seed>=0&&seed<3);
const seconds=300,dt=1/30,chunk=450;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.addScriptTag({url:'/tests/browser/frontlines-public-pilot.js'});
  await page.addScriptTag({url:'/tests/browser/frontlines-visible-defense.js'});
  await page.evaluate(({terrainSeed,gameSeed})=>{
   let state=gameSeed>>>0;
   const seeded=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const spawn=Game.prototype.spawnPlayer,spawnAI=Game.prototype.spawnAITank,
    update=Game.prototype.update,start=Game.prototype.start;
   Game.prototype.spawnPlayer=function(){
    if(this.__novaTerrain)return spawn.apply(this,arguments);
    const oldNow=Date.now,oldRandom=Math.random;let first=true;
    this.__novaInitRandomRestore=oldRandom;this.__novaInitSpawnCount=0;
    Date.now=()=>0;
    Math.random=()=>first?(first=false,terrainSeed/0x7fffffff):seeded();
    try{return spawn.apply(this,arguments);}
    finally{Date.now=oldNow;Math.random=seeded;}
   };
   Game.prototype.spawnAITank=function(){
    const result=spawnAI.apply(this,arguments);
    if(this.__novaInitRandomRestore){
     this.__novaInitSpawnCount++;
     if(this.__novaInitSpawnCount>=8){
      Math.random=this.__novaInitRandomRestore;
      delete this.__novaInitRandomRestore;delete this.__novaInitSpawnCount;
     }
    }
    return result;
   };
   Game.prototype.start=function(){
    window.__novaStarNaturalGame=this;this.paused=true;
    const oldRandom=Math.random,oldNow=Date.now;
    Math.random=seeded;Date.now=()=>0;
    try{return start.apply(this,arguments);}
    finally{Math.random=oldRandom;Date.now=oldNow;}
   };
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaStarNaturalGame=this;
    return update.apply(this,arguments);
   };
  },{terrainSeed:layout,gameSeed:(0x1d4a3f21^Math.imul(seed,0x9e3779b9))>>>0});
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaStarNaturalGame?.status==='playing'&&
   !!window.__novaStarNaturalGame.__lfState,{timeout:30000});
  const initial=await page.evaluate(({layout,seed})=>{
   const g=window.__novaStarNaturalGame;
   g.setPaused(true);
   if(g.raf){cancelAnimationFrame(g.raf);g.raf=0;}
   g.tanks.sort((a,b)=>Number(a.id)-Number(b.id));
   if(g.__novaBattlefield?.name!==['CROSSFIRE','SPLIT HORIZON','FOUR GATES'][layout])
    throw Error('uncontrolled layout: '+g.__novaBattlefield?.name);
   if(g.tanks.filter(t=>t.ai).length<8)throw Error('canonical rival population missing');
   const p=g.player,LF=window.__NOVA_LIVING_FRONT_INTERNAL__,
    T=window.__NOVA_LIVING_FRONT_TEST__,F=window.__NOVA_FAIR_ENGAGEMENT_TEST__,
    helper=window.__novaResearchPublicPilot,defense=window.__novaResearchVisibleDefense;
   if(!p||p.cls!=='scout'||!LF||!T||!F||!helper||!defense)
    throw Error('canonical Scout / Director / Fair Engagement / public pilot missing');
   g.__novaTrialRng=(0x7d27e91b^Math.imul(seed,0x85ebca6b))>>>0;
   g.input.mouseActive=false;g.input.autofire=true;g.input.firing=false;
   const wander=()=>({x:Math.cos(g.time*.29),y:Math.sin(g.time*.29)});
   g.input.moveVec=()=>{
    const v=helper.moveTowardPublicBloom(g,p,LF)||wander();
    return defense.dodgeVisibleProjectile(g,p,F,v)||v;
   };
   g.input.aimVec=()=>defense.aimAtVisibleHostile(g,p,F)||
    helper.aimAtVisibleNeutral(g,p,LF,F)||
    {x:Math.cos(g.time*.73),y:Math.sin(g.time*.73)};
   const audit={ticks:0,after72:0,fresh:0,freshAfter72:0,
    quietFreshAfter72:0,candidates:0,announcements:0,
    firstCandidate:null,firstAnnouncement:null,events:[],
    /* Counterfactual is read-only: a candidate at an actual Director tick,
     * not an independent event or a simulated gameplay intervention. */
    counterfactual:{},maxQuietWithFreshAfter72:0,
    starGenerations:[],seenStarIds:[],blocked:{
     noStar:0,staleStar:0,early:0,activeSignal:0,signalCooldown:0,
     starCooldown:0,notQuiet:0,bloom:0,migrationHeat:0,other:0}};
   g.__novaStarAudit=audit;
   const oldDirector=LF.directorTick;
   LF.directorTick=function(world,st){
    if(world!==g)return oldDirector.apply(this,arguments);
    const now=world.time||0,stars=(world.shapes||[]).filter(s=>s?.type==='star'&&s.hp>0),
     fresh=stars.filter(s=>!s.__lfPublicAnnounced&&Number.isFinite(s.__lfStarBorn)&&
      now-s.__lfStarBorn>=0&&now-s.__lfStarBorn<=8);
    const candidate=T.directorDecision(st,{enabled:st.directorEnabled,now,
     hasStar:stars.length>0,adoptStarId:fresh.length?fresh[fresh.length-1].id:null});
    audit.ticks++;if(now>72)audit.after72++;
    if(fresh.length){audit.fresh++;if(now>72){
     audit.freshAfter72++;
     audit.maxQuietWithFreshAfter72=Math.max(audit.maxQuietWithFreshAfter72,
      now-st.lastMeaningfulAt);
     if(now-st.lastMeaningfulAt>31)audit.quietFreshAfter72++;
    }}
    const baseReady=now>72&&(!st.signal||now>=st.signal.until)&&
     now-st.lastSignalAt>=8&&st.cooldowns.star<=0&&
     T.bloomCandidate(st)<0&&st.migrationHeat<3;
    if(baseReady)for(const maxAge of [8,12,16]){
     const adoptable=stars.some(s=>!s.__lfPublicAnnounced&&
      Number.isFinite(s.__lfStarBorn)&&now-s.__lfStarBorn>=0&&
      now-s.__lfStarBorn<=maxAge);
     if(!adoptable)continue;
     for(const quiet of [12,16,20,24,28,31]){
      if(now-st.lastMeaningfulAt<=quiet)continue;
      const key='quiet'+quiet+'-age'+maxAge;
      const times=audit.counterfactual[key]||(audit.counterfactual[key]=[]);
      if(times.length<128)times.push(+now.toFixed(2));
     }
    }
    for(const s of stars)if(!audit.seenStarIds.includes(s.id)){
     audit.seenStarIds.push(s.id);
     audit.starGenerations.push({id:s.id,born:+(s.__lfStarBorn||0).toFixed(2)});
    }
    if(candidate?.type==='ROGUE STAR'){
     audit.candidates++;
     if(audit.firstCandidate===null)audit.firstCandidate=+now.toFixed(2);
    }else{
     let reason='other';
     if(now<=72)reason='early';
     else if(!stars.length)reason='noStar';
     else if(!fresh.length)reason='staleStar';
     else if(st.signal&&now<st.signal.until)reason='activeSignal';
     else if(now-st.lastSignalAt<8)reason='signalCooldown';
     else if(st.cooldowns.star>0)reason='starCooldown';
     else if(now-st.lastMeaningfulAt<=31)reason='notQuiet';
     else if(T.bloomCandidate(st)>=0)reason='bloom';
     else if(st.migrationHeat>=3)reason='migrationHeat';
     audit.blocked[reason]++;
    }
    const before=st.stats?.starAnnouncements||0;
    const result=oldDirector.apply(this,arguments);
    if((st.stats?.starAnnouncements||0)>before){
     audit.announcements++;
     if(audit.firstAnnouncement===null)audit.firstAnnouncement=+now.toFixed(2);
     audit.events.push({time:+now.toFixed(2),id:st.signal?.starId,
      reported:{x:st.signal?.x,y:st.signal?.y},
      starCount:world.shapes.filter(s=>s?.type==='star'&&s.hp>0).length});
    }
    return result;
   };
   return{layout:g.__novaBattlefield.name,seed,initialStars:g.shapes.filter(s=>s.type==='star'&&s.hp>0).length,
    initialBots:g.tanks.filter(t=>t.ai).length};
  },{layout,seed});
  for(let i=0;i<Math.ceil(seconds/dt/chunk);i++){
   const progress=await page.evaluate(({steps,dt})=>{
    const g=window.__novaStarNaturalGame,oldRandom=Math.random;
    Math.random=()=>{
     let state=g.__novaTrialRng>>>0;
     state^=state<<13;state^=state>>>17;state^=state<<5;
     g.__novaTrialRng=state>>>0;return g.__novaTrialRng/4294967296;
    };
    try{for(let j=0;j<steps&&g.status!=='dead';j++)g.update(dt);}
    finally{Math.random=oldRandom;}
    return{time:g.time,status:g.status};
   },{steps:Math.min(chunk,Math.ceil(seconds/dt)-i*chunk),dt});
   if(progress.status==='dead')break;
  }
  const result=await page.evaluate(()=>{
   const g=window.__novaStarNaturalGame,st=g.__lfState;
   return{time:+g.time.toFixed(3),status:g.status,
    pilotAlive:!!g.player?.alive,stats:{...st.stats},audit:g.__novaStarAudit,
    directorEnabled:st.directorEnabled,errors:[]};
  });
  assert.equal(initial.initialStars,1,'natural one-Star baseline must be preserved');
  assert.ok(result.audit.ticks>0,'real Director must tick');
  assert.equal(result.audit.announcements,result.stats.starAnnouncements||0,
   'audit must match real public announcements');
  assert.ok(result.audit.announcements<=result.audit.candidates,
   'no public Star without a real Director candidate');
  assert.deepEqual(errors,[],'no runtime page errors');
  const output={protocol:'natural-star-v1',horizon:seconds,initial,result,
   censored:result.time<seconds,unmodifiedStarPopulation:true};
  const dir=path.join('artifacts','star-natural');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'layout-'+layout+'-seed-'+seed+'.json'),
   JSON.stringify(output,null,2)+'\n');
  console.log('NOVA_STAR_NATURAL '+JSON.stringify(output));
 }finally{await page.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
