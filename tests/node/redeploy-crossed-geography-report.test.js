'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {reportCrossed}=require('../../scripts/redeploy-crossed-geography-report.cjs');
function fixture(){
 const results=[];
 for(const seed of [101,102])for(const hz of [30,60]){
  const spawns={fresh:{x:800,y:100},return:{x:400,y:100}};
  const nativePostInsertion={
   fresh:{enemyBodiesHash:'enemy-a',neutralBodiesHash:'neutral-a'},
   return:{enemyBodiesHash:'enemy-b',neutralBodiesHash:'neutral-b'}};
  const arm=(base,position)=>({
   baseChoice:base,choice:position,spawn:spawns[position],
   generatedSpawn:spawns[base],postInsertion:nativePostInsertion[base],
   fingerprintHash:'matched-world-'+seed+'-'+hz,
   origin:{x:0,y:0},prelude:{ticks:240,elapsed:8},
   nearestEnemyDistance:base===position?1200:300,
   hp:(base==='fresh'?100:97)+(position==='return'?-10:0),
   neutralXP:(base==='fresh'?8:10)+(position==='return'?4:0),
   score:20+(position==='return'?4:0),
   alive:true,frontReached:position==='return'?3:null,
   firstVisibleEnemy:position==='return'?2:null,
   firstFairVisibleEnemy:position==='return'?2:null,
   firstVisibleNeutral:1,blockedNearFrontSeconds:0,
   routeRequests:position==='return'?3:2,travelled:position==='return'?100:200
  });
  results.push({seed,hz,layout:'Crossfire',rotation:0,
   origin:{x:0,y:0},spawns,nativePostInsertion,
   worlds:{fresh:{fresh:arm('fresh','fresh'),return:arm('fresh','return')},
    return:{fresh:arm('return','fresh'),return:arm('return','return')}}});
 }
 return {protocolVersion:'crossed-geography-v1',preludeSeconds:8,
  seconds:12,results};
}
test('crossed report identifies geography separately from generated enemy world',()=>{
 const out=reportCrossed(fixture(),2);
 assert.equal(out.independentSeeds,2);
 assert.equal(out.fpsRepeatedObservations,4);
 assert.equal(out.crossedWorldPairs,8);
 assert.equal(out.postInsertionParity.nativeFreshVsReturnEnemyBodiesSame,0);
 assert.equal(out.spawnSafety.nativeBelow,0);
 assert.equal(out.spawnSafety.offDiagonalBelow,8);
 assert.equal(out.spawnSafety.independentSeedsWithAllFourCellsSafeAtBothHz,0);
 assert.equal(out.spawnSafety.nativeSpawnSupportSatisfied,false);
 assert.equal(out.spawnSafety.causalGeographyIdentified,false);
 assert.match(out.spawnSafety.verdict,/FALSIFIED/);
 assert.equal(out.metrics.hp.conditionalGeographyReturnMinusFresh.mean,-10);
 assert.equal(out.metrics.hp.baseWorldReturnMinusFresh.mean,-3);
 assert.equal(out.metrics.hp.geographyByBaseInteraction.mean,0);
 assert.equal(out.metrics.hp.nativeTotalPolicyReturnMinusFresh.mean,-13);
 assert.deepEqual(out.metrics.hp.conditionalGeographyReturnMinusFresh.seedBootstrap95,[-10,-10]);
 assert.equal(out.metrics.neutralXP.conditionalGeographyReturnMinusFresh.mean,4);
 assert.equal(out.metrics.frontArrival.conditionalGeographyReturnMinusFresh.mean,1);
 assert.equal(out.metrics.fairEnemySeen.conditionalGeographyReturnMinusFresh.mean,1);
});
test('crossed report accepts only fully spawn-safe counterfactual support',()=>{
 const data=fixture();
 for(const row of data.results)
  for(const base of ['fresh','return'])
   for(const pos of ['fresh','return'])
    row.worlds[base][pos].nearestEnemyDistance=1200;
 const out=reportCrossed(data,2);
 assert.equal(out.spawnSafety.offDiagonalBelow,0);
 assert.equal(out.spawnSafety.independentSeedsWithAllFourCellsSafeAtBothHz,2);
 assert.equal(out.spawnSafety.nativeSpawnSupportSatisfied,true);
 assert.equal(out.spawnSafety.causalGeographyIdentified,false,'spawn support alone cannot establish causality');
});
test('crossed report rejects base-world mismatches rather than calling them causal',()=>{
 const data=fixture();
 data.results[0].worlds.fresh.return.postInsertion={enemyBodiesHash:'tampered'};
 assert.throws(()=>reportCrossed(data,2),/base-world mismatch/);
});
test('crossed report rejects forged native spawn positions and incomplete FPS repeats',()=>{
 const data=fixture();
 data.results[0].worlds.return.fresh.spawn={x:999,y:999};
 assert.throws(()=>reportCrossed(data,2),/transplanted position mismatch/);
 const missing=fixture();missing.results.pop();
 assert.throws(()=>reportCrossed(missing,2),/FPS repeats/);
});
test('crossed report rejects nonfinite outcomes and duplicate observations',()=>{
 const data=fixture();data.results[0].worlds.fresh.fresh.hp=NaN;
 assert.throws(()=>reportCrossed(data,2),/invalid hp/);
 const duplicate=fixture();duplicate.results[1].hz=30;
 assert.throws(()=>reportCrossed(duplicate,2),/duplicate seed\/FPS/);
});
