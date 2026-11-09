'use strict';
// Source-executed regression for the shipping Frame Budget telemetry owner.
// No gameplay or production code is patched by this test.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fixture(){
 let now=1000;
 class Game {
  constructor(){this.status='playing';this.paused=false;this.time=0;this.tanks=[];this.drones=[];this.bullets=[];this.shapes=[];}
  update(dt){this.time+=dt;}
 }
 const render={render(){}};
 const mods={
  'game/engine':(module)=>{module.exports={Game};},
  'game/render':(module)=>{module.exports=render;}
 };
 const window={__novaModules:mods};
 const context={window,console:{info(){},error(){}},performance:{now:()=>now},Math,Number,Date};
 const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/performance-v1.7.5.js'),'utf8');
 vm.runInNewContext(source,context,{filename:'performance-v1.7.5.js'});
 const engineModule={exports:{}};
 mods['game/engine'](engineModule,engineModule.exports,()=>{});
 const renderModule={exports:{}};
 mods['game/render'](renderModule,renderModule.exports,()=>{});
 const game=new engineModule.exports.Game();
 const step=(gapMs,dt=gapMs/1000)=>{
  now+=gapMs;
  if(dt>0)game.update(dt);
  renderModule.exports.render(game,320,640);
 };
 return {game,step,snapshot:()=>game.novaPerfSnapshot()};
}

test('shipping telemetry reports simulation pace separately from FPS',()=>{
 const {step,snapshot}=fixture();
 step(1000/30);
 for(let i=0;i<12;i++)step(1000/30);
 const good=snapshot();
 assert.equal(good.frameSamples,12);
 assert.equal(good.fps,30);
 assert.ok(Math.abs(good.simulationPacePct-100)<.2);
 assert.equal(good.simulationHz,30);
 const slow=fixture();
 slow.step(1000/30);
 for(let i=0;i<12;i++)slow.step(1000/30,1/60);
 const lag=slow.snapshot();
 assert.equal(lag.fps,30,'render rate must not disguise simulation slowdown');
 assert.ok(Math.abs(lag.simulationPacePct-50)<.2);
 assert.equal(lag.simulationHz,30,'step count is independent of simulated duration');
});

test('pause and long background gaps reset rolling chronology, not mix sessions',()=>{
 const {game,step,snapshot}=fixture();
 step(1000/30);
 for(let i=0;i<10;i++)step(1000/30);
 assert.ok(snapshot().frameSamples>=5);
 game.paused=true;step(33,0);
 assert.equal(snapshot().frameSamples,0);
 game.paused=false;
 step(33);
 assert.equal(snapshot().frameSamples,0,'first resumed presentation establishes new baseline');
 for(let i=0;i<6;i++)step(33);
 assert.equal(snapshot().frameSamples,6);
 step(300,0);
 assert.equal(snapshot().frameSamples,0,'suspension must not contaminate active timing');
 step(33);
 assert.equal(snapshot().frameSamples,1);
});

test('slow active frames below suspension threshold remain visible to telemetry',()=>{
 const {step,snapshot}=fixture();
 step(100);
 for(let i=0;i<8;i++)step(100,1/30);
 const s=snapshot();
 assert.equal(s.frameSamples,8);
 assert.equal(s.fps,10);
 assert.equal(s.frameOver50Pct,100);
 assert.ok(s.simulationPacePct>=33&&s.simulationPacePct<=34,
  '10 FPS should expose one 33ms step per 100ms wall time');
});
