'use strict';
// Shipping React + full overlay smoke for observation-only public MIGRATION
// diagnostics. This is a controlled wiring check, not a natural-match trial.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:320,height:568},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game,old=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaMigrationAuditGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaMigrationAuditGame?.status==='playing'&&
   !!window.__novaMigrationAuditGame.__lfState,{timeout:30000});
  const result=await page.evaluate(()=>{
   const g=window.__novaMigrationAuditGame,st=g.__lfState,
    T=window.__NOVA_LIVING_FRONT_TEST__,LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
   if(!T||!LF||!T.publicEcoBias||!T.debugSummary||!LF.snapshot)
    throw Error('canonical public migration audit not wired into production modules');
   const rival=(g.tanks||[]).find(t=>t&&t.ai&&t.hp>0);
   if(!rival)throw Error('no live rival available for public-signal smoke');
   g.setPaused(true);
   const original={signal:st.signal,directorEnabled:st.directorEnabled,
    x:rival.x,y:rival.y,hp:rival.hp,target:rival.ai.__v1112TargetId,
    stats:Object.assign({},st.stats)};
   try{
    rival.x=-200;rival.y=-562.5;rival.hp=rival.maxHp||100;
    rival.ai.__v1112TargetId=-1;st.directorEnabled=true;
    st.signal={type:'MIGRATION',from:5,to:6,x:0,y:-562.5,
     started:g.time,until:g.time+4.4};
    const before=st.stats.migrationAiSamples||0;
    const bias=T.publicEcoBias(g,rival,{},{}),after=st.stats.migrationAiSamples||0;
    if(after!==before+1)throw Error('real AI decision did not reach migration audit');
    const reasons=['migrationAiHealthVeto','migrationAiCombatVeto','migrationAiRouteBlocked',
     'migrationAiScoreVeto','migrationAiSteered'];
    const sum=reasons.reduce((n,k)=>n+(st.stats[k]||0)-(original.stats[k]||0),0);
    if(sum!==1)throw Error('one migration sample must have exactly one outcome: '+sum);
    const snap=LF.snapshot(g),debug=T.debugSummary(snap);
    if(snap.stats.migrationAiSamples!==after||!debug.includes('MIG AI')||
       !debug.includes('MIG ARR'))
     throw Error('COPY ECOLOGY / Debug did not expose real migration decision counters');
    st.directorEnabled=false;
    T.publicEcoBias(g,rival,{},{});
    if(st.stats.migrationAiSamples!==after)throw Error('disabled Director entered migration audit');
    st.directorEnabled=true;st.signal.started=g.time+1;
    T.publicEcoBias(g,rival,{},{});
    if(st.stats.migrationAiSamples!==after)throw Error('future signal entered migration audit');
    return{realShippingGame:true,publicSignal:true,oneSampleOneOutcome:true,
     snapshotAndDebug:true,disabledAndFutureFailClosed:true,
     sampleMode:bias.mode,realRivalId:rival.id};
   }finally{
    st.signal=original.signal;st.directorEnabled=original.directorEnabled;
    rival.x=original.x;rival.y=original.y;rival.hp=original.hp;
    rival.ai.__v1112TargetId=original.target;
    st.stats=original.stats;g.setPaused(false);
   }
  });
  assert.deepEqual(errors,[],'no browser runtime errors');
  console.log('NOVA_MIGRATION_AI_AUDIT '+JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
