const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const uiDir = path.join(root, 'src/ui');

function loadMission21() {
  const outDir = mkdtempSync(path.join(tmpdir(), 'nova-ui-'));
  const tsc = require.resolve('typescript/bin/tsc');
  const entries = [
    path.join(uiDir, 'store/UIStore.ts'),
    path.join(uiDir, 'actions/UIController.ts'),
    path.join(uiDir, 'settings/LiveSettings.ts'),
    path.join(uiDir, 'messages/MessageFeed.ts'),
    path.join(root, 'src/input/touch/TouchInputAdapter.ts'),
  ];
  execFileSync(process.execPath, [tsc, '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--skipLibCheck', '--strict', '--outDir', outDir, ...entries], { cwd: root, stdio: 'pipe' });
  const store = require(path.join(outDir, 'ui/store/UIStore.js'));
  const actions = require(path.join(outDir, 'ui/actions/UIController.js'));
  const settings = require(path.join(outDir, 'ui/settings/LiveSettings.js'));
  const messages = require(path.join(outDir, 'ui/messages/MessageFeed.js'));
  return {
    ui: { ...store, ...actions, ...settings, ...messages },
    touch: require(path.join(outDir, 'input/touch/TouchInputAdapter.js')),
    dispose: () => rmSync(outDir, { recursive: true, force: true }),
  };
}

const api = loadMission21();
test.after(() => api.dispose());

function missionTest(name, fn) {
  test(name, () => {
    try { fn(); }
    catch (error) {
      const message = String(error && error.stack ? error.stack : error).replace(/\r?\n/g, '%0A');
      console.log(`::error file=tests/node/ui-mission-21.test.js,title=${name}::${message}`);
      throw error;
    }
  });
}

function frame(overrides = {}) {
  return {
    tick: 12,
    playerId: 'player',
    entities: { version: 1, entities: [{
      id: 'player', kind: 'tank', lifecycle: 'active', position: { x: 1, y: 2 }, rotation: 0,
      turretRotation: 0, team: { teamId: 'blue' }, health: { current: 75, max: 100 },
      tankDefinitionId: 'basic', spawnedAtTick: 0,
    }] },
    score: 900,
    contacts: [],
    ...overrides,
  };
}

missionTest('Mission 21 store projects authoritative state without owning it', () => {
  const store = new api.ui.UIStore();
  const source = frame();
  const model = store.publish(source);
  assert.equal(model.hud.health.current, 75);
  assert.equal(model.hud.score, 900);
  assert.equal(model.hud.tick, 12);
  assert.notEqual(model.hud.health, source.entities.entities[0].health, 'UI receives a copied health projection');
  assert.equal(typeof store.getSnapshot().hud, 'object');
  assert.equal('world' in store, false);
  assert.equal('entities' in store, false);
});

missionTest('Mission 21 live settings preserve fair-play ranges and canonical input provider', () => {
  const settings = new api.ui.LiveSettings();
  settings.update({ aimSensitivity: 9, moveSensitivity: 0.1, stickSize: 4, stickOpacity: 0, screenShake: 4 });
  const state = settings.snapshot();
  assert.equal(state.input.aimSensitivity, 1.6);
  assert.equal(state.input.moveSensitivity, 0.6);
  assert.equal(state.presentation.stickSize, 1.3);
  assert.equal(state.presentation.stickOpacity, 0.3);
  assert.equal(state.presentation.screenShake, 1);
  assert.deepEqual(settings.inputSettings(), state.input);
});

missionTest('Mission 21 move sensitivity changes stick response without exceeding canonical command range', () => {
  const slow = new api.touch.TouchInputAdapter(() => ({ aimSensitivity: 1, moveSensitivity: 0.6, stickDeadzone: 0.12 }));
  const fast = new api.touch.TouchInputAdapter(() => ({ aimSensitivity: 1, moveSensitivity: 1.6, stickDeadzone: 0.12 }));
  const sample = { moveStick: { x: 0.3, y: 0 }, aimStick: { x: 0, y: 0 }, firing: false, ultimate: false };
  slow.ingest(sample); fast.ingest(sample);
  const slowMove = slow.poll().find((envelope) => envelope.command.type === 'move').command.vector.x;
  const fastMove = fast.poll().find((envelope) => envelope.command.type === 'move').command.vector.x;
  assert.ok(fastMove > slowMove);
  assert.ok(fastMove <= 1 && slowMove >= -1);
});

missionTest('Mission 21 preserves Quiet Relay duplicate-message suppression windows', () => {
  const feed = new api.ui.MessageFeed();
  assert.equal(feed.push('CONTACT', 1000).text, 'CONTACT RELAY');
  assert.equal(feed.push('CONTACT RELAY', 2000), undefined);
  assert.equal(feed.push('CONTACT', 2400).text, 'CONTACT RELAY');
  assert.equal(feed.push('SPOTTED', 3000).text, 'SPOTTED · RELAY');
  assert.equal(feed.push('SPOTTED · RELAY', 4800), undefined);
  assert.equal(feed.push('SPOTTED', 4900).text, 'SPOTTED · RELAY');
});

missionTest('Mission 21 controller emits canonical commands and delegates progression to application APIs', () => {
  const issued = [];
  const evolved = [];
  const store = new api.ui.UIStore();
  const controller = new api.ui.UIController(store, {
    issue: (command) => issued.push(command),
    chooseEvolution: (tankId) => evolved.push(tankId),
  });
  controller.swarm('defend');
  controller.designate('enemy');
  controller.evolve('gunner');
  assert.deepEqual(issued, [
    { type: 'swarm-order', order: 'defend', targetId: undefined },
    { type: 'designate-target', targetId: 'enemy' },
  ]);
  assert.deepEqual(evolved, ['gunner']);
});

missionTest('Mission 21 React remains a presentation shell with no gameplay authority imports', () => {
  const sources = [
    'CanonicalUI.tsx', 'selectors.ts', 'store/UIStore.ts', 'actions/UIController.ts', 'settings/LiveSettings.ts', 'messages/MessageFeed.ts',
  ].map((file) => readFileSync(path.join(uiDir, file), 'utf8')).join('\n');
  assert.doesNotMatch(sources, /GameWorld|CombatSystem|EntityStore|stepTankMovement|applyDamage|spawnProjectile/);
  assert.doesNotMatch(sources, /\.evolve\(state|chooseMastery\(state|chooseGene\(state/);
  assert.match(sources, /swarm-order/);
  assert.match(sources, /designate-target/);
  assert.match(sources, /useSyncExternalStore/);
});

missionTest('Mission 21 covers required presentation surfaces without redesigning controls', () => {
  const source = readFileSync(path.join(uiDir, 'CanonicalUI.tsx'), 'utf8');
  for (const token of ['HUD', 'NOVA menu', 'Evolution', 'Pilot settings', 'Blackglass UI', 'Debug data', 'Touch controls', 'Swarm commands']) {
    assert.match(source, new RegExp(token));
  }
  const touchSource = readFileSync(path.join(root, 'src/input/touch/TouchInputAdapter.ts'), 'utf8');
  assert.match(touchSource, /Pure twin-stick translator/);
  assert.doesNotMatch(source, /aim assist|auto.?aim|third joystick/i);
});
