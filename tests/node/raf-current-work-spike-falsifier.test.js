'use strict';
/* #842/#799 RESEARCH ONLY. Source-execute the materialized production RAF
 * with a cheap history followed by an expensive current first update.
 * The historical-work gate cannot predict the current callback cost.
 * This is a deterministic CPU-clock falsifier, not device timing evidence. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const html=patchRafStepCap(fs.readFileSync(path.resolve(__dirname,'../../index.html'),'utf8'));
const begin=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
const end=html.indexOf('    destroy() {',begin);
assert.ok(begin>=0&&end>begin,'materialized Game.start source');
const shipping=html.slice(begin,end).trim();
const guard='priorWork < 18 && earlierWork < 18';
assert.equal(shipping.split(guard).length-1,1,'shipping historical work gate');
const guarded=shipping.replace(guard,
  guard+' && performance.now() - workStart < 18');
function run(source,{firstSpikeMs=40,secondSpikeMs=12}={}){
 let now=0,work=0,raf=null,frame=0,step=0,sim=0,previousEnd=0;
 const rows=[];
 const start=new Function('performance','requestAnimationFrame','render_1',
  'return ({'+source+'}).start')({now:()=>now+work},
  fn=>{raf=fn;return 1},{render(){work+=4;}});
 const game={paused:false,__novaDestroyed:false,mmTimer:.08,
  sfx:{startMusic(){}},update(dt){
   assert.ok(dt>0&&dt<=1/30+1e-9);
   sim+=dt;step++;
   // Second active callback: a new 40ms first-update spike after
   // cheap preceding work. A second 12ms update breaches 50ms budget.
   work+=frame===2?(step===1?firstSpikeMs:secondSpikeMs):1;
  },drawMinimap(){}};
 start.call(game);
 for(frame=1;frame<=8;frame++){
  // Missed 20Hz vsync callbacks cannot be delivered between refresh slots.
  now=Math.max(frame*50,Math.ceil(previousEnd/50)*50);work=0;step=0;
  const callback=raf;raf=null;
  assert.equal(typeof callback,'function');
  callback(now);
  previousEnd=now+work;
  rows.push({frame,atMs:now,steps:step,workMs:work,simSec:sim});
 }
 return rows;
}
test('historical CPU gate admits an over-budget second update after a current-frame spike',()=>{
 const baseline=run(shipping),candidate=run(guarded);
 assert.equal(baseline[0].steps,1);
 assert.equal(candidate[0].steps,1);
 assert.equal(baseline[1].steps,2,'shipping admits second update based on cheap history');
 assert.equal(candidate[1].steps,1,'current-work gate rejects the second update');
 assert.ok(baseline[1].workMs>50,'shipping frame overruns synthetic 20Hz budget');
 assert.ok(candidate[1].workMs<50,'candidate avoids this particular overrun');
 assert.ok(baseline[2].atMs>150,'an overrun delays the next browser callback');
 assert.equal(candidate[2].atMs,150,'non-overrun remains on the scheduled frame');
 assert.ok(candidate[1].simSec<baseline[1].simSec,
  'the CPU safeguard sacrifices immediate simulation recovery');
 for(const row of [...baseline,...candidate]){
  assert.ok(row.steps<=2,'never exceed shipping two-update bound');
  assert.ok(row.simSec<=row.atMs/1000+1e-8,'no unearned simulated time');
 }
 console.log('NOVA_RAF_CURRENT_WORK_SPIKE_RESEARCH '+JSON.stringify({
  baseline,candidate,caveat:'synthetic work; no device/thermal/latency claim; not a production fix'
 }));
});

test('naive current-work guard can discard a safe cheap second update',()=>{
 const baseline=run(shipping,{secondSpikeMs:1});
 const candidate=run(guarded,{secondSpikeMs:1});
 assert.equal(baseline[1].steps,2);
 assert.equal(candidate[1].steps,1);
 assert.ok(baseline[1].workMs<50,
  'the extra update is affordable despite expensive first update');
 assert.ok(candidate[1].simSec<baseline[1].simSec,
  'a fixed first-update threshold trades away valid recovery');
 console.log('NOVA_RAF_CURRENT_WORK_FALSE_VETO '+JSON.stringify({
  baseline:baseline[1],candidate:candidate[1],
  caveat:'constructed costs; guard is not a production-ready policy'
 }));
});
