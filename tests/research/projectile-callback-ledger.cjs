'use strict';
// Research-only synchronous callback ledger. No combat writes. Attribution
// requires explicit projectile scope; owner ID alone never proves causality.
function createProjectileCallbackLedger(game, options = {}) {
  if (!game || typeof game !== 'object') throw new TypeError('game required');
  const limit = options.limit === undefined ? 2048 : options.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100000)
    throw new RangeError('invalid event budget');
  const methods = ['damageTank', 'damageShape', 'damageDrone'];
  const originals = new Map(), wrappers = new Map(), events = [];
  let scope = null, installed = false, overflow = 0, epoch = 0, callbackDepth = 0, unknown = 0;
  function append(kind, target, args) {
    if (events.length >= limit) { overflow++; return; }
    const id = target && Number.isSafeInteger(target.id) ? target.id : null;
    const attributed = !!scope && (scope.attribution === 'indirect' || callbackDepth === scope.baseDepth);
    if (!attributed) unknown++;
    events.push(Object.freeze({epoch, kind, targetId: id,
      shotId: attributed ? scope.shotId : null,
      attribution: attributed ? scope.attribution : 'unknown',
      damage: Number.isFinite(args[1]) ? args[1] : null}));
  }
  function install() {
    if (installed) return false;
    // Preflight all methods before touching the instance. Preserve inherited
    // prototype ownership and exact own descriptors on uninstall.
    for (const name of methods) {
      if (typeof game[name] !== 'function') throw new TypeError(name + ' missing');
      const own = Object.getOwnPropertyDescriptor(game, name);
      if ((own && !own.configurable) || (!own && !Object.isExtensible(game)))
        throw new TypeError(name + ' cannot be safely wrapped');
    }
    try {
      for (const name of methods) {
        const own = Object.getOwnPropertyDescriptor(game, name);
        const original = game[name];
        originals.set(name, own || null);
        const wrapper = function(...args) {
          append(name, args[0], args);
          callbackDepth++;
          try { return original.apply(this, args); }
          finally { callbackDepth--; }
        };
        wrappers.set(name, wrapper);
        Object.defineProperty(game, name, {configurable:true, writable:true,
          enumerable:own ? own.enumerable : false, value:wrapper});
      }
    } catch (error) {
      for (const [name, own] of originals) {
        if (own) Object.defineProperty(game, name, own);
        else delete game[name];
      }
      originals.clear(); wrappers.clear();
      throw error;
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
    epoch++; events.length = 0; overflow = 0; unknown = 0;
  }
  function snapshot() {
    return Object.freeze({epoch, events: Object.freeze(events.slice()), overflow, unknown,
      bounded: overflow === 0,
      allCapturedCallbacksAttributed: overflow === 0 && unknown === 0});
  }
  function uninstall() {
    if (!installed) return false;
    // Never overwrite another system's later replacement of our wrapper.
    for (const [name, wrapper] of wrappers)
      if (game[name] !== wrapper)
        throw new Error(name + ' changed after ledger install');
    for (const [name, own] of originals) {
      if (own) Object.defineProperty(game, name, own);
      else delete game[name];
    }
    originals.clear(); wrappers.clear(); installed = false; scope = null;
    return true;
  }
  return Object.freeze({install, uninstall, withProjectile, nextFrame, snapshot});
}
module.exports = {createProjectileCallbackLedger};
