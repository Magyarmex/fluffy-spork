const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function baseContext(){
  const listeners = {};
  const context = {
    console,
    window: {},
    document: {
      readyState: 'loading',
      documentElement: {},
      addEventListener(type, fn){ listeners[type] = fn; },
      getElementById(){ return null; },
      querySelectorAll(){ return []; },
    },
    navigator: { onLine: true, maxTouchPoints: 0 },
    requestAnimationFrame(fn){ return fn(); },
    MutationObserver: class { observe(){} disconnect(){} },
    fetch(){ throw new Error('fetch should not run before DOMContentLoaded in this unit harness'); },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  context.window.window = context.window;
  return { context, listeners };
}

function load(){
  const { context } = baseContext();
  const src = fs.readFileSync(path.join(__dirname, '../../nova-updates/living-archive-v1.7.9.js'), 'utf8');
  vm.runInNewContext(src, context, { filename: 'living-archive-v1.7.9.js' });
  return { context, hooks: context.window.__NOVA_LIVING_ARCHIVE_TEST__, src };
}

function loadColorPatch(){
  const { context } = baseContext();
  context.window.__NOVA_LIVING_ARCHIVE_TEST__ = { version: 'test-only' };
  const src = fs.readFileSync(path.join(__dirname, '../../nova-updates/living-archive-runtime-cleanup-v1.7.9.js'), 'utf8');
  vm.runInNewContext(src, context, { filename: 'living-archive-runtime-cleanup-v1.7.9.js' });
  return { context, patch: context.window.__NOVA_ARCHIVE_COLOR_PATCH__, src };
}

function hue(color){
  const m = /^hsl\(([-\d.]+)/.exec(color);
  return m ? Number(m[1]) : NaN;
}

test('Living Archive publishes v1.7.9 release metadata', () => {
  const { context, hooks } = load();
  assert.equal(hooks.version, '1.7.9');
  assert.equal(context.window.__NOVA_LIVING_ARCHIVE_RELEASE__.codename, 'Living Archive');
});

test('major versions own distinct hue families while v1 releases stay cohesive', () => {
  const { patch } = loadColorPatch();
  const a = hue(patch.colorFor('1.1.0', 'A'));
  const b = hue(patch.colorFor('1.7.0', 'B'));
  const c = hue(patch.colorFor('2.1.0', 'C'));
  assert.ok(Math.abs(a - b) < 12, 'all 1.x releases should remain in one color family');
  assert.ok(Math.abs(a - c) > 40, 'a new major should move to a clearly different family');
});

test('patch posts get distinct variations inside the same minor family', () => {
  const { patch } = loadColorPatch();
  const a = patch.colorFor('1.1.0', 'Alpha');
  const b = patch.colorFor('1.1.1', 'Beta');
  const c = patch.colorFor('1.1.2', 'Gamma');
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.ok(Math.abs(hue(a) - hue(c)) < 6, 'patch colors should remain visibly related');
});

test('same semantic version can still give separate release posts their own tint', () => {
  const { patch } = loadColorPatch();
  assert.notEqual(patch.colorFor('1.7.7', 'Contained First Contact'), patch.colorFor('1.7.7', 'Pilot Console'));
  assert.notEqual(patch.colorFor('1.7.8', 'Signal Flow'), patch.colorFor('1.7.8', 'Zero Churn'));
});

test('archive dedupes exact release posts but preserves different codenames on the same version', () => {
  const { hooks } = load();
  const rows = hooks.dedupe([
    {version:'1.7.7',codename:'Pilot Console',headline:'A'},
    {version:'1.7.7',codename:'Pilot Console',headline:'A'},
    {version:'1.7.7',codename:'Contained First Contact',headline:'B'},
    {version:'1.7.8',codename:'Signal Flow',headline:'C'},
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].version, '1.7.8');
  const names = Array.from(rows.filter(r => r.version === '1.7.7'), r => String(r.codename)).sort();
  assert.equal(names.join('|'), 'Contained First Contact|Pilot Console');
});

test('UI contract includes persistent latest card, scrollable archive, ambience and reduced-motion support', () => {
  const { src } = load();
  assert.match(src, /dataset\.novaSlot='latest-release'/);
  assert.match(src, /OPEN ARCHIVE/);
  assert.match(src, /overflow-y:auto/);
  assert.match(src, /nvl-ambience/);
  assert.match(src, /prefers-reduced-motion:reduce/);
  assert.match(src, /data-nova-action=\\?"updates\\?"/);
});

test('runtime refinement removes discovery test metadata and recolors rendered release posts', () => {
  const { context, patch, src } = loadColorPatch();
  assert.ok(patch && typeof patch.colorFor === 'function');
  assert.equal(context.window.__NOVA_LIVING_ARCHIVE_TEST__, undefined);
  assert.match(src, /\.nvl-release,\.nvl-latest/);
  assert.match(src, /delete window\.__NOVA_LIVING_ARCHIVE_TEST__/);
});

test('production materializer loads archive layers after existing menu layers and keeps v1.7.4 badge absent', () => {
  const deploy = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy.yml'), 'utf8');
  const base = deploy.indexOf("./nova-updates/menu-slot-compat-v1.7.8.js");
  const archive = deploy.indexOf("./nova-updates/living-archive-v1.7.9.js");
  const cleanup = deploy.indexOf("./nova-updates/living-archive-runtime-cleanup-v1.7.9.js");
  assert.ok(base >= 0 && archive > base && cleanup > archive, 'archive must layer after the current lobby stack');
  const match = /scripts = \[([\s\S]*?)\n\s*\]/.exec(deploy);
  const scriptsBlock = match ? match[1] : '';
  assert.doesNotMatch(scriptsBlock, /auto-update-test-v1\.7\.4\.js/);
  assert.match(deploy, /! grep -q 'nova-updates\/auto-update-test-v1\.7\.4\.js'/);
});
