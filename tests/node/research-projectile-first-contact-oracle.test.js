'use strict';
// Research-only independent analytic reference for projectile first-contact ordering.
// This oracle is deliberately NOT wired into the shipping collision resolver.
const test = require('node:test');
const assert = require('node:assert/strict');

function firstContact(a, b, horizon = Infinity) {
  const px = a.x - b.x, py = a.y - b.y;
  const vx = a.vx - b.vx, vy = a.vy - b.vy;
  const radius = a.r + b.r + 1.5; // Shipping projectile contact allowance.
  const c = px * px + py * py - radius * radius;
  if (c <= 0) return 0; // Already touching; subject to hostility/terrain policy.
  const qa = vx * vx + vy * vy;
  if (qa <= 0) return null;
  const qb = 2 * (px * vx + py * vy);
  if (qb >= 0) return null; // Initially separating or tangent outside.
  const disc = qb * qb - 4 * qa * c;
  if (disc < 0) return null;
  const t = (-qb - Math.sqrt(Math.max(0, disc))) / (2 * qa);
  const maxTime = Math.min(horizon, a.ttl, b.ttl);
  return t >= 0 && t <= maxTime + 1e-12 ? t : null;
}
function shot(x, y, vx, vy, ttl = 1, r = 3) {
  return { x, y, vx, vy, ttl, r };
}
test('short-TTL interception is physically before expiry', () => {
  const t = firstContact(shot(-20, 0, 6000, 0, .005),
    shot(20, 0, -6000, 0, .005), 1 / 30);
  assert.ok(Math.abs(t - 32.5 / 12000) < 1e-12);
});
test('one projectile expiring first vetoes contact', () => {
  assert.equal(firstContact(shot(-20, 0, 6000, 0, .001),
    shot(20, 0, -6000, 0, .01), 1 / 30), null);
});
test('frame horizon cannot include a future contact', () => {
  assert.equal(firstContact(shot(-20, 0, 6000, 0),
    shot(20, 0, -6000, 0), .002), null);
});
test('already overlapping returns immediate contact', () => {
  assert.equal(firstContact(shot(0, 0, 0, 0), shot(5, 0, 0, 0)), 0);
});
test('parallel separated projectiles do not contact', () => {
  assert.equal(firstContact(shot(0, 0, 10, 0), shot(20, 0, 10, 0)), null);
});
test('separating projectiles do not retroactively contact', () => {
  assert.equal(firstContact(shot(-20, 0, -10, 0), shot(20, 0, 10, 0)), null);
});
test('diagonal crossing detects first entry, not closest approach', () => {
  const a = shot(-10, 0, 10, 0), b = shot(0, -10, 0, 10);
  const t = firstContact(a, b);
  assert.ok(t > 0 && t < 1);
  const dx = (a.x + a.vx * t) - (b.x + b.vx * t);
  const dy = (a.y + a.vy * t) - (b.y + b.vy * t);
  assert.ok(Math.abs(Math.hypot(dx, dy) - 7.5) < 1e-9);
});
test('near miss remains a miss even if closest approach is near', () => {
  assert.equal(firstContact(shot(-20, 0, 40, 0),
    shot(0, 8, 0, 0)), null);
});
test('canonical-scale shotgun pair contacts before 0.42s TTL', () => {
  const t = firstContact(shot(-227.43, 0, 540, 0, .42, 4.2),
    shot(227.43, 0, -540, 0, .42, 4.2));
  assert.ok(Math.abs(t - .412) < 1e-12);
});
test('uniform time partition leaves physical contact time unchanged', () => {
  const a = shot(-20, 0, 6000, 0, .005);
  const b = shot(20, 0, -6000, 0, .005);
  const full = firstContact(a, b, .008);
  const dt = .002;
  const a2 = { ...a, x: a.x + a.vx * dt, ttl: a.ttl - dt };
  const b2 = { ...b, x: b.x + b.vx * dt, ttl: b.ttl - dt };
  assert.ok(Math.abs(full - (dt + firstContact(a2, b2, .006))) < 1e-12);
});
