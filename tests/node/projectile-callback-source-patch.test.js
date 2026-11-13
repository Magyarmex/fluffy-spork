'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {patchMaterializedCore, CALLS} = require('../research/projectile-callback-source-patch.cjs');
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
test('research patch changes exactly three authoritative core callbacks, not splash or overlays',()=>{
  const patched = patchMaterializedCore(html);
  assert.notEqual(patched, html);
  assert.equal((patched.match(/this\.__novaShotLedger\.withProjectile\(b, \(\) =>/g)||[]).length,3);
  const start=html.indexOf('    updateBullets(dt) {');
  const end=html.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {',start);
  assert.equal(patched.slice(0,start),html.slice(0,start));
  const patchedEnd=patched.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {',start);
  assert.equal(patched.slice(patchedEnd),html.slice(end));
  for(const call of CALLS)assert.ok(patched.includes(' : '+call.slice(0,-1)+');'));
});
test('research patch fails closed on changed or ambiguous callback ownership',()=>{
  for(const call of CALLS){
    assert.throws(()=>patchMaterializedCore(html.replace(call,'/* changed callback */')),
      /expected one core callback/);
    const start=html.indexOf('    updateBullets(dt) {');
    assert.throws(()=>patchMaterializedCore(html.slice(0,start+'    updateBullets(dt) {'.length)+call+'\n'+html.slice(start+'    updateBullets(dt) {'.length)),
      /expected one core callback/);
  }
  assert.throws(()=>patchMaterializedCore('not a game'),/shipping core boundaries/);
});
test('patched materialized core inline JavaScript remains syntactically valid',()=>{
  const patched=patchMaterializedCore(html);
  const blocks=[...patched.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length>0);
  for(const block of blocks)new vm.Script(block[1],{filename:'research-patched-index.html'});
});
