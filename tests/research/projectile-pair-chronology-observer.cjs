'use strict';
// Research-only read-only pre-update observer; never authorizes combat effects.
const { firstContact } = require('./projectile-first-event-certificate.cjs');
const MAX_PAIRS = 256;
function observeProjectilePairs(game, dt, eventsForPair) {
  const result = { scanned: 0, pairs: 0, certified: [], abstained: 0,
    incomplete: false, reason: null };
  if (!game || !Array.isArray(game.bullets) || !Number.isFinite(dt) ||
      !(dt > 0) || typeof eventsForPair !== 'function') {
    result.incomplete = true; result.reason = 'missing-context'; return result;
  }
  const bullets = game.bullets;
  const total = bullets.length * (bullets.length - 1) / 2;
  if (total > MAX_PAIRS) {
    result.incomplete = true; result.reason = 'pair-budget'; return result;
  }
  // Snapshot before the shipping updater mutates TTL, positions, or dead flags.
  const shots = bullets.map(b => b && ({
    kind: b.kind, dead: b.dead, shell: b.shell, beam: b.beam,
    splash: b.splash, __v17Cannon: b.__v17Cannon, __novaRail: b.__novaRail,
    pen: b.pen, hits: b.hits, x: b.x, y: b.y, vx: b.vx, vy: b.vy,
    ttl: b.ttl, r: b.r, ownerId: b.ownerId
  }));
  result.scanned = shots.length;
  for (let i = 0; i < shots.length; i++) for (let j = i + 1; j < shots.length; j++) {
    result.pairs++;
    let context;
    try { context = eventsForPair(shots[i], shots[j], i, j, game, dt); }
    catch (_) { result.incomplete = true; result.reason = 'event-provider-error'; break; }
    if (!context || context.complete !== true || context.unscanned !== false ||
        context.allied !== false) {
      result.incomplete = true; result.reason = 'unverified-pair'; break;
    }
    const time = firstContact(shots[i], shots[j], dt, context);
    if (time === null) { result.abstained++; continue; }
    result.certified.push({ i, j, time });
  }
  if (result.incomplete) {
    result.abstained += result.certified.length;
    result.certified = [];
    return result;
  }
  result.certified.sort((a, b) => a.time - b.time || a.i - b.i || a.j - b.j);
  // Certify at most the unique earliest event in a common frame timeline.
  if (result.certified.length > 1) {
    if (result.certified[1].time <= result.certified[0].time + 1e-9) {
      result.abstained += result.certified.length;
      result.certified = [];
      result.reason = 'simultaneous-contact';
    } else {
      result.abstained += result.certified.length - 1;
      result.certified.length = 1;
    }
  }
  return result;
}
module.exports = { observeProjectilePairs, MAX_PAIRS };
