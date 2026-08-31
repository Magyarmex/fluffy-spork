const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../..', 'nova-updates');
const files = ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js'];

function boot() {
  const window = { __novaModules: {} };
  const context = { window, console:{info(){},warn(){},error(){}}, Math, Number, Object, Array, Date, JSON, Map, setTimeout(){}, clearTimeout(){} };
  for (const file of files) vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
  return window.__NOVA_LIVING_FRONT_INTERNAL__;
}

test('Crasher terrain bump expires after collision instead of poisoning future charges', () => {
  const LF = boot();
  assert.equal(typeof LF.decayTerrainBump, 'function');
  const cr = { type:'crasher', __novaTerrainBumpT:.22 };
  assert.ok(LF.decayTerrainBump(cr, .12) > 0, 'fresh Battlefield collision must still interrupt the current charge');
  assert.equal(LF.decayTerrainBump(cr, .12), 0, 'stale shape marker must expire on the next behavior tick when terrain no longer refreshes it');
  cr.__novaTerrainBumpT = .22;
  assert.ok(LF.decayTerrainBump(cr, .12) > 0, 'a later real collision must become detectable again');
});

test('Wild Instincts consumes Crasher terrain bump before charge evaluation each behavior tick', () => {
  const source = fs.readFileSync(path.join(root, 'living-front-instincts-v1.12.0.js'), 'utf8');
  const behavior = source.slice(source.indexOf('LF.behaviorTick='), source.indexOf('LF.bulletThreat=', source.indexOf('LF.behaviorTick=')));
  assert.match(behavior, /if\(s\.type==='crasher'\)decayTerrainBump\(s,dt\)/);
  assert.ok(behavior.indexOf("if(s.type==='crasher')decayTerrainBump(s,dt)") < behavior.indexOf("else if(s.type==='crasher')crasher(g,st,s,defs,dt)"));
});
