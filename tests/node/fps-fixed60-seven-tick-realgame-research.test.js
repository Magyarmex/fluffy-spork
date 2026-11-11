'use strict';
/* #799 research-only: compare six-, seven- and eight-tick capacity policies against the
 * existing six-tick controls in the actual composed Game. No production changes.
 * This reports simulation chronology and volley counts; it does NOT measure hit damage.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const {run,frameTimes}=require('../research/fps-20hz-scheduler-pilot.cjs');
const STEP_MS=1000/60, WALL_MS=2000;
const cases=[
 {name:'3+3',maxSteps:3,backlogExtraTicks:3},
 {name:'4+2',maxSteps:4,backlogExtraTicks:2},
 {name:'3+4',maxSteps:3,backlogExtraTicks:4},
 {name:'4+3',maxSteps:4,backlogExtraTicks:3},
 {name:'4+4',maxSteps:4,backlogExtraTicks:4}
];
function check(result,policy,cls,trace){
 assert.ok(Math.abs(result.wallMs-WALL_MS)<.002,'identical wall duration');
 assert.ok(result.updates>=0&&result.updates<=120,'60Hz tick ceiling');
 assert.ok(result.peakSteps<=policy.maxSteps,'per-frame update budget');
 assert.ok(result.lagMs>=0&&result.droppedMs>=0,'nonnegative debt');
 assert.ok(Math.abs(result.updates*STEP_MS+result.droppedMs+result.lagMs-WALL_MS)<.002,
  'simulation + queued + discarded must equal elapsed time');
 assert.equal(result.frameCpuSamples,frameTimes(trace).length,'all frames measured');
 assert.ok(Number.isFinite(result.frameCpuP95Ms)&&result.frameCpuP95Ms>=0,
  'real composed-game CPU evidence');
 assert.ok(result.hostileTankCount>0&&result.neutralShapeCount>0,
  'fixture must retain real battlefield activity');
 if(cls==='hivemind')assert.ok(result.playerDroneCount>0,
  'Hivemind must have real owned drones, not an empty-swarm shortcut');
 if(policy.maxSteps===3)assert.equal(result.fourStepFrameSamples,0,
  'three-step budget must never execute four updates');
 if(result.fourStepFrameSamples>0)assert.ok(
  Number.isFinite(result.fourStepFrameCpuP95Ms),
  'four-step callbacks require a CPU witness');
}
test('real composed Gunner and live-drone Hivemind compare seven- and eight-tick capacity on adversarial active presentation',()=>{
 const rows=[];
 for(const trace of ['30Hz-adversarial95','30Hz-display-quantized','30Hz-seven-tick-falsifier',
  '30Hz-double-burst','30Hz-triple-long-falsifier']){
  const gaps=frameTimes(trace);
  assert.equal(gaps.length,60);
  assert.ok(gaps.every(ms=>ms>0&&ms<100),'do not mix foreground stalls with active jitter');
  assert.ok(Math.abs(gaps.reduce((a,b)=>a+b,0)-WALL_MS)<.002);
  for(const cls of ['minigun','hivemind'])for(const seed of [1517800,1517802]){
   const results=cases.map(policy=>{
    const r=run({seed,cls,cadence:trace,maxSteps:policy.maxSteps,
     backlogExtraTicks:policy.backlogExtraTicks,render:true,profileCpu:true});
    check(r,policy,cls,trace);
    return {policy:policy.name,updates:r.updates,droppedMs:r.droppedMs,
     queuedMs:r.lagMs,peakQueuedMs:r.peakQueuedMs,
     meanQueuedMs:r.meanQueuedMs,volleys:r.volleys,worldHash:r.hash,
     peakSteps:r.peakSteps,fourStepFrames:r.fourStepFrameSamples,
     frameCpuP95Ms:r.frameCpuP95Ms,frameCpuPeakMs:r.frameCpuPeakMs,
     fourStepCpuP95Ms:r.fourStepFrameCpuP95Ms,
     playerDrones:r.playerDroneCount,hostileTanks:r.hostileTankCount};
   });
   // More backlog capacity may retain history rather than simulate it yet:
   // never equate a higher tick count or identical volley count with parity.
   const by=Object.fromEntries(results.map(r=>[r.policy,r]));
   assert.equal(by['3+3'].peakSteps<=3,true);
   assert.equal(by['4+3'].peakSteps<=4,true);
   assert.ok(by['4+4'].droppedMs<=by['4+3'].droppedMs+.002,
    'extra capacity must not discard more active simulation than 4+3');
   if(trace==='30Hz-triple-long-falsifier'){
    assert.ok(by['4+4'].droppedMs>0,
     'eight-tick capacity must expose its genuine clustered-frame limitation');
    assert.ok(by['4+4'].updates<120,
     'discarded time must not masquerade as complete simulation chronology');
   }
   if(trace==='30Hz-seven-tick-falsifier'){
    assert.equal(by['4+4'].droppedMs,0,
     'eight-tick capacity must retain the previously lost active chronology');
    assert.ok(by['4+4'].updates>=by['4+3'].updates,
     'retained chronology must not execute fewer Game updates');
    assert.ok(by['4+4'].queuedMs>0,
     'retained but unfinished ticks must remain visible as queued phase');
    assert.ok(by['4+4'].peakQueuedMs>=by['4+3'].peakQueuedMs-1e-7,
     'more retained history must expose, not hide, the peak phase-lag cost');
   }
   if(by['4+4'].updates===by['4+3'].updates&&
      Math.abs(by['4+4'].queuedMs-by['4+3'].queuedMs)<.002&&
      Math.abs(by['4+4'].droppedMs-by['4+3'].droppedMs)<.002){
    assert.equal(by['4+4'].worldHash,by['4+3'].worldHash,
     'identical four-step chronology must preserve the real physical world');
    assert.equal(by['4+4'].volleys,by['4+3'].volleys,
     'identical four-step chronology must preserve actual Gunner volleys');
   }
   // If both schedules execute every chronological tick with no discarded
   // time and the same end queue, the physical world must not depend on how
   // those ticks were grouped into presentation callbacks.
   if(by['3+4'].droppedMs===0&&by['4+3'].droppedMs===0&&
      by['3+4'].updates===by['4+3'].updates&&
      Math.abs(by['3+4'].queuedMs-by['4+3'].queuedMs)<.002){
    assert.equal(by['3+4'].worldHash,by['4+3'].worldHash,
     'equal chronological updates diverged in the actual composed Game');
    assert.equal(by['3+4'].volleys,by['4+3'].volleys,
     'same held firing history produced different volley counts');
   }
   rows.push({trace,cls,seed,results});
  }
 }
 assert.equal(rows.length,20);
 console.log('REAL_GAME_BACKLOG_CAPACITY_POLICY_COMPARISON '+JSON.stringify({
  rows,caveat:'research only; Node Canvas JS not GPU/Android; sequential CPU timing is host-dependent; volley counts are not applied damage'}));
});
