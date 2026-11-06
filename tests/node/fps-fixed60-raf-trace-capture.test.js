'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../scripts/fixed60-raf-trace-capture.js'),'utf8');
function harness(){
 let callback=null,cancelled=0;
 const window={document:{hidden:false},
  requestAnimationFrame(fn){callback=fn;return 1;},
  cancelAnimationFrame(){cancelled++;callback=null;}};
 vm.runInNewContext(source,{window},{timeout:1000});
 return {window,next(ts){const fn=callback;callback=null;
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
 h.window.document.hidden=true;h.next(2000);
 assert.equal(c.active,false);
 assert.equal(c.snapshot().capture.reason,'hidden');
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
});

test('host RAF scheduling failure cannot strand an active recorder',()=>{
 const h=harness(),c=h.window.__novaRafTraceCapture.create();
 c.start();h.next(100);
 h.window.requestAnimationFrame=()=>{throw Error('host RAF failure');};
 assert.throws(()=>h.next(133),/host RAF failure/);
 assert.equal(c.active,false);
 assert.equal(c.snapshot().capture.reason,'raf-error');
});
