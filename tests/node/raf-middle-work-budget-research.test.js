'use strict';
/* RESEARCH ONLY: a 20Hz display has a 50ms presentation interval, but the
 * shipping RAF declines optional catch-up based on an 18ms historical
 * work threshold. Compare a candidate in extracted source only; this does
 * not change production or establish a mobile-safe CPU budget. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const shipping=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const patched=patchRafStepCap(shipping);
function body(html){
 const a=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
 const b=html.indexOf('    destroy() {',a);
 assert.ok(a>=0&&b>a,'actual materialized RAF owner');
 return html.slice(a,b).trim();
}
const original=body(patched);
const guard='priorWork < 18 && earlierWork < 18';
assert.equal(original.split(guard).length-1,1,'exact shipping historical-work gate');
const candidate=original.replace(guard,'priorWork < 26 && earlierWork < 26');
function run(source,intervals,updateMs,renderMs){
 let now=0,work=0,raf=null,sim=0,updates=0,draws=0,frameSteps=0;
 let maxSteps=0,maxWork=0,frameStart=0;
 const start=new Function('performance','requestAnimationFrame','render_1',
  'return ({'+source+'}).start')({now:()=>now+work},
  fn=>{raf=fn;return 1;},{render(){draws++;work+=renderMs;
   maxSteps=Math.max(maxSteps,frameSteps);maxWork=Math.max(maxWork,work-frameStart);
   frameSteps=0;}});
 const game={paused:false,__novaDestroyed:false,mmTimer:.08,
  sfx:{startMusic(){}},update(dt){
   assert.ok(dt>=0&&dt<=1/30+1e-10,'bounded collision step');
   sim+=dt;updates++;frameSteps++;work+=updateMs;
  },drawMinimap(){}};
 start.call(game);
 for(const interval of intervals){
  now+=interval;frameStart=work;
  const callback=raf;raf=null;assert.equal(typeof callback,'function');
  callback(now);
 }
 return {sim,updates,draws,maxSteps,maxWork};
}
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('middle-cost 20Hz source RAF loses recoverable time under historical 18ms gate',()=>{
 const frames=Array(40).fill(50);
 const current=run(original,frames,10,4),research=run(candidate,frames,10,4);
 assert.equal(current.draws,40);assert.equal(research.draws,40);
 assert.ok(current.sim<=2+1e-8,'no unearned game time');
 assert.ok(research.sim>=current.sim-1e-8,'candidate cannot regress this model');
 approx(research.sim,2);
 assert.ok(research.maxSteps<=2,'no more than two complete updates per draw');
 assert.ok(research.maxWork<=24+1e-8,'modeled work remains below 50ms interval');
 console.log('NOVA_RAF_MIDDLE_WORK_RESEARCH '+JSON.stringify({current,research,
  note:'synthetic 10ms/update + 4ms/render; not physical CPU or latency'}));
});
test('research work threshold preserves steady 30Hz and long-stall bounds',()=>{
 for(const intervals of [Array(60).fill(1000/30),[120,50,50,50,50]]){
  const a=run(original,intervals,10,4),b=run(candidate,intervals,10,4);
  assert.ok(b.sim>=a.sim-1e-8);
  assert.ok(b.maxSteps<=2);
  assert.ok(b.sim<=intervals.reduce((s,v)=>s+v,0)/1000+1e-8);
 }
});
