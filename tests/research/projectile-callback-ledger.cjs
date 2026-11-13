'use strict';
// Research-only synchronous callback ledger. No combat writes. Attribution
// requires explicit projectile scope; owner ID alone never proves causality.
function createProjectileCallbackLedger(game, options = {}) {
  if (!game || typeof game !== 'object') throw new TypeError('game required');
  const limit = options.limit === undefined ? 2048 : options.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000)
    throw new RangeError('invalid event budget');
  const methods = ['damageTank', 'damageShape', 'damageDrone'];
  const originals = new Map(), events = [];
  let scope = null, installed = false, overflow = 0, epoch = 0, callbackDepth = 0;
  function append(kind, target, args) {
    if (events.length >= limit) { overflow++; return; }
    const id = target && Number.isSafeInteger(target.id) ? target.id : null;
    events.push(Object.freeze({epoch, kind, targetId: id,
      shotId: scope && (scope.attribution === 'indirect' || callbackDepth === scope.baseDepth) ? scope.shotId : null,
      attribution: scope && (scope.attribution === 'indirect' || callbackDepth === scope.baseDepth) ? scope.attribution : 'unknown',
      damage: Number.isFinite(args[1]) ? args[1] : null}));
  }
  function install() {
    if (installed) return false;
    for (const name of methods)
      if (typeof game[name] !== 'function') throw new TypeError(name + ' missing');
    for (const name of methods) {
      const original = game[name];
      originals.set(name, original);
      game[name] = function(...args) {
        // Capture identity before lethal callbacks mutate/remove their victim.
        append(name, args[0], args);
        callbackDepth++;
        try { return original.apply(this, args); }
        finally { callbackDepth--; }
      };
    }
    installed = true;
    return true;
  }
  function withProjectile(shot, fn, attribution = 'direct') {
    if (typeof fn !== 'function') throw new TypeError('callback required');
    if (!shot || !Number.isSafeInteger(shot.id) || shot.id < 0)
      throw new TypeError('explicit projectile ID required');
    if (attribution !== 'direct' && attribution !== 'indirect')
      throw new TypeError('invalid attribution');
    const prior = scope;
    scope = {shotId: shot.id, attribution, baseDepth: callbackDepth};
    try { return fn(); } finally { scope = prior; }
  }
  function nextFrame() {
    if (scope) throw new Error('cannot advance frame inside projectile callback');
    epoch++; events.length = 0; overflow = 0;
  }
  function snapshot() {
    return Object.freeze({epoch, events: Object.freeze(events.slice()), overflow,
      complete: overflow === 0});
  }
  function uninstall() {
    if (!installed) return false;
    for (const [name, original] of originals) game[name] = original;
    originals.clear(); installed = false; scope = null;
    return true;
  }
  return Object.freeze({install, uninstall, withProjectile, nextFrame, snapshot});
}
module.exports = {createProjectileCallbackLedger};
