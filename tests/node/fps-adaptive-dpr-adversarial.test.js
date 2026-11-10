'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAdaptiveDprPilot}=require('../research/fps-adaptive-dpr.cjs');
const slow={frameSamples:120,fps:32,frameP95Ms:45,updateP95Ms:9,renderP95Ms:6,simulationPacePct:70};
const better={frameSamples:120,fps:52,frameP95Ms:30,updateP95Ms:5,renderP95Ms:4,simulationPacePct:95};
function fixture(){const game={quality:'low',status:'playing',paused:false,dpr:1.5,w:320,h:568,
 canvas:{width:480,height:852,clientWidth:320,clientHeight:568}};
 const pilot=createAdaptiveDprPilot(game);return {game,pilot};}
function step(p,from,to,perf){let result;for(let t=from;t<=to;t+=500)result=p.sample(t,perf);return result;}
test('a faster average alone cannot certify a worse 95th-percentile frame',()=>{
 const {game,pilot}=fixture();step(pilot,0,1000,slow);
 assert.equal(game.dpr,1);
 const r=step(pilot,1500,7000,{...better,frameP95Ms:44});
 assert.equal(r.kind,'probe-rejected');assert.equal(game.dpr,1.5);
});
test('a faster average and frame P95 cannot hide excessive simulation cost',()=>{
 const {game,pilot}=fixture();step(pilot,0,1000,slow);
 const r=step(pilot,1500,7000,{...better,updateP95Ms:15});
 assert.equal(r.kind,'probe-rejected');assert.equal(game.dpr,1.5);
});
test('missing telemetry during a probe times out and restores original quality',()=>{
 const {game,pilot}=fixture();step(pilot,0,1000,slow);
 const kinds=[];for(let t=1500;t<=10000;t+=500)kinds.push(pilot.sample(t,null).kind);
 assert.ok(kinds.includes('probe-no-evidence'));assert.equal(game.dpr,1.5);
});
test('a new quality setting is never reverted by research cleanup',()=>{
 const {game,pilot}=fixture();step(pilot,0,1000,slow);
 game.quality='high';game.dpr=2;game.canvas.width=640;game.canvas.height=1136;
 assert.equal(pilot.sample(1500,slow).kind,'external-resize');
 assert.equal(pilot.stop(),true);assert.equal(pilot.stop(),false);
 assert.equal(game.dpr,2);assert.equal(game.canvas.width,640);
});
test('focus loss cannot leave a temporary low-resolution probe armed',()=>{
 const {game,pilot}=fixture();step(pilot,0,1000,slow);
 assert.equal(game.dpr,1);
 game.paused=true;
 assert.equal(pilot.sample(1500,slow).kind,'probe-cancelled');
 assert.equal(game.dpr,1.5);
});
test('actual shipping two-stick touch geometry and ownership are DPR-independent',()=>{
 const prev=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
 process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
 const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
 if(prev===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
 else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prev;
 const g=bootGame();g.__testWindow.devicePixelRatio=3;g.resize();
 const pointer=(pointerId,x,y)=>({pointerId,pointerType:'touch',clientX:x,clientY:y,target:{closest:()=>null}});
 function trace(){const i=g.input;
  i.pd(pointer(11,100,300));i.pd(pointer(12,600,300));
  i.pm(pointer(11,130,300));i.pm(pointer(12,640,300));
  const state=[i.move.active,i.aim.active,i.move.dx,i.move.dy,i.aim.dx,i.aim.dy,
    i.stickId.move,i.stickId.aim,i.firing];
  i.pu(pointer(11,130,300));i.pu(pointer(12,640,300));return state;
 }
 const baseline=trace();assert.equal(baseline[0],true);assert.equal(baseline[1],true);
 const pilot=createAdaptiveDprPilot(g);
 step(pilot,0,1000,slow);assert.equal(g.dpr,1);
 assert.deepEqual(trace(),baseline);
 pilot.stop();g.destroy();
});

test('DPR probe cannot accept better FPS at the cost of slower simulation',()=>{
 const {game,pilot}=fixture();step(pilot,0,1000,slow);
 assert.equal(game.dpr,1,'slow baseline should start a reversible probe');
 const r=step(pilot,1500,7000,{...better,simulationPacePct:60});
 assert.equal(r.kind,'probe-rejected');
 assert.equal(game.dpr,1.5,'rejected probe must restore original clarity');
});
test('missing simulation-pace telemetry cannot authorize a DPR reduction',()=>{
 const {game,pilot}=fixture();
 const {simulationPacePct,...withoutPace}=slow;
 const r=step(pilot,0,2000,withoutPace);
 assert.equal(r.kind,'insufficient-evidence');
 assert.equal(game.dpr,1.5);
});

test('a slow rolling window cannot certify a DPR probe before old samples expire',()=>{
 const {game,pilot}=fixture();
 const slowTen={...slow,fps:10,frameP95Ms:120};
 const betterTwenty={...better,fps:20,frameP95Ms:60};
 step(pilot,0,1000,slowTen);
 assert.equal(game.dpr,1);
 const early=step(pilot,1500,7000,betterTwenty);
 assert.equal(early.kind,'probing','a six-second window cannot flush 120 frames at 10 FPS');
 const late=step(pilot,7500,9000,betterTwenty);
 assert.equal(late.kind,'probe-window-too-slow');
 assert.equal(game.dpr,1.5,'unverifiable clarity reduction must roll back');
});

test('accepted low-resolution mode restores owned backing on pause or quality exit',()=>{
 for(const exit of ['pause','quality','stop-after-quality','hidden-gap']){
  const {game:g,pilot:p}=fixture();
  step(p,0,1000,slow);
  const good={...better,fps:55,frameP95Ms:22,updateP95Ms:5,simulationPacePct:95};
  step(p,1500,7000,good);
  assert.equal(p.state.phase,'low');
  assert.equal(g.dpr,1);
  if(exit==='pause'){g.paused=true;assert.equal(p.sample(7500,good).kind,'low-inactive-rollback');}
  else if(exit==='quality'){g.quality='high';assert.equal(p.sample(7500,good).kind,'low-inactive-rollback');}
  else if(exit==='hidden-gap')assert.equal(p.sample(12000,good).kind,'low-interrupted-rollback');
  else {g.quality='high';assert.equal(p.stop(),true);}
  assert.equal(g.dpr,1.5,exit+' must restore original backing DPR');
  assert.deepEqual([g.canvas.width,g.canvas.height],[480,852]);
 }
});

test('accepted-low cleanup never overwrites a player DPR change on resume',()=>{
 const {game,pilot}=fixture();
 step(pilot,0,1000,slow);
 const good={...better,fps:55,frameP95Ms:22,updateP95Ms:5,simulationPacePct:95};
 step(pilot,1500,7000,good);
 assert.equal(pilot.state.phase,'low');
 game.quality='high';game.dpr=2;
 game.canvas.width=640;game.canvas.height=1136;
 assert.equal(pilot.sample(12000,good).kind,'external-resize',
  'external owner must win even when the first sample follows a long hidden gap');
 assert.equal(pilot.stop(),true);
 assert.equal(game.dpr,2);
 assert.deepEqual([game.canvas.width,game.canvas.height],[640,1136]);
});

test('accepted-low quality cannot persist indefinitely without valid telemetry',()=>{
 const {game,pilot}=fixture();
 const good={...better,fps:55,frameP95Ms:22,updateP95Ms:5,simulationPacePct:95};
 step(pilot,0,1000,slow);step(pilot,1500,7000,good);
 assert.equal(pilot.state.phase,'low');
 assert.equal(pilot.sample(7500,null).kind,'insufficient-evidence');
 assert.equal(game.dpr,1,'one missing sample must not flicker clarity');
 assert.equal(pilot.sample(8000,good).kind,'hold',
  'a valid sample must clear the missing-evidence timer');
 assert.equal(pilot.sample(8500,null).kind,'insufficient-evidence');
 let last;
 for(let t=9000;t<=16500;t+=500)last=pilot.sample(t,null);
 assert.equal(last.kind,'low-no-evidence-rollback');
 assert.equal(game.dpr,1.5);
});

test('seeded mixed lifecycle sequences preserve external DPR ownership and canvas dimensions',()=>{
 let state=0x12345678;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;
  return (state>>>0)/4294967296;};
 const good={...better,fps:55,frameP95Ms:22,updateP95Ms:5,simulationPacePct:95};
 const fast={frameSamples:120,fps:60,frameP95Ms:16,updateP95Ms:2,
  renderP95Ms:3,simulationPacePct:100};
 for(let run=0;run<50;run++){
  const {game,pilot}=fixture();let time=0,external=false;
  for(let i=0;i<100;i++){
   time+=random()<.015?4000:100+random()*500;
   const event=random();
   if(event<.01)game.paused=!game.paused;
   else if(event<.02)game.quality=game.quality==='low'?'high':'low';
   else if(event<.025){
    game.dpr=1.2;game.canvas.width=384;game.canvas.height=682;
    external=true;
   }
   const sample=random()<.04?null:random()<.5?slow:random()<.5?good:fast;
   pilot.sample(time,sample);
   if(external)assert.equal(game.dpr,1.2,'player DPR must never be overridden');
   assert.equal(game.canvas.width,Math.round(game.w*game.dpr));
   assert.equal(game.canvas.height,Math.round(game.h*game.dpr));
  }
  pilot.stop();
  if(external)assert.equal(game.dpr,1.2);
 }
});

test('near-threshold CPU-dominated frames do not authorize a blur probe',()=>{
 const {game,pilot}=fixture();
 const cpuDominated={frameSamples:120,fps:30,frameP95Ms:40,
  updateP95Ms:19,renderP95Ms:3,simulationPacePct:75};
 const result=step(pilot,0,3000,cpuDominated);
 assert.equal(result.kind,'hold');
 assert.equal(pilot.state.phase,'baseline');
 assert.equal(game.dpr,1.5);
});

test('accepted low DPR rolls back after finite but invalid telemetry',()=>{
 const invalid=[
  {...better,fps:0,frameP95Ms:0},
  {...better,updateP95Ms:-1},
  {...better,renderP95Ms:-1},
  {...better,simulationPacePct:-1},
  {...better,frameSamples:90.5}
 ];
 for(const sample of invalid){
  const {game,pilot}=fixture();
  step(pilot,0,1000,slow);
  step(pilot,1500,7000,{...better,fps:55,frameP95Ms:22});
  assert.equal(pilot.state.phase,'low');
  assert.equal(pilot.sample(7500,sample).kind,'insufficient-evidence');
  let final;
  for(let t=8000;t<=15500;t+=500)final=pilot.sample(t,sample);
  assert.equal(final.kind,'low-no-evidence-rollback');
  assert.equal(game.dpr,1.5);
 }
});
