'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAdaptiveDprPilot}=require('../research/fps-adaptive-dpr.cjs');
function game(){return {quality:'low',status:'playing',paused:false,dpr:1.5,w:320,h:568,
 zoom:.8,canvas:{width:480,height:852,clientWidth:320,clientHeight:568},
 mm:{width:216,height:216},time:12,input:{firing:true}};}
const slow={frameSamples:120,fps:35,frameP95Ms:40,updateP95Ms:10,renderP95Ms:7};
const improved={frameSamples:120,fps:55,frameP95Ms:22,updateP95Ms:5,renderP95Ms:5};
const fast={frameSamples:120,fps:60,frameP95Ms:16.7,updateP95Ms:2,renderP95Ms:4};
const cpu={frameSamples:120,fps:27,frameP95Ms:55,updateP95Ms:31,renderP95Ms:7};
function drive(p,from,to,perf,step=500){let r;for(let t=from;t<=to;t+=step)r=p.sample(t,perf);return r;}
function accept(p){drive(p,0,1000,slow);assert.equal(p.state.phase,'probing');
 drive(p,1500,7000,improved);assert.equal(p.state.phase,'low');}
test('measured A/B probe lowers backing pixels without modifying world, input, minimap or CSS',()=>{
 const g=game(),p=createAdaptiveDprPilot(g);
 const before=[g.w,g.h,g.zoom,g.time,g.mm.width,g.input.firing,g.canvas.clientWidth];
 accept(p);assert.equal(g.dpr,1);assert.equal(g.canvas.width,320);assert.equal(g.canvas.height,568);
 assert.deepEqual([g.w,g.h,g.zoom,g.time,g.mm.width,g.input.firing,g.canvas.clientWidth],before);
 assert.equal(p.stop(),true);assert.equal(g.dpr,1.5);assert.equal(g.canvas.width,480);
});
test('fails closed for CPU-bound slowdown, sparse telemetry, and short spikes',()=>{
 for(const evidence of [cpu,{...slow,frameSamples:10},{...slow,renderP95Ms:2},null]){
  const g=game(),p=createAdaptiveDprPilot(g);drive(p,0,9000,evidence);assert.equal(g.dpr,1.5);
 }
 const g=game(),p=createAdaptiveDprPilot(g);drive(p,0,500,slow);drive(p,1000,9000,fast);
 assert.equal(g.dpr,1.5);
});
test('probe rolls back if improvement is too small and waits 30 seconds before retrying',()=>{
 const g=game(),p=createAdaptiveDprPilot(g);drive(p,0,1000,slow);
 assert.equal(g.dpr,1);assert.equal(p.state.phase,'probing');
 drive(p,1500,7000,{...slow,fps:37,frameP95Ms:38});
 assert.equal(g.dpr,1.5);assert.equal(p.state.phase,'baseline');
 drive(p,7500,15000,slow);assert.equal(g.dpr,1.5);
 drive(p,38000,42000,slow);assert.equal(g.dpr,1,'a later fresh sustained problem can be probed');
});
test('accepted low DPR restores only after sustained spare capacity and cannot oscillate',()=>{
 const g=game(),p=createAdaptiveDprPilot(g);accept(p);
 drive(p,7500,16000,fast);assert.equal(g.dpr,1,'not enough time since reduction');
 drive(p,16500,19000,fast);assert.equal(g.dpr,1.5);
 drive(p,19500,26000,slow);assert.equal(g.dpr,1.5,'restoration cooldown prevents rapid oscillation');
});
test('focus loss, pause, and time discontinuity cancel an active probe',()=>{
 let shown=true;const g=game(),p=createAdaptiveDprPilot(g,{visible:()=>shown});
 drive(p,0,1000,slow);shown=false;
 assert.equal(p.sample(1500,slow).kind,'probe-cancelled');assert.equal(g.dpr,1.5);
 shown=true;drive(p,2000,5000,slow);assert.equal(g.dpr,1.5);
 drive(p,6000,10000,slow);assert.equal(g.dpr,1.5,'rollback cooldown prevents re-probing');
 const h=game(),q=createAdaptiveDprPilot(h);drive(q,0,1000,slow);
 assert.equal(q.sample(5000,slow).kind,'probe-interrupted');assert.equal(h.dpr,1.5);
 const j=game(),r=createAdaptiveDprPilot(j);drive(r,0,1000,slow);j.paused=true;
 assert.equal(r.sample(1500,slow).kind,'probe-cancelled');assert.equal(j.dpr,1.5);
});
test('external resize and quality changes are not overwritten by pilot cleanup',()=>{
 const g=game(),p=createAdaptiveDprPilot(g);drive(p,0,1000,slow);assert.equal(g.dpr,1);
 g.w=400;g.canvas.clientWidth=400;g.dpr=1.5;g.canvas.width=600;
 assert.equal(p.sample(1500,slow).kind,'external-resize');assert.equal(g.canvas.width,600);
 p.stop();assert.equal(g.canvas.width,600);
 const h=game(),q=createAdaptiveDprPilot(h);h.quality='high';
 assert.equal(q.sample(0,slow).kind,'inactive');assert.equal(h.dpr,1.5);
});
test('research pilot never attaches itself to production or starts timers',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.resolve(__dirname,'../..');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.doesNotMatch(html,/fps-adaptive-dpr/);
 const g=game();assert.throws(()=>createAdaptiveDprPilot({...g,quality:'high'}));
 assert.throws(()=>createAdaptiveDprPilot({...g,__novaDecorativeWorld:true}));
 const p=createAdaptiveDprPilot(g);assert.equal(p.sample(0,slow).changed,false);
 assert.equal(p.sample(0,slow).kind,'invalid-time');
 assert.equal(p.stop(),true);assert.equal(p.sample(100,slow).kind,'stopped');
});
test('actual composed 49-overlay Game retains physical state and RNG when DPR changes mid-fight',()=>{
 const prev=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
 process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
 const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
 if(prev===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prev;
 function arm(seed,cls,adaptive){return withSeed(seed,draws=>{
  const g=bootGame();g.__testWindow.devicePixelRatio=3;g.resize();
  g.setClass(g.player,cls);g.sfx.muted=true;
  const render=g.__testWindow.__novaMakeRequire('')('game/render').render;
  const pilot=adaptive?createAdaptiveDprPilot(g):null;
  for(let i=0;i<80;i++){
   g.update(1/60);
   if(i%2===0)render(g,g.w,g.h);
   if(pilot)pilot.sample(i*100,i<=10?slow:improved);
  }
  const result={state:digest(physical(g)),rng:draws(),dpr:g.dpr,
    canvas:[g.canvas.width,g.canvas.height],world:[g.w,g.h,g.zoom]};
  if(pilot)pilot.stop();g.destroy();return result;
 });}
 const allClasses='scout twin minigun shotgun cannon bomber demolisher marksman railgun ghost carrier overlord warden guard fortress juggernaut tempest needlestorm breachlord flakmaster clusterking siegebomber annihilator quake singularity prism specter assassin hivemind broodmother citadel valkyrie bastion aegis meteor ravager'.split(' ');
 for(const cls of allClasses)for(const seed of ['tempest','minigun','railgun','hivemind','bastion','scout'].includes(cls)?[1517802,1517810]:[1517802]){
  const a=arm(seed,cls,false),b=arm(seed,cls,true);
  assert.equal(b.dpr,1,cls+' pilot must change actual composed canvas DPR');
  assert.equal(a.state,b.state,cls+' physical state must be unchanged');
  assert.equal(a.rng,b.rng,cls+' gameplay RNG must be unchanged');
  assert.deepEqual(a.world,b.world);
 }
});
