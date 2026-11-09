'use strict';
// Research-first desired invariant: the materialized shipping RAF must not
// discard active-game time under sub-100ms clustered 30Hz presentation.
// This file is intentionally known-red until the canonical scheduler changes.
// It is NOT a license to ship the conditional carry-cap prototype without
// composed-game, input, Android and browser latency gates.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const a=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
const b=html.indexOf('    destroy() {',a);
assert.ok(a>=0&&b>a,'real materialized Game.start owner exists');
const shipping=html.slice(a,b).trim();
const oldCap='Math.min(1 / 30, excess)';
const hasOldCap=shipping.includes(oldCap);
const prototype=hasOldCap?shipping.replace(oldCap,
 'Math.min(elapsed <= 0.1 ? 2 / 30 : 1 / 30, excess)'):null;
function run(body,gaps,seconds=10,workMs=0){
 let now=0,work=0,raf=null,sim=0,updates=0,draws=0,maxSteps=0,steps=0,maxLag=0;
 const start=new Function('performance','requestAnimationFrame','render_1',
  'return ({'+body+'}).start')({now:()=>now+work},fn=>{raf=fn;return 1;},
  {render(){draws++;maxSteps=Math.max(maxSteps,steps);steps=0;maxLag=Math.max(maxLag,now/1000-sim);}});
 const g={paused:false,__novaDestroyed:false,mmTimer:.08,
  sfx:{startMusic(){}},update(dt){
   assert.ok(dt>=0&&dt<=1/30+1e-10,'each update must stay physically bounded');
   sim+=dt;updates++;steps++;work+=workMs;
  },drawMinimap(){}};
 start.call(g);
 let i=0;while(now<seconds*1000-1e-7){
  now+=Math.min(gaps[i++%gaps.length],seconds*1000-now);
  const cb=raf;raf=null;assert.equal(typeof cb,'function');cb(now);
 }
 return {sim,updates,draws,maxSteps,maxLag};
}
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const moderate=[55,55,1000/15-55,1000/15-55];
const harsh=[85,40,5,1000/7.5-130];
test('uniform 20/30/60Hz shipping RAF remains canonical',()=>{
 for(const hz of [20,30,60]){const r=run(shipping,[1000/hz]);
  approx(r.sim,10);assert.ok(r.maxSteps<=2);}
});
test('desired: 55/55/11.67/11.67ms 30Hz must not silently lose 7.5% world time',()=>{
 const r=run(shipping,moderate);approx(r.sim,10);
});
test('desired: 85/40/5/3.33ms 30Hz must not silently lose 18.75% world time',()=>{
 const r=run(shipping,harsh);approx(r.sim,10);
});
// Strong adversarial counterexample: mean 30Hz and every gap <100ms, but
// the simple 2/30 carry-cap prototype also loses time cumulatively here.
const eightGap=[14.207085933918753,12.760071936027344,4.133955086476322,
 50.264174640298336,96.0277607031713,83.86484405207489,
 4.301894803222718,1.1068795114770285];
test('desired: eight-gap sub-100ms mean-30Hz must not discard active world time',()=>{
 const r=run(shipping,eightGap,60);approx(r.sim,60);
});
// Every gap is below the shipping 83.33ms catch-up gate. The defect is
// therefore not merely a threshold mismatch between 83ms and 100ms.
const belowCatchupGate=[5.941416705947619,23.41420116160293,
 10.312324158230117,55.478651640124,80.274986251358,
 78.51104381735914,2.4928051806983254,10.24123775134658];
test('desired: sub-83ms eight-gap mean-30Hz must preserve 60s world time',()=>{
 const r=run(shipping,belowCatchupGate,60);approx(r.sim,60);
});
// Mean 60Hz is not a sufficient guarantee when frames arrive unevenly.
const irregularMean60=[7.462545447209942,91.1690205691155,
 10.223294786501562,3.0005384001705946,2.9156630931681042,
 5.552244930873242,9.82486238212232,3.1851637241720603];
test('desired: irregular mean-60Hz must not discard active game time',()=>{
 const r=run(shipping,irregularMean60,10);approx(r.sim,10);
});
if(hasOldCap)test('falsifier: merely doubling carry cap still loses time on eight-gap 30Hz',()=>{
 const r=run(prototype,eightGap,60);
 assert.ok(r.sim<50,'the conditional cap is not a universal chronology fix');
});
if(hasOldCap)test('research-only conditional cap restores clustered chronology in zero-cost owner',()=>{
 for(const gaps of [moderate,harsh,[1000/30],[1000/60],[50]]){
  const r=run(prototype,gaps);approx(r.sim,10);
  assert.ok(r.maxSteps<=2);
 }
});
if(hasOldCap)test('conditional cap does not repay long >100ms foreground stalls',()=>{
 const gaps=[120,1000/60,1000/60,1000/60];
 const a=run(shipping,gaps),b=run(prototype,gaps);
 approx(a.sim,b.sim);assert.ok(a.sim<8);
});
if(hasOldCap)test('optional second update remains CPU-bounded under 22ms synthetic work',()=>{
 for(const gaps of [moderate,harsh,[50]]){
  const a=run(shipping,gaps,10,22),b=run(prototype,gaps,10,22);
  assert.equal(a.maxSteps,1);assert.equal(b.maxSteps,1);
  assert.ok(b.sim>=a.sim-1e-8);
 }
});

// Permanent safety gates must survive the eventual scheduler correction.
test('shipping scheduler never repays a long >100ms foreground stall',()=>{
 const r=run(shipping,[120,1000/60,1000/60,1000/60]);
 assert.ok(r.sim<8,'do not replay suspended wall time as live combat');
 assert.ok(r.maxSteps<=2);
});
test('shipping scheduler keeps optional CPU-heavy catch-up bounded',()=>{
 for(const gaps of [moderate,harsh,[50]]){
  const r=run(shipping,gaps,10,22);assert.equal(r.maxSteps,1);
 }
});

// Adversarial tradeoff: an oversized carry bucket can avoid dropping time
// only by retaining an older-than-100ms simulation debt. Without an explicit
// input-history policy this must NOT be mistaken for a safe production fix.
// The candidate is a research-only source transform; shipping is unchanged.
if(hasOldCap)test('falsifier: 250ms carry repairs eight-gap time only by retaining >100ms debt',()=>{
 const wide=shipping.replace(oldCap,'Math.min(elapsed <= 0.1 ? 1 / 4 : 1 / 30, excess)');
 assert.notEqual(wide,shipping,'research candidate must actually replace shipping carry cap');
 const original=run(shipping,eightGap,60);
 const candidate=run(wide,eightGap,60);
 assert.ok(original.sim<40,'original eight-gap deficit must remain reproduced');
 assert.ok(candidate.sim>59.9,'wide debt bucket should repay the tested active schedule');
 assert.ok(candidate.maxSteps<=2,'the candidate still has a per-frame work bound');
 assert.ok(candidate.maxLag>0.1,'candidate carries more than 100ms of stale world time');
 // The bound is a separate, deliberately visible risk: current input is
 // sampled during catch-up, not replayed from a timestamped event history.
 // Do not infer that a >100ms backlog is safe for touch or Controller orders.
});
