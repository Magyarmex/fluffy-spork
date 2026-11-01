'use strict';
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {ChronologicalInput,FixedStepPresentation}=require('../research/fixed-step-dom-input.cjs');
const {SubtickFirePulse}=require('../research/subtick-fire-pulse.cjs');
function run({seed=1517800,hz=60,release=.008,cancel=false,mode='pulse',kind='touch',blur=false}){
 return withSeed(seed,draws=>{
  const game=bootGame();game.sfx.muted=true;game.input.autofire=false;
  const timeline=new ChronologicalInput(game.input),driver=new FixedStepPresentation(game,timeline,{maxSteps:2});
  const pulse=mode==='pulse'?new SubtickFirePulse(game,timeline):null;
  if(kind==='touch'){
   timeline.push(.001,'pointerdown',{pointerType:'touch',pointerId:22,clientX:600,clientY:200});
   timeline.push(.002,'pointermove',{pointerType:'touch',pointerId:22,clientX:640,clientY:200});
   timeline.push(release,cancel?'pointercancel':'pointerup',{pointerType:'touch',pointerId:22,clientX:640,clientY:200});
  }else{
   timeline.push(.001,'pointerdown',{pointerType:'mouse',pointerId:1,button:0,buttons:1,clientX:600,clientY:200});
   timeline.push(release,cancel?'pointercancel':'pointerup',{pointerType:'mouse',pointerId:1,button:0,buttons:0,clientX:600,clientY:200});
  }
  if(blur)timeline.push(Math.min(release+.001,.016),'blur');
  let maxBullets=0;
  for(let frame=1;frame<=hz;frame++){
   driver.frame(frame/hz);maxBullets=Math.max(maxBullets,game.bullets.length);
  }
  const result={hash:digest(physical(game)),draws:draws(),maxBullets,pulses:pulse?.pulses||0,
   firing:game.input.firing,aim:game.input.aim.active,ticks:driver.ticks,dropped:driver.droppedTicks};
  if(pulse)pulse.detach();game.destroy();return result;
 });
}
test('brief intentional aimed touch and primary mouse taps get exactly one simulation opportunity',()=>{
 for(const kind of ['touch','mouse'])for(const seed of [1517800,1517802,1517810]){
  const baseline=run({seed,kind,mode:'baseline'});
  assert.equal(baseline.maxBullets,0,`baseline expected to miss ${kind} tap`);
  const ref=run({seed,kind});assert.equal(ref.maxBullets,1,`pulse must fire ${kind}`);
  assert.equal(ref.pulses,1);assert.equal(ref.firing,false);assert.equal(ref.aim,false);
  for(const hz of [30,120,240])assert.deepEqual(run({seed,kind,hz}),ref,`seed ${seed},${kind},${hz}`);
 }
});
test('cancellation, blur, and long held input never manufacture a tap',()=>{
 for(const kind of ['touch','mouse'])for(const hz of [30,60,120,240]){
  const canceled=run({kind,hz,cancel:true});assert.equal(canceled.maxBullets,0);
  assert.equal(canceled.pulses,0);
  const blurred=run({kind,hz,blur:true});assert.equal(blurred.maxBullets,0);
  assert.equal(blurred.pulses,0);
  const long=run({kind,hz,release:.05});assert.equal(long.pulses,0);
  assert.ok(long.maxBullets>=1);assert.equal(long.firing,false);
 }
});
test('detach restores original input and Game methods and clears pending pulse',()=>{
 const game=bootGame(),timeline=new ChronologicalInput(game.input);
 const orig={pd:game.input.pd,pu:game.input.pu,pm:game.input.pm,update:game.update,reset:timeline.reset,releaseAll:timeline.releaseAll};
 const pulse=new SubtickFirePulse(game,timeline);
 timeline.push(.001,'pointerdown',{pointerType:'mouse',pointerId:1,button:0,clientX:600,clientY:200});
 timeline.push(.002,'pointerup',{pointerType:'mouse',pointerId:1,button:0,clientX:600,clientY:200});
 timeline.consumeThrough(.005);assert.ok(pulse.pending);
 pulse.detach();for(const [k,fn] of Object.entries(orig))assert.equal((k==='reset'||k==='releaseAll')?timeline[k]:k==='update'?game[k]:game.input[k],fn);
 assert.equal(game.input.firing,false);game.destroy();
});
function runEvents(events,{seed=1517800,hz=60,pulseEnabled=true,paused=false}={}) {
 return withSeed(seed,draws=>{
  const game=bootGame();game.sfx.muted=true;game.input.autofire=false;
  const timeline=new ChronologicalInput(game.input),driver=new FixedStepPresentation(game,timeline,{maxSteps:2});
  const pulse=pulseEnabled?new SubtickFirePulse(game,timeline):null;
  for(const [at,kind,data] of events)timeline.push(at,kind,data||{});
  if(paused)game.setPaused(true);
  let maxBullets=0;
  for(let i=1;i<=hz;i++){driver.frame(i/hz);maxBullets=Math.max(maxBullets,game.bullets.length);}
  const out={maxBullets,pulses:pulse?.pulses||0,draws:draws(),hash:digest(physical(game)),
   firing:game.input.firing,move:game.input.move.active,aim:game.input.aim.active};
  if(pulse)pulse.detach();game.destroy();return out;
 });
}
test('independent movement finger cannot steal or cancel a short aimed shot',()=>{
 const events=[
  [.001,'pointerdown',{pointerType:'touch',pointerId:22,clientX:600,clientY:200}],
  [.002,'pointermove',{pointerType:'touch',pointerId:22,clientX:640,clientY:200}],
  [.003,'pointerdown',{pointerType:'touch',pointerId:11,clientX:100,clientY:200}],
  [.004,'pointerup',{pointerType:'touch',pointerId:11,clientX:100,clientY:200}],
  [.005,'pointerup',{pointerType:'touch',pointerId:22,clientX:640,clientY:200}]
 ];
 for(const hz of [30,60,120,240]){
  const r=runEvents(events,{hz});assert.equal(r.maxBullets,1);assert.equal(r.pulses,1);
  assert.equal(r.firing,false);assert.equal(r.aim,false);assert.equal(r.move,false);
 }
});
test('zero-direction aim, UI press, and canceled pending pulse never fire',()=>{
 const scenarios=[
  [[.001,'pointerdown',{pointerType:'touch',pointerId:22,clientX:600,clientY:200}],
   [.005,'pointerup',{pointerType:'touch',pointerId:22,clientX:600,clientY:200}]],
  [[.001,'pointerdown',{pointerType:'mouse',pointerId:1,button:0,clientX:600,clientY:200,targetIsUI:true}],
   [.005,'pointerup',{pointerType:'mouse',pointerId:1,button:0,clientX:600,clientY:200}]],
  [[.001,'pointerdown',{pointerType:'touch',pointerId:22,clientX:600,clientY:200}],
   [.002,'pointermove',{pointerType:'touch',pointerId:22,clientX:640,clientY:200}],
   [.005,'pointerup',{pointerType:'touch',pointerId:22,clientX:640,clientY:200}],
   [.006,'pointercancel',{pointerType:'touch',pointerId:22,clientX:640,clientY:200}]]
 ];
 for(let i=0;i<scenarios.length;i++)for(const hz of [30,60,120,240]){
  const r=runEvents(scenarios[i],{hz});assert.equal(r.maxBullets,0,`scenario ${i} ${hz}`);
  assert.equal(r.pulses,0);assert.equal(r.firing,false);
 }
});
test('normal long-press 60Hz gameplay remains physically identical to baseline',()=>{
 const events=[
  [.001,'pointerdown',{pointerType:'touch',pointerId:22,clientX:600,clientY:200}],
  [.002,'pointermove',{pointerType:'touch',pointerId:22,clientX:640,clientY:200}],
  [.12,'pointerup',{pointerType:'touch',pointerId:22,clientX:640,clientY:200}]
 ];
 for(const seed of [1517800,1517802,1517810]){
  const baseline=runEvents(events,{seed,pulseEnabled:false});
  assert.deepEqual(runEvents(events,{seed}),baseline);
 }
});
test('pointer-ID collision across mouse/touch does not swallow unrelated release',()=>{
 const events=[
  [.001,'pointerdown',{pointerType:'touch',pointerId:1,clientX:600,clientY:200}],
  [.002,'pointermove',{pointerType:'touch',pointerId:1,clientX:640,clientY:200}],
  [.003,'pointerdown',{pointerType:'touch',pointerId:2,clientX:100,clientY:200}],
  [.004,'pointerup',{pointerType:'touch',pointerId:1,clientX:640,clientY:200}],
  // Compatibility mouse has same pointer ID as the already released touch;
  // it must not flush the pending aim pulse or steal its ownership.
  [.005,'pointermove',{pointerType:'mouse',pointerId:1,clientX:700,clientY:250}],
  [.006,'pointerup',{pointerType:'touch',pointerId:2,clientX:100,clientY:200}]
 ];
 for(const hz of [30,60,120,240]){
  const r=runEvents(events,{hz});assert.equal(r.pulses,1);assert.equal(r.maxBullets,1);
  assert.equal(r.aim,false);assert.equal(r.move,false);assert.equal(r.firing,false);
 }
});
