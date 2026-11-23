'use strict';
// Research-only #375: observe the actual 49-overlay Director gate in natural
// composed play. No synthetic signals, no AI/player intervention, no game writes.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const SEEDS=[1517800,1517802,1517810],TICKS=1800;
// Mirror only the source's public physical-flow eligibility, not its decisions.
function dominantFlow(st){
 let bestOutbound=0,found=false;
 for(const sector of st.sectors||[]){
  const outbound=Number(sector&&sector.outbound)||0;
  if(!(outbound>bestOutbound)||!sector||!sector.flowTo)continue;
  let best=1e-6,runner=0,hasTo=false;
  for(const [to,raw] of sector.flowTo.entries()){
   const weight=Number(raw)||0;
   if(!(weight>0))continue;
   if(weight>best){runner=best;best=weight;hasTo=true;}
   else if(weight>runner)runner=weight;
  }
  if(hasTo&&best>runner+1e-6&&Math.hypot(Number(sector.flowX)||0,Number(sector.flowY)||0)>1e-6){
   bestOutbound=outbound;found=true;
  }
 }
 return found;
}

function run(seed,observe){
 return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
  const census={activeTicks:0,withState:0,heatSamples:0,maxHeat:0,
   heatReady:0,cooldownReady:0,flowReady:0,bothReady:0,allReady:0,unblockedReady:0,
   activeBloom:0,activeMigration:0,activeStar:0,
   maxOutbound:0,firstReadyAt:null,firstMigrationAt:null};
  try{
   g.status='playing';g.paused=false;
   for(let tick=0;tick<TICKS;tick++){
    g.update(1/60);
    if(g.status!=='playing')break;
    census.activeTicks++;
    if(!observe||tick%6!==0)continue;
    const st=g.__lfState;
    if(!st)continue;
    census.withState++;
    const heat=Number(st.migrationHeat);
    if(Number.isFinite(heat)){
     census.heatSamples++;
     census.maxHeat=Math.max(census.maxHeat,heat);
    }
    const ready=Number.isFinite(heat)&&heat>=5;
    const cool=Number(st.cooldowns&&st.cooldowns.migration)<=0;
    if(ready)census.heatReady++;
    if(cool)census.cooldownReady++;
    const flow=dominantFlow(st);
    if(flow)census.flowReady++;
    if(ready&&cool&&flow)census.allReady++;
    if(ready&&cool){
     census.bothReady++;
     if(census.firstReadyAt==null)census.firstReadyAt=+g.time.toFixed(3);
     const signal=st.signal,now=g.time;
     if(flow&&(!signal||now>=signal.until)&&now-Number(st.lastSignalAt||-99)>=8)
      census.unblockedReady++;
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
    stars:stats.starsSpawned||0,census};
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
  assert.ok(observed.census.bothReady<=observed.census.heatReady);
  assert.ok(observed.census.bothReady<=observed.census.cooldownReady);
  assert.ok(observed.census.allReady<=observed.census.bothReady);
  assert.ok(observed.census.allReady<=observed.census.flowReady);
  rows.push({seed,status:observed.status,time:observed.time,
   blooms:observed.blooms,migrations:observed.migrations,stars:observed.stars,
   ...observed.census});
 }
 console.log('NOVA_LIVING_FRONT_NATURAL_MIGRATION_GATE '+JSON.stringify(rows));
});
