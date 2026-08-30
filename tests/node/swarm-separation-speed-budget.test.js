const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/terrain-intelligence-v1.10.2.js'), 'utf8');

function bootGame(){
  class Game {
    constructor(){
      this.time = 0;
      this.drones = [];
      this.tanks = [];
    }
    getTank(id){ return this.tanks.find(t => t.id === id) || null; }
    updateDrones(){ return undefined; }
  }

  const modules = {
    'game/engine'(module){ module.exports = {Game}; }
  };
  const window = {__novaModules: modules};
  const context = {window, console:{info(){},warn(){},error(){}}, Math, Object, Array, Number, String, Infinity};
  vm.runInNewContext(source, context, {filename:'terrain-intelligence-v1.10.2.js'});

  const module = {exports:{}};
  modules['game/engine'](module, module.exports, id => {
    if(id === './classes') return {
      CLASSES:{carrier:{size:15}},
      lineageForClass(){ return 'controller'; }
    };
    throw new Error(`unexpected require ${id}`);
  });
  return module.exports.Game;
}

function controllerGame(drones){
  const Game = bootGame();
  const game = new Game();
  game.tanks = [{id:1, alive:true, cls:'carrier', __novaSwarm:{active:true}}];
  game.drones = drones;
  return game;
}

function speed(d){ return Math.hypot(d.__novaVX || 0, d.__novaVY || 0); }

test('friendly swarm separation cannot create movement from rest',()=>{
  const drones = [
    {id:11, ownerId:1, hp:20, x:0, y:0, __novaVX:0, __novaVY:0},
    {id:12, ownerId:1, hp:20, x:0, y:12, __novaVX:0, __novaVY:0}
  ];
  const game = controllerGame(drones);
  game.updateDrones(.016);

  assert.equal(drones[0].__novaVX, 0);
  assert.equal(drones[0].__novaVY, 0);
  assert.equal(drones[1].__novaVX, 0);
  assert.equal(drones[1].__novaVY, 0);
});

test('friendly swarm separation bends heading without increasing speed',()=>{
  const drones = [
    {id:21, ownerId:1, hp:20, x:0, y:0, __novaVX:120, __novaVY:0},
    {id:22, ownerId:1, hp:20, x:0, y:12, __novaVX:120, __novaVY:0}
  ];
  const before = drones.map(d => ({vx:d.__novaVX, vy:d.__novaVY, speed:speed(d)}));
  const game = controllerGame(drones);
  game.updateDrones(.016);

  for(let i=0;i<drones.length;i++){
    assert.ok(speed(drones[i]) <= before[i].speed + 1e-9, `drone ${i} gained free speed`);
    assert.ok(Math.abs(speed(drones[i]) - before[i].speed) <= 1e-9, `drone ${i} should preserve its movement budget`);
  }
  assert.notEqual(drones[0].__novaVY, before[0].vy, 'separation should still bend the first drone away from its neighbor');
  assert.notEqual(drones[1].__novaVY, before[1].vy, 'separation should still bend the second drone away from its neighbor');
  assert.ok(drones[0].__novaVY < 0 && drones[1].__novaVY > 0, 'the pair should separate in opposite directions');
});

test('dash and windup commitment states are never separation-steered',()=>{
  const drones = [
    {id:31, ownerId:1, hp:20, x:0, y:0, __novaVX:75, __novaVY:20, __novaPhase:'dash'},
    {id:32, ownerId:1, hp:20, x:0, y:10, __novaVX:65, __novaVY:-15, __novaPhase:'windup'},
    {id:33, ownerId:1, hp:20, x:10, y:5, __novaVX:90, __novaVY:0}
  ];
  const committed = drones.slice(0,2).map(d => ({vx:d.__novaVX, vy:d.__novaVY}));
  const game = controllerGame(drones);
  game.updateDrones(.016);

  assert.deepEqual({vx:drones[0].__novaVX, vy:drones[0].__novaVY}, committed[0]);
  assert.deepEqual({vx:drones[1].__novaVX, vy:drones[1].__novaVY}, committed[1]);
});
