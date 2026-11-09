'use strict';
// The shipping materializer must consume already-eligible active RAF time
// before clamping leftover carry. The per-frame two-step limit, final
// carry bucket, catch-up gate and long-stall policy remain unchanged.
// Recovered time can require additional legal updates on later frames.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const shipping=fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8');
const patched=patchRafStepCap(shipping);
// The materializer rewrites index.html on main after merge. Reconstruct the
// pre-fix scheduler solely as an adversarial comparison baseline so these
// regressions also run on the deployed, already-patched production HTML.
function preFix(html){
 const fixed='carry = excess > 1e-9 ? excess : 0;';
 const prior='carry = excess > 1e-9 ? Math.min(1 / 30, excess) : 0;';
 const clamp='            carry = Math.min(1 / 30, carry);\n';
 assert.equal(html.split(fixed).length-1,1,'current RAF carries active time before optional update');
 assert.equal(html.split(clamp).length-1,1,'current RAF clamps after optional update');
 return html.replace(fixed,prior).replace(clamp,'');
}
const legacy=preFix(patched);
function startBody(html){
 const a=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
 const b=html.indexOf('    destroy() {',a);
 assert.ok(a>=0&&b>a,'materialized Game.start owner');
 return html.slice(a,b).trim();
}
function run(body,gaps,seconds=10,workMs=0){
 let now=0,work=0,raf=null,sim=0,updates=0,draws=0,maxSteps=0,frameSteps=0;
 const start=new Function('performance','requestAnimationFrame','render_1',
  'return ({'+body+'}).start')({now:()=>now+work},
   fn=>{raf=fn;return 1;},{render(){draws++;maxSteps=Math.max(maxSteps,frameSteps);frameSteps=0;}});
 const game={paused:false,__novaDestroyed:false,mmTimer:.08,
  sfx:{startMusic(){}},update(dt){
   assert.ok(dt>=0&&dt<=1/30+1e-10,'collision step remains bounded');
   sim+=dt;updates++;frameSteps++;work+=workMs;
  },drawMinimap(){}};
 start.call(game);
 let i=0;while(now<seconds*1000-1e-7){
  now+=Math.min(gaps[i++%gaps.length],seconds*1000-now);
  const callback=raf;raf=null;assert.equal(typeof callback,'function');
  callback(now);
 }
 return {sim,updates,draws,maxSteps};
}
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const patterns={
 uniform60:[1000/60],uniform30:[1000/30],uniform20:[50],
 moderate:[55,55,1000/15-55,1000/15-55],
 harsh:[85,40,5,1000/7.5-130],
 eight:[14.207085933918753,12.760071936027344,4.133955086476322,
  50.264174640298336,96.0277607031713,83.86484405207489,
  4.301894803222718,1.1068795114770285],
 under83:[5.941416705947619,23.41420116160293,10.312324158230117,
  55.478651640124,80.274986251358,78.51104381735914,
  2.4928051806983254,10.24123775134658],
 mean60:[7.462545447209942,91.1690205691155,10.223294786501562,
  3.0005384001705946,2.9156630931681042,5.552244930873242,
  9.82486238212232,3.1851637241720603],
 stall:[120,1000/60,1000/60,1000/60]
};
test('materializer upgrades existing guarded shipping RAF idempotently',()=>{
 assert.equal(patchRafStepCap(shipping),patched);
 assert.equal(patchRafStepCap(patched),patched);
 const body=startBody(patched);
 assert.ok(body.includes('carry = excess > 1e-9 ? excess : 0;'));
 assert.ok(body.includes('carry = Math.min(1 / 30, carry);'));
 assert.ok(body.includes('elapsed <= 1 / 12'),'do not broaden catch-up gate');
 assert.ok(body.includes('priorWork < 18 && earlierWork < 18'),'preserve CPU budget');
});
test('post-second carry clamp recovers time without increasing update count',()=>{
 const old=startBody(legacy),next=startBody(patched);
 for(const [name,gaps] of Object.entries(patterns)){
  const before=run(old,gaps,60),after=run(next,gaps,60);
  assert.equal(after.updates,before.updates,name+' update count');
  assert.equal(after.draws,before.draws,name+' presentation count');
  assert.ok(after.sim>=before.sim-1e-7,name+' must not lose more world time');
  assert.ok(after.maxSteps<=2,name+' bounded update work');
 }
 approx(run(next,patterns.moderate,60).sim,60);
 assert.ok(run(next,patterns.harsh,60).sim>51);
 approx(run(next,patterns.stall,60).sim,run(old,patterns.stall,60).sim);
});
test('post-second carry clamp preserves CPU-heavy catch-up gate',()=>{
 const old=startBody(legacy),next=startBody(patched);
 for(const name of ['moderate','harsh','eight','under83']){
  const before=run(old,patterns[name],10,22),after=run(next,patterns[name],10,22);
  assert.equal(before.maxSteps,1);
  assert.equal(after.maxSteps,1);
  assert.ok(after.sim>=before.sim-1e-7);
 }
});

test('adversarial clustered cadence may need more bounded updates to recover time',()=>{
 // A constructed mean-30Hz schedule where preserving previously discarded
 // carry triggers one more legal second update in 10s. Do not claim global
 // CPU-neutrality merely because the named moderate/harsh cases tie.
 const gaps=[70.22197361267777,69.85515032393816,4.208393405113806,
  1.3476876986254644,35.870264145346084,21.436604746020528,
  19.39160146743469,44.33499126751018];
 const before=run(startBody(legacy),gaps,10);
 const after=run(startBody(patched),gaps,10);
 assert.ok(after.updates>before.updates,'recovered time may cost another legal update');
 assert.ok(after.sim>before.sim,'extra update must advance recovered world time');
 assert.ok(after.maxSteps<=2,'no frame may exceed the existing two-step bound');
 assert.equal(after.draws,before.draws);
});
