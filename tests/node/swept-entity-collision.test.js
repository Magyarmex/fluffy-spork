const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

function sweep(ax, ay, ex, ey, cx, cy, rr) {
  const dx = ex - ax, dy = ey - ay, fx = ax - cx, fy = ay - cy;
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - rr * rr;
  if (C < 0) return 0;
  if (A < 1e-9) return (fx * fx + fy * fy < rr * rr) ? 1 : null;
  const D = B * B - 4 * A * C;
  if (D <= 0) return null;
  const root = Math.sqrt(D), t0 = (-B - root) / (2 * A), t1 = (-B + root) / (2 * A);
  if (t0 >= 0 && t0 <= 1) return t0;
  if (t1 >= 0 && t1 <= 1) return t1;
  return null;
}

test('shipping collision path broad-phases the full projectile segment', () => {
  assert.match(html, /const travel = Math\.hypot\(ex - ax, ey - ay\)/);
  assert.match(html, /this\.hash\.query\(\(ax \+ ex\) \* 0\.5, \(ay \+ ey\) \* 0\.5, travel \* 0\.5 \+ b\.r \+ 46/);
});

test('hypervelocity crossing registers even when endpoint misses', () => {
  const t = sweep(-100, 0, 100, 0, 0, 0, 20);
  assert.ok(t != null && t > 0.39 && t < 0.41, `expected first contact near 0.4, got ${t}`);
  assert.ok(Math.abs(100) > 20, 'endpoint itself is outside the target');
});

test('near miss stays a miss and nearest contact wins', () => {
  assert.equal(sweep(-100, 25, 100, 25, 0, 0, 20), null);
  const near = sweep(-100, 0, 100, 0, -35, 0, 20);
  const far = sweep(-100, 0, 100, 0, 35, 0, 20);
  assert.ok(near < far, `expected near contact first: ${near} vs ${far}`);
});

test('surviving penetration preserves the original frame endpoint', () => {
  assert.match(html, /if \(!b\.dead && first\) \{\s*b\.x = ex;\s*b\.y = ey;/);
});

test('point-blank overlap resolves immediately rather than at the exit edge', () => {
  assert.equal(sweep(0, 0, 100, 0, 0, 0, 20), 0);
});


test('exact tangency remains a miss under strict collision semantics', () => {
  assert.equal(sweep(-100, 20, 100, 20, 0, 0, 20), null);
});

test('resolved swept contact is nudged infinitesimally inside before strict legacy hit checks', () => {
  assert.match(html, /const hitT = first\.t === 0 \? 0 : Math\.min\(1, first\.t \+ 1e-9\)/);
  const t = sweep(-100, 0, 100, 0, 0, 0, 20);
  const hitT = Math.min(1, t + 1e-9);
  const x = -100 + 200 * hitT;
  assert.ok(x * x < 20 * 20, `expected strict interior contact, got x=${x}`);
});
