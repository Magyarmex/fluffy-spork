'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../scripts/fixed60-raf-trace-capture.js'),'utf8');
function harness(){
 let callback=null,cancelled=0;const listeners=new Map();
 const document={hidden:false,
  addEventListener(type,fn){listeners.set(type,fn);},
  removeEventListener(type,fn){if(listeners.get(type)===fn)listeners.delete(type);}};
 const window={document,
  requestAnimationFrame(fn){callback=fn;return 1;},
  cancelAnimationFrame(){cancelled++;callback=null;}};
 vm.runInNewContext(source,{window},{timeout:1000});
 return {window,hide(){document.hidden=true;listeners.get('visibilitychange')?.();},
  get listenerCount(){return listeners.size;},next(ts){const fn=callback;callback=null;
   assert.equal(typeof fn,'function');fn(ts);},get cancelled(){return cancelled;}};
}
test('opt-in browser recorder captures only foreground RAF intervals',()=>{
 const h=harness(),c=h.window.__novaRafTraceCapture.create({maxFrames:3});
 assert.equal(c.active,false);
 c.start();
 for(const t of [100,133,166,199])h.next(t);
 assert.equal(c.active,false);
 const data=c.snapshot();
 assert.equal(data.capture.reason,'limit');
 assert.equal(data.capture.frames,3);
 assert.equal(data.capture.foregroundOnly,true);
 assert.deepEqual(Array.from(data.frameIntervalsMs),[33,33,33]);
 assert.equal(data.capture.durationMs,99);
 assert.equal(Object.keys(data).length,2);
});
test('hidden tab ends capture without inventing background frame gaps',()=>{
 const h=harness(),c=h.window.__novaRafTraceCapture.create();
 c.start();h.next(100);h.next(133);
 h.hide();
 assert.equal(c.active,false);
 assert.equal(c.snapshot().capture.reason,'hidden');
 assert.equal(h.listenerCount,0);
 assert.deepEqual(Array.from(c.snapshot().frameIntervalsMs),[33]);
});
test('RAF capture rejects invalid configuration and duplicate starts',()=>{
 const h=harness();
 for(const options of [{durationMs:0},{maxFrames:0},{maxFrames:200001},
   {durationMs:Infinity},{durationMs:600001}])
   assert.throws(()=>h.window.__novaRafTraceCapture.create(options));
 const c=h.window.__novaRafTraceCapture.create();
 h.window.document.hidden=true;
 assert.throws(()=>c.start(),/foreground/);
 h.window.document.hidden=false;c.start();
 assert.throws(()=>c.start(),/already active/);
 c.stop();
 assert.equal(c.active,false);
 assert.ok(h.cancelled>=1);
 assert.equal(h.listenerCount,0);
});

test('host RAF scheduling failure cannot strand an active recorder',()=>{
 const h=harness(),c=h.window.__novaRafTraceCapture.create();
 c.start();h.next(100);
 h.window.requestAnimationFrame=()=>{throw Error('host RAF failure');};
 assert.throws(()=>h.next(133),/host RAF failure/);
 assert.equal(c.active,false);
 assert.equal(c.snapshot().capture.reason,'raf-error');
});

test('browser capture JSON is directly consumable by real RAF-owner replay',()=>{
 const {analyze}=require('../../scripts/fixed60-raf-trace-replay.cjs');
 const h=harness(),c=h.window.__novaRafTraceCapture.create({maxFrames:3});
 c.start();
 for(const t of [100,100+1000/30,100+2000/30,200])h.next(t);
 const capture=c.snapshot(),report=analyze(JSON.parse(JSON.stringify(capture)));
 assert.equal(report.capture.reason,'limit');
 assert.equal(report.results[0].frames,3);
 assert.equal(report.results[0].simulatedTicks,6);
 assert.equal(report.results[0].droppedMs,0);
 assert.equal(report.captureProvenance.status,'consistent');
 assert.equal(report.captureProvenance.visibilityGuardClaimed,true);
 assert.equal(report.captureProvenance.gameplayActiveVerified,false);
});

test('custom recorder stop remains replayable without a false provenance certificate',()=>{
 const {analyze}=require('../../scripts/fixed60-raf-trace-replay.cjs');
 const h=harness(),c=h.window.__novaRafTraceCapture.create();
 c.start();h.next(100);h.next(133);c.stop('operator-end');
 const report=analyze(JSON.parse(JSON.stringify(c.snapshot())));
 assert.equal(report.capture.reason,'operator-end');
 assert.equal(report.captureProvenance.status,'unverified');
 assert.equal(report.captureProvenance.visibilityGuardClaimed,true);
 assert.equal(report.captureProvenance.gameplayActiveVerified,false);
 assert.equal(report.results.length,3);
});

test('cancel failure and late RAF delivery cannot contaminate a restarted capture',()=>{
 let queue=[],seq=0;
 const document={hidden:false,addEventListener(){},removeEventListener(){}};
 const window={document,
  requestAnimationFrame(fn){queue.push(fn);return ++seq;},
  cancelAnimationFrame(){throw Error('host cancel failure');}};
 vm.runInNewContext(source,{window},{timeout:1000});
 const c=window.__novaRafTraceCapture.create();
 c.start();
 queue.shift()(100);
 const stale=queue.shift();
 assert.throws(()=>c.stop(),/host cancel failure/);
 assert.equal(c.active,false);
 c.start();
 const fresh=queue.shift();
 stale(120); // Delivered after a failed cancellation: must be ignored.
 fresh(130);
 fresh(131); // Duplicate delivery of a superseded ticket must be ignored.
 queue.shift()(163);
 assert.deepEqual(Array.from(c.snapshot().frameIntervalsMs),[33]);
 assert.equal(c.snapshot().capture.frames,1);
 assert.equal(c.snapshot().capture.durationMs,33);
});
