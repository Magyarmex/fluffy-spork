'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {analyzeCommonSafe}=require('../../scripts/redeploy-common-safe-report.cjs');
function fixture(){
 const results=[];
 for(const seed of [101,102])for(const hz of [30,60]){
  const spawns={fresh:{x:1000,y:0},return:{x:450,y:0}};
  const postInsertion={aiCount:8,neutralCount:120,
   enemyBodiesHash:'body-'+seed,neutralBodiesHash:'neutral-'+seed,
   enemyFullStateHash:'full-ai-'+seed,neutralFullStateHash:'full-neutral-'+seed};
  const commonSafeSpawnStats={calls:8,attempts:12,maxAttempts:3};
  const arm=choice=>({
   choice,baseChoice:'fresh',origin:{x:0,y:0},
   prelude:{ticks:240,elapsed:8},spawn:spawns[choice],
   generatedSpawn:spawns.fresh,postInsertion,
   rngDrawsAtInsertion:1900,commonSafeSpawnStats,
   nearestEnemyDistance:choice==='fresh'?1100:1300,
   neutralXP:choice==='fresh'?10:16,
   score:choice==='fresh'?20:27,
   hp:choice==='fresh'?100:95,
   alive:true,frontReached:choice==='return'?4:null,
   firstFairVisibleEnemy:choice==='return'?2:null,
   travelled:choice==='fresh'?200:130,routeRequests:choice==='fresh'?3:1
  });
  results.push({seed,hz,layout:'Crossfire',rotation:0,origin:{x:0,y:0},
   spawns,common:{fresh:arm('fresh'),return:arm('return')},
   native:{fresh:{nearestEnemyDistance:1200},return:{nearestEnemyDistance:1250}}});
 }
 return {protocolVersion:'common-safe-geography-v1',
  preludeSeconds:8,seconds:12,results};
}
test('common-safe report preserves one independent seed per FPS pair',()=>{
 const out=analyzeCommonSafe(fixture(),2);
 assert.equal(out.independentSeeds,2);
 assert.equal(out.fpsRepeatedObservations,4);
 assert.equal(out.spawnSafety.safeArms,8);
 assert.equal(out.spawnSafety.matchedEnemyNeutralWorldPairs,4);
 assert.equal(out.spawnSafety.generatedEnemies,32);
 assert.equal(out.spawnSafety.totalCandidateAttempts,48);
 assert.equal(out.metrics.neutralXP.conditionalReturnMinusFresh,6);
 assert.deepEqual(out.metrics.neutralXP.seedBootstrap95,[6,6]);
 assert.equal(out.metrics.hp.conditionalReturnMinusFresh,-5);
 assert.equal(out.metrics.frontReached.conditionalReturnMinusFresh,1);
 assert.equal(out.spawnSafety.initialSupportVerified,true);
});
test('reject an enemy inside either player insertion exclusion zone',()=>{
 const data=fixture();data.results[0].common.return.nearestEnemyDistance=999.999;
 assert.throws(()=>analyzeCommonSafe(data,2),/SPAWN INVARIANT FAILED/);
});
test('reject different full enemy state even when body positions match',()=>{
 const data=fixture();
 data.results[0].common.return.postInsertion={...data.results[0].common.return.postInsertion,
  enemyFullStateHash:'different-ai-state'};
 assert.throws(()=>analyzeCommonSafe(data,2),/common enemy\/neutral world mismatch/);
});
test('reject divergent random streams and invalid native insertion',()=>{
 const data=fixture();data.results[0].common.return.rngDrawsAtInsertion++;
 assert.throws(()=>analyzeCommonSafe(data,2),/RNG replay mismatch/);
 const other=fixture();other.results[0].common.return.spawn={x:9999,y:0};
 assert.throws(()=>analyzeCommonSafe(other,2),/not a genuine native location/);
});
test('reject partial seed/FPS coverage and forged spawn call counts',()=>{
 const data=fixture();data.results.pop();
 assert.throws(()=>analyzeCommonSafe(data,2),/missing seed\/FPS observations/);
 const other=fixture();other.results[0].common.fresh.commonSafeSpawnStats={calls:7,attempts:12,maxAttempts:3};
 assert.throws(()=>analyzeCommonSafe(other,2),/spawn rejection mismatch/);
});
