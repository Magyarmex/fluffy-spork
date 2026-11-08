'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {replay,analyze}=require('../../scripts/fixed60-raf-trace-replay.cjs');
test('captured clustered 30Hz trace compares low-work, balanced and low-lag budgets',()=>{
 const gaps=Array.from({length:15},()=>[85,40,5,1000/7.5-130]).flat();
 const report=analyze({frameIntervalsMs:gaps});
 const [lowWork,middle,lowLag]=report.recoveryBudgetResults;
 assert.deepEqual(report.recoveryBudgetResults.map(r=>[r.maxSteps,r.backlogExtraTicks]),
  [[2,4],[3,3],[4,2]]);
 for(const row of [lowWork,middle,lowLag]){
  assert.equal(row.simulatedTicks,120);
  assert.equal(row.droppedMs,0);
  assert.equal(row.foregroundStallFrames,0);
  assert.equal(row.remainingBacklogMs,0);
  assert.equal(row.wallMs,2000);
  assert.ok(row.p95SimulationPhaseLagMs>=0);
  assert.ok(row.interpolationSaturatedFrames>0,
   'clustered frame recovery must disclose saturated visual interpolation');
  assert.ok(row.interpolationSaturatedFrames<=row.frames);
  assert.ok(row.p99StepsPerFrame<=row.maxSteps);
 }
 assert.ok(lowWork.peakBacklogMs>middle.peakBacklogMs);
 assert.ok(middle.peakBacklogMs>lowLag.peakBacklogMs);
 assert.ok(lowWork.peakSteps<=2);
 assert.ok(lowLag.peakSteps<=4);
 // The legacy comparison remains stable and uses the default backlog.
 assert.deepEqual(report.results.map(r=>r.backlogExtraTicks),[2,2,2]);
});
test('replay rejects invalid backlog headroom rather than silently changing defaults',()=>{
 for(const bad of [0,1,5,2.5,Infinity,NaN,'4'])
  assert.throws(()=>replay([16,17],2,bad),/backlogExtraTicks/);
 assert.equal(replay([16,17],2).backlogExtraTicks,2);
});
