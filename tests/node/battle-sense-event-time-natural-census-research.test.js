'use strict';
// RESEARCH ONLY. Descriptive natural-match census of event-time crossfire
// witnesses on the exact 49-overlay composed Game. Not a causal balance A/B,
// device CPU benchmark, or shipping authorization.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
test('natural composed matches bound firing-time witness scans and report incidence',()=>{
 for(const seed of [1517800,1517802,1517810]){
  withSeed(seed,()=>{
   const g=bootGame();
   try{
    g.sfx.muted=true;g.sfx.startMusic=()=>{};
    g.status='playing';g.paused=false;
    const stats={seed,frames:0,successfulFireCalls:0,observedShotRecords:0,
     eligibleVictimMemberships:0,shotsWithAnyVictimWitness:0,
     fireLOSCalls:0,maxFireLOSCalls:0,crossfireSamples:0};
    const originalLOS=g.hasLineOfSight,originalFire=g.tryFire;
    let insideFire=false,shotRays=0;
    g.hasLineOfSight=function(){if(insideFire)shotRays++;
     return originalLOS.apply(this,arguments);};
    g.tryFire=function(shooter){
     const before=this.bullets.length;shotRays=0;insideFire=true;
     let out;
     try{out=originalFire.apply(this,arguments);}
     finally{insideFire=false;}
     if(this.bullets.length>before){
      stats.successfulFireCalls++;
      stats.fireLOSCalls+=shotRays;
      stats.maxFireLOSCalls=Math.max(stats.maxFireLOSCalls,shotRays);
      const observers=this.__novaFairShotWitnesses||this.tanks||[];
      let witnessed=false;
      for(const observer of observers){
       if(!observer||!observer.ai||observer===shooter)continue;
       if(observer.ai.__v181ObservedShotId!==shooter.id||
          Math.abs(observer.ai.__v181ObservedShotAt-this.time)>1e-8)continue;
       const candidates=observer.ai.__v181ObservedShotVictims;
       assert.ok(Array.isArray(candidates),'actual witnessed shot must have an event-time candidate set');
       assert.ok(candidates.length<=observers.length,'witness memory must be roster-bounded');
       stats.observedShotRecords++;
       stats.eligibleVictimMemberships+=candidates.length;
       if(candidates.length)witnessed=true;
      }
      if(witnessed)stats.shotsWithAnyVictimWitness++;
     }
     return out;
    };
    for(let frame=0;frame<720;frame++){
     g.update(1/60);stats.frames++;
     if(frame%30===0)for(const t of g.tanks)
      if(t&&t.ai&&t.alive!==false&&t.ai.__v181Mode==='crossfire')
       stats.crossfireSamples++;
    }
    assert.equal(stats.frames,720);
    assert.ok(stats.successfulFireCalls>=0);
    assert.ok(stats.fireLOSCalls>=0);
    console.log('NOVA_EVENT_TIME_WITNESS_NATURAL_RESEARCH '+JSON.stringify(stats));
   }finally{g.destroy();}
  });
 }
});
