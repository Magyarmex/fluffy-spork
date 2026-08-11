const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'nova-updates/visual-language-v1.10.9.js'), 'utf8');
const deploy = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
const doctrine = fs.readFileSync(path.join(root, 'VISUAL_LANGUAGE.md'), 'utf8');

function boot() {
  const window = { __novaModules: {} };
  const context = { window, console: { info() {}, warn() {}, error() {} }, Math, Number, Object, Array, String, TypeError };
  vm.runInNewContext(source, context, { filename: 'visual-language-v1.10.9.js' });
  return window;
}

test('visual intent registry requires a decision-relevant question, reason, intent and channel', () => {
  const window = boot();
  assert.throws(() => window.NOVAVisuals.register({ id: 'bad', intent: 'state', channel: 'reticle' }), /question/i);
  assert.throws(() => window.NOVAVisuals.register({ id: 'bad2', intent: 'sparkle', channel: 'reticle', question: 'What changed right now?', reason: 'This would be decorative without a decision.' }), /unknown visual intent/i);
  assert.throws(() => window.NOVAVisuals.register({ id: 'bad3', intent: 'state', channel: 'everywhere', question: 'What changed right now?', reason: 'This would duplicate the same event across surfaces.' }), /unknown visual channel/i);
  const spec = window.NOVAVisuals.register({ id: 'test-ready', intent: 'readiness', channel: 'hud', question: 'Can I use the test action now?', reason: 'The answer changes whether the player commits to the action.' });
  assert.equal(spec.id, 'test-ready');
  assert.equal(window.NOVAVisuals.audit().valid, true);
});

test('current authoritative signals all state why they exist and own one primary channel', () => {
  const audit = boot().NOVAVisuals.audit();
  assert.ok(audit.registered >= 8);
  for (const item of audit.items) {
    assert.ok(item.question.length >= 8, item.id);
    assert.ok(item.reason.length >= 12, item.id);
    assert.ok(['reticle', 'edge', 'world', 'hud', 'chassis'].includes(item.channel), item.id);
  }
  assert.equal(audit.rules.onePrimaryVisual, true);
  assert.equal(audit.rules.cleanPlayerBaseline, true);
});

test('legacy suppression is surgical: duplicate self-blooms go, unrelated world effects stay', () => {
  const T = boot().__NOVA_VISUAL_LANGUAGE_TEST__;
  const player = { x: 100, y: 200, isPlayer: true };
  assert.equal(T.shouldSuppressLegacy({ kind: 'pickup', target: player }, 'addRing', [100, 200, '#75f0a3', 42]), true);
  assert.equal(T.shouldSuppressLegacy({ kind: 'pickup', target: player }, 'addParticles', [100, 200, '#75f0a3', 7, 72, 'glow']), true);
  assert.equal(T.shouldSuppressLegacy({ kind: 'ability', target: player }, 'addRing', [100, 200, '#fff', 36]), true);
  assert.equal(T.shouldSuppressLegacy({ kind: 'evolve', target: player }, 'addParticles', [100, 200, '#fff', 12, 105, 'glow']), true);
  assert.equal(T.shouldSuppressLegacy({ kind: 'update', target: player }, 'addRing', [100, 200, '#d8c0ff', 38]), true);
  assert.equal(T.shouldSuppressLegacy({ kind: 'update', target: player }, 'addText', [100, 170, 'EVADED', '#ffd98a', 9]), true);
  assert.equal(T.shouldSuppressLegacy({ kind: 'pickup', target: player }, 'addRing', [420, 510, '#75f0a3', 42]), false);
  assert.equal(T.shouldSuppressLegacy({ kind: 'update', target: player }, 'addRing', [100, 200, '#ff0000', 90]), false);
});

test('legacy screen-stack fields are explicitly muted while spatial damage/drone state is preserved', () => {
  const T = boot().__NOVA_VISUAL_LANGUAGE_TEST__;
  const saved = T.saveFeedback({ shotUntil: 1, hitUntil: 2, hitKill: true, hitPower: .6, hitColor: '#fff', readyUntil: 3, powerUntil: 4, powerColor: '#0f0', abilityUntil: 5, abilityColor: '#00f', evolveUntil: 6, critical: true, deathUntil: 7, damageUntil: 8, droneUntil: 9 });
  assert.equal(saved.hitKill, true);
  assert.equal(saved.evolveUntil, 6);
  assert.equal(Object.hasOwn(saved, 'damageUntil'), false);
  assert.equal(Object.hasOwn(saved, 'droneUntil'), false);
  assert.match(source, /s\.shotUntil=0;s\.hitUntil=0;s\.readyUntil=0;s\.powerUntil=0;s\.abilityUntil=0;s\.evolveUntil=0;s\.critical=false;s\.deathUntil=0/);
});

test('player-centric renderer uses no additive glow, shadow bloom, particles or full-frame state rectangle', () => {
  assert.doesNotMatch(source, /globalCompositeOperation\s*=\s*['"]lighter['"]/);
  assert.doesNotMatch(source, /shadowBlur\s*=/);
  assert.doesNotMatch(source, /strokeRect\(/);
  assert.match(source, /primary='none'/);
  assert.match(source, /saved\.hitUntil>tm/);
  assert.match(source, /else if\(focus>\.01\)/);
});

test('visual doctrine locks clean-player and one-primary-signal rules for future releases', () => {
  assert.match(doctrine, /clean silhouette/i);
  assert.match(doctrine, /one event[^\n]*one primary visual/i);
  assert.match(doctrine, /NOVA_VISUAL_INTENT/);
  assert.match(doctrine, /world-space/i);
  assert.match(doctrine, /reticle/i);
});

test('production materializer loads Signal Discipline after Applied Power Parity and verifies it', () => {
  assert.match(deploy, /'\.\/nova-updates\/applied-power-parity-v1\.10\.8\.js',\n\s*'\.\/nova-updates\/visual-language-v1\.10\.9\.js'/);
  assert.match(deploy, /grep -q 'nova-updates\/visual-language-v1\.10\.9\.js'/);
});

test('future production runtime files loaded after Signal Discipline must declare NOVA_VISUAL_INTENT', () => {
  const scripts = [...deploy.matchAll(/'\.\/nova-updates\/([^']+\.js)'/g)].map(m => m[1]);
  const boundary = scripts.indexOf('visual-language-v1.10.9.js');
  assert.ok(boundary >= 0);
  const directVisual = /\badd(?:Ring|Particles|Flash|Text)\b|\b(?:ctx|g\.ctx)\.(?:arc|stroke|fill|strokeRect|fillRect|drawImage)\b/;
  for (const file of scripts.slice(boundary + 1)) {
    const text = fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8');
    if (directVisual.test(text)) assert.match(text, /NOVA_VISUAL_INTENT:/, `${file} emits visuals without declaring intent`);
  }
});
