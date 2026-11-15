'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function makeScene(order) {
  function Game() {}
  Game.prototype.novaBattlefieldWaypoint = function () { return null; };
  Game.prototype.moveTank = function () {};
  Game.prototype.tryFire = function () {};
  Game.prototype.updatePowerups = function () {};
  const classes = { CLASSES: { guard: { size: 15, bullet: { reload: .5 } } },
    lineageForClass: () => 'guardian' };
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/classes': m => { m.exports = classes; },
    'game/ai': m => { m.exports = { updateAI() {} }; }
  };
  const w = { __novaModules: modules };
  const context = { window: w, Math, Number, Object, Array,
    console: { info() {}, error() {} } };
  for (const file of ['battle-sense-v1.8.1.js', 'terrain-intelligence-v1.10.2.js'])
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),
      context, { filename: file });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => classes);
  const g = new m.exports.Game();
  g.time = 10;
  const walls = [
    { id: 1, x: -130, y: -35, w: 60, h: 330, solid: true },
    { id: 2, x: 0, y: 35, w: 60, h: 330, solid: true },
    { id: 3, x: 130, y: -35, w: 60, h: 330, solid: true }
  ];
  g.__novaTerrain = walls;
  function hits(ax, ay, bx, by, wall, pad) {
    const minX = wall.x - wall.w / 2 - pad, maxX = wall.x + wall.w / 2 + pad;
    const minY = wall.y - wall.h / 2 - pad, maxY = wall.y + wall.h / 2 + pad;
    const dx = bx - ax, dy = by - ay;
    let lo = 0, hi = 1;
    for (const [p, q] of [[-dx, ax-minX], [dx, maxX-ax],
      [-dy, ay-minY], [dy, maxY-ay]]) {
      if (Math.abs(p) < 1e-9) { if (q < 0) return false; }
      else {
        const t = q / p;
        if (p < 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
        if (lo > hi) return false;
      }
    }
    return true;
  }
  g.hasLineOfSight = (ax, ay, bx, by, pad = 0) =>
    !walls.some(wall => hits(ax, ay, bx, by, wall, pad));
  g.isTerrainSafe = (x, y, pad = 0) =>
    !walls.some(wall => Math.abs(x-wall.x) <= wall.w/2+pad &&
      Math.abs(y-wall.y) <= wall.h/2+pad);
  const tank = { id: 7, cls: 'guard', x: -340, y: 0,
    hp: 10, maxHp: 100, alive: true, ai: {} };
  const pickups = [
    { id: 'lower', type: 'heal', x: 340, y: -40 },
    { id: 'upper', type: 'heal', x: 340, y: 40 }
  ];
  g.powerups = order.map(i => pickups[i]);
  g.tanks = [tank];
  g.bullets = [];
  return { g, tank, classes, hooks: w.__NOVA_BATTLE_SENSE_TEST__,
    terrain: w.__NOVA_TERRAIN_INTELLIGENCE__, pickups };
}


test('two critical heals and an unwinnable shield preserve live route ownership in both orders',()=>{
  for(const shieldFirst of [false,true]){
    const scene=makeScene([0,1]);
    const {g,tank,classes,hooks,terrain}=scene;
    const shield={id:'shield',type:'shield',x:340,y:0};
    if(shieldFirst)g.powerups.unshift(shield);else g.powerups.push(shield);
    const selected=hooks.chooseResource(g,tank,classes);
    assert.ok(selected && selected.type==='heal','the critical heal remains preferred');
    assert.equal(terrain.plans,0,'unwinnable shield must not invoke the live movement planner');
    assert.equal(Object.keys(g.__v1102Routes||{}).length,0,'strategic pricing must leave live routes untouched');
    assert.equal(g.__v1102StrategicBudget.plans,2,'both heal contenders are independently evaluated');
  }
});

test('critical heal and competitive shield use bounded scratch routes without corrupting live movement',()=>{
 for(const shieldFirst of [false,true]){
  const {g,tank,classes,hooks,terrain}=makeScene([0]);
  const heal={id:'heal',type:'heal',x:340,y:-40};
  const shield={id:'shield',type:'shield',x:-50,y:40};
  g.powerups=shieldFirst?[shield,heal]:[heal,shield];
  // Both opponents are locally visible, so the shield has legitimate
  // pressure value rather than being an artificially weak candidate.
  const enemies=[{id:80,x:-350,y:-100,alive:true},
   {id:81,x:-350,y:100,alive:true}];
  g.tanks=[tank,...enemies];
  g.__novaFairVisibleTanks=g.tanks;
  const selected=hooks.chooseResource(g,tank,classes);
  assert.ok(selected&&['heal','shield'].includes(selected.id),
   'the mixed pair must yield an eligible strategic pickup');
  assert.equal(terrain.plans,0,
   'neither occluded mixed contender may mutate the live movement route');
  assert.equal(Object.keys(g.__v1102Routes||{}).length,0,
   'both candidate orders preserve live route ownership');
  assert.ok(g.__v1102StrategicBudget.plans<=2,
   'critical mixed-resource planning remains bounded at two searches');
  assert.ok(g.__v1102StrategicBudget.plans>=1,
   'the fixture must exercise strategic route evaluation');
 }
});
