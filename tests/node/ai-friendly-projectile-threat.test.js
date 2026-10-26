'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the actual shipping AI overlays, not a rewritten threat model.
function hooks() {
  const Game = function Game() {};
  Game.prototype.tryFire = function () {};
  Game.prototype.updatePowerups = function () {};
  Game.prototype.moveTank = function () {};
  const modules = {
    'game/engine': m => { m.exports = {Game}; },
    'game/ai': m => { m.exports = {updateAI() {}}; },
    'game/classes': m => { m.exports = {CLASSES: {twin: {size: 14}}, lineageForClass: () => 'gunner'}; }
  };
  const context = {window: {__novaModules: modules}, console, Math, performance: {now: () => 0}};
  for (const file of ['predator-doctrine-v1.8.0.js', 'battle-sense-v1.8.1.js']) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../nova-updates', file), 'utf8'), context, {filename: file});
  }
  return {
    predator: context.window.__NOVA_PREDATOR_TEST__,
    battle: context.window.__NOVA_BATTLE_SENSE_TEST__
  };
}
function tank(id, teamId) {
  const t = {id, cls: 'twin', x: 0, y: 0, alive: true, hp: 100};
  if (teamId !== undefined) t.teamId = teamId;
  return t;
}
function world(relationship = 'helper') {
  const self = tank(1, 7), ally = tank(2, 7), enemy = tank(3, 8);
  const g = {
    tanks: [self, ally, enemy],
    bullets: [],
    tankById: new Map([[1,self],[2,ally],[3,enemy]]),
    getTank(id) {return this.tanks.find(t => t.id === id) || null;},
    hasLineOfSight() {return true;}
  };
  if (relationship === 'helper') {
    g.areAllies = (a,b) => a.teamId != null && b.teamId != null && a.teamId === b.teamId;
    g.areHostile = (a,b) => a.teamId != null && b.teamId != null ? a.teamId !== b.teamId : true;
  }
  return {g,self,ally,enemy};
}
const incoming = ownerId => ({ownerId, x: 160, y: 5, vx: -500, vy: 0, ttl: 0.6, dead: false});
const laneShot = ownerId => ({ownerId, x: -120, y: 0, vx: 600, vy: 0, ttl: 0.6, dead: false});

for (const relationship of ['helper', 'metadata']) {
  test('Predator dodges hostile but not allied ordinary fire ('+relationship+')', () => {
    const {predator} = hooks(), {g,self} = world(relationship);
    const C = {twin: {size: 14}};
    g.bullets = [incoming(2)];
    assert.equal(predator.threatVector(g,C,self,{}).risk,0,
      'an allied shot cannot hit the evaluating tank and must not trigger defensive movement');
    g.bullets = [incoming(3)];
    assert.ok(predator.threatVector(g,C,self,{}).risk > 0.2,
      'identical hostile fire must still cause a dodge');
    g.bullets = [incoming(2), incoming(3)];
    assert.ok(predator.threatVector(g,C,self,{}).risk > 0.2,
      'friendly traffic must not mask simultaneous hostile danger');
  });
  test('Battle Sense does not mark an allied firing lane as dangerous ('+relationship+')', () => {
    const {battle} = hooks(), {g,self} = world(relationship);
    g.bullets = [laneShot(2)];
    assert.equal(battle.laneRisk(g,0,0,self.id),0,
      'a bot should not abandon a resource or dodge lane because an ally fires through it');
    g.bullets = [laneShot(3)];
    assert.ok(battle.laneRisk(g,0,0,self.id) > 0.3,
      'a hostile shot remains dangerous at the same location');
    g.bullets = [laneShot(2), laneShot(3)];
    const hostile = battle.laneRisk(g,0,0,self.id);
    g.bullets = [laneShot(3)];
    assert.equal(hostile,battle.laneRisk(g,0,0,self.id),
      'adding friendly fire must not inflate hostile lane risk');
  });
}
test('unknown projectile owners remain conservative threats in both AI systems', () => {
  const {predator,battle} = hooks(), {g,self} = world();
  g.bullets = [incoming(999)];
  assert.ok(predator.threatVector(g,{twin:{size:14}},self,{}).risk > 0.2);
  g.bullets = [laneShot(999)];
  assert.ok(battle.laneRisk(g,0,0,self.id) > 0.3);
});
test('unlabeled free-for-all rivals remain threats when no team contract exists', () => {
  const {predator,battle} = hooks(), {g,self} = world('metadata');
  for (const t of g.tanks) delete t.teamId;
  g.bullets = [incoming(2)];
  assert.ok(predator.threatVector(g,{twin:{size:14}},self,{}).risk > 0.2);
  g.bullets = [laneShot(2)];
  assert.ok(battle.laneRisk(g,0,0,self.id) > 0.3);
});
test('without an evaluating tank, Battle Sense retains legacy conservative lane risk', () => {
  const {battle} = hooks(), {g} = world();
  g.bullets = [laneShot(2)];
  assert.ok(battle.laneRisk(g,0,0,999) > 0.3,
    'do not infer friendship from an unresolved observer');
});
