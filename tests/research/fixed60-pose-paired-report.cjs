'use strict';
// Research-only paired Chromium reporting: same seeded playable world and
// catch-up policy, but sequential runs are NOT a causal CPU/latency A/B.
// The existing Game.prototype.update timer excludes the pose snapshot wrapper;
// report RAF callback JS instead of mislabeling it as per-tick snapshot cost.
const assert=require('node:assert/strict');
const fs=require('node:fs');
function compare(off,on){
 assert.equal(off.pose?.enabled,false,'OFF control must use the native presenter');
 assert.equal(on.pose?.enabled,true,'ON candidate must use the opt-in presenter');
 assert.equal(off.initialFingerprint,on.initialFingerprint,
  'paired arms must start in the same seeded materialized Game');
 assert.match(off.initialFingerprint,/^[0-9a-f]{8}:[0-9]+$/);
 for(const key of ['configuredMaxSteps','backlogExtraTicks','controlledGate'])
  assert.equal(off[key],on[key],key+' must match');
 assert.equal(off.controlledGate,true,'comparison requires controlled Chromium RAF');
 assert.equal(off.productionRafActive,false);
 assert.equal(on.productionRafActive,false);
 assert.ok(off.births>0&&on.births>0,'both arms must emit real projectiles');
 assert.equal(off.pose.frames,0,'OFF must not run pose instrumentation');
 assert.ok(on.pose.frames>2&&on.pose.interpolated>0,
  'ON must execute actual interpolation during real Game renders');
 assert.ok(on.pose.shiftedBulletFrames>0,
  'ON must actually present at least one projectile at an interpolated pose');
 assert.ok(on.pose.renderJs.p95>=0&&Number.isFinite(on.pose.renderJs.p95));
 // Sequential browser arms can advance different amounts of simulated time.
 // Report the exposure explicitly; matching seed and policy is not matching
 // tick chronology, so never present these P95 values as a causal speedup.
 const exposure=arm=>{
  const ticks=arm.ticks,wallMs=arm.raf?.observedWallMs,
   simulatedMs=arm.raf?.simulatedMs,queuedMs=arm.raf?.remainingLagMs,
   droppedMs=arm.droppedMs;
  assert.ok(Number.isInteger(ticks)&&ticks>0,'missing authoritative tick count');
  for(const [name,value] of Object.entries({wallMs,simulatedMs,queuedMs,droppedMs}))
   assert.ok(Number.isFinite(value)&&value>=0,'invalid '+name+' exposure');
  assert.ok(wallMs>0,'missing observed RAF wall time');
  assert.ok(Math.abs(simulatedMs-ticks*1000/60)<1e-6,
   'simulated milliseconds disagree with authoritative tick count');
  const errorMs=simulatedMs+queuedMs+droppedMs-wallMs;
  assert.ok(Math.abs(errorMs)<1,'RAF time accounting is inconsistent');
  return {ticks,wallMs,simulatedMs,queuedMs,droppedMs,
   conservationErrorMs:+errorMs.toFixed(5)};
 };
 const offExposure=exposure(off),onExposure=exposure(on);
 const result={
  researchOnly:true,causalPerformanceComparison:false,
  initialFingerprint:on.initialFingerprint,
  maxSteps:on.configuredMaxSteps,
  off:{frames:off.raf.frames,exposure:offExposure,renderP95Ms:off.renders.p95,
   callbackP95Ms:off.raf.callbackJs.p95,touchToCanvasMs:off.touchToCanvasSubmissionMs,
   births:off.births,droppedMs:off.droppedMs},
  on:{frames:on.raf.frames,exposure:onExposure,renderP95Ms:on.renders.p95,
   callbackP95Ms:on.raf.callbackJs.p95,touchToCanvasMs:on.touchToCanvasSubmissionMs,
   births:on.births,droppedMs:on.droppedMs,
   poseRenderP95Ms:on.pose.renderJs.p95,
   interpolated:on.pose.interpolated,
   shiftedBulletFrames:on.pose.shiftedBulletFrames,
   alphaBelowQuarterFrames:on.pose.alphaBelowQuarterFrames,
   alphaSaturatedFrames:on.pose.alphaSaturatedFrames,
   meanNominalPoseDelayMs:on.pose.meanNominalPoseDelayMs,
   teleportSkips:on.pose.teleportSkips}
 };
 return result;
}
if(require.main===module){
 try{
  assert.equal(process.argv.length,4,
   'usage: node fixed60-pose-paired-report.cjs off.json on.json');
  const [off,on]=process.argv.slice(2).map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
  console.log('NOVA_FIXED60_POSE_PAIRED_CHROMIUM '+JSON.stringify(compare(off,on)));
 }catch(error){console.error(error.stack||error);process.exitCode=1;}
}
module.exports={compare};
