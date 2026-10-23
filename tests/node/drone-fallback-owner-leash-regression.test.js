'use strict';
// Regression: protected spotter/allied target fallback must not acquire
// targets outside the OWNER's leash merely because a drone is nearby.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/drone-targeting-v1.5.1.js'),'utf8');

function setup(nativeTarget) {
  class Game { acquireDroneTarget(){ return nativeTarget; } }
  const modules={'game/engine':m=>{m.exports.Game=Game;}};
  const win={__novaModules:modules};
  vm.runInNewContext(source,{window:win,console:{info(){},error(){}},Math},
    {filename:'drone-targeting-v1.5.1.js'});
  const mod={exports:{}};
  modules['game/engine'](mod,mod.exports,()=>({}));
  const g=new mod.exports.Game();
  const owner={id:1,kind:'tank',alive:true,team:'blue',x:0,y:0};
  const drone={id:10,kind:'drone',ownerId:1,hp:20,x:490,y:0,leash:500};
  g.tanks=[owner];g.drones=[drone];g.shapes=[];
  g.tankById=new Map([[owner.id,owner]]);
  g.hasLineOfSight=()=>true;
  g.areAllies=(a,b)=>a.team===b.team;
  g.areHostile=(a,b)=>a.team!==b.team;
  return {g,owner,drone,acquire:(leash=500)=>g.acquireDroneTarget(drone,owner,leash)};
}
const protectedSpotter={id:99,kind:'drone',ownerId:9,__novaSpotter:true,hp:10,x:490,y:0};
function tank(id,x,team='red'){return{id,kind:'tank',alive:true,hp:100,x,y:0,team};}
function shape(id,x){return{id,kind:'shape',hp:20,x,y:0};}
function enemyDrone(id,ownerId,x){return{id,kind:'drone',ownerId,hp:30,x,y:0};}

test('a hostile tank close to a displaced drone but outside its owner leash is not acquired',()=>{
  const w=setup(protectedSpotter),enemy=tank(2,650);
  w.g.tanks.push(enemy);
  assert.equal(w.acquire(),null);
});
test('the nearest valid hostile wins over a closer out-of-leash hostile',()=>{
  const w=setup(protectedSpotter),outside=tank(2,560),inside=tank(3,450);
  w.g.tanks.push(outside,inside);
  assert.equal(w.acquire(),inside);
});
test('hostile drones obey owner leash independently of their distant owners',()=>{
  const w=setup(protectedSpotter),remoteOwner=tank(2,900);
  const out=enemyDrone(12,2,610),inside=enemyDrone(13,2,480);
  w.g.tanks.push(remoteOwner);w.g.tankById.set(2,remoteOwner);
  w.g.drones.push(out,inside);
  assert.equal(w.acquire(),inside);
});
test('a hostile drone outside owner leash cannot displace a nearby neutral shape',()=>{
  const w=setup(protectedSpotter),remoteOwner=tank(2,900);
  w.g.tanks.push(remoteOwner);w.g.tankById.set(2,remoteOwner);
  w.g.drones.push(enemyDrone(12,2,580));
  const harvest=shape(30,475);w.g.shapes.push(harvest);
  assert.equal(w.acquire(),harvest);
});
test('neutral fallback never sends a drone after shapes outside its owner leash',()=>{
  const w=setup(protectedSpotter);
  w.g.shapes.push(shape(3,550));
  assert.equal(w.acquire(),null);
});
test('neutral fallback skips a closer out-of-leash shape for a reachable one',()=>{
  const w=setup(protectedSpotter),outside=shape(3,510),inside=shape(4,420);
  w.g.shapes.push(outside,inside);
  assert.equal(w.acquire(),inside);
});
test('an explicitly larger leash retains legitimate targets beyond the 520-unit drone search cap',()=>{
  const w=setup(protectedSpotter),enemy=tank(2,600);
  w.g.tanks.push(enemy);
  assert.equal(w.acquire(650),enemy);
});
test('valid native targets and line-of-sight exclusions remain unchanged',()=>{
  const far=tank(2,800),w=setup(far);
  assert.equal(w.acquire(),far,'native selector remains authoritative for its own targets');
  const x=setup(protectedSpotter),enemy=tank(3,450),harvest=shape(4,460);
  x.g.tanks.push(enemy);x.g.shapes.push(harvest);
  x.g.hasLineOfSight=(ax,ay,bx)=>bx!==450;
  assert.equal(x.acquire(),harvest);
});
