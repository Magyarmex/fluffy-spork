'use strict';
// RESEARCH ONLY. Exact materialized Game.start() owner; never loaded by the game.
// Test a narrowly bounded <100ms active-jitter policy without changing shipping.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
function body(){
 const a=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
 const b=html.indexOf('    destroy() {',a);
 assert.ok(a>=0&&b>a,'actual materialized Game.start');
 return html.slice(a,b).trim();
}
const shipping=body();
const oldGate='elapsed <= 1 / 12';
const oldCap='carry = Math.min(1 / 30, carry);';
assert.equal(shipping.split(oldGate).length-1,1,'shipping CPU/catch-up gate owner');
assert.equal(shipping.split(oldCap).length-1,1,'shipping final carry cap owner');
const pilot=shipping.replace(oldGate,'elapsed <= 0.1')
 .replace(oldCap,'carry = Math.min(elapsed <= 0.1 ? 2 / 30 : 1 / 30, carry);');
function run(startBody,gaps,seconds=10,workMs=0){
 let now=0,work=0,raf=null,sim=0,updates=0,draws=0,frameSteps=0,maxSteps=0,firstFrameSteps=null;
 const start=new Function('performance','requestAnimationFrame','render_1',
  'return ({'+startBody+'}).start')({now:()=>now+work},
  fn=>{raf=fn;return 1;},{render(){if(firstFrameSteps===null)firstFrameSteps=frameSteps;draws++;maxSteps=Math.max(maxSteps,frameSteps);frameSteps=0;}});
 const game={paused:false,__novaDestroyed:false,mmTimer:0,
  sfx:{startMusic(){}},update(dt){
   assert.ok(dt>=0&&dt<=1/30+1e-9,'collision dt bounded');
   sim+=dt;updates++;frameSteps++;work+=workMs;
  },drawMinimap(){}};
 start.call(game);
 let i=0;
 while(now<seconds*1000-1e-7){
  now+=Math.min(gaps[i++%gaps.length],seconds*1000-now);
  const cb=raf;raf=null;assert.equal(typeof cb,'function');cb(now);
 }
 assert.ok(sim<=seconds+1e-7,'no future time');
 assert.ok(maxSteps<=2,'no more than two simulation updates per render');
 return {sim,updates,draws,maxSteps,firstFrameSteps};
}
const worst=[20.91151399025735,10.023170844306332,19.252641284801797,
 99.18706951738324,89.60306031033099,2.794867239606748,
 6.619622334380946,18.274721145599262];
const harsh=[85,40,5,1000/7.5-130];
test('opt-in active-jitter pilot recovers a falsifying sub-100ms schedule',()=>{
 const before=run(shipping,worst),after=run(pilot,worst);
 assert.ok(before.sim<7,'reproduce shipping deficit');
 assert.ok(after.sim>9.9,'pilot substantially recovers active time');
 assert.equal(after.draws,before.draws);
 assert.ok(after.updates>=before.updates,'account for extra CPU work');
});
test('pilot preserves uniform presentation and established 120ms stall policy',()=>{
 for(const gaps of [[1000/60],[1000/30],[50],[120,1000/60,1000/60,1000/60]]){
  const before=run(shipping,gaps),after=run(pilot,gaps);
  assert.ok(Math.abs(after.sim-before.sim)<1e-6,'do not replay stall time');
  assert.equal(after.updates,before.updates);
  assert.equal(after.draws,before.draws);
 }
});
test('harsh clustered 30Hz improves without changing update count',()=>{
 const before=run(shipping,harsh),after=run(pilot,harsh);
 assert.ok(after.sim>before.sim+1,'recover lost active time');
 assert.equal(after.updates,before.updates);
});
test('current-frame CPU spikes can still double-update; both policies remain bounded',()=>{
 // The existing gate observes the PREVIOUS two frames, not the current
 // first update. A 22ms first update may therefore be followed by another
 // update when earlier frames were cheap. Preserve this measured risk rather
 // than falsely claiming that the CPU gate forbids all double updates.
 for(const gaps of [worst,harsh]){
  const before=run(shipping,gaps,10,22),after=run(pilot,gaps,10,22);
  assert.ok(before.maxSteps<=2&&after.maxSteps<=2);
  assert.ok(after.sim>=before.sim-1e-7);
  assert.ok(after.updates>=after.draws,'at least one update per presentation');
 }
});
test('seeded mixed schedules retain bounded work and never lose more simulated time',()=>{
 let state=0x6a09e667;
 for(let i=0;i<160;i++){
  const gaps=[];
  for(let j=0;j<8;j++){
   state^=state<<13;state^=state>>>17;state^=state<<5;
   gaps.push(1+(state>>>0)%150);
  }
  const total=gaps.reduce((a,b)=>a+b,0);
  const normalized=gaps.map(v=>v*(8000/30)/total);
  for(const workMs of [0,22]){
   const before=run(shipping,normalized,2,workMs);
   const after=run(pilot,normalized,2,workMs);
   assert.ok(after.sim>=before.sim-1e-7,'no additional time loss');
   assert.equal(after.draws,before.draws);
  }
 }
});

test('three consecutive 99ms frames falsify complete recovery with a 2/30 carry cap',()=>{
 // Nine frames span 300ms (mean 30Hz); the first three arrive at 99ms.
 // Two updates per frame cannot repay the third long frame without retaining
 // more than 66.67ms of debt or deliberately dropping time. This pilot drops.
 const gaps=[99,99,99,.5,.5,.5,.5,.5,.5];
 const before=run(shipping,gaps),after=run(pilot,gaps);
 assert.ok(after.sim>before.sim+3,'pilot still improves the old scheduler');
 assert.ok(after.sim<9.5,'the pilot is NOT a complete chronology solution');
 assert.ok(after.maxSteps<=2,'preserve bounded update budget');
 assert.equal(after.draws,before.draws);
});

// A separate opt-in guard experiment. The shipping and active-jitter pilot
// both check only the previous two frames' CPU work. The first update in the
// current frame may be expensive; the next update must be evaluated against
// that cost before any production change can claim a bounded frame budget.
test('current-update CPU gate prevents a second expensive step on the first frame',()=>{
 const oldCpuGate='priorWork < 18 && earlierWork < 18';
 assert.equal(pilot.split(oldCpuGate).length-1,1,'unique existing CPU gate');
 const guarded=pilot.replace(oldCpuGate,
  oldCpuGate+' && performance.now() - workStart < 18');
 for(const gaps of [[70],[99,99,99,.5,.5,.5,.5,.5,.5]]){
  const unguarded=run(pilot,gaps,1,22);
  const safe=run(guarded,gaps,1,22);
  assert.equal(unguarded.firstFrameSteps,2,
   'existing prior-frame-only guard permits a second expensive first-frame step');
  assert.equal(safe.firstFrameSteps,1,
   'current-work-aware guard prevents that second update');
  assert.ok(safe.maxSteps<=2&&unguarded.maxSteps<=2);
  assert.equal(safe.draws,unguarded.draws);
  assert.ok(safe.sim<=unguarded.sim+1e-7,
   'lower current-frame CPU work may trade off simulation progress');
 }
});

// The proposed 100ms gate is a sharp policy boundary. Explicitly preserve
// its intended side of the threshold; do not accidentally repay suspended
// time when floating-point RAF timestamps land just above the boundary.
test('active-jitter eligibility has a bounded 100ms timestamp boundary',()=>{
 for(const [gap,expected] of [[99.9,2],[100,2],[100.1,1],[120,1]]){
  const observed=run(pilot,[gap],1,0);
  assert.equal(observed.firstFrameSteps,expected,
   'first-frame update count for '+gap+'ms presentation gap');
  assert.ok(observed.maxSteps<=2);
 }
 const current=run(shipping,[99.9],1,0);
 assert.equal(current.firstFrameSteps,1,
  'shipping 83.33ms gate must not be mistaken for pilot 100ms gate');
});

// Guard cost must be explicit: no-op work should leave the pilot's simulated
// chronology unchanged, while expensive work is allowed to sacrifice some
// catch-up in exchange for avoiding two costly updates in the same frame.
test('current-work-aware guard is neutral on cheap frames',()=>{
 const oldCpuGate='priorWork < 18 && earlierWork < 18';
 const guarded=pilot.replace(oldCpuGate,
  oldCpuGate+' && performance.now() - workStart < 18');
 for(const gaps of [[1000/60],[1000/30],[50],harsh,worst,
  [99,99,99,.5,.5,.5,.5,.5,.5]]){
  const baseline=run(pilot,gaps,3,0),candidate=run(guarded,gaps,3,0);
  assert.deepEqual(candidate,baseline,
   'current CPU guard must not change cheap-frame chronology');
 }
});
