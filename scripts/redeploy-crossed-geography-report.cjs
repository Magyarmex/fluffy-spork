'use strict';
/* Research-only 2x2 crossed FRESH/RETURN analysis. Never pool FPS repeats or
 * the two native base worlds as independent experimental units. */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const choices=['fresh','return'];
const metrics={
 nearestEnemyDistance:x=>x.nearestEnemyDistance,
 hp:x=>x.hp,neutralXP:x=>x.neutralXP,score:x=>x.score,
 survival:x=>Number(x.alive),frontArrival:x=>Number(x.frontReached!==null),
 enemySeenLegacyRangeProxy:x=>Number(x.firstVisibleEnemy!==null),
 fairEnemySeen:x=>Number(x.firstFairVisibleEnemy!==null),
 initialEnemyWithin60:x=>Number(x.nearestEnemyDistance<60),
 neutralSeen:x=>Number(x.firstVisibleNeutral!==null),
 blockedNearFrontSeconds:x=>x.blockedNearFrontSeconds,
 routeRequests:x=>x.routeRequests,travelled:x=>x.travelled
};
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function bootstrap(values,repetitions=3000){
 const n=values.length;if(!n)return null;
 let state=0x45acb3d7;
 const draws=[];
 for(let k=0;k<repetitions;k++){
  let sum=0;
  for(let i=0;i<n;i++){
   state^=state<<13;state^=state>>>17;state^=state<<5;
   sum+=values[(state>>>0)%n];
  }
  draws.push(sum/n);
 }
 draws.sort((a,b)=>a-b);
 return [draws[Math.floor(.025*(repetitions-1))],
  draws[Math.ceil(.975*(repetitions-1))]];
}
function reportCrossed(data,expectedSeeds=12){
 assert.equal(data.protocolVersion,'crossed-geography-v1','unknown research protocol');
 assert.ok(Number.isInteger(expectedSeeds)&&expectedSeeds>0);
 assert.equal(data.results?.length,expectedSeeds*2,'missing FPS repeats or seed rows');
 const groups=new Map(),layouts=new Set(),all=[];
 for(const row of data.results){
  assert.ok(Number.isInteger(row.seed)&&[30,60].includes(row.hz));
  const key=row.seed+'/'+row.hz;
  assert.ok(!all.some(x=>x.key===key),'duplicate seed/FPS observation');
  assert.ok(row.spawns&&row.nativePostInsertion&&row.worlds);
  const pair={key,seed:row.seed,hz:row.hz,layout:row.layout,rotation:row.rotation};
  const worlds=row.worlds;
  for(const base of choices){
   const a=worlds[base]?.fresh,b=worlds[base]?.return;
   assert.ok(a&&b,'missing crossed arm '+key+'/'+base);
   assert.ok(same(a.postInsertion,b.postInsertion),
    'enemy/neutral base-world mismatch within '+key+'/'+base);
   assert.ok(same(a.postInsertion,row.nativePostInsertion[base]),
    'native post-insertion mismatch '+key+'/'+base);
   assert.ok(same(a.origin,b.origin)&&same(a.prelude,b.prelude),
    'first-life mismatch '+key+'/'+base);
   for(const position of choices){
    const x=worlds[base][position];
    assert.equal(x.baseChoice,base);
    assert.equal(x.choice,position);
    assert.ok(same(x.spawn,row.spawns[position]),'transplanted position mismatch');
    assert.ok(same(x.generatedSpawn,row.spawns[base]),'native base spawn mismatch');
    assert.ok(x.fingerprintHash===worlds.fresh.fresh.fingerprintHash,
     'pre-death physical world mismatch');
    assert.ok(Number.isFinite(x.nearestEnemyDistance)&&x.nearestEnemyDistance>=0);
    for(const [name,fn]of Object.entries(metrics))
     assert.ok(Number.isFinite(fn(x)),'invalid '+name+' in '+key+'/'+base+'/'+position);
   }
  }
  assert.ok(same(worlds.fresh.fresh.origin,worlds.return.return.origin),
   'pre-death origins differ between native policies');
  assert.ok(row.layout&&Number.isInteger(row.rotation));
  layouts.add(row.layout+'/'+row.rotation);
  all.push(pair);
  if(!groups.has(row.seed))groups.set(row.seed,[]);
  groups.get(row.seed).push(row);
 }
 assert.equal(groups.size,expectedSeeds,'independent seed count');
 assert.ok([...groups.values()].every(rows=>rows.length===2&&
  new Set(rows.map(r=>r.hz)).size===2),'each seed must have both frame rates');
 /* The real spawnAITank uses randSpawnPos(1000) relative to the native
  * player. Crossing an enemy world with the other player position can break
  * this structural safety invariant. Such off-diagonal cells are not valid
  * native-play counterfactuals; never promote their outcome gaps as causal. */
 const exclusion=1000,counts={native:0,offDiagonal:0,nativeBelow:0,offDiagonalBelow:0};
 let fullySupportedSeeds=0;
 for(const rows of groups.values()){
  let allSafe=true;
  for(const row of rows)for(const base of choices)for(const pos of choices){
   const dist=row.worlds[base][pos].nearestEnemyDistance;
   const native=base===pos;
   counts[native?'native':'offDiagonal']++;
   if(dist<exclusion){
    counts[native?'nativeBelow':'offDiagonalBelow']++;
    if(!native)allSafe=false;
   }
  }
  if(allSafe)fullySupportedSeeds++;
 }
 const causalIdentification=counts.nativeBelow===0&&counts.offDiagonalBelow===0;
 const out={contract:'crossed insertion falsification: exploratory outcomes, NOT identified native-play geography effects',
  independentSeeds:groups.size,fpsRepeatedObservations:data.results.length,
  crossedWorldPairs:data.results.length*2,layouts:[...layouts].sort(),
  preludeSeconds:data.preludeSeconds,postSeconds:data.seconds,
  spawnSafety:{
   canonicalAIMinDistanceRequested:exclusion,
   ...counts,independentSeedsWithAllFourCellsSafeAtBothHz:fullySupportedSeeds,
   causalGeographyIdentified:causalIdentification,
   verdict:causalIdentification?
    'All observed cells preserve native enemy clearance; other confounds and human value remain untested.':
    'FALSIFIED: crossed positions violate the native 1000u AI spawn-exclusion policy. Exploratory effect estimates cannot be interpreted as native-play causal geography.'
  },
  postInsertionParity:{withinBaseWorldPairs:data.results.length*2,
   nativeFreshVsReturnEnemyBodiesSame:data.results.filter(r=>
    r.nativePostInsertion.fresh.enemyBodiesHash===r.nativePostInsertion.return.enemyBodiesHash).length,
   nativeFreshVsReturnNeutralBodiesSame:data.results.filter(r=>
    r.nativePostInsertion.fresh.neutralBodiesHash===r.nativePostInsertion.return.neutralBodiesHash).length},
  metrics:{},limitations:[
   'One scripted public-information pilot, not a randomized human study.',
   'The native FRESH and RETURN enemy/neutral worlds are separately generated; crossing creates off-policy enemy proximity in many cells and does not preserve the 1000u AI spawn-exclusion policy.',
   'FPS and base worlds are repeated observations of each independent seed, not additional independent samples.',
   'The native diagonal is a total-policy contrast; off-diagonal differences are exploratory outside native spawn support, NOT isolated gameplay geography.',
   'Legacy 600u/LoS enemy-seen is not a camera/viewport observation; fairEnemySeen separately requires both player and camera bounds plus terrain line-of-sight.'
  ]};
 for(const [name,fn]of Object.entries(metrics)){
  const cluster=[];
  for(const rows of groups.values()){
   const differences=[];
   for(const row of rows){
    const w=row.worlds;
    const geo=mean(choices.map(base=>fn(w[base].return)-fn(w[base].fresh)));
    const base=mean(choices.map(pos=>fn(w.return[pos])-fn(w.fresh[pos])));
    const interaction=(fn(w.return.return)-fn(w.return.fresh))-
     (fn(w.fresh.return)-fn(w.fresh.fresh));
    const native=fn(w.return.return)-fn(w.fresh.fresh);
    differences.push({geo,base,interaction,native});
   }
   cluster.push(Object.fromEntries(['geo','base','interaction','native'].map(k=>
    [k,mean(differences.map(x=>x[k]))])));
  }
  out.metrics[name]=Object.fromEntries([
   ['conditionalGeographyReturnMinusFresh','geo'],
   ['baseWorldReturnMinusFresh','base'],
   ['geographyByBaseInteraction','interaction'],
   ['nativeTotalPolicyReturnMinusFresh','native']
  ].map(([label,key])=>{
   const values=cluster.map(x=>x[key]);
   return [label,{mean:mean(values),seedBootstrap95:bootstrap(values)}];
  }));
 }
 return out;
}
if(require.main===module){
 if(process.argv.length!==3)throw Error('Usage: node scripts/redeploy-crossed-geography-report.cjs crossed-geography.json');
 const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const result=reportCrossed(data,Number(process.env.NOVA_CROSSED_EXPECTED_SEEDS||12));
 const output=process.argv[2].replace(/\.json$/,'-summary.json');
 fs.writeFileSync(output,JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}
module.exports={reportCrossed};
