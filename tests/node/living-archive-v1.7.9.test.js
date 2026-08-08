const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(){
  const listeners = {};
  const context = {
    console,
    window: {},
    document: {
      readyState: 'loading',
      addEventListener(type, fn){ listeners[type] = fn; },
      getElementById(){ return null; },
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
  const src = fs.readFileSync(path.join(__dirname, '../../nova-updates/living-archive-v1.7.9.js'), 'utf8');
  vm.runInNewContext(src, context, { filename: 'living-archive-v1.7.9.js' });
  return { context, hooks: context.window.__NOVA_LIVING_ARCHIVE_TEST__, src };
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
  const { hooks } = load();
  const a = hue(hooks.colorFor('1.1.0', 'A'));
  const b = hue(hooks.colorFor('1.7.0', 'B'));
  const c = hue(hooks.colorFor('2.1.0', 'C'));
  assert.ok(Math.abs(a - b) < 12, 'all 1.x releases should remain in one color family');
  assert.ok(Math.abs(a - c) > 40, 'a new major should move to a clearly different family');
});

test('patch posts get distinct variations inside the same minor family', () => {
  const { hooks } = load();
  const a = hooks.colorFor('1.1.0', 'Alpha');
  const b = hooks.colorFor('1.1.1', 'Beta');
  const c = hooks.colorFor('1.1.2', 'Gamma');
  assert.notEqual(a, b);
  assert.notEqual(b, c);
  assert.ok(Math.abs(hue(a) - hue(c)) < 6, 'patch colors should remain visibly related');
});

test('same semantic version can still give separate release posts their own tint', () => {
  const { hooks } = load();
  assert.notEqual(hooks.colorFor('1.7.7', 'Contained First Contact'), hooks.colorFor('1.7.7', 'Pilot Console'));
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
  assert.deepEqual(rows.filter(r => r.version === '1.7.7').map(r => r.codename).sort(), ['Contained First Contact','Pilot Console']);
});

test('UI contract includes persistent latest card, scrollable archive, ambience and reduced-motion support', () => {
  const { src } = load();
  assert.match(src, /data-nova-slot='latest-release'|data\.novaSlot='latest-release'/);
  assert.match(src, /OPEN ARCHIVE/);
  assert.match(src, /overflow-y:auto/);
  assert.match(src, /nvl-ambience/);
  assert.match(src, /prefers-reduced-motion:reduce/);
  assert.match(src, /data-nova-action=\\?"updates\\?"/);
});

test('runtime cleanup removes test metadata before release discovery', () => {
  const cleanup = fs.readFileSync(path.join(__dirname, '../../nova-updates/living-archive-runtime-cleanup-v1.7.9.js'), 'utf8');
  assert.match(cleanup, /delete window\.__NOVA_LIVING_ARCHIVE_TEST__/);
});

test('production materializer loads archive layers after existing menu layers and keeps v1.7.4 badge absent', () => {
  const deploy = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy.yml'), 'utf8');
  const base = deploy.indexOf("./nova-updates/menu-slot-compat-v1.7.8.js");
  const archive = deploy.indexOf("./nova-updates/living-archive-v1.7.9.js");
  const cleanup = deploy.indexOf("./nova-updates/living-archive-runtime-cleanup-v1.7.9.js");
  assert.ok(base >= 0 && archive > base && cleanup > archive, 'archive must layer after the current lobby stack');
  assert.doesNotMatch(deploy, /scripts = \[[\s\S]*auto-update-test-v1\.7\.4\.js/);
});
