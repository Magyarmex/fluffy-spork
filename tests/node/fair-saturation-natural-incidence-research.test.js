'use strict';
// Research-only player-value gate for #1064. No balance assertion or claim of
// ordinary player incidence: this is a bounded deterministic natural prelude.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,playPublicPrelude}=require('../research/audio-rng-causal-pilot.cjs');

test('real composed Game records whether phantom allied/self saturation can occur naturally',()=>{
 const results=[];
 for(const seed of [1517800,1517802,1517810]){
  withSeed(seed,()=>{
   const g=bootGame();
   try{
    if(!g.player)g.redeploy();
    assert.ok(g.player&&g.status==='playing');
    let samples=0,selfAssignments=0,alliedAssignments=0;
    const oldUpdate=g.update;
    g.update=function(dt){
     const out=oldUpdate.call(this,dt);
     for(const q of this.tanks||[]){
      if(!q||!q.ai||q.alive===false)continue;
      const a=q.ai,id=a.__v1112TargetId>=0?a.__v1112TargetId:
       a.__v1105TargetId>=0?a.__v1105TargetId:
       a.__v180TargetId>=0?a.__v180TargetId:a.targetId;
      if(!(id>=0))continue;
      samples++;
      if(id===q.id)selfAssignments++;
      const target=this.getTank(id);
      if(target&&target.id!==q.id&&typeof this.areAllies==='function'&&
         this.areAllies(q,target))alliedAssignments++;
     }
     return out;
    };
    const run=playPublicPrelude(g,60,4,g.__testFair);
    results.push({seed,ticks:run.ticks,samples,selfAssignments,alliedAssignments});
    assert.ok(run.ticks>0);
   }finally{g.destroy();}
  });
 }
 console.log('NOVA_PHANTOM_SATURATION_NATURAL '+JSON.stringify(results));
});
