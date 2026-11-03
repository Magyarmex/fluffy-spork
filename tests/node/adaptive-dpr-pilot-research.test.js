'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {AdaptiveDprPilot}=require('../research/adaptive-dpr-pilot.cjs');
const renderBound={frameSamples:120,fps:37,frameP95Ms:34,renderP95Ms:19,updateP95Ms:5,simulationPacePct:99};
const simBound={...renderBound,renderP95Ms:3,updateP95Ms:28,simulationPacePct:70};
const healthy={frameSamples:120,fps:59,frameP95Ms:17,renderP95Ms:4,updateP95Ms:3,simulationPacePct:100};
test('only sustained render pressure lowers the proposed backing DPR',()=>{
 const c=new AdaptiveDprPilot();
 assert.equal(c.observe(renderBound,0),1.5);
 assert.equal(c.observe(renderBound,1000),1.25);
 assert.equal(c.observe(renderBound,2000),1.25,'dwell prevents oscillation');
 assert.equal(c.observe(renderBound,5000),1,'second sustained downshift');
 assert.equal(c.observe(renderBound,10000),1,'hard readability floor');
 assert.equal(c.changes,2);
});
test('CPU-bound slow simulation and ordinary 30Hz do not trigger blur',()=>{
 const c=new AdaptiveDprPilot();
 for(let t=0;t<20000;t+=1000)assert.equal(c.observe(simBound,t),1.5);
 assert.equal(c.observe({...renderBound,renderP95Ms:5,updateP95Ms:4},21000),1.5);
 assert.equal(c.changes,0);
});
test('recover only after sustained healthy frames and minimum dwell',()=>{
 const c=new AdaptiveDprPilot();
 c.observe(renderBound,0);c.observe(renderBound,1000);
 assert.equal(c.dpr,1.25);
 assert.equal(c.observe(healthy,2000),1.25);
 assert.equal(c.observe(healthy,3000),1.25);
 assert.equal(c.observe(healthy,4000),1.25);
 assert.equal(c.observe(healthy,5000),1.5);
 assert.equal(c.observe(healthy,10000),1.5);
});
test('pause, hidden tab, menu, stale or malformed snapshots cannot change quality',()=>{
 const c=new AdaptiveDprPilot();
 for(let i=0;i<10;i++){
  c.observe(renderBound,i*1000,{active:false});
  c.observe({...renderBound,frameSamples:5},i*1000+100);
  c.observe({...renderBound,fps:NaN},i*1000+200);
 }
 assert.equal(c.dpr,1.5);assert.equal(c.changes,0);
 c.observe(renderBound,11000);
 assert.equal(c.observe(null,12000),1.5,'missing window resets confirmation');
 assert.equal(c.observe(renderBound,13000),1.5);
 assert.equal(c.observe(renderBound,14000),1.25);
});
test('repeated per-frame reads of one sliding telemetry window cannot fake sustained pressure',()=>{
 const c=new AdaptiveDprPilot();
 for(let i=0;i<59;i++)c.observe(renderBound,i*16.667);
 assert.equal(c.dpr,1.5,'one second of near-identical snapshots is only one vote');
 c.observe(renderBound,1017);
 assert.equal(c.dpr,1.25);
});
test('invalid settings and nonmonotonic samples fail closed',()=>{
 for(const config of [{floor:0},{ceiling:.8},{initial:2},{step:0},{downWindows:0},{dwellMs:-1},{sampleMs:0}])
  assert.throws(()=>new AdaptiveDprPilot(config),/invalid/);
 const c=new AdaptiveDprPilot();c.observe(healthy,10);
 assert.throws(()=>c.observe(healthy,9),/nonmonotonic/);
 assert.throws(()=>c.observe(healthy,NaN),/nonmonotonic/);
});
test('same snapshot trace always yields identical decisions and never changes snapshot',()=>{
 const trace=Array.from({length:120},(_,i)=>i%15<8?renderBound:i%15<12?healthy:simBound);
 const a=new AdaptiveDprPilot(),b=new AdaptiveDprPilot();
 const before=JSON.stringify(trace),aa=[],bb=[];
 trace.forEach((s,i)=>{aa.push(a.observe(s,i*1000));bb.push(b.observe(s,i*1000));});
 assert.deepEqual(aa,bb);assert.equal(JSON.stringify(trace),before);
 assert.ok(aa.every(x=>x>=1&&x<=1.5));
});
