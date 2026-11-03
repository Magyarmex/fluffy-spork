'use strict';
// Integration gate: feed the real shipping telemetry implementation into the
// research-only DPR decision helper. Synthetic timing is not device evidence.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {AdaptiveDprPilot}=require('../research/adaptive-dpr-pilot.cjs');
const perf=fs.readFileSync(path.resolve(__dirname,'../../nova-updates/performance-v1.7.5.js'),'utf8');
function telemetry() {
 const a=perf.indexOf('function perfState(g)'),b=perf.indexOf('function callWithoutFirstHit',a);
 assert.ok(a>=0&&b>a,'extract actual shipping telemetry functions');
 const clock={now:0},window={},ctx={window,VERSION:'1.7.5',Math,Number,Object,Array,
  performance:{now:()=>clock.now},Date};
 vm.runInNewContext(perf.slice(a,b)+
  '\nwindow.__test={perfState,recordPresentation,recordSimulation,timingWindow,record};',ctx);
 return {clock,...window.__test};
}
function windowAt({renderMs,updateMs,frameMs=1000/30,step=1/30}){
 const t=telemetry(),g={status:'playing',paused:false};
 t.recordPresentation(g,0);
 for(let i=0;i<140;i++){
  t.clock.now+=frameMs;
  t.recordSimulation(g,step);
  t.recordPresentation(g,t.clock.now);
  t.record(g,'updateMs',updateMs);
  t.record(g,'renderMs',renderMs);
 }
 return t.timingWindow(t.perfState(g));
}
test('real shipping telemetry identifies render-bound slow frames for DPR research',()=>{
 const s=windowAt({renderMs:19,updateMs:3});
 assert.ok(s.frameSamples>=60);
 assert.ok(s.fps>29&&s.fps<31);
 assert.equal(s.renderP95Ms,19);
 assert.ok(s.simulationPacePct>=90);
 const c=new AdaptiveDprPilot();
 assert.equal(c.observe(s,0),1.5);
 assert.equal(c.observe(s,1000),1.25);
});
test('real shipping telemetry does not recommend blur for CPU-bound simulation',()=>{
 const s=windowAt({renderMs:3,updateMs:26,frameMs:50,step:1/30});
 assert.ok(s.fps<25);
 const c=new AdaptiveDprPilot();
 for(let i=0;i<10;i++)assert.equal(c.observe(s,i*1000),1.5);
});
