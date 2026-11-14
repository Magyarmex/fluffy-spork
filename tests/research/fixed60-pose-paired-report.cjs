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
function compareTriple(offA,offB,on){
 assert.equal(offA.pose?.enabled,false,'first A/A control must use the native presenter');
 assert.equal(offB.pose?.enabled,false,'second A/A control must use the native presenter');
 assert.equal(offB.pose?.frames,0,'second A/A control must not run pose presentation');
 assert.equal(on.pose?.enabled,true,'B candidate must use the opt-in presenter');
 const arms=[['OFF-A',offA],['OFF-B',offB],['ON',on]];
 for(const [label,arm] of arms){
  assert.equal(arm.initialFingerprint,offA.initialFingerprint,
   label+' must start from the same seeded materialized Game');
  for(const key of ['configuredMaxSteps','backlogExtraTicks','controlledGate','presentationTargetHz'])
   assert.equal(arm[key],offA[key],label+' '+key+' must match');
  assert.equal(arm.controlledGate,true,label+' must use controlled Chromium callbacks');
  assert.equal(arm.productionRafActive,false,label+' must not leave the production RAF active');
  assert.ok(arm.births>0,label+' must emit a real player projectile');
  assert.ok(arm.raf?.frames>2&&Number.isFinite(arm.raf?.activePresentationHz),
   label+' must report actual composed-Game callbacks');
  assert.ok(arm.raf.activeIntervals?.n>0&&Number.isFinite(arm.raf.activeIntervals?.p95),
   label+' must report active composed-Game callback intervals');
  assert.ok(arm.blankRaf&&Number.isFinite(arm.blankRaf.hz)&&
   Number.isFinite(arm.blankRaf.p95),label+' must include the same-process blank RAF control');
  assert.equal(arm.rafHostCapable,arm.blankRaf.supports90Hz,
   label+' host-capability flag must match the blank RAF control');
 }
 assert.equal(offA.presentationTargetHz,90,'experiment target must be 90Hz');
 assert.equal(offA.configuredMaxSteps,2,'90Hz arms use a two-step safety ceiling');
 assert.equal(offA.backlogExtraTicks,2,'90Hz arms use the bounded two-tick backlog');
 const hostCapability=new Set(arms.map(([,arm])=>arm.blankRaf.supports90Hz));
 assert.equal(hostCapability.size,1,'all matched arms must agree on blank-page RAF host capability');
 if(!offA.blankRaf.supports90Hz){
  const blankRaf=Object.fromEntries(arms.map(([label,arm])=>[label,arm.blankRaf]));
  const gameRaf=Object.fromEntries(arms.map(([label,arm])=>[label,{
   activePresentationHz:arm.raf.activePresentationHz,
   activeIntervals:arm.raf.activeIntervals,frames:arm.raf.frames,
   droppedMs:arm.droppedMs,ticks:arm.ticks}]));
  return {researchOnly:true,causalPerformanceComparison:false,
   status:'inconclusive-host-raf-capability',gatePassed:false,inconclusive:true,
   targetPresentationHz:90,
   reason:'The same-process blank-page RAF control could not sustain 80–100Hz with p95 below 15ms; this Chromium runner cannot validate the composed-Game 90Hz gate.',
   blankRaf,gameRaf};
 }
 for(const [label,arm] of arms){
  assert.ok(arm.raf.activePresentationHz>=80&&arm.raf.activePresentationHz<=100,
   label+' must demonstrate near-90Hz active callbacks when the blank-page host control passes');
  assert.ok(arm.raf.activeIntervals.p95<15,
   label+' active callback p95 must remain below 15ms when the blank-page host control passes');
 }
 const paired=compare(offA,on);
 return {...paired,researchOnly:true,causalPerformanceComparison:false,
  status:'90hz-browser-gate-passed',gatePassed:true,inconclusive:false,
  targetPresentationHz:90,
  offRepeat:{ticks:offB.ticks,wallMs:offB.raf.observedWallMs,
   simulatedMs:offB.raf.simulatedMs,activePresentationHz:offB.raf.activePresentationHz,
   callbackP95Ms:offB.raf.callbackJs.p95,renderP95Ms:offB.renders.p95,
   touchToCanvasMs:offB.touchToCanvasSubmissionMs,births:offB.births},
  activePresentationHz:{offA:offA.raf.activePresentationHz,
   offB:offB.raf.activePresentationHz,on:on.raf.activePresentationHz}};
}
if(require.main===module){
 try{
  assert.ok(process.argv.length===4||process.argv.length===5,
   'usage: node fixed60-pose-paired-report.cjs off.json on.json OR off-a.json off-b.json on.json');
  const arms=process.argv.slice(2).map(file=>JSON.parse(fs.readFileSync(file,'utf8')));
  const result=arms.length===3?compareTriple(arms[0],arms[1],arms[2]):compare(arms[0],arms[1]);
  console.log('NOVA_FIXED60_POSE_PAIRED_CHROMIUM '+JSON.stringify(result));
 }catch(error){console.error(error.stack||error);process.exitCode=1;}
}
module.exports={compare,compareTriple};
