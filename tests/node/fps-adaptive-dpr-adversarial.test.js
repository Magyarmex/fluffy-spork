'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAdaptiveDprPilot}=require('../research/fps-adaptive-dpr.cjs');
const slow={frameSamples:120,fps:32,frameP95Ms:45,updateP95Ms:9,renderP95Ms:6};
const better={frameSamples:120,fps:52,frameP95Ms:30,updateP95Ms:5,renderP95Ms:4};
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
