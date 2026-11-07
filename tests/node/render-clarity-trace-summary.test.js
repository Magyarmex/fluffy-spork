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

// Regression guard for the measured-window boundary. The real Chromium pilot
// remains the integration gate; this catches accidental reintroduction of
// warmup-inclusive tracing when the research runner is edited.
test('DevTools trace begins after warmup and before measured RAF timing',()=>{
 const warmup=source.indexOf('await new Promise(resolve=>setTimeout(resolve,1800));');
 const start=source.indexOf('await window.__novaResearchBeginMeasuredTrace();');
 const begin=source.indexOf('const begin=performance.now(),gameTime=g.time');
 assert.ok(warmup>=0&&start>warmup&&begin>start,
  'trace must start after combat warmup and before measured window');
 const exposure=source.indexOf("page.exposeFunction('__novaResearchBeginMeasuredTrace'");
 const evaluate=source.indexOf('const data=await page.evaluate(async()=>{');
 assert.ok(exposure>=0&&exposure<evaluate,
  'trace-start bridge must exist before the page enters its measurement');
 assert.match(source.slice(exposure,evaluate),/await cdp\.send\('Tracing\.start'/,
  'CDP tracing must be inside the page-exposed callback, not started eagerly');
});

// Protect the existing Render clarity benchmark from the opt-in causal pilot.
// A future refactor must not silently add particle wrappers to ordinary A/A/B.
test('ordinary-trail causal research remains opt-in and preserves default clarity measurements',()=>{
 assert.match(source,/const trailMode=process\.env\.NOVA_TRAIL_CAUSAL==='1'/);
 assert.match(source,/const midpointMode=process\.env\.NOVA_CLARITY_MIDPOINT==='1'/);
 assert.match(source,/const phases=trailMode\?\[100,100,100,100,100,100\]:/);
 assert.match(source,/midpointMode\?midpointPhases:\[100,65,65,100,65,100\]/);
 assert.match(source,/const suppressOrdinaryTrails=trailMode&&\[1,2,4\]\.includes\(index\)/);
 assert.match(source,/if\(trailMode\)\{\s*const originalBulletUpdate=g\.updateBullets/,
  'extra projectile instrumentation must not run in ordinary clarity mode');
 assert.match(source,/window\.__novaTrailResearchMode=trailMode/);
 assert.match(source,/window\.__novaTrailResearchSuppress=suppressOrdinaryTrails/);
 assert.match(source,/const data=await page\.evaluate\(async\(\)=>\{/,
  'preserve the measured-window trace boundary contract');
});

test('opt-in 80% clarity midpoint pilot is balanced and preserves legacy controls',()=>{
 const match=source.match(/const midpointPhases=(\[[^;]+\]);/);
 assert.ok(match,'midpoint research phase schedule must be explicit');
 const phases=JSON.parse(match[1]);
 assert.equal(phases.length,9);
 for(const scale of [65,80,100])assert.equal(phases.filter(v=>v===scale).length,3);
 assert.deepEqual(phases.slice(0,3).sort((a,b)=>a-b),[65,80,100]);
 assert.deepEqual(phases.slice(3,6).sort((a,b)=>a-b),[65,80,100]);
 assert.deepEqual(phases.slice(6,9).sort((a,b)=>a-b),[65,80,100]);
 assert.match(source,/assert\.ok\(!\(trailMode&&midpointMode\)/,
  'causal trail pilot and midpoint pilot must not be mixed');
 assert.match(source,/\|\|trailMode\|\|midpointMode/,
  'midpoint arms must use deterministic initial-world fixture');
 assert.match(source,/if\(trailMode\|\|midpointMode\)assert\.equal\(matchedInitialWorlds,true/,
  'midpoint pilot must reject mismatched initial fingerprints');
 assert.match(source,/phases\[i\]===65\?100:80/,
  'mobile order must invert endpoints while retaining the midpoint');
});
