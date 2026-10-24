'use strict';
// Circle's flock/shot/tank scan must not raycast neutral shape types it ignores.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function scenario({ extras = true, bullets = false, dense = false, blocked = false } = {}) {
  const window = { __novaModules: {} };
  const context = { window, Math, Map, Set, Number, Object, Array, Date, JSON,
    performance: { now: () => 0 },
    console: { info() {}, error() {}, warn() {} } };
  for (const file of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8'),context,{filename:file});
  }
  const LF = window.__NOVA_LIVING_FRONT_INTERNAL__;
  const target = { id: 1, kind: 'shape', type: 'circle', x: 0, y: 0, r: 12, hp: 20, vx: 0, vy: 0 };
  const others = [{ id: 2, kind: 'shape', type: 'circle', x: 20, y: 0, r: 12, hp: 20, vx: 0, vy: 0 }];
  if (dense) for (let i = 0; i < 9; i++) others.push({ id: 30 + i, kind: 'shape', type: 'circle', x: 25 + i, y: 5, r: 12, hp: 20, vx: 0, vy: 0 });
  if (extras) for (const [i, type] of ['triangle','square','pentagon','hexagon'].entries())
    others.push({ id: 10 + i, kind: 'shape', type, x: 40 + i * 10, y: 15, r: 14, hp: 20, maxHp: 20, vx: 0, vy: 0 });
  const shot = { id: 500, kind: 'bullet', x: -40, y: 0, vx: 500, vy: 0, r: 3, dead: false };
  const rays = [];
  const g = { time: 10, shapes: [target, ...others], bullets: bullets ? [shot] : [], tanks: [],
    hasLineOfSight(ax, ay, bx, by) {
      if (ax === target.x && ay === target.y) rays.push({ bx, by });
      return !(blocked && bx === shot.x && by === shot.y);
    } };
  const defs = { circle: { speed: 60 }, triangle: { speed: 80 }, square: { speed: 40 }, pentagon: { speed: 30 }, hexagon: { speed: 20 } };
  const st = LF.ensure(g, defs);
  LF.behaviorTick(g, st, defs, .12);
  return { target, rays, st };
}

test('ignored non-circle neutral shapes do not consume terrain visibility rays', () => {
  const s = scenario();
  assert.equal(s.rays.filter(p => p.bx >= 40).length, 0);
});

test('irrelevant neutral types do not change Circle cohesion', () => {
  const a = scenario({ extras: false }).target;
  const b = scenario({ extras: true }).target;
  assert.ok(Math.abs(a.vx - b.vx) < 1e-9);
  assert.ok(Math.abs(a.vy - b.vy) < 1e-9);
});

test('dense Circle schools still react to visible fire after their eighth neighbor', () => {
  const s = scenario({ extras: true, bullets: true, dense: true });
  assert.ok(s.target.__lfDisturbance > 0);
});

test('dense schools still ignore blocked fire', () => {
  const s = scenario({ extras: true, bullets: true, dense: true, blocked: true });
  assert.equal(s.target.__lfDisturbance, undefined);
});

test('the optimized source is included in the materialized game', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
