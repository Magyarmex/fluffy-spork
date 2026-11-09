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
assert.equal(shipping.split(oldCap).length-1,1,'canonical carry-cap owner must not drift');
const prototype=shipping.replace(oldCap,
 'Math.min(elapsed <= 0.1 ? 2 / 30 : 1 / 30, excess)');
function run(body,gaps,seconds=10,workMs=0){
 let now=0,work=0,raf=null,sim=0,updates=0,draws=0,maxSteps=0,steps=0;
 const start=new Function('performance','requestAnimationFrame','render_1',
  'return ({'+body+'}).start')({now:()=>now+work},fn=>{raf=fn;return 1;},
  {render(){draws++;maxSteps=Math.max(maxSteps,steps);steps=0;}});
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
 return {sim,updates,draws,maxSteps};
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
test('research-only conditional cap restores clustered chronology in zero-cost owner',()=>{
 for(const gaps of [moderate,harsh,[1000/30],[1000/60],[50]]){
  const r=run(prototype,gaps);approx(r.sim,10);
  assert.ok(r.maxSteps<=2);
 }
});
test('conditional cap does not repay long >100ms foreground stalls',()=>{
 const gaps=[120,1000/60,1000/60,1000/60];
 const a=run(shipping,gaps),b=run(prototype,gaps);
 approx(a.sim,b.sim);assert.ok(a.sim<8);
});
test('optional second update remains CPU-bounded under 22ms synthetic work',()=>{
 for(const gaps of [moderate,harsh,[50]]){
  const a=run(shipping,gaps,10,22),b=run(prototype,gaps,10,22);
  assert.equal(a.maxSteps,1);assert.equal(b.maxSteps,1);
  assert.ok(b.sim>=a.sim-1e-8);
 }
});
