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
    const classes=g.__testWindow.__novaMakeRequire('')('game/classes').CLASSES;
    const stats={seed,frames:0,playingFrames:0,successfulFireCalls:0,observedShotRecords:0,
     eligibleVictimMemberships:0,shotsWithAnyVictimWitness:0,
     projectileAlignedMemberships:0,projectileBlockedMemberships:0,
     noProjectileLaneMemberships:0,
     fireLOSCalls:0,maxFireLOSCalls:0,crossfireSamples:0,
     geometricComparisons:0,oldOnlyGeometry:0,newOnlyGeometry:0};
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
      const emitted=this.bullets.slice(before).filter(b=>b&&b.ownerId===shooter.id&&
       Number.isFinite(b.x)&&Number.isFinite(b.y)&&
       Number.isFinite(b.vx)&&Number.isFinite(b.vy));
      let witnessed=false;
      for(const observer of observers){
       if(!observer||!observer.ai||observer===shooter)continue;
       if(observer.ai.__v181ObservedShotId!==shooter.id||
          !Number.isFinite(observer.ai.__v181ObservedShotAt)||
          Math.abs(observer.ai.__v181ObservedShotAt-this.time)>1e-8)continue;
       const candidates=observer.ai.__v181ObservedShotVictims;
       assert.ok(candidates===null||typeof candidates.has==='function',
        'actual witnessed shot must have a weak event-time candidate set');
       const count=observer.ai.__v181ObservedShotVictimCount;
       assert.ok(Number.isInteger(count)&&count>=0&&count<=observers.length,
        'witness count must be roster-bounded');
       stats.observedShotRecords++;
       stats.eligibleVictimMemberships+=count;
       if(count)witnessed=true;
       // Descriptive event-time physical plausibility, not a damage prediction.
       // A victim may move, cover may break and another unit may intercept.
       for(const victim of observers){
        if(!victim||victim===shooter||victim===observer||
           candidates?.has(victim)!==true)continue;
        let aligned=false,clear=false;
        for(const b of emitted){
         const speed=Math.hypot(b.vx,b.vy);
         if(!(speed>1))continue;
         const ux=b.vx/speed,uy=b.vy/speed;
         const dx=victim.x-b.x,dy=victim.y-b.y;
         const along=dx*ux+dy*uy;
         const maxTravel=speed*Math.max(0,b.ttl||0);
         const lateral=Math.abs(dx*uy-dy*ux);
         // Match the composed core updateBullets tank-contact radius, not a
         // fixed 20-unit approximation that misclassifies larger hulls.
         const hitRadius=(b.r||0)+(classes[victim.cls]?.size||15)+3;
         if(!(along>=0&&along<=maxTravel&&lateral<=hitRadius))continue;
         aligned=true;
         const hit=typeof this.firstTerrainHit==='function'?
          this.firstTerrainHit(b.x,b.y,b.x+ux*along,b.y+uy*along,
           Math.max(0,(b.r||0)*.45)):null;
         if(!hit){clear=true;break;}
        }
        if(!aligned)stats.noProjectileLaneMemberships++;
        else if(!clear)stats.projectileBlockedMemberships++;
        else stats.projectileAlignedMemberships++;
       }
      }
      if(witnessed)stats.shotsWithAnyVictimWitness++;
     }
     return out;
    };
    for(let frame=0;frame<720;frame++){
     g.update(1/60);stats.frames++;
     if(g.status==='playing')stats.playingFrames++;
     if(frame%30===0){
      for(const t of g.tanks){
       if(!t||!t.ai||t.alive===false)continue;
       if(t.ai.__v181Mode==='crossfire')stats.crossfireSamples++;
       const a=t.ai,at=a.__v181ObservedShotAt;
       if(!Number.isFinite(at)||g.time-at<0||g.time-at>1.25||
          !Number.isFinite(a.__v181ObservedShotAngle)||
          !Number.isFinite(a.__v181ObservedShotX)||
          !Number.isFinite(a.__v181ObservedShotY)||
          !(a.__v181ObservedShotVictims===null||typeof a.__v181ObservedShotVictims?.has==='function'))continue;
       const shooter=g.getTank(a.__v181ObservedShotId);
       if(!shooter||shooter.alive===false)continue;
       for(const victim of g.tanks){
        if(!victim||victim===shooter||victim===t||victim.alive===false)continue;
        const bearing=Math.atan2(victim.y-a.__v181ObservedShotY,
          victim.x-a.__v181ObservedShotX);
        const legacy=Math.cos(a.__v181ObservedShotAngle-bearing)>.75;
        const eventTime=a.__v181ObservedShotVictims?.has(victim)===true;
        stats.geometricComparisons++;
        if(legacy&&!eventTime)stats.oldOnlyGeometry++;
        if(eventTime&&!legacy)stats.newOnlyGeometry++;
       }
      }
     }
    }
    assert.equal(stats.frames,720);
    assert.ok(stats.successfulFireCalls>=0);
    assert.ok(stats.fireLOSCalls>=0);
    console.log('NOVA_EVENT_TIME_WITNESS_NATURAL_RESEARCH '+JSON.stringify(stats));
   }finally{g.destroy();}
  });
 }
});
