const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadPerformance(){
  function Game(){
    this.time=0;this.tanks=[];this.drones=[];this.bullets=[];this.shapes=[];
    this.__novaTerrain=[];
  }
  Game.prototype.hasLineOfSight=function(){return true;};
  Game.prototype.firstTerrainHit=function(){return null;};
  Game.prototype.moveTank=function(t,vx,vy,dt){
    if(this.firstTerrainHit)this.firstTerrainHit(t.x,t.y,t.x+vx*dt,t.y+vy*dt,8);
    t.x+=vx*dt;t.y+=vy*dt;
  };
  Game.prototype.updateDrones=function(dt){
    if(!this.firstTerrainHit)return;
    for(const d of this.drones)this.firstTerrainHit(d.x,d.y,d.x+20*dt,d.y,5);
  };
  Game.prototype.update=function(){};
  const modules={
    'game/engine':function(module){module.exports={Game};},
    'game/render':function(module){module.exports={render(){}};}
  };
  let now=0;
  const context={window:{__novaModules:modules},console,Math,Date,performance:{now:()=>++now}};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/performance-v1.7.5.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'performance-v1.7.5.js'});
  const cache={};
  function load(id){
    if(cache[id])return cache[id].exports;
    const m={exports:{}};cache[id]=m;
    modules[id](m,m.exports,()=>({}));
    return m.exports;
  }
  const engine=load('game/engine');load('game/render');
  return {context,Game:engine.Game};
}
function rect(id,x,y,w=50,h=50,extra={}){return Object.assign({id,shape:'rect',x,y,w,h,solid:true,destructible:false,hp:0},extra);}

test('Frame Budget publishes v1.7.5 and bounded planner rates',()=>{
  const {context}=loadPerformance(),r=context.window.__NOVA_PERFORMANCE_RELEASE__,t=context.window.__NOVA_PERFORMANCE_TEST__;
  assert.equal(r.version,'1.7.5');
  assert.equal(r.codename,'Frame Budget');
  assert.ok(t.aiRouteHz>=8&&t.aiRouteHz<=15);
  assert.ok(t.droneRouteHz>=10&&t.droneRouteHz<=20);
});

test('spatial broad-phase keeps exact line-of-sight answers',()=>{
  const {Game}=loadPerformance(),g=new Game();
  g.__novaTerrain=[rect(1,50,0,20,120),rect(2,900,900,100,100)];
  assert.equal(g.hasLineOfSight(0,0,100,0,2),false);
  g.__novaTerrain[0].solid=false;
  assert.equal(g.hasLineOfSight(0,0,100,0,2),true);
});

test('first terrain hit remains the nearest exact collision',()=>{
  const {Game}=loadPerformance(),g=new Game();
  g.__novaTerrain=[rect(1,120,0,20,100),rect(2,55,0,20,100)];
  const hit=g.firstTerrainHit(0,0,200,0,0);
  assert.ok(hit);assert.equal(hit.solid.id,2);assert.ok(hit.hit.t<0.3);
});

test('short segment queries prune far-away terrain before narrow phase',()=>{
  const {context,Game}=loadPerformance(),g=new Game();
  for(let y=-5;y<=5;y++)for(let x=-5;x<=5;x++)g.__novaTerrain.push(rect(g.__novaTerrain.length+1,x*500,y*500,60,60));
  const total=g.__novaTerrain.length;
  const n=context.window.__NOVA_PERFORMANCE_TEST__.candidateCount(g,-40,0,40,0,3);
  assert.ok(n<total/5,`expected broad-phase pruning, candidates=${n}, total=${total}`);
  g.hasLineOfSight(-40,0,40,0,3);
  assert.ok(g.__novaPerf.terrainNarrowTests<total/5);
});

test('AI predictive terrain probes are staggered instead of running every movement frame',()=>{
  const {Game}=loadPerformance(),g=new Game(),t={id:7,x:0,y:0,isPlayer:false,ai:{}};
  g.__novaTerrain=[rect(1,500,0,40,100)];
  for(let i=0;i<20;i++)g.moveTank(t,100,0,1/60);
  let p=g.novaPerfSnapshot();
  assert.equal(p.aiRouteFramesPlanned,0);
  assert.ok(p.aiRouteFramesSkipped>=20);
  g.time=.2;g.moveTank(t,100,0,1/60);
  p=g.novaPerfSnapshot();
  assert.equal(p.aiRouteFramesPlanned,1);
  const q=p.terrainQueries;
  for(let i=0;i<12;i++)g.moveTank(t,100,0,1/60);
  assert.equal(g.novaPerfSnapshot().terrainQueries,q,'same planning window should reuse cached steering without new terrain probes');
});

test('drone route planning is decimated while physics/update still executes',()=>{
  const {Game}=loadPerformance(),g=new Game();
  g.__novaTerrain=[rect(1,500,0,40,100)];
  g.drones=[{id:1,x:0,y:0,hp:10},{id:2,x:20,y:0,hp:10}];
  g.updateDrones(1/60);
  const afterFirst=g.novaPerfSnapshot();
  assert.equal(afterFirst.droneRouteFramesPlanned,1);
  assert.ok(afterFirst.terrainQueries>=2);
  const q=afterFirst.terrainQueries;
  for(let i=0;i<10;i++)g.updateDrones(1/60);
  const p=g.novaPerfSnapshot();
  assert.ok(p.droneRouteFramesSkipped>=10);
  assert.equal(p.terrainQueries,q);
});

test('cached AI waypoint steering remains live on skipped planning frames',()=>{
  const {Game}=loadPerformance(),g=new Game(),t={id:3,x:0,y:0,isPlayer:false,ai:{__v172Waypoint:{x:0,y:200},__v172WaypointUntil:1}};
  g.__novaTerrain=[rect(1,900,900,40,40)];
  g.moveTank(t,100,0,1/60);
  assert.ok(t.y>0,`expected cached waypoint to bend movement, y=${t.y}`);
  assert.equal(g.novaPerfSnapshot().terrainQueries,0);
  assert.equal(t.ai.__v172Routing,true);
});
