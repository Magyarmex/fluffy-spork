'use strict';
/* #799 research-only. Profile real composed nine-hunter Hivemind under
 * adversarial active 30Hz presentation. Node Canvas-JS is not Android GPU
 * or touch-to-photon evidence; no production runtime is modified. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {run,frameTimes}=require('../research/fps-20hz-scheduler-pilot.cjs');
const STEP_MS=1000/60;
test('shipping nine-hunter Hivemind compares seven- and eight-tick CPU recovery without inventing drones',()=>{
 const rows=[];
 for(const trace of ['30Hz-adversarial95','30Hz-double-burst','30Hz-seven-tick-falsifier']){
  const gaps=frameTimes(trace);
  assert.equal(gaps.length,60);
  assert.ok(gaps.every(ms=>ms>0&&ms<100),'active jitter only; no foreground stall');
  assert.ok(Math.abs(gaps.reduce((a,b)=>a+b,0)-2000)<.002);
  for(const seed of [1517800,1517802]){
   const candidates=[];
   for(const [maxSteps,extra] of [[3,4],[4,3],[4,4]]){
    const r=run({seed,cls:'hivemind',cadence:trace,maxSteps,
     backlogExtraTicks:extra,denseHivemind:true,render:true,profileCpu:true});
    assert.equal(r.denseHivemind,true);
    assert.equal(r.initialPlayerDroneCount,9,
     'nine real player-owned Hivemind hunters must exist at simulation start');
    assert.ok(r.hostileTankCount>0&&r.neutralShapeCount>0,
     'real rival tanks and neutral ecology must remain active');
    assert.equal(r.frameCpuSamples,60,'measure all composed Game/Canvas callbacks');
    assert.ok(r.peakSteps<=maxSteps,'per-frame update budget');
    assert.ok(Math.abs(r.updates*STEP_MS+r.droppedMs+r.lagMs-2000)<.002,
     'simulation, discarded and queued time must account for elapsed wall time');
    assert.ok(Number.isFinite(r.peakQueuedMs)&&r.peakQueuedMs>=r.lagMs-1e-7,
     'peak queued simulation phase must include final backlog');
    assert.ok(Number.isFinite(r.meanQueuedMs)&&r.meanQueuedMs>=0&&
     r.meanQueuedMs<=r.peakQueuedMs+1e-7,
     'mean queued simulation phase must be bounded by peak');
    assert.ok(Number.isInteger(r.queuedOverTickFrames)&&
     r.queuedOverTickFrames>=0&&r.queuedOverTickFrames<=60,
     'queued-over-one-tick frame count must be bounded');
    assert.ok(Number.isFinite(r.frameCpuP95Ms)&&Number.isFinite(r.frameCpuPeakMs),
     'real composed CPU witnesses required');
    if(maxSteps===3)assert.equal(r.fourStepFrameSamples,0);
    if(r.fourStepFrameSamples>0)assert.ok(Number.isFinite(r.fourStepFrameCpuP95Ms));
    candidates.push({maxSteps,extra,updates:r.updates,droppedMs:r.droppedMs,
     queuedMs:r.lagMs,peakQueuedMs:r.peakQueuedMs,
     meanQueuedMs:r.meanQueuedMs,queuedOverTickFrames:r.queuedOverTickFrames,
     worldHash:r.hash,volleys:r.volleys,
     remainingPlayerDrones:r.playerDroneCount,
     frameCpuP95Ms:r.frameCpuP95Ms,frameCpuPeakMs:r.frameCpuPeakMs,
     fourStepFrameCpuP95Ms:r.fourStepFrameCpuP95Ms,
     fourStepFrames:r.fourStepFrameSamples});
   }
   const [three,four,eight]=candidates;
   assert.ok(eight.droppedMs<=four.droppedMs+.002,
    '4+4 must not discard more active simulation than 4+3');
   if(eight.updates===four.updates&&
      Math.abs(eight.queuedMs-four.queuedMs)<.002&&
      Math.abs(eight.droppedMs-four.droppedMs)<.002){
    assert.equal(eight.worldHash,four.worldHash,
     'same four-update chronology must preserve the real nine-hunter swarm');
    assert.equal(eight.volleys,four.volleys,
     'same four-update chronology must preserve player volleys');
   }
   if(three.droppedMs===0&&four.droppedMs===0&&
      three.updates===four.updates&&Math.abs(three.queuedMs-four.queuedMs)<.002){
    assert.equal(three.worldHash,four.worldHash,
     'same full simulation chronology must preserve the physical swarm');
    assert.equal(three.volleys,four.volleys,
     'same chronology must preserve player volleys');
   }
   rows.push({trace,seed,initialHunters:9,candidates});
  }
 }
 assert.equal(rows.length,6);
 console.log('REAL_GAME_NINE_HUNTER_BACKLOG_CAPACITY_CPU '+JSON.stringify({
  rows,caveat:'Node JS/Canvas only; sequential host CPU is not physical Android, GPU paint, or natural match FPS'}));
});
