'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../scripts/fixed60-full-render-timing.js'),'utf8');
function harness(){
 let time=100,ms=2,throws=false,draws=0;
 const listeners=new Map();
 const mod={render(g){draws++;time+=ms;if(throws)throw Error('render fault');return g.id;}};
 const original=mod.render;
 const document={hidden:false,
  addEventListener(k,fn){listeners.set(k,fn);},
  removeEventListener(k,fn){if(listeners.get(k)===fn)listeners.delete(k);}};
 const window={document,performance:{now(){return time;}},
  __novaMakeRequire(){return id=>id==='game/render'?mod:null;}};
 vm.runInNewContext(source,{window,Float64Array,Array,Number,Math,Error});
 return {api:window.__novaFullRenderTiming,window,document,mod,original,listeners,
  setMs(v){ms=v;},setThrows(v){throws=v;},draws(){return draws;}};
}
const game={id:7,status:'playing',paused:false,__novaDecorativeWorld:false};
test('opt-in final renderer probe preserves return value and stops at bounded sample count',()=>{
 const h=harness(),p=h.api.create({maxSamples:60});p.start();
 for(let n=1;n<=60;n++){h.setMs(n);assert.equal(h.mod.render(game),7);}
 const s=p.snapshot();
 assert.equal(s.active,false);assert.equal(s.reason,'limit');
 assert.equal(s.restored,true);assert.equal(s.frames,60);
 assert.equal(s.meanMs,30.5);assert.equal(s.p50Ms,30);
 assert.equal(s.p95Ms,57);assert.equal(s.p99Ms,60);assert.equal(s.maxMs,60);
 assert.equal(s.renderOver16_67Pct,73.333);
 assert.equal(s.renderOver33_33Pct,45);
 assert.equal(h.mod.render,h.original,'real renderer must be restored');
 assert.equal(h.listeners.size,0,'visibility listener must be released');
 assert.equal(h.draws(),60,'instrumentation must not duplicate renders');
 assert.equal(Object.hasOwn(s,'game'),false,'no game state is collected');
});
test('pause, lobby, decorative and hidden frames never contaminate playing CPU sample',()=>{
 const h=harness(),p=h.api.create({maxSamples:60});p.start();
 for(const g of [{...game,paused:true},{...game,status:'dead'},
  {...game,__novaDecorativeWorld:true}])h.mod.render(g);
 assert.equal(p.snapshot().frames,0);
 h.mod.render(game);assert.equal(p.snapshot().frames,1);
 h.document.hidden=true;h.listeners.get('visibilitychange')();
 assert.equal(p.snapshot().reason,'hidden');assert.equal(h.mod.render,h.original);
 assert.equal(h.listeners.size,0);
});
test('renderer exception preserves original error and restores module export',()=>{
 const h=harness(),p=h.api.create({maxSamples:60});p.start();h.setThrows(true);
 assert.throws(()=>h.mod.render(game),/render fault/);
 assert.equal(p.snapshot().reason,'render-error');
 assert.equal(p.snapshot().frames,0);
 assert.equal(h.mod.render,h.original);
});
test('restart creates fresh bounded timing epoch without double wrapping',()=>{
 const h=harness(),p=h.api.create({maxSamples:60});
 p.start();assert.throws(()=>p.start(),/already active/);
 h.mod.render(game);assert.equal(p.stop().frames,1);
 assert.equal(h.mod.render,h.original);
 p.start();assert.equal(p.snapshot().frames,0);
 h.mod.render(game);assert.equal(p.stop().frames,1);
 assert.equal(h.draws(),2);
});
test('another render owner taking over is not silently overwritten on stop',()=>{
 const h=harness(),p=h.api.create({maxSamples:60});p.start();
 const newer=()=>9;h.mod.render=newer;
 const s=p.stop();assert.equal(s.restored,false);
 assert.equal(h.mod.render,newer);
});
test('unavailable module, invalid bound and background tab fail closed',()=>{
 const h=harness();
 assert.throws(()=>h.api.create({maxSamples:0}),/bound/);
 h.document.hidden=true;
 assert.throws(()=>h.api.create().start(),/foreground/);
 h.document.hidden=false;h.window.__novaMakeRequire=undefined;
 assert.throws(()=>h.api.create().start(),/loader/);
});

test('nonfinite clock during an active render releases the instrumentation owner',()=>{
 const h=harness(),p=h.api.create({maxSamples:60});p.start();
 h.window.performance.now=()=>NaN;
 assert.throws(()=>h.mod.render(game),/invalid monotonic clock/);
 assert.equal(p.snapshot().reason,'clock-error');
 assert.equal(h.mod.render,h.original);
 assert.equal(h.listeners.size,0);
});

test('probe remains outside shipping HTML and targets the live final render export',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 assert.match(html,/\(0, render_1\.render\)\(this, this\.w, this\.h\)/,
  'shipping RAF must dereference the module export at render time');
 assert.match(html,/window\.__novaMakeRequire = makeRequire/,
  'materialized game must expose its canonical module loader');
 assert.doesNotMatch(html,/fixed60-full-render-timing\.js/,
  'DevTools probe must not ship or run on player devices by default');
});
