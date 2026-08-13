const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourcePath = path.join(__dirname, '../../nova-updates/menu-slot-compat-v1.7.8.js');
const src = fs.readFileSync(sourcePath, 'utf8');
const fieldcraft = src.slice(src.indexOf('NOVA TANKS v1.7.9 — Fieldcraft'));

test('Fieldcraft ships exactly 50 unique reviewed base tips', () => {
  const ids = [...fieldcraft.matchAll(/tip\('([^']+)'\s*,/g)].map((m) => m[1]);
  assert.equal(ids.length, 50);
  assert.equal(new Set(ids).size, 50);
  assert.match(fieldcraft, /reviewed:'2026-08-08'/);
});

test('tip dwell time is exactly double the legacy rotation', () => {
  assert.match(fieldcraft, /var DISPLAY_MS=10400; \/\/ exactly 2x the legacy 5200ms rotation/);
  assert.match(fieldcraft, /setInterval\(rotateContexts,DISPLAY_MS\)/);
  assert.match(fieldcraft, /},DISPLAY_MS\);/);
});

test('rotation uses a shuffle bag rather than sequential indexes', () => {
  assert.match(fieldcraft, /Math\.floor\(Math\.random\(\)\*\(i\+1\)\)/);
  assert.match(fieldcraft, /if\(a\.length>1&&a\[0\]\.id===lastId\)/);
  assert.match(fieldcraft, /var bag=bags\[key\]\|\|\[\]/);
  assert.doesNotMatch(fieldcraft, /tipIndex/);
});

test('legacy five-second writer is neutralized on the live Tips line', () => {
  assert.match(fieldcraft, /old\.classList\.remove\('nv-tip-line'\)/);
  assert.match(fieldcraft, /old\.classList\.add\('nova-tip-line'\)/);
});

test('tips are distributed through relevant menu contexts', () => {
  assert.match(fieldcraft, /data-nova-slot="utility"/);
  assert.match(fieldcraft, /\.nvs-panel/);
  assert.match(fieldcraft, /nova-pilot-panel/);
  assert.match(fieldcraft, /\['blackglass','graft','lineage','apex','discipline'\]/);
  assert.match(fieldcraft, /\['settings','controls','ui'\]/);
});

test('future gameplay releases can register and retire tips', () => {
  assert.match(fieldcraft, /window\.NOVATips=\{/);
  assert.match(fieldcraft, /register:register,registerMany:registerMany,deprecate:deprecate/);
  assert.match(fieldcraft, /staleTipsAllowed:false/);
  assert.match(fieldcraft, /minimumIsNotAQuota:true/);
  assert.match(fieldcraft, /Gameplay releases should register useful mechanic-aware tips and deprecate copy in the same release that makes it false\./);
});

test('tip copy is mechanic-aware rather than generic filler', () => {
  for (const phrase of [
    'Perfect Guard window',
    'programs detonation distance',
    'Forward Observer',
    'destructible cover',
    'deployment distance',
    'screen shake is scaled only for rendering',
  ]) {
    assert.ok(fieldcraft.toLowerCase().includes(phrase.toLowerCase()), `missing mechanic phrase: ${phrase}`);
  }
  assert.doesNotMatch(fieldcraft, /Keep moving\.|Use cover\.|Watch your surroundings\.|Stay alert\./i);
});
