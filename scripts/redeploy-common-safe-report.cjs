'use strict';
/* Research only. A shared Game-generated enemy world is conditioned to be
 * safe for BOTH native insertion locations. FPS repeats are NOT independent
 * samples. No effect estimate is evidence of human strategy or fun. */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const choices=['fresh','return'];
const measures={
 neutralXP:x=>x.neutralXP,score:x=>x.score,hp:x=>x.hp,
 survived:x=>Number(x.alive),frontReached:x=>Number(x.frontReached!==null),
 fairEnemySeen:x=>Number(x.firstFairVisibleEnemy!==null),
 travelled:x=>x.travelled,routeRequests:x=>x.routeRequests
};
function interval(values,repetitions=3000){
 let rng=0x47e1c23d;const samples=[];
 for(let k=0;k<repetitions;k++){
  let total=0;
  for(let i=0;i<values.length;i++){
   rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;
   total+=values[(rng>>>0)%values.length];
  }
  samples.push(total/values.length);
 }
 samples.sort((a,b)=>a-b);
 return [samples[Math.floor(.025*(repetitions-1))],
  samples[Math.ceil(.975*(repetitions-1))]];
}
function analyzeCommonSafe(data,expectedSeeds=12){
 assert.equal(data.protocolVersion,'common-safe-geography-v1');
 assert.ok(Number.isInteger(expectedSeeds)&&expectedSeeds>0);
 assert.equal(data.results?.length,expectedSeeds*2,'missing seed/FPS observations');
 const grouped=new Map(),seen=new Set(),layoutCells=new Set();
 let worldParity=0,safeArms=0,nativeSafeArms=0,enemyCount=0;
 let maxAttempts=0,totalAttempts=0;
 for(const row of data.results){
  assert.ok(Number.isInteger(row.seed)&&[30,60].includes(row.hz));
  const key=row.seed+'/'+row.hz;
  assert.ok(!seen.has(key),'duplicate seed/FPS observation');seen.add(key);
  assert.ok(row.layout&&Number.isInteger(row.rotation));
  layoutCells.add(row.layout+'/'+row.rotation);
  assert.ok(row.spawns&&row.origin&&row.native&&row.common);
  assert.ok(choices.includes(row.commonBaseChoice),'invalid common base choice');
  const a=row.common.fresh,c=row.common.return;
  assert.ok(same(a.origin,c.origin)&&same(a.origin,row.origin),'first-life origin mismatch');
  assert.ok(same(a.prelude,c.prelude),'witnessed first-life mismatch');
  assert.ok(same(a.spawn,row.spawns.fresh)&&same(c.spawn,row.spawns.return),
   'player insertion is not a genuine native location');
  assert.ok(same(a.generatedSpawn,row.spawns[row.commonBaseChoice])&&
   same(c.generatedSpawn,row.spawns[row.commonBaseChoice]),
   'common world must share one native base');
  assert.ok(same(a.postInsertion,c.postInsertion),'common enemy/neutral world mismatch');
  assert.ok(a.postInsertion.enemyFullStateHash&&a.postInsertion.neutralFullStateHash,
   'full enemy/neutral state fingerprints required');
  assert.equal(a.rngDrawsAtInsertion,c.rngDrawsAtInsertion,'initial RNG replay mismatch');
  assert.ok(same(a.commonSafeSpawnStats,c.commonSafeSpawnStats),'spawn rejection mismatch');
  assert.equal(a.commonSafeSpawnStats.calls,8,'expected eight actual AI spawn calls');
  assert.ok(a.commonSafeSpawnStats.attempts>=8&&
   a.commonSafeSpawnStats.maxAttempts<=64);
  for(const choice of choices){
   const x=row.common[choice],native=row.native[choice];
   assert.equal(x.choice,choice);
   assert.equal(x.baseChoice,row.commonBaseChoice);
   assert.ok(Number.isFinite(x.nearestEnemyDistance)&&x.nearestEnemyDistance>=1000,
    'COMMON-SAFE SPAWN INVARIANT FAILED '+key+'/'+choice);
   assert.ok(native&&Number.isFinite(native.nearestEnemyDistance));
   safeArms++;
   if(native.nearestEnemyDistance>=1000)nativeSafeArms++;
   for(const [name,fn]of Object.entries(measures))
    assert.ok(Number.isFinite(fn(x)),'invalid '+name+' in '+key+'/'+choice);
  }
  worldParity++;
  enemyCount+=a.postInsertion.aiCount;
  totalAttempts+=a.commonSafeSpawnStats.attempts;
  maxAttempts=Math.max(maxAttempts,a.commonSafeSpawnStats.maxAttempts);
  if(!grouped.has(row.seed))grouped.set(row.seed,[]);
  grouped.get(row.seed).push(row);
 }
 assert.equal(grouped.size,expectedSeeds,'independent seed count mismatch');
 assert.ok([...grouped.values()].every(rows=>rows.length===2&&
  new Set(rows.map(r=>r.hz)).size===2&&
  new Set(rows.map(r=>r.commonBaseChoice)).size===1),
  'each seed requires both FPS repeats and one consistent base');
 const baseSeedCounts={fresh:0,return:0};
 for(const rows of grouped.values())baseSeedCounts[rows[0].commonBaseChoice]++;
 assert.ok(Math.abs(baseSeedCounts.fresh-baseSeedCounts.return)<=1,
  'common-world native base must be balanced across independent seeds');
 const metrics={};
 for(const [name,fn]of Object.entries(measures)){
  const clustered=[];
  for(const rows of grouped.values()){
   clustered.push(mean(rows.map(r=>fn(r.common.return)-fn(r.common.fresh))));
  }
  metrics[name]={conditionalReturnMinusFresh:mean(clustered),
   seedBootstrap95:interval(clustered)};
 }
 return {
  contract:'SUPPORTED common-safe initial world, CONDITIONAL scripted geography only; not native total-policy or human benefit',
  independentSeeds:grouped.size,fpsRepeatedObservations:data.results.length,
  layouts:[...layoutCells].sort(),balancedNativeBasesBySeed:baseSeedCounts,
  preludeSeconds:data.preludeSeconds,
  postSeconds:data.seconds,
  spawnSafety:{minimumAISeparation:1000,safeArms,nativeSafeArms,
   matchedEnemyNeutralWorldPairs:worldParity,generatedEnemies:enemyCount,
   totalCandidateAttempts:totalAttempts,maxAttemptsPerEnemy:maxAttempts,
   initialSupportVerified:true},
  metrics,
  limitations:[
   'Shared initial enemy worlds are conditioned on BOTH genuine insertion locations, with native base choice counterbalanced across independent seeds.',
   'The 8s first life is played, but death is forced if the pilot survives; these are not natural-death exposures.',
   'Only the initial post-redeploy world is controlled; subsequent AI/ecology evolution is allowed to respond to the player.',
   'FPS repeats are technical repeated measures. Confidence intervals resample independent seeds only.',
   'Public-only scripted pilot behavior does not establish player comprehension, preference, fun or an optimal strategy.',
   'No game balance, spawning rule, class or UI is modified by this research harness.'
  ]
 };
}
if(require.main===module){
 if(process.argv.length!==3)throw Error('Usage: node scripts/redeploy-common-safe-report.cjs common-safe-geography.json');
 const input=process.argv[2];
 const out=analyzeCommonSafe(JSON.parse(fs.readFileSync(input,'utf8')),
  Number(process.env.NOVA_COMMON_SAFE_EXPECTED_SEEDS||12));
 fs.writeFileSync(input.replace(/\.json$/,'-summary.json'),JSON.stringify(out,null,2));
 console.log(JSON.stringify(out,null,2));
}
module.exports={analyzeCommonSafe};
