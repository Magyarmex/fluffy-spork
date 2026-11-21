'use strict';
// RESEARCH ONLY: A/B/C natural-match causal probe of event-time crossfire.
// A = existing observer-owned hull cone; B = emitted lanes; C = emitted lanes
// plus terrain. Unknown lanes remain eligible: never silently erase a threat.
// Both projectile arms preserve future-motion uncertainty: a currently
// stationary target may accelerate into a shot after its birth.
// Exact shipping 49-overlay Game. NOT a balance win-rate or Android benchmark.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const {projectileCandidate}=require('../research/battle-sense-projectile-candidate.cjs');
function run(seed,arm){
 return withSeed(seed,()=>{
  const g=bootGame();
  const stats={seed,arm,frames:0,shots:0,originalMemberships:0,
   retainedMemberships:0,snapshotMisses:0,unknownRetained:0,futureMotionUnknown:0,terrainChecks:0,
   crossfireBotFrames:0,modeTrace:[],moveTrace:[]};
  try{
   g.sfx.muted=true;g.sfx.startMusic=()=>{};
   g.status='playing';g.paused=false;
   const originalMove=g.moveTank;
   let commands=[];
   g.moveTank=function(t,vx,vy,dt){
    if(t&&t.ai)commands.push([t.id,
     Number.isFinite(vx)?+vx.toFixed(3):null,
     Number.isFinite(vy)?+vy.toFixed(3):null]);
    return originalMove.apply(this,arguments);
   };
   const original=g.tryFire;
   g.tryFire=function(shooter){
    const before=this.bullets.length;
    const out=original.apply(this,arguments);
    if(!shooter||this.bullets.length<=before)return out;
    stats.shots++;
    const roster=this.__novaFairShotWitnesses||this.tanks||[];
    // The shot-to-victim physical lane is observer-independent at birth.
    const physicalByVictim=new Map();
    for(const observer of roster){
     const a=observer&&observer.ai;
     if(!a||a.__v181ObservedShotId!==shooter.id||
        a.__v181ObservedShotAt!==this.time)continue;
     const old=a.__v181ObservedShotVictims;
     if(!old)continue;
     const next=arm==='A'?null:new WeakSet();
     let count=0;
     for(const victim of roster){
      if(!victim||victim===shooter||victim===observer||!old.has(victim))continue;
      stats.originalMemberships++;
      let retain=true;
      if(arm!=='A'){
       let evidence=physicalByVictim.get(victim);
       if(!evidence){
        evidence=projectileCandidate(this,shooter,victim,before,
         {terrain:arm==='C',conservativeMotion:true});
        physicalByVictim.set(victim,evidence);
        stats.terrainChecks+=evidence.terrainChecks||0;
       }
       if(evidence.known&&!evidence.possible){
        retain=false;stats.snapshotMisses++;
       }else if(!evidence.known){
        stats.unknownRetained++;
        if(evidence.futureMotionUnknown)stats.futureMotionUnknown++;
       }
      }
      if(retain){count++;stats.retainedMemberships++;if(next)next.add(victim);}
     }
     if(next){
      a.__v181ObservedShotVictims=count?next:null;
      a.__v181ObservedShotVictimCount=count;
     }
    }
    return out;
   };
   for(let frame=0;frame<720;frame++){
    commands=[];
    g.update(1/60);stats.frames++;
    {
     const modes=g.tanks.filter(t=>t&&t.ai&&t.alive!==false)
      .map(t=>[t.id,t.ai.__v181Mode||'none']).sort((a,b)=>a[0]-b[0]);
     stats.crossfireBotFrames+=modes.filter(x=>x[1]==='crossfire').length;
     stats.modeTrace.push(modes);
     stats.moveTrace.push(commands.sort((a,b)=>a[0]-b[0]));
    }
   }
   assert.equal(stats.frames,720);
   assert.equal(stats.originalMemberships,
    stats.retainedMemberships+stats.snapshotMisses);
   if(arm==='A')assert.equal(stats.snapshotMisses,0);
   if(arm==='B')assert.equal(stats.terrainChecks,0);
   return stats;
  }finally{g.destroy();}
 });
}
function firstDifference(a,b){
 for(let i=0;i<Math.min(a.modeTrace.length,b.modeTrace.length);i++){
  if(JSON.stringify(a.modeTrace[i])!==JSON.stringify(b.modeTrace[i]))
   return {frame:i,a:a.modeTrace[i],b:b.modeTrace[i]};
 }
 return null;
}
function firstTraceDifference(a,b){
 for(let i=0;i<Math.min(a.length,b.length);i++){
  if(JSON.stringify(a[i])!==JSON.stringify(b[i]))
   return {frame:i,a:a[i],b:b[i]};
 }
 return null;
}
test('research: natural 49-overlay A/B/C crossfire decisions remain auditable',()=>{
 for(const seed of [1517800,1517802,1517810]){
  const A=run(seed,'A'),B=run(seed,'B'),C=run(seed,'C');
  assert.equal(A.modeTrace.length,720);
  assert.equal(B.modeTrace.length,720);
  assert.equal(C.modeTrace.length,720);
  assert.equal(A.moveTrace.length,720);
  assert.equal(B.moveTrace.length,720);
  assert.equal(C.moveTrace.length,720);
  assert.ok(B.snapshotMisses>=0&&C.snapshotMisses>=0);
  console.log('NOVA_BATTLE_SENSE_NATURAL_ABC '+JSON.stringify({
   seed,
   arms:[A,B,C].map(({arm,shots,originalMemberships,retainedMemberships,
    snapshotMisses,unknownRetained,futureMotionUnknown,terrainChecks,crossfireBotFrames})=>({
    arm,shots,originalMemberships,retainedMemberships,
    snapshotMisses,unknownRetained,futureMotionUnknown,terrainChecks,crossfireBotFrames})),
   firstModeAB:firstDifference(A,B),firstModeAC:firstDifference(A,C),
   firstMoveAB:firstTraceDifference(A.moveTrace,B.moveTrace),
   firstMoveAC:firstTraceDifference(A.moveTrace,C.moveTrace),
   // First frame-level difference is an observation, not proof of a unique
   // causal decision: movement and RNG can diverge within that same frame.
  }));
 }
});
