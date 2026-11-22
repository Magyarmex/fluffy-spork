'use strict';
/* #799: exact materialized RAF owner reports synchronous callback work.
 * This is synthetic CPU timing, not GPU/compositor or real-device latency. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const root=path.resolve(__dirname,'../..');
const html=patchRafStepCap(fs.readFileSync(path.join(root,'index.html'),'utf8'));
const begin=html.indexOf('    start() {',html.indexOf('window.__defineModule("game/engine"'));
const end=html.indexOf('    destroy() {',begin);
assert.ok(begin>=0&&end>begin,'actual materialized Game.start');
const body=html.slice(begin,end).trim();
const factory=new Function('performance','requestAnimationFrame','render_1',
 'return ({'+body+'}).start');
const perf=fs.readFileSync(path.join(root,'nova-updates/performance-v1.7.5.js'),'utf8');
const snapStart=perf.indexOf('function rafWorkSnapshot(g)');
const snapEnd=perf.indexOf('function record(g,key,ms)',snapStart);
assert.ok(snapStart>=0&&snapEnd>snapStart,'shipping diagnostics snapshot helper');
const snapshot=new Function(perf.slice(snapStart,snapEnd)+';return rafWorkSnapshot;')();
test('final RAF CPU work is measured after update, render and minimap, and resets when paused',()=>{
 let now=0,work=0,raf=null,updateCalls=0;
 const start=factory({now:()=>now+work},fn=>{raf=fn;return 1;},
  {render(){work+=3;}});
 const g={status:'playing',paused:false,__novaDestroyed:false,
  mmTimer:0,sfx:{startMusic(){}},update(dt){
   assert.ok(dt>=0&&dt<=1/30+1e-10);
   updateCalls++;work+=7;
  },drawMinimap(){work+=2;}};
 start.call(g);
 let lastEma=null;
 for(let i=0;i<5;i++){
  now+=50;
  const before=work,cb=raf;
  assert.equal(typeof cb,'function');cb(now);
  const expected=work-before;
  assert.equal(g.__novaRafWorkMs,expected,'exact final synchronous callback cost');
  assert.ok(g.__novaRafWorkEmaMs>0&&g.__novaRafWorkPeakMs>=expected);
  assert.ok(g.__novaRafWorkPeakMs>=g.__novaRafWorkEmaMs);
  lastEma=g.__novaRafWorkEmaMs;
 }
 assert.ok(updateCalls>=5);
 assert.equal(snapshot(g).rafWorkMs,g.__novaRafWorkMs);
 assert.equal(snapshot(g).rafWorkEmaMs,+lastEma.toFixed(2));
 g.paused=true;now+=50;raf(now);
 assert.deepEqual(snapshot(g),{rafWorkMs:null,rafWorkEmaMs:null,rafWorkPeakMs:null},
  'pause must not present stale active-game work as current');
 g.paused=false;now+=50;
 const before=work;raf(now);
 assert.equal(g.__novaRafWorkMs,work-before);
 assert.equal(g.__novaRafWorkEmaMs,g.__novaRafWorkMs,
  'resumed active epoch begins with a fresh estimate');
});
test('production RAF patch is idempotent with one full-work instrumentation owner',()=>{
 assert.equal(patchRafStepCap(html),html);
 assert.equal(html.split('this.__novaRafWorkMs = priorWork;').length-1,1);
 assert.throws(()=>patchRafStepCap(html+'\n            priorWork = performance.now() - workStart;'),/owner drift/,
  'a second uninstrumented RAF timing owner must not pass idempotence');
 assert.ok(body.includes('this.__novaRafWorkEmaMs = this.__novaRafWorkEmaMs == null ? priorWork'),
  'active EMA must use the measured RAF work');
 assert.ok(body.includes('this.__novaRafWorkEmaMs = null;'),
  'inactive work estimate must reset');
});

test('copied Debug diagnostics expose RAF work without claiming GPU latency',()=>{
 const vm=require('node:vm');
 const menu=fs.readFileSync(path.join(root,'nova-updates/menu-debug-motion-v1.7.8.js'),'utf8');
 const a=menu.indexOf('function snapshot()'),b=menu.indexOf('function fillDebug()',a);
 assert.ok(a>=0&&b>a,'canonical Debug snapshot owner');
 function debug(perf){
  const window={__NOVA_PERF_LAST__:perf,innerWidth:320,innerHeight:568,devicePixelRatio:2};
  const navigator={onLine:true,maxTouchPoints:2,userAgent:'test'};
  vm.runInNewContext(menu.slice(a,b)+'\nwindow.__snap=snapshot;',{
   window,navigator,VERSION:'1.7.8',CODENAME:'Signal Flow',updaterState:()=> 'CURRENT'
  });
  return window.__snap();
 }
 assert.equal(debug({rafWorkEmaMs:12.5,rafWorkPeakMs:24.2})['RAF CPU WORK'],
  '12.5 ms smoothed / 24.2 ms peak');
 assert.equal(debug({})['RAF CPU WORK'],'n/a');
});
