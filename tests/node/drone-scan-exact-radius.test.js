'use strict';
// The materialized core's drone selector queries whole 180u hash cells.
// Its owner leash does not enforce the smaller role-specific scan radius.
// Both native acquisition and the v1.5.1 fallback must honor that radius.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const overlay = fs.readFileSync(path.join(root,
  'nova-updates/drone-targeting-v1.5.1.js'), 'utf8');

function coreSelector() {
  const marker = '    acquireDroneTarget(d, owner, leash) {';
  const at = html.indexOf(marker);
  assert.ok(at >= 0, 'shipping core drone selector missing');
  let end = at + marker.length, depth = 1;
  while (depth && end < html.length) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0);
  return new Function('types_1',
    'return function(d,owner,leash){' + html.slice(at + marker.length, end - 1) + '}')(
    { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 });
}
function boot({ role = 'escort', droneX = 0, native = true } = {}) {
  class Game {
    constructor() {
      this.tanks = []; this.drones = []; this.shapes = [];
      this.tmpD = []; this.tankById = new Map();
      this.hasLineOfSight = () => true;
      this.areAllies = (a, b) => a.team != null && a.team === b.team;
      this.areHostile = (a, b) => a.team !== b.team;
      this.hash = { query: (x, y, radius, out) => {
        out.length = 0;
        // The canonical Zero Churn index returns full 180u buckets.
        const minX = Math.floor((x - radius) / 180), maxX = Math.floor((x + radius) / 180);
        const minY = Math.floor((y - radius) / 180), maxY = Math.floor((y + radius) / 180);
        for (const e of [...this.tanks, ...this.shapes, ...this.drones]) {
          const cx = Math.floor(e.x / 180), cy = Math.floor(e.y / 180);
          if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) out.push(e);
        }
      } };
    }
  }
  Game.prototype.acquireDroneTarget = native ? coreSelector() : function() { return null; };
  const modules = { 'game/engine': m => { m.exports = { Game }; } };
  const win = { __novaModules: modules };
  vm.runInNewContext(overlay, { window: win, Math, console: { info() {}, error() {} } });
  const m = { exports: {} };
  modules['game/engine'](m, m.exports, () => ({}));
  const g = new m.exports.Game();
  const owner = { id: 1, kind: 'tank', team: 'blue', alive: true, x: 0, y: 0 };
  const drone = { id: 10, kind: 'drone', ownerId: 1, role,
    x: droneX, y: 0, hp: 20, leash: 500 };
  g.tanks = [owner]; g.drones = [drone]; g.tankById.set(1, owner);
  return { g, owner, drone, acquire: () => g.acquireDroneTarget(drone, owner, 500) };
}
function enemy(id, x) {
  return { id, kind: 'tank', team: 'red', alive: true, spawnShieldT: 0,
    x, y: 0, hp: 100 };
}
function shape(id, x) { return { id, kind: 'shape', x, y: 0, hp: 30, r: 12 }; }

test('real native escort cannot acquire a target beyond its 260u scan', () => {
  const s = boot(), outside = enemy(2, 300);
  s.g.tanks.push(outside);
  assert.equal(s.acquire(), null, 'a full spatial bucket is not extra sensing range');
});
test('real native escort still acquires a target inside its 260u scan', () => {
  const s = boot(), inside = enemy(2, 259);
  s.g.tanks.push(inside);
  assert.equal(s.acquire(), inside);
});
test('native hunter scan is centered on drone, not owner', () => {
  const s = boot({ role: 'hunter', droneX: 400 });
  s.g.tanks.push(enemy(2, -150));
  assert.equal(s.acquire(), null, '550u from drone exceeds its 500u scan');
});
test('native hunter retains legitimate edge-of-scan target', () => {
  const s = boot({ role: 'hunter', droneX: 400 });
  const target = enemy(2, -100);
  s.g.tanks.push(target);
  assert.equal(s.acquire(), target, '500u from drone remains legal');
});
test('combat fallback cannot extend escort sensing beyond 260u', () => {
  const s = boot({ native: false }), far = enemy(2, 300), near = shape(3, 90);
  s.g.tanks.push(far); s.g.shapes.push(near);
  assert.equal(s.acquire(), near, 'far hostile must not suppress nearby farming');
});
test('neutral fallback cannot acquire a shape outside escort scan', () => {
  const s = boot({ native: false });
  s.g.shapes.push(shape(3, 300));
  assert.equal(s.acquire(), null);
});
test('fallback retains visible hostile within escort scan', () => {
  const s = boot({ native: false }), near = enemy(2, 240);
  s.g.tanks.push(near);
  assert.equal(s.acquire(), near);
});
test('fallback hunter range remains centered on drone', () => {
  const s = boot({ native: false, role: 'hunter', droneX: 400 });
  const beyond = enemy(2, -150), inside = enemy(3, 100);
  s.g.tanks.push(beyond, inside);
  assert.equal(s.acquire(), inside);
});
