'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const marker = '    updateBullets(dt) {';
const start = html.indexOf(marker);
assert.ok(start >= 0, 'shipping projectile update must exist');
let end = start + marker.length, depth = 1;
while (depth && end < html.length) {
  if (html[end] === '{') depth++;
  else if (html[end] === '}') depth--;
  end++;
}
assert.equal(depth, 0, 'shipping projectile method must be balanced');
const method = new Function('types_1', 'classes_1', 'M',
  'return function(dt) {' + html.slice(start + marker.length, end - 1) + '}')(
  { dist2: (x, y, xx, yy) => (x - xx) ** 2 + (y - yy) ** 2 },
  { CLASSES: {} }, 2250);

function trial(hz, beam = false, seconds = 20) {
  let seed = 0x19a7e531, draws = 0, ordinary = 0, beamGlows = 0;
  const bullet = { x: 0, y: 0, vx: 0, vy: 0, r: 2, ttl: seconds + 1,
    ownerId: 1, beam, dead: false, color: '#fff' };
  const game = {
    bullets: [bullet], tmp: [], hash: { query(x, y, r, out) { out.length = 0; } },
    initBulletIntegrity() {}, resolveBulletCollisions() {},
    cosmeticRandom() {
      draws++;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    },
    addParticles(x, y, color, n, speed, kind) {
      assert.equal(n, 1); assert.equal(kind, 'glow');
      if (speed === 20) ordinary++;
      else if (speed === 30) beamGlows++;
      else assert.fail('unexpected projectile trail speed');
    },
  };
  for (let i = 0; i < hz * seconds; i++) method.call(game, 1 / hz);
  assert.equal(game.bullets.length, 1);
  assert.ok(Math.abs(bullet.ttl - 1) < 1e-9);
  assert.equal(bullet.x, 0);
  return { ordinary, beamGlows, draws };
}

test('ordinary trails retain the canonical <=60Hz emission gate', () => {
  const low = trial(30), reference = trial(60);
  assert.equal(low.draws, 600);
  assert.equal(reference.draws, 1200);
  assert.ok(low.ordinary > 100 && low.ordinary < 170, JSON.stringify(low));
  assert.ok(reference.ordinary > 220 && reference.ordinary < 310, JSON.stringify(reference));
});

test('ordinary trail emissions do not double or quadruple at 120/240Hz', () => {
  const reference = trial(60);
  for (const hz of [120, 240]) {
    const high = trial(hz);
    assert.equal(high.draws, hz * 20, 'one cosmetic draw per ordinary projectile update');
    assert.ok(Math.abs(high.ordinary - reference.ordinary) < reference.ordinary * .2,
      hz + 'Hz trail density diverged: ' + JSON.stringify({ reference, high }));
  }
});

test('beam telegraph and fallback gates are unchanged at high refresh', () => {
  const reference = trial(60, true);
  const high = trial(120, true);
  assert.ok(reference.beamGlows > 900);
  assert.ok(high.beamGlows > reference.beamGlows * 1.8,
    'beam visual telegraph must not be throttled by ordinary trail cap');
  assert.ok(reference.ordinary > 15 && high.ordinary > reference.ordinary * 1.5,
    'beam fallback remains unchanged');
});

test('production materializer restores capped trail gate from compressed-shell legacy source', () => {
  const { patchCosmeticRng } = require('../../scripts/patch-cosmetic-rng.cjs');
  const capped = 'else if ((typeof this.cosmeticRandom === "function" ? this.cosmeticRandom() : Math.random()) <\n                (!b.beam && dt < 1 / 60 ? 0.22 * Math.max(0, dt * 60) : 0.22))';
  const legacy = 'else if ((typeof this.cosmeticRandom === "function" ? this.cosmeticRandom() : Math.random()) < 0.22)';
  assert.equal(html.split(capped).length - 1, 1, 'shipping HTML must have exactly one capped gate');
  const legacyShell = html.replace(capped, legacy);
  const restored = patchCosmeticRng(legacyShell);
  assert.equal(restored, html, 'materialization must reproduce shipping capped HTML');
  assert.equal(patchCosmeticRng(restored), restored, 'repeated materialization must be idempotent');
});

test('mixed 120Hz and 30Hz frame intervals retain bounded trail density', () => {
  let seed = 0x19a7e531, draws = 0, ordinary = 0;
  const bullet = { x: 0, y: 0, vx: 0, vy: 0, r: 2, ttl: 21,
    ownerId: 1, beam: false, dead: false, color: '#fff' };
  const game = {
    bullets: [bullet], tmp: [], hash: { query(x, y, r, out) { out.length = 0; } },
    initBulletIntegrity() {}, resolveBulletCollisions() {},
    cosmeticRandom() {
      draws++;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    },
    addParticles(x, y, color, n, speed, kind) {
      assert.equal(speed, 20);
      ordinary++;
    },
  };
  // Each pair advances 1/120 + 1/30 = 1/24 seconds, for 20s total.
  for (let i = 0; i < 480; i++) {
    method.call(game, 1 / 120);
    method.call(game, 1 / 30);
  }
  assert.equal(draws, 960);
  assert.ok(Math.abs(bullet.ttl - 1) < 1e-9);
  // The 30Hz half intentionally retains its legacy per-update gate; the
  // 120Hz half is capped to 0.11 per update. Expected mean: 480*(.22+.11).
  const expected = 480 * (0.22 + 0.11);
  assert.ok(Math.abs(ordinary - expected) < expected * 0.25,
    JSON.stringify({ ordinary, expected }));
});

test('real compressed shipping payload materializes with high-refresh cap', () => {
  const os = require('node:os');
  const zlib = require('node:zlib');
  const { execFileSync } = require('node:child_process');
  const root = path.join(__dirname, '../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-trail-materialize-'));
  try {
    const chunks = fs.readdirSync(path.join(root, 'nova-gz'))
      .filter(name => name.endsWith('.b64')).sort();
    assert.ok(chunks.length > 0, 'canonical compressed shipping payload missing');
    const encoded = chunks.map(name => fs.readFileSync(path.join(root, 'nova-gz', name), 'utf8')).join('')
      .replace(/[\\r\\n\\t ]/g, '');
    const shell = zlib.gunzipSync(Buffer.from(encoded, 'base64')).toString('utf8');
    const destination = path.join(dir, 'index.html');
    fs.writeFileSync(destination, shell);
    const patches = [
      'patch-star-minimap.cjs',
      'patch-saved-records.cjs',
      'patch-ai-strafe-timebase.cjs',
      'patch-raf-step-cap.cjs',
      'patch-cosmetic-rng.cjs',
      'patch-audio-rng.cjs',
      'patch-perk-offer.cjs',
      'patch-render-tank-order.cjs',
    ];
    for (const patch of patches) {
      execFileSync(process.execPath, [path.join(root, 'scripts', patch), destination],
        { timeout: 30000, stdio: 'pipe' });
    }
    const output = fs.readFileSync(destination, 'utf8');
    const capped = '(!b.beam && dt < 1 / 60 ? 0.22 * Math.max(0, dt * 60) : 0.22)';
    assert.equal(output.split(capped).length - 1, 1,
      'real production materializer must preserve exactly one capped projectile trail gate');
    assert.ok(!output.includes('else if (Math.random() < 0.22)'),
      'legacy ordinary projectile trail gate must not survive materialization');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
