'use strict';
// Research-only #375: observe the actual 49-overlay Director gate in natural
// composed play. No synthetic signals, no AI/player intervention, no game writes.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
// Ninety simulated seconds expose the match-age BLOOM window without changing pilot behavior.
// Natural death/pauses censor the horizon; do not interpret a short trace as 90s exposure.
const SEEDS=[1517800,1517802,1517810],TICKS=5400,SEGMENT_SECONDS=30;
function run(seed,observe){
 return withSeed(seed,draws=>{
  const g=bootGame();if(!g.player)g.redeploy();
  assert.ok(g.player&&g.player.alive,'real player must be spawned');
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  const census={activeTicks:0,withState:0,heatSamples:0,maxHeat:0,
   heatReady:0,cooldownReady:0,bothReady:0,unblockedReady:0,
   candidateBloom:0,candidateMigration:0,candidateStar:0,candidateNone:0,
   activeBloom:0,activeMigration:0,activeStar:0,
   maxOutbound:0,firstReadyAt:null,firstMigrationAt:null,
   pausedAt:null,segments:[],activeIntentSamples:0,totalActiveIntents:0,maxActiveIntents:0,
   rawCrossings:0,certifiedAtOwner:0,excludedCrossings:0,excludedByType:{},
   excludedPriorIntent:{sameDestinationWithin05:0,sameDestinationWithin1:0,sameDestinationWithin2:0,
    differentDestinationWithin2:0,noRecentIntent:0},excludedPriorIntentByType:{}};
  try{
   if(observe){
    // Weak identity ownership prevents respawned/reused shape IDs from inheriting intent.
    const recentIntent=new WeakMap();
    const LF=g.__testLivingFront,oldBehavior=LF&&LF.behaviorTick;
    assert.equal(typeof oldBehavior,'function','shipping behavior owner must exist');
    // Observe the exact transition boundary: physics already moved shapes,
    // but transition() has not yet replaced their previous-sector stamp.
    LF.behaviorTick=function(game,st,defs,dt){
     let raw=0,certified=0,excluded=0;
     const now=Number(game.time)||0;
     for(const shape of game.shapes||[]){
      if(!shape||!(shape.hp>0)||!Number.isInteger(shape.__lfSector))continue;
      const to=LF.sectorIndex(shape.x,shape.y);
      if(to===shape.__lfSector)continue;
      raw++;
      if(shape.__lfMigrationIntent===to)certified++;
      else{
       excluded++;
       const kind=String(shape.type||'unknown');
       census.excludedByType[kind]=(census.excludedByType[kind]||0)+1;
       const prior=recentIntent.get(shape),age=prior?now-prior.at:Infinity;
       const same=prior&&prior.to===to&&prior.from===shape.__lfSector&&age>=0;
       let bucket='noRecentIntent';
       if(same&&age<=.5)bucket='sameDestinationWithin05';
       else if(same&&age<=1)bucket='sameDestinationWithin1';
       else if(same&&age<=2)bucket='sameDestinationWithin2';
       else if(prior&&age>=0&&age<=2)bucket='differentDestinationWithin2';
       census.excludedPriorIntent[bucket]++;
       const byType=census.excludedPriorIntentByType[kind]||(census.excludedPriorIntentByType[kind]={});
       byType[bucket]=(byType[bucket]||0)+1;
      }
     }
     const before=Number(st.migrationTransitions)||0;
     const result=oldBehavior.apply(this,arguments);
     // Record intent only after the real owner has updated it; never steer or extend it.
     for(const shape of game.shapes||[]){
      if(!shape||!(shape.hp>0))continue;
      const to=shape.__lfMigrationIntent,from=shape.__lfSector;
      if(Number.isInteger(to)&&to>=0&&to<16&&Number.isInteger(from)&&to!==from)
       recentIntent.set(shape,{to,from,at:now});
     }
     assert.equal((Number(st.migrationTransitions)||0)-before,certified,
      'read-only pre-owner crossing certificate disagrees with shipping transition');
     census.rawCrossings+=raw;
     census.certifiedAtOwner+=certified;
     census.excludedCrossings+=excluded;
     return result;
    };
   }
   g.status='playing';g.paused=false;
   for(let tick=0;tick<TICKS;tick++){
    g.update(1/60);
    if(g.status!=='playing')break;
    if(g.paused){census.pausedAt=+g.time.toFixed(3);break;}
    census.activeTicks++;
    if(!observe||tick%6!==0)continue;
    const st=g.__lfState;
    if(!st)continue;
    const T=g.__testWindow.__NOVA_LIVING_FRONT_TEST__;
    assert.ok(T&&typeof T.directorDecision==='function','real Director decision export');
    census.withState++;
    const segmentIndex=Math.max(0,Math.floor(Math.max(0,g.time-1e-9)/SEGMENT_SECONDS));
    while(census.segments.length<=segmentIndex){
     const n=census.segments.length;
     census.segments.push({from:n*SEGMENT_SECONDS,to:(n+1)*SEGMENT_SECONDS,
      samples:0,maxHeat:0,heatReadySamples:0,transitionsAtEnd:0,
      bloomsAtEnd:0,migrationsAtEnd:0,starsAtEnd:0,
      activeIntentSum:0,maxActiveIntents:0});
    }
    const segment=census.segments[segmentIndex];
    segment.samples++;
    segment.transitionsAtEnd=Number(st.migrationTransitions)||0;
    segment.bloomsAtEnd=Number(st.stats&&st.stats.blooms)||0;
    segment.migrationsAtEnd=Number(st.stats&&st.stats.migrations)||0;
    segment.starsAtEnd=Number(st.stats&&st.stats.starAnnouncements)||0;
    // A crossing may be rare because few shapes choose to migrate, or because
    // their pressure-driven intent expires before they reach a sector edge.
    // Observe existing intent only; never steer or extend it in this pilot.
    const LF=g.__testLivingFront;
    let activeIntents=0;
    for(const shape of g.shapes||[]){
     if(!shape||!(shape.hp>0))continue;
     const to=shape.__lfMigrationIntent;
     if(Number.isInteger(to)&&to>=0&&to<16&&to!==LF.sectorIndex(shape.x,shape.y))
      activeIntents++;
    }
    if(activeIntents>0)census.activeIntentSamples++;
    census.totalActiveIntents+=activeIntents;
    census.maxActiveIntents=Math.max(census.maxActiveIntents,activeIntents);
    segment.activeIntentSum+=activeIntents;
    segment.maxActiveIntents=Math.max(segment.maxActiveIntents,activeIntents);
    const heat=Number(st.migrationHeat);
    if(Number.isFinite(heat)){
     census.heatSamples++;
     census.maxHeat=Math.max(census.maxHeat,heat);
     segment.maxHeat=Math.max(segment.maxHeat,heat);
    }
    const ready=Number.isFinite(heat)&&heat>=5;
    const cool=Number(st.cooldowns&&st.cooldowns.migration)<=0;
    if(ready){census.heatReady++;segment.heatReadySamples++;}
    if(cool)census.cooldownReady++;
    if(ready&&cool){
     census.bothReady++;
     if(census.firstReadyAt==null)census.firstReadyAt=+g.time.toFixed(3);
     const signal=st.signal,now=g.time;
     if((!signal||now>=signal.until)&&!(now-Number(st.lastSignalAt)<8)){
      census.unblockedReady++;
      const d=T.directorDecision(st,{enabled:st.directorEnabled,now,
       hasStar:(g.shapes||[]).some(s=>s&&s.type==='star'&&s.hp>0)});
      if(d&&d.type==='BLOOM')census.candidateBloom++;
      else if(d&&d.type==='MIGRATION')census.candidateMigration++;
      else if(d&&d.type==='ROGUE STAR')census.candidateStar++;
      else census.candidateNone++;
     }
    }
    const signal=st.signal;
    if(signal&&g.time>=signal.started&&g.time<signal.until){
     if(signal.type==='BLOOM')census.activeBloom++;
     else if(signal.type==='MIGRATION'){
      census.activeMigration++;
      if(census.firstMigrationAt==null)census.firstMigrationAt=+g.time.toFixed(3);
     }else if(signal.type==='ROGUE STAR')census.activeStar++;
    }
    const sectors=st.sectors||[];
    for(const s of sectors){
     const outbound=Number(s&&s.outbound);
     if(Number.isFinite(outbound))census.maxOutbound=Math.max(census.maxOutbound,outbound);
    }
   }
   const st=g.__lfState||{},stats=st.stats||{};
   return {status:g.status,time:+g.time.toFixed(3),
    hash:digest(physical(g)),draws:draws(),
    blooms:stats.blooms||0,migrations:stats.migrations||0,
    stars:stats.starsSpawned||0,
    physicalMigrationTransitions:st.migrationTransitions||0,census};
  }finally{g.destroy();}
 });
}
test('natural composed Director migration gate census is read-only and A/A identical',()=>{
 const rows=[];
 for(const seed of SEEDS){
  const control=run(seed,false),observed=run(seed,true);
  assert.equal(observed.hash,control.hash,'read-only Director census altered physical world');
  assert.equal(observed.draws,control.draws,'read-only Director census consumed gameplay RNG');
  assert.equal(observed.status,control.status);
  assert.equal(observed.time,control.time);
  assert.ok(observed.census.activeTicks>0,'no real gameplay ticks');
  assert.ok(observed.census.withState>0,'Director state never materialized');
  assert.ok(observed.census.heatSamples>0,'migration heat never sampled');
  assert.ok(observed.census.segments.length>0,'no time-window exposure');
  assert.equal(observed.census.rawCrossings,
   observed.census.certifiedAtOwner+observed.census.excludedCrossings,
   'raw crossing partition must be complete');
  assert.equal(Object.values(observed.census.excludedPriorIntent).reduce((a,b)=>a+b,0),
   observed.census.excludedCrossings,'prior-intent age bins must partition every excluded crossing');
  assert.equal(observed.census.certifiedAtOwner,observed.physicalMigrationTransitions,
   'exact owner-certified crossings must match shipping counter');
  assert.equal(observed.census.segments.reduce((n,s)=>n+s.activeIntentSum,0),
   observed.census.totalActiveIntents,'intent census must partition by time window');
  assert.equal(observed.census.segments.reduce((n,s)=>n+s.samples,0),observed.census.withState,
   'segmented exposure must cover every sampled Director state');
  assert.ok(observed.census.bothReady<=observed.census.heatReady);
  assert.ok(observed.census.bothReady<=observed.census.cooldownReady);
  assert.equal(observed.census.unblockedReady,
   observed.census.candidateBloom+observed.census.candidateMigration+
   observed.census.candidateStar+observed.census.candidateNone);
  rows.push({seed,status:observed.status,time:observed.time,
   blooms:observed.blooms,migrations:observed.migrations,stars:observed.stars,
   physicalMigrationTransitions:observed.physicalMigrationTransitions,
   ...observed.census});
 }
 console.log('NOVA_LIVING_FRONT_NATURAL_MIGRATION_GATE '+JSON.stringify(rows));
});
