const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/lobby-battlefield-v1.10.10.js'), 'utf8');
const deploy = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy.yml'), 'utf8');

function metadataBoot() {
  const window = {};
  const context = { window, document: undefined, navigator: {}, console, Math };
  vm.runInNewContext(source, context, { filename: 'lobby-battlefield-v1.10.10.js' });
  return window;
}

test('Live War Room declares canonical runtime ownership and legal tier states', () => {
  const window = metadataBoot();
  const hooks = window.__NOVA_LOBBY_BATTLEFIELD_TEST__;
  assert.equal(window.__NOVA_VERSION, '1.10.10');
  assert.equal(hooks.codename, 'Live War Room');
  assert.equal(hooks.canonicalRuntime, true);
  assert.equal(hooks.legacyApproximation, false);
  assert.deepEqual([0, 1, 2, 3].map(hooks.legalLevelForTier), [9, 19, 39, 40]);
});

test('roster, models, simulation and rendering come from canonical gameplay modules', () => {
  assert.match(source, /\.\/game\/engine/);
  assert.match(source, /\.\/game\/classes/);
  assert.match(source, /\.\/game\/ai/);
  assert.match(source, /\.\/game\/render/);
  assert.match(source, /Object\.keys\(CLASSES\)\.sort\(classOrder\)/);
  assert.match(source, /new Game\(canvas,this\.mm,callbacks\(\),'low'\)/);
  assert.match(source, /g\.update\(dt\)/);
  assert.match(source, /render\.render\(g,this\.w,this\.h\)/);
});

test('legacy fake combat authorities are gone', () => {
  assert.doesNotMatch(source, /TEAM_EDGE/);
  assert.doesNotMatch(source, /var ROSTER=\[/);
  assert.doesNotMatch(source, /shot:\{speed:/);
  assert.doesNotMatch(source, /team:\(i/);
  assert.doesNotMatch(source, /drawTank=function/);
  assert.doesNotMatch(source, /drawProjectile=function/);
});

test('menu simulation has explicit adaptive performance budgets and no per-frame bind churn', () => {
  const hooks = metadataBoot().__NOVA_LOBBY_BATTLEFIELD_TEST__;
  assert.equal(hooks.normalSimHz, 15);
  assert.equal(hooks.lowSimHz, 12);
  assert.equal(hooks.normalRenderHz, 30);
  assert.equal(hooks.lowRenderHz, 20);
  assert.ok(hooks.normalScale < 1 && hooks.lowScale < hooks.normalScale);
  assert.ok(hooks.panSpeed > 0 && hooks.panSpeed <= 20);
  assert.match(source, /deviceMemory/);
  assert.match(source, /hardwareConcurrency/);
  assert.match(source, /document\.hidden/);
  assert.match(source, /prefers-reduced-motion: reduce/);
  assert.match(source, /this\.boundFrame=this\.frame\.bind\(this\)/);
  assert.doesNotMatch(source, /requestAnimationFrame\(this\.frame\.bind\(this\)\)/);
});

test('decorative world freezes only progression and restores real class-owned drones', () => {
  assert.match(source, /g\.syncAILevels=function\(\)\{\}/);
  assert.match(source, /if\(t&&t\.__novaLobbyClass\)return;/);
  assert.match(source, /baseKill\(victim,killer\)/);
  assert.match(source, /self\.respawns\.push\(\{at:g\.time\+4\.5\+self\.rand\(\)\*4\.5,cls:cls\}\)/);
  assert.match(source, /g\.registerTank\(t\)/);
  assert.match(source, /g\.refitDrones\(t\)/);
  assert.match(source, /g\.sfx=silentAudio\(\)/);
  assert.match(source, /g\.shapeTimer=1e9;g\.powerupTimer=1e9;g\.eliteTimer=1e9/);
});

test('Live War Room remounts if React removes injected presentation nodes', () => {
  assert.match(source, /current=new LiveWorld\(c,m\);current\.atmosphere=a;current\.start\(\)/);
  assert.match(source, /!current\.canvas\.isConnected/);
  assert.match(source, /current\.canvas\.parentElement!==current\.menu/);
  assert.match(source, /!current\.atmosphere\.isConnected/);
  assert.match(source, /current\.atmosphere\.parentElement!==current\.menu/);
  assert.match(source, /if\(current&&\(!m\|\|current\.menu!==m\|\|!m\.isConnected\|\|detached\)\)\{current\.destroy\(\);current=null;\}/);
  assert.match(source, /if\(m&&!current\)mount\(m\)/);
});

test('Live War Room clears stale owned nodes before remounting', () => {
  assert.match(source, /function removeStalePresentation\(m\)/);
  assert.match(source, /querySelectorAll\('\.nv-lobby-battlefield,\.nv-lobby-atmosphere'\)/);
  assert.match(source, /if\(stale\[i\]\.parentElement===m\)m\.removeChild\(stale\[i\]\)/);
  assert.match(source, /function mount\(m\)\{\s*if\(!m\)return;\s*removeStalePresentation\(m\);/);
  assert.doesNotMatch(source, /if\(!m\|\|m\.querySelector\('\.nv-lobby-battlefield'\)\)return/);
});

test('Live War Room obeys Signal Discipline and loads after it', () => {
  const oldRuntime = "'./nova-updates/lobby-battlefield-v1.10.1.js',";
  const parity = "'./nova-updates/applied-power-parity-v1.10.8.js',";
  const signals = "'./nova-updates/visual-language-v1.10.9.js',";
  const live = "'./nova-updates/lobby-battlefield-v1.10.10.js',";
  assert.match(source, /NOVA_VISUAL_INTENT:/);
  assert.equal(deploy.includes(oldRuntime), false);
  assert.ok(deploy.includes(parity));
  assert.ok(deploy.includes(signals));
  assert.ok(deploy.includes(live));
  assert.ok(deploy.indexOf(parity) < deploy.indexOf(signals));
  assert.ok(deploy.indexOf(signals) < deploy.indexOf(live));
  assert.match(deploy, /! grep -q 'nova-updates\/lobby-battlefield-v1\.10\.1\.js' index\.html\.new/);
});
