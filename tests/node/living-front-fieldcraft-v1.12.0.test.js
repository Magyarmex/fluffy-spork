const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../..', 'nova-updates');
const files = ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'];
const director = fs.readFileSync(path.join(root, files[2]), 'utf8');

function boot() {
  let registered = null;
  const window = {
    __novaModules: {},
    NOVATips: { registerMany(list) { registered = list.map(t => ({...t, tags:[...(t.tags||[])]})); return list.length; } }
  };
  const context = { window, console:{info(){},warn(){},error(){}}, Math, Number, Object, Array, Date, JSON, Map, setTimeout(){}, clearTimeout(){} };
  for (const file of files) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
  return {window, registered};
}

test('Living Front registers seven stable tactical tips through canonical NOVATips', () => {
  const {window, registered} = boot();
  assert.equal(window.__NOVA_LIVING_FRONT__.contract.canonicalTipRegistry, true);
  assert.ok(Array.isArray(registered));
  assert.equal(registered.length, 7);
  assert.equal(new Set(registered.map(t => t.id)).size, 7);
  for (const tip of registered) {
    assert.match(tip.id, /^living-front-/);
    assert.ok(tip.text.length >= 70, tip.id);
    assert.ok(Array.isArray(tip.tags) && tip.tags.includes('living-front'), tip.id);
    assert.equal(tip.reviewed, '2026-08-30');
    assert.equal(tip.source, 'living-front-v1.12.0');
  }
});

test('Living Front does not rewrite or observe the rendered tip line', () => {
  assert.doesNotMatch(director, /querySelector\(['"]\.nv-tip-line/);
  assert.doesNotMatch(director, /line\.textContent\s*=\s*TIPS/);
  assert.doesNotMatch(director, /\.observe\(line\s*,/);
  assert.match(director, /NOVATips/);
  assert.match(director, /registerMany\(TIP_DEFS\)/);
});
