const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');

function loadMission16() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-ai-tactics-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const dirs = [
    ['src/game/simulation', ['math.ts', 'types.ts']],
    ['src/game/entities', ['types.ts']],
    ['src/game/targeting', ['types.ts']],
    ['src/game/progression', ['types.ts']],
    ['src/ai/memory', ['AIMemory.ts']],
    ['src/ai/perception', ['types.ts', 'AIKnowledge.ts']],
    ['src/ai/navigation', ['types.ts', 'RoutePlanner.ts', 'NavigationService.ts', 'index.ts']],
    ['src/ai/tactics', readdirSync(path.join(root, 'src/ai/tactics')).filter((n) => n.endsWith('.ts'))],
    ['src/input/commands', ['GameCommand.ts']],
    ['src/ai/controllers', readdirSync(path.join(root, 'src/ai/controllers')).filter((n) => n.endsWith('.ts'))],
    ['src/content', ['schema.ts']],
    ['src/game/battlefield', readdirSync(path.join(root, 'src/game/battlefield')).filter((n) => n.endsWith('.ts'))],
  ];
  const sources = dirs.flatMap(([dir, files]) => files.map((file) => path.join(root, dir, file)));
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...sources], { cwd: root, stdio: 'pipe' });
  return {
    Battlefield: require(path.join(outDir, 'game/battlefield/Battlefield.js')).Battlefield,
    RoutePlanner: require(path.join(outDir, 'ai/navigation/RoutePlanner.js')).RoutePlanner,
    NavigationService: require(path.join(outDir, 'ai/navigation/NavigationService.js')).NavigationService,
    TankAIController: require(path.join(outDir, 'ai/controllers/TankAIController.js')).TankAIController,
    TacticalPlanner: require(path.join(outDir, 'ai/tactics/TacticalPlanner.js')).TacticalPlanner,
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

function world(observerId, tick, contacts) {
  return Object.freeze({
    tick, elapsedMs: tick * 16, observerId, contacts: Object.freeze(contacts),
    getContact(id) { return contacts.find((c) => c.id === id); },
    hostileContacts() { return contacts.filter((c) => c.relation === 'hostile'); },
  });
}

function contact(id, relation, position, options = {}) {
  return Object.freeze({
    id, kind: 'tank', relation, teamId: relation === 'hostile' ? 'red' : 'blue', source: relation === 'self' ? 'self' : (options.source || 'direct'),
    position: Object.freeze(position), observedAtTick: options.tick || 1, observedAtMs: (options.tick || 1) * 16,
    visibility: Object.freeze({ directSight: options.directSight !== false, publiclyTracked: options.publiclyTracked !== false, relayed: false, designated: Boolean(options.designated) }),
    live: options.live !== false, targetable: true,
    ...(options.health ? { health: Object.freeze(options.health) } : {}),
  });
}

const build = Object.freeze({
  tankId: 'test', level: 30, appliedPowerLevel: 30, stats: Object.freeze({ damage:0,reload:0,bulletspeed:0,penetration:0,maxhp:0,regen:0,speed:0,body:0 }),
  maxHealth: 100, moveSpeed: 124, projectileDamage: 20, reloadSeconds: .5, projectileSpeed: 600, penetration: 1, bodyDamage: 10, regenPerSecond: 0,
  weaponRange: 900, passiveDamageReduction: 0, bodyReflectFraction: 0, drone: Object.freeze({ count: 2, role:'escort', health:30, damage:5, speed:220, leash:250, foreignHunterCount:0 }),
});

function controllerFor(api, lineage, difficulty = {}) {
  const field = new api.Battlefield({ template: 'crossfire' });
  const nav = new api.NavigationService(new api.RoutePlanner(field));
  return new api.TankAIController({ navigation: nav, difficulty: { reactionTicks: 4, aimErrorRadians: .02, ...difficulty } });
}

test('Mission 16 implements all five combat-lineage doctrines through one canonical tank controller', () => {
  const api = loadMission16();
  try {
    for (const lineage of ['gunner','cannon','guardian','sniper','controller']) {
      const ai = controllerFor(api, lineage);
      const frame = world('self', 10, [contact('self','self',{x:-1200,y:1200},{tick:10}), contact('enemy','hostile',{x:-600,y:1200},{tick:10,health:{current:60,max:100}})]);
      const commands = ai.update({ world: frame, build, lineage, selfHealthFraction: .8, abilityReady: true, ultimateReady: true });
      assert.ok(commands.some((entry) => entry.command.type === 'aim'));
      assert.ok(commands.some((entry) => entry.command.type === 'fire'));
      assert.ok(commands.every((entry) => entry.source === 'ai'));
      assert.equal(ai.currentPlan.targetId, 'enemy');
      assert.ok(ai.currentPlan.preferredRange > 0);
    }
  } finally { api.dispose(); }
});

test('Mission 16 target scoring penalizes dogpiling and respects explicit designation', () => {
  const api = loadMission16();
  try {
    const ai = controllerFor(api, 'gunner');
    const frame = world('self', 10, [contact('self','self',{x:0,y:1600},{tick:10}), contact('a','hostile',{x:500,y:1600},{tick:10}), contact('b','hostile',{x:520,y:1600},{tick:10,designated:true})]);
    ai.update({ world: frame, build, lineage:'gunner', selfHealthFraction:1, friendlyCommitments:{ b: 5 } });
    assert.equal(ai.currentPlan.targetId, 'a');
  } finally { api.dispose(); }
});

test('Mission 16 never converts public awareness into through-cover direct fire', () => {
  const api = loadMission16();
  try {
    const ai = controllerFor(api, 'sniper');
    const frame = world('self', 20, [contact('self','self',{x:0,y:0},{tick:20}), contact('enemy','hostile',{x:400,y:0},{tick:20,directSight:false,source:'public-map'})]);
    const commands = ai.update({ world: frame, build, lineage:'sniper', selfHealthFraction:1 });
    const fire = commands.find((entry) => entry.command.type === 'fire');
    assert.equal(fire.command.active, false);
    assert.equal(ai.currentPlan.targetId, 'enemy');
  } finally { api.dispose(); }
});

test('Mission 16 decisions obey a reaction floor and keep a positive deterministic aim-error floor', () => {
  const api = loadMission16();
  try {
    assert.throws(() => new api.TacticalPlanner({ aimErrorRadians: 0 }), /positive fairness floor/);
    const ai = controllerFor(api, 'gunner', { reactionTicks: 5 });
    ai.update({ world: world('self', 10, [contact('self','self',{x:0,y:1600},{tick:10}), contact('a','hostile',{x:500,y:1600},{tick:10})]), build, lineage:'gunner', selfHealthFraction:1 });
    const first = ai.currentPlan;
    ai.update({ world: world('self', 12, [contact('self','self',{x:0,y:1600},{tick:12}), contact('b','hostile',{x:200,y:1600},{tick:12})]), build, lineage:'gunner', selfHealthFraction:1 });
    assert.equal(ai.currentPlan, first);
    ai.update({ world: world('self', 15, [contact('self','self',{x:0,y:1600},{tick:15}), contact('b','hostile',{x:200,y:1600},{tick:15})]), build, lineage:'gunner', selfHealthFraction:1 });
    assert.equal(ai.currentPlan.targetId, 'b');
    assert.notEqual(Math.atan2(ai.currentPlan.aimVector.y, ai.currentPlan.aimVector.x), 0);
  } finally { api.dispose(); }
});

test('Mission 16 Controller AI emits only the shared swarm command; drone execution remains Mission 17', () => {
  const api = loadMission16();
  try {
    const ai = controllerFor(api, 'controller');
    const commands = ai.update({ world: world('self', 10, [contact('self','self',{x:0,y:1600},{tick:10}), contact('enemy','hostile',{x:600,y:1600},{tick:10})]), build, lineage:'controller', selfHealthFraction:1 });
    const order = commands.find((entry) => entry.command.type === 'swarm-order');
    assert.deepEqual(order.command, { type:'swarm-order', order:'attack', targetId:'enemy' });
  } finally { api.dispose(); }
});

test('Mission 16 source boundary forbids raw world, renderer, legacy, and AI-only movement/fire implementations', () => {
  const files = ['src/ai/tactics/TacticalPlanner.ts','src/ai/controllers/TankAIController.ts'];
  const source = files.map((file) => readFileSync(path.join(root,file),'utf8')).join('\n');
  for (const forbidden of ['GameWorld','EntityStore','rendering/','legacy/','document.','window.','CombatSystem']) assert.equal(source.includes(forbidden), false, `forbidden authority leak: ${forbidden}`);
  assert.match(source, /GameCommand/);
  assert.match(source, /NavigationService/);
  assert.match(source, /PerceivedWorld/);
  assert.match(source, /TankBuild/);
});
