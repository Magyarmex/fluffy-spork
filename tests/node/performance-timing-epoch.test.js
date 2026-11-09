'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fixture(){
 let now=1000,updateCost=10,renderCost=10;
 class Game {
  constructor(){this.status='playing';this.paused=false;this.time=0;this.tanks=[];this.drones=[];this.bullets=[];this.shapes=[];}
  update(dt){this.time+=dt;now+=updateCost;}
  redeploy(){this.time=0;this.status='playing';this.paused=false;}
 }
 const render={render(){now+=renderCost;}};
 const mods={
  'game/engine':module=>{module.exports={Game};},
  'game/render':module=>{module.exports=render;}
 };
 const window={__novaModules:mods};
 const context={window,console:{info(){},error(){}},performance:{now:()=>now},Math,Number,Date};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates/performance-v1.7.5.js'),'utf8'),context);
 const e={exports:{}},r={exports:{}};
 mods['game/engine'](e,e.exports,()=>{});
 mods['game/render'](r,r.exports,()=>{});
 const game=new e.exports.Game();
 const step=(gap=33,dt=gap/1000)=>{
  now+=gap;
  if(dt>0)game.update(dt);
  r.exports.render(game,320,700);
 };
 return {game,step,window,snapshot:()=>game.novaPerfSnapshot(),
  cost:(update,render)=>{updateCost=update;renderCost=render;}};
}
function warm(f,n=8){f.step();for(let i=0;i<n;i++)f.step();}
function expectFresh(f,expected){
 const s=f.snapshot();
 assert.ok(s.frameSamples>=5,'fresh active presentation window');
 assert.equal(s.updateP95Ms,expected);
 assert.equal(s.renderP95Ms,expected);
 assert.ok(s.simulationPacePct!==null);
}
test('pause/resume CPU P95 cannot retain previous session and paused render is excluded',()=>{
 const f=fixture();warm(f);
 expectFresh(f,10);
 f.window.__NOVA_PERF_LAST__={frameSamples:99,updateP95Ms:10};
 f.game.paused=true;f.step(33,0);
 assert.equal(f.window.__NOVA_PERF_LAST__,null,'published telemetry must not outlive its epoch');
 assert.equal(f.snapshot().frameSamples,0);
 assert.equal(f.snapshot().updateP95Ms,null);
 assert.equal(f.snapshot().renderP95Ms,null);
 f.cost(1,1);f.game.paused=false;warm(f);
 expectFresh(f,1);
 for(let i=0;i<65;i++)f.step();
 const published=f.window.__NOVA_PERF_LAST__;
 assert.ok(published&&published.frameSamples>=5,'new active epoch must publish telemetry');
 assert.equal(published.updateP95Ms,1);
 assert.equal(published.renderP95Ms,1);
});
test('long presentation discontinuity starts fresh CPU and simulation windows',()=>{
 const f=fixture();warm(f);expectFresh(f,10);
 f.window.__NOVA_PERF_LAST__={frameSamples:99,renderP95Ms:10};
 f.cost(1,1);f.step(300,0);
 assert.equal(f.window.__NOVA_PERF_LAST__,null);
 assert.equal(f.snapshot().frameSamples,0);
 assert.equal(f.snapshot().renderP95Ms,null);
 warm(f);expectFresh(f,1);
});
test('redeploy clears CPU timing without resetting cumulative terrain counters',()=>{
 const f=fixture();warm(f);expectFresh(f,10);
 f.game.__novaPerf.terrainQueries=17;
 f.window.__NOVA_PERF_LAST__={frameSamples:99,renderP95Ms:10};
 f.game.redeploy();
 assert.equal(f.window.__NOVA_PERF_LAST__,null);
 assert.equal(f.snapshot().frameSamples,0);
 assert.equal(f.snapshot().updateP95Ms,null);
 assert.equal(f.snapshot().renderP95Ms,null);
 assert.equal(f.snapshot().terrainQueries,17);
 f.cost(1,1);warm(f);expectFresh(f,1);
});
test('continuous play retains a bounded rolling CPU window',()=>{
 const f=fixture();warm(f,120);
 expectFresh(f,10);
 f.cost(1,1);
 for(let i=0;i<120;i++)f.step();
 expectFresh(f,1);
 assert.equal(f.snapshot().frameSamples,120);
});

test('decorative-world render and update work never enters active timing rings',()=>{
 const f=fixture();
 f.game.__novaDecorativeWorld=true;
 warm(f);
 const s=f.snapshot();
 assert.equal(s.frameSamples,0);
 assert.equal(s.updateP95Ms,null);
 assert.equal(s.renderP95Ms,null);
 assert.equal(f.window.__NOVA_PERF_LAST__,undefined);
});
