'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {patchSavedRecords, changes} = require('../../scripts/patch-saved-records.cjs');

const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

function evaluatePatchedRecords(score, level) {
  const patched = patchSavedRecords(html);
  const start = patched.indexOf('        const savedBestScore = Number(');
  const end = patched.indexOf("        this.muted = ", start);
  assert.ok(start >= 0 && end > start, 'shipping Game constructor must contain sanitized records');
  const body = patched.slice(start, end);
  const store = new Map([['novatanks_best', score], ['novatanks_bestlevel', level]]);
  const storage = {lsGet: key => store.get(key)};
  const types = {MAX_LEVEL: 45};
  const read = new Function('storage_1', 'types_1', body + '\nreturn {best:this.best, level:this.bestRunLevel};');
  const game = read.call({}, storage, types);
  const menu = new Function('storage_1', 'return ({' + changes[2].after + '}).best;')(storage);
  return {...game, menu};
}

test('the decoded production Game and React menu are patched exactly once, idempotently', () => {
  const once = patchSavedRecords(html);
  assert.equal(patchSavedRecords(once), once);
  for (const {before, after} of changes) {
    assert.equal(once.split(before).length - 1, 0, 'legacy read remains');
    assert.equal(once.split(after).length - 1, 1, 'sanitized read missing or duplicated');
  }
});

test('valid score and level records retain earned values and menu parity', () => {
  for (const [score, level] of [['0', '0'], ['1.25', '1'], ['100', '3'],
    ['999999999', '45'], ['1e100', '40']]) {
    const out = evaluatePatchedRecords(score, level);
    assert.equal(out.best, Number(score));
    assert.equal(out.menu, Number(score));
    assert.equal(out.level, Number(level));
  }
});

test('corrupt, negative, nonfinite and out-of-range records cannot poison a run', () => {
  for (const bad of ['oops', 'NaN', 'Infinity', '-Infinity', '1e309', '-7']) {
    const out = evaluatePatchedRecords(bad, bad);
    assert.deepEqual(out, {best:0, level:0, menu:0}, bad);
  }
  for (const badLevel of ['45.1', '46', '999999', '-1']) {
    assert.equal(evaluatePatchedRecords('250', badLevel).level, 0, badLevel);
  }
  assert.deepEqual(evaluatePatchedRecords(null, null), {best:0, level:0, menu:0});
});

test('source drift fails closed instead of silently dropping protection', () => {
  const original = changes[0].before;
  assert.throws(() => patchSavedRecords(html.replace(original, original + ' // drift')), /changed unexpectedly/);
  assert.throws(() => patchSavedRecords('not a game'), /owners missing/);
  assert.throws(() => patchSavedRecords(null), /UTF-8/);
});

test('production materializer applies both base patches before composing the shell', () => {
  const deploy = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy.yml'), 'utf8');
  const star = deploy.indexOf('node scripts/patch-star-minimap.cjs index.html.new');
  const saves = deploy.indexOf('node scripts/patch-saved-records.cjs index.html.new');
  const compose = deploy.indexOf("from pathlib import Path", saves);
  assert.ok(star >= 0 && saves > star && compose > saves, 'saved-record patch must run before composition');
  assert.match(deploy, /'scripts\/patch-saved-records.cjs',/);
});
