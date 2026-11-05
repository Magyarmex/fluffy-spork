'use strict';
// Research-only read-only pre-update observer; never authorizes combat effects.
const { firstContact } = require('./projectile-first-event-certificate.cjs');
const MAX_PAIRS = 256;
const EVENT_KEYS = ['aTerrain','bTerrain','aBody','bBody',
  'aOtherProjectile','bOtherProjectile'];
function completeContext(c) {
  if (!c || c.complete !== true || c.unscanned !== false || c.allied !== false)
    return false;
  for (const key of EVENT_KEYS) {
    if (!Object.hasOwn(c, key)) return false;
    const t = c[key];
    if (t !== null && (!Number.isFinite(t) || t < 0)) return false;
  }
  return true;
}
function supported(s) {
  return !!s && s.kind === 'bullet' && s.dead === false &&
    s.shell === false && s.beam === false && !s.splash &&
    !s.__v17Cannon && !s.__novaRail && s.pen === 0 &&
    Number.isFinite(s.hits) && s.hits === 0 && s.ttl > 0 && s.r > 0 &&
    ['x','y','vx','vy','ttl','r','ownerId'].every(k => Number.isFinite(s[k]));
}
// Conservative full-frame swept boxes: a disjoint pair cannot intercept.
// Use the whole frame (not independent TTL endpoints) to avoid false negatives.
function definitelyDisjoint(a, b, dt) {
  if (!a || !b || ![a.x,a.y,a.vx,a.vy,a.r,b.x,b.y,b.vx,b.vy,b.r]
    .every(Number.isFinite) || !(a.r > 0) || !(b.r > 0)) return false;
  const ax = a.x + a.vx * dt, ay = a.y + a.vy * dt;
  const bx = b.x + b.vx * dt, by = b.y + b.vy * dt;
  if (![ax,ay,bx,by].every(Number.isFinite)) return false;
  const radius = a.r + b.r + 1.5;
  return Math.max(a.x,ax) + radius < Math.min(b.x,bx) ||
    Math.max(b.x,bx) + radius < Math.min(a.x,ax) ||
    Math.max(a.y,ay) + radius < Math.min(b.y,by) ||
    Math.max(b.y,by) + radius < Math.min(a.y,ay);
}
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
  let shots;
  try { shots = bullets.map(b => b && Object.freeze({
    kind: b.kind, dead: b.dead, shell: b.shell, beam: b.beam,
    splash: b.splash, __v17Cannon: b.__v17Cannon, __novaRail: b.__novaRail,
    pen: b.pen, hits: b.hits, x: b.x, y: b.y, vx: b.vx, vy: b.vy,
    ttl: b.ttl, r: b.r, ownerId: b.ownerId
  })); }
  catch (_) { result.incomplete = true; result.reason = 'snapshot-error'; return result; }
  result.scanned = shots.length;
  outer: for (let i = 0; i < shots.length; i++) for (let j = i + 1; j < shots.length; j++) {
    result.pairs++;
    if (shots[i] && shots[i].dead === true || shots[j] && shots[j].dead === true) {
      result.abstained++; continue;
    }
    if (definitelyDisjoint(shots[i], shots[j], dt)) {
      result.abstained++; continue;
    }
    if (!supported(shots[i]) || !supported(shots[j])) {
      result.incomplete = true; result.reason = 'unsupported-competing-projectile'; break outer;
    }
    let context;
    try { context = eventsForPair(shots[i], shots[j], i, j, dt); }
    catch (_) { result.incomplete = true; result.reason = 'event-provider-error'; break outer; }
    let verified;
    try { verified = completeContext(context); }
    catch (_) { result.incomplete = true; result.reason = 'event-provider-error'; break outer; }
    if (!verified) {
      result.incomplete = true; result.reason = 'unverified-pair'; break outer;
    }
    let time;
    try { time = firstContact(shots[i], shots[j], dt, context); }
    catch (_) { result.incomplete = true; result.reason = 'certificate-error'; break outer; }
    if (time === null) { result.abstained++; continue; }
    result.certified.push({ i, j, time });
  }
  if (result.incomplete) {
    result.abstained = result.pairs;
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
