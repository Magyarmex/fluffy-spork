'use strict';
/* Real shipping telemetry functions + full 49-overlay runtime composition.
 * Synthetic timestamps are deliberately NOT physical-device benchmarks. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const perf=fs.readFileSync(path.join(root,'nova-updates/performance-v1.7.5.js'),'utf8');
const menu=fs.readFileSync(path.join(root,'nova-updates/menu-debug-motion-v1.7.8.js'),'utf8');
function telemetry(){
 const a=perf.indexOf('function perfState(g)'),b=perf.indexOf('function callWithoutFirstHit',a);
 assert.ok(a>=0&&b>a,'extract actual shipping telemetry functions');
 const clock={now:0},window={},ctx={window,VERSION:'1.7.5',Math,Number,Object,Array,
  performance:{now:()=>clock.now},Date};
 vm.runInNewContext(perf.slice(a,b)+'\nwindow.__test={perfState,timingSample,recordPresentation,timingWindow,record};',ctx);
 return {clock,window,...window.__test};
}
function sample(t,g,delta,update=2,render=3){
 t.clock.now+=delta;
 t.recordPresentation(g,t.clock.now);
 t.record(g,'updateMs',update);
 t.record(g,'renderMs',render);
}
test('60Hz presentation produces 60 observed FPS, bounded p95s, no jank',()=>{
 const t=telemetry(),g={};
 t.recordPresentation(g,0);
 for(let i=0;i<180;i++)sample(t,g,1000/60,2,3);
 const p=t.timingWindow(t.perfState(g));
 assert.equal(p.frameSamples,120);
 assert.ok(Math.abs(p.fps-60)<.2,JSON.stringify(p));
 assert.ok(Math.abs(p.frameP95Ms-16.67)<.02);
 assert.equal(p.frameOver50Pct,0);
 assert.equal(p.updateP95Ms,2);
 assert.equal(p.renderP95Ms,3);
 assert.equal(t.window.__NOVA_PERF_LAST__.fps,60);
});
test('30Hz 34/32.667ms jitter is not misreported as dropped frames',()=>{
 const t=telemetry(),g={};t.recordPresentation(g,0);
 for(let i=0;i<140;i++)sample(t,g,i%2?32.6666667:34);
 const p=t.timingWindow(t.perfState(g));
 assert.equal(p.frameSamples,120);
 assert.ok(Math.abs(p.fps-30)<.2,JSON.stringify(p));
 assert.equal(p.frameP95Ms,34);
 assert.equal(p.frameOver50Pct,0);
});
test('large frame gaps reset only presentation window, not simulation history',()=>{
 const t=telemetry(),g={};t.recordPresentation(g,0);
 for(let i=0;i<40;i++)sample(t,g,16.666,4,5);
 assert.equal(t.timingWindow(t.perfState(g)).frameSamples,40);
 sample(t,g,1200,4,5);
 assert.equal(t.timingWindow(t.perfState(g)).frameSamples,0);
 assert.equal(t.timingWindow(t.perfState(g)).fps,null);
 for(let i=0;i<10;i++)sample(t,g,33.333,4,5);
 const p=t.timingWindow(t.perfState(g));
 assert.equal(p.frameSamples,10);
 assert.ok(Math.abs(p.fps-30)<.2);
 assert.equal(p.frameOver50Pct,0);
 assert.equal(p.updateP95Ms,4);
});
test('slow frames and expensive simulation are visible in copied diagnostics',()=>{
 const t=telemetry(),g={};t.recordPresentation(g,0);
 for(let i=0;i<100;i++)sample(t,g,i%10===0?70:16.667,i%10===0?26:3,2);
 const p=t.timingWindow(t.perfState(g));
 assert.equal(p.frameP95Ms,70);
 assert.equal(p.frameOver50Pct,10);
 assert.equal(p.updateP95Ms,26);
 const a=menu.indexOf('function snapshot()'),b=menu.indexOf('function fillDebug()',a);
 assert.ok(a>=0&&b>a);
 const window={__NOVA_PERF_LAST__:p,innerWidth:360,innerHeight:740,devicePixelRatio:2},
  navigator={onLine:false,maxTouchPoints:5,userAgent:'test'},
  ctx={window,navigator,VERSION:'1.7.8',CODENAME:'Signal Flow',updaterState:()=> 'OFFLINE'};
 vm.runInNewContext(menu.slice(a,b)+'\nwindow.__snap=snapshot;',ctx);
 const s=window.__snap();
 assert.match(s['GAME FPS'],/observed/);
 assert.equal(s['FRAME P95'],'70 ms');
 assert.equal(s['SIMULATION P95'],'26 ms');
 assert.equal(s['FRAMES >50MS'],'10%');
 assert.match(s['TIMING SAMPLES'],/last game window/);
});
test('no-match debug displays n/a rather than inventing frame rates',()=>{
 const a=menu.indexOf('function snapshot()'),b=menu.indexOf('function fillDebug()',a);
 const window={innerWidth:320,innerHeight:568,devicePixelRatio:1},
  navigator={onLine:false,maxTouchPoints:0},
  ctx={window,navigator,VERSION:'1.7.8',CODENAME:'Signal Flow',updaterState:()=> 'OFFLINE'};
 vm.runInNewContext(menu.slice(a,b)+'\nwindow.__snap=snapshot;',ctx);
 const s=window.__snap();
 assert.match(s['GAME FPS'],/n\/a/);
 assert.equal(s['FRAME P95'],'n/a');
 assert.equal(s['TIMING SAMPLES'],'0 · last game window');
});
test('full shipping Game exposes timing fields without changing game state',()=>{
 const flag=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
 process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 if(flag===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
 else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=flag;
 withSeed(1517802,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const before=[g.time,g.player.x,g.player.y,g.player.hp,g.bullets.length];
  const render=g.__testWindow.__novaMakeRequire('')('game/render').render;
  for(let i=0;i<8;i++)render(g,g.w,g.h);
  const p=g.novaPerfSnapshot();
  assert.ok(p.frameSamples>=5);
  assert.ok(p.fps>0);
  assert.equal(typeof p.renderP95Ms,'number');
  assert.deepEqual([g.time,g.player.x,g.player.y,g.player.hp,g.bullets.length],before,
   'read-only rendering telemetry cannot mutate simulation');
 });
});
