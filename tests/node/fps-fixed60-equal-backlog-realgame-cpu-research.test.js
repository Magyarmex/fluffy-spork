'use strict';
/* #799 research only. Exercise the ACTUAL composed Game and Canvas renderer
 * with the equal-total-backlog 3+3 and 4+2 fixed60 policies. This is Node
 * JavaScript CPU evidence, not Chromium paint or physical Android approval.
 * No production scheduler, input, weapons, or materializer changes. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {run}=require('../research/fps-20hz-scheduler-pilot.cjs');
const STEP_MS=1000/60;
const DURATION_MS=2000;
function witness(cls,seed,cadence,maxSteps,backlogExtraTicks){
 const result=run({cls,seed,cadence,
  maxSteps,backlogExtraTicks,render:true,profileCpu:true});
 assert.ok(Math.abs(result.wallMs-DURATION_MS)<1e-6,'matched two-second wall time');
 assert.equal(result.frameCpuSamples,60,'all 60 real composed frames rendered');
 assert.ok(result.updates>0&&result.updates<=120,'bounded 60Hz simulation');
 assert.ok(result.peakSteps<=maxSteps,'no update budget violation');
 assert.ok(result.droppedMs>=0&&result.lagMs>=0,'nonnegative simulation debt');
 assert.ok(Math.abs(result.updates*STEP_MS+result.droppedMs+
  result.lagMs-DURATION_MS)<.002,
  'simulation, discarded and queued time must account for wall time');
 for(const name of ['frameCpuP50Ms','frameCpuP95Ms','frameCpuP99Ms',
  'frameCpuPeakMs','frameUpdateCpuP95Ms','frameRenderCpuP95Ms']){
  assert.ok(Number.isFinite(result[name])&&result[name]>=0,
   cls+' '+name+' missing real composed CPU witness');
 }
 assert.ok(result.frameCpuP50Ms<=result.frameCpuP95Ms);
 assert.ok(result.frameCpuP95Ms<=result.frameCpuP99Ms);
 assert.ok(result.frameCpuP99Ms<=result.frameCpuPeakMs);
 return result;
}
test('equal-backlog 3+3 and 4+2 expose real Gunner/Carrier CPU burst costs',()=>{
 const rows=[];
 for(const cadence of ['30Hz-adversarial','30Hz-adversarial95'])
 for(const cls of ['minigun','carrier'])for(const seed of [1517800,1517802]){
  const three=witness(cls,seed,cadence,3,3);
  const four=witness(cls,seed,cadence,4,2);
  // The alternatives share six ticks of total capacity, not identical
  // per-frame chronology. Do not falsely require matching damage or hashes.
  assert.equal(three.maxSteps+three.backlogExtraTicks,6);
  assert.equal(four.maxSteps+four.backlogExtraTicks,6);
  assert.ok(four.peakSteps>=three.peakSteps,
   'four-step candidate must not have less observed peak work on this trace');
  assert.ok(four.updates<=120 && three.updates<=120);
  rows.push({cls,seed,cadence,
   three:{updates:three.updates,droppedMs:three.droppedMs,
    lagMs:three.lagMs,peakSteps:three.peakSteps,
    frameCpuP95Ms:three.frameCpuP95Ms,
    frameCpuPeakMs:three.frameCpuPeakMs,
    updateCpuP95Ms:three.frameUpdateCpuP95Ms,
    renderCpuP95Ms:three.frameRenderCpuP95Ms},
   four:{updates:four.updates,droppedMs:four.droppedMs,
    lagMs:four.lagMs,peakSteps:four.peakSteps,
    frameCpuP95Ms:four.frameCpuP95Ms,
    frameCpuPeakMs:four.frameCpuPeakMs,
    updateCpuP95Ms:four.frameUpdateCpuP95Ms,
    renderCpuP95Ms:four.frameRenderCpuP95Ms}});
 }
 assert.equal(rows.length,8);
 console.log('REAL_GAME_EQUAL_BACKLOG_CPU '+JSON.stringify({
  rows,caveat:'Node Canvas-JS only; host load varies; no absolute CPU threshold or Android claim'}));
});
