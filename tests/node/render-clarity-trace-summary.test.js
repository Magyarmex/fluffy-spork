'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const EventEmitter=require('node:events');

const source=fs.readFileSync(path.join(__dirname,'../browser/render-clarity-aa-b-research.cjs'),'utf8');
const start=source.indexOf('async function stopTrace(');
const end=source.indexOf('\nasync function measure(',start);
assert.ok(start>=0&&end>start,'extract the real research trace implementation');
const percentile=(xs,p)=>[...xs].sort((a,b)=>a-b)[Math.ceil(xs.length*p)-1];
const stopTrace=vm.runInNewContext('('+source.slice(start,end)+')',{
 assert,Buffer,JSON,Number,Math,setTimeout,clearTimeout,
 fs:{mkdirSync(){},writeFileSync(){}},pct:percentile
});

test('paired trace summary attributes Commit only to renderer main and preserves percentiles',async()=>{
 const events=[
  {ph:'M',name:'thread_name',pid:1,tid:2,args:{name:'CrRendererMain'}},
  {ph:'M',name:'thread_name',pid:1,tid:3,args:{name:'Compositor'}},
  ...[1000,2000,4000,8000].map(dur=>({ph:'X',name:'Commit',pid:1,tid:2,dur})),
  {ph:'X',name:'Commit',pid:1,tid:3,dur:900000},
  {ph:'X',name:'Paint',pid:1,tid:2,dur:500}
 ];
 const payload=JSON.stringify({traceEvents:events});
 class CDP extends EventEmitter{
  async send(method){
   if(method==='Tracing.end'){queueMicrotask(()=>this.emit('Tracing.tracingComplete',{stream:'trace'}));return {};}
   if(method==='IO.read')return {data:payload,eof:true};
   if(method==='IO.close')return {};
   throw Error('unexpected CDP method '+method);
  }
 }
 const summary=await stopTrace(new CDP(),'artifacts/browser/test-trace.json');
 assert.equal(summary.inclusiveMainThreadEventCosts.Commit.count,4);
 assert.equal(summary.inclusiveMainThreadEventCosts.Commit.inclusiveMs,15);
 assert.equal(summary.inclusiveMainThreadEventCosts.Commit.maxMs,8);
 assert.equal(summary.inclusiveMainThreadEventCosts.Commit.medianMs,2);
 assert.equal(summary.inclusiveMainThreadEventCosts.Commit.p95Ms,8);
 assert.equal(summary.inclusiveMainThreadEventCosts.Paint.count,1);
 assert.equal(summary.rendererMainThreadCount,1);
 assert.equal(summary.inclusiveMainThreadEventCosts.Commit.commitDurationsMs,undefined);
});
