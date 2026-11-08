'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {replay,analyze}=require('../../scripts/fixed60-raf-trace-replay.cjs');
test('RAF trace replay uses real owner and exposes queued time invisible to droppedMs',()=>{
  const intervals=Array.from({length:240},(_,i)=>i%2===0?1000/120:7000/120);
  const report=analyze({frameIntervalsMs:intervals});
  const [two,three,four]=report.results;
  assert.equal(report.researchOnly,true);
  assert.equal(two.frames,240);
  assert.equal(two.droppedMs,0);
  assert.equal(three.droppedMs,0);
  assert.equal(four.droppedMs,0);
  assert.equal(two.simulatedTicks,478);
  assert.equal(three.simulatedTicks,479);
  assert.equal(four.simulatedTicks,480);
  assert.equal(two.remainingBacklogMs,33.333);
  assert.equal(three.remainingBacklogMs,16.667);
  assert.equal(four.remainingBacklogMs,0);
  assert.ok(three.catchupFrames>0);
  assert.ok(four.peakSteps===4);
});
test('RAF trace replay rejects malformed, unbounded, and hostile intervals',()=>{
  for(const value of [[],[0],[-1],[NaN],[Infinity],[10001],Array(200001).fill(1)])
    assert.throws(()=>replay(value),/expected/);
  for(const cap of [0,5,1.5])assert.throws(()=>replay([33],cap),/maxSteps/);
});
test('steady 30Hz trace reaches native60 tick budget without dropping time',()=>{
  const result=replay(Array(120).fill(1000/30),2);
  assert.equal(result.simulatedTicks,240);
  assert.equal(result.droppedMs,0);
  assert.equal(result.remainingBacklogMs,0);
  assert.equal(result.catchupFrames,0);
});

test('per-frame work concentration exposes catch-up pressure without pretending CPU timing',()=>{
  const steady=replay(Array(120).fill(1000/30),2);
  assert.equal(steady.framesAtStepCap,120);
  assert.equal(steady.framesWithZeroSteps,0);
  assert.equal(steady.p95StepsPerFrame,2);
  assert.equal(steady.p99StepsPerFrame,2);
  const highRefresh=replay(Array(240).fill(1000/120),4);
  assert.equal(highRefresh.simulatedTicks,120);
  assert.equal(highRefresh.framesWithZeroSteps,120,
    '120Hz presentation should reveal zero-update frames at 60Hz simulation');
  assert.equal(highRefresh.p95StepsPerFrame,1);
  assert.equal(highRefresh.framesAtStepCap,0);
  const burst=Array.from({length:240},(_,i)=>i%2===0?1000/120:7000/120);
  for(const cap of [2,3,4]){
    const result=replay(burst,cap);
    assert.ok(result.framesAtStepCap>=0&&result.framesAtStepCap<=result.frames);
    assert.ok(result.framesWithZeroSteps>=0&&result.framesWithZeroSteps<=result.frames);
    assert.ok(result.p95StepsPerFrame<=result.peakSteps);
    assert.ok(result.p99StepsPerFrame<=result.peakSteps);
    assert.ok(result.p99StepsPerFrame>=result.p95StepsPerFrame);
    assert.ok(result.peakSteps<=cap);
  }
  const aggressive=replay(burst,4);
  assert.equal(aggressive.peakSteps,4);
  assert.ok(aggressive.framesAtStepCap>0,
    'the zero-backlog four-step arm must disclose its concentrated work');
});

test('phase reversal is a negative control, not an assumed universal backlog',()=>{
  const reversed=Array.from({length:240},(_,i)=>i%2===0?7000/120:1000/120);
  const result=replay(reversed,2);
  assert.equal(result.simulatedTicks,480);
  assert.equal(result.droppedMs,0);
  assert.equal(result.remainingBacklogMs,0);
});
test('foreground RAF stall is accounted separately from queued backlog',()=>{
  const result=replay([1000/30,150,1000/30],2);
  assert.equal(result.droppedFrames,1);
 assert.equal(result.foregroundStallFrames,1);
 assert.equal(result.maxFrameGapMs,150);
 assert.ok(result.p95FrameGapMs>=100);
  assert.ok(result.droppedMs>0);
  assert.ok(result.simulatedTicks>0);
});

test('reported tick time, skipped time, and backlog conserve wall time',()=>{
  for(let seed=1;seed<=50;seed++){
    let state=seed;
    const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;
      return state/4294967296;};
    const intervals=Array.from({length:120},()=>5+90*random());
    for(const cap of [2,3,4]){
      const result=replay(intervals,cap);
      const accounted=result.simulatedMs+result.droppedMs+result.remainingBacklogMs;
      assert.ok(Math.abs(accounted-result.wallMs)<.005,
        'time accounting must include skipped and queued work: '+JSON.stringify({seed,cap,result}));
    }
  }
});

test('replay preserves capture termination metadata for interpretation',()=>{
 const capture={reason:'hidden',frames:2,foregroundOnly:true};
 const report=analyze({frameIntervalsMs:[16,17],capture});
 assert.deepEqual(report.capture,capture);
 assert.equal(analyze([16,17]).capture,null);
});

test('capture provenance distinguishes guarded timing from verified gameplay',()=>{
 const intervals=[16,17,33];
 const consistent={reason:'hidden',frames:3,durationMs:66,foregroundOnly:true};
 const report=analyze({frameIntervalsMs:intervals,capture:consistent});
 assert.equal(report.captureProvenance.status,'consistent');
 assert.equal(report.captureProvenance.visibilityGuardClaimed,true);
 assert.equal(report.captureProvenance.gameplayActiveVerified,false);
 assert.equal(analyze(intervals).captureProvenance.status,'unverified');
 assert.equal(analyze({frameIntervalsMs:intervals,capture:{...consistent,reason:'running'}})
   .captureProvenance.status,'partial');
 for(const capture of [
   {...consistent,frames:2},
   {...consistent,durationMs:65},
   {...consistent,reason:'start-error'},
   {...consistent,frames:'3'},
   {...consistent,durationMs:Infinity},
 ]){
   const result=analyze({frameIntervalsMs:intervals,capture});
   assert.equal(result.captureProvenance.status,'inconsistent');
   assert.equal(result.results.length,3,'untrusted metadata must not prevent replay');
 }
 assert.equal(analyze({frameIntervalsMs:intervals,capture:{...consistent,reason:'operator-end'}})
   .captureProvenance.status,'unverified','custom stop is not necessarily corrupt');
 const unguarded=analyze({frameIntervalsMs:intervals,capture:{...consistent,foregroundOnly:false}});
 assert.equal(unguarded.captureProvenance.status,'consistent');
 assert.equal(unguarded.captureProvenance.visibilityGuardClaimed,false);
});


test('saturation streak and interval exposure distinguish isolated phase risk from sustained backlog',()=>{
  const smooth=replay(Array(120).fill(1000/30),2);
  assert.equal(smooth.interpolationSaturatedFrames,0);
  assert.equal(smooth.longestSaturationStreakFrames,0);
  assert.equal(smooth.longestSaturationStreakMs,0);
  assert.equal(smooth.saturatedFrameIntervalMs,0);
  assert.equal(smooth.saturatedFrameIntervalShare,0);
  // A bounded clustered schedule must disclose both the number of saturated
  // render samples and their consecutive duration, without calling it FPS.
  const gaps=Array.from({length:15},()=>[85,40,5,1000/7.5-130]).flat();
  const constrained=replay(gaps,2,4);
  const recovered=replay(gaps,4,2);
  for(const r of [constrained,recovered]){
    assert.ok(r.interpolationSaturatedFrames>0);
    assert.ok(r.longestSaturationStreakFrames>=1);
    assert.ok(r.longestSaturationStreakFrames<=r.interpolationSaturatedFrames);
    assert.ok(r.longestSaturationStreakMs>0);
    assert.ok(r.longestSaturationStreakMs<=r.saturatedFrameIntervalMs);
    assert.ok(r.saturatedFrameIntervalMs>0);
    assert.ok(r.saturatedFrameIntervalMs<=r.wallMs);
    assert.ok(r.saturatedFrameIntervalShare>0&&r.saturatedFrameIntervalShare<=1);
  }
  assert.ok(constrained.saturatedFrameIntervalMs>=recovered.saturatedFrameIntervalMs,
    'lower step budget should not conceal its greater phase exposure');
});


test('interval-weighted saturation uses actual RAF gaps and contiguous streaks',()=>{
  const r=replay([34,34],1,4);
  assert.equal(r.simulatedTicks,2);
  assert.equal(r.droppedMs,0);
  assert.equal(r.interpolationSaturatedFrames,2);
  assert.equal(r.longestSaturationStreakFrames,2);
  assert.equal(r.longestSaturationStreakMs,68);
  assert.equal(r.saturatedFrameIntervalMs,68);
  assert.equal(r.saturatedFrameIntervalShare,1);
});


test('lower saturation is not a victory when the scheduler drops simulation time',()=>{
  const gaps=Array.from({length:15},()=>[85,40,5,1000/7.5-130]).flat();
  const baseline=replay(gaps,2,2);
  const retained=replay(gaps,2,4);
  assert.ok(baseline.droppedMs>0);
  assert.equal(retained.droppedMs,0);
  assert.ok(baseline.interpolationSaturatedFrames<retained.interpolationSaturatedFrames,
    'dropping simulation time can artificially reduce reported phase saturation');
  assert.ok(baseline.simulatedTicks<retained.simulatedTicks);
});
