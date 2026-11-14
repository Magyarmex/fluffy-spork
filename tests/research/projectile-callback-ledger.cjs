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
  let scope = null, installed = false, overflow = 0, epoch = 0, callbackDepth = 0, unknown = 0, unidentifiedTargets = 0, observerErrors = 0, unusedScopes = 0, scopedCalls = 0, coreAttributed = 0, battlefieldAttributed = 0;
  function append(kind, target, args) {
    // Consume the scope before any potentially throwing identity getter or
    // budget check. A dropped/failed first callback must never transfer its
    // shot identity to a later unrelated callback in the same closure.
    const attributed = !!scope && scope.remaining > 0 && callbackDepth === scope.baseDepth;
    if (attributed) scope.remaining--;
    if (events.length >= limit) { overflow++; return; }
    // Read identity once: getters may be stateful or throw on a second read.
    const observedId = target == null ? null : target.id;
    const id = Number.isSafeInteger(observedId) ? observedId : null;
    if (id === null) unidentifiedTargets++;
    if (!attributed) unknown++;
    else if (scope.source === 'core') coreAttributed++;
    else if (scope.source === 'battlefield') battlefieldAttributed++;
    events.push(Object.freeze({epoch, kind, targetId: id,
      shotId: attributed ? scope.shotId : null,
      attribution: attributed ? scope.attribution : 'unknown',
      ...(attributed && scope.source ? {source:scope.source} : {}),
      requestedDamage: Number.isFinite(args[1]) ? args[1] : null}));
  }
  function install() {
    if (installed) return false;
    // Snapshot each method once before mutation. A stateful accessor must not
    // validate one callback and silently wrap a different callback later.
    const preflight = new Map();
    for (const name of methods) {
      const own = Object.getOwnPropertyDescriptor(game, name);
      if ((own && !own.configurable) || (!own && !Object.isExtensible(game)))
        throw new TypeError(name + ' cannot be safely wrapped');
      const original = game[name];
      if (typeof original !== 'function') throw new TypeError(name + ' missing');
      preflight.set(name, {own, original});
    }
    try {
      for (const name of methods) {
        const {own, original} = preflight.get(name);
        originals.set(name, own || null);
        const wrapper = function(...args) {
          // Observer failures must never prevent an actual combat callback.
          try { append(name, args[0], args); }
          catch (_) { observerErrors++; }
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
  function withProjectile(shot, fn, attribution = 'direct', source = null) {
    if (typeof fn !== 'function') throw new TypeError('callback required');
    // Snapshot identity once: mutable or stateful getters must not switch
    // the attributed projectile between validation and ledger recording.
    // An observer must never prevent the real callback when a projectile ID
    // is absent or its getter throws. Run unscoped and mark the frame unsafe.
    // Temporarily suppress an outer scope so a nested invalid shot cannot
    // borrow the parent's identity.
    let shotId;
    try { shotId = shot == null ? null : shot.id; }
    catch (_) { shotId = null; }
    // Malformed research metadata must be treated like an invalid ID: the
    // underlying combat callback still runs, but its attribution is unknown.
    const validAttribution = attribution === 'direct' || attribution === 'indirect';
    const validSource = source === null || source === 'core' || source === 'battlefield';
    if (!validAttribution || !validSource || !Number.isSafeInteger(shotId) || shotId < 0) {
      observerErrors++;
      const prior = scope;
      scope = null;
      try { return fn(); } finally { scope = prior; }
    }
    const prior = scope;
    scopedCalls++;
    scope = {shotId, attribution, source, baseDepth: callbackDepth, remaining: 1};
    try { return fn(); } finally {
      // A scope with no captured callback is evidence of an unobserved path,
      // NOT evidence of a missed hit. Keep it separate from callback errors.
      if (scope.remaining > 0) unusedScopes++;
      scope = prior;
    }
  }
  // Terrain has a separate HP owner and does not call damageTank/Shape/Drone.
  // This records an actual cover write, not a predicted first-contact time.
  function recordCoverDamage(shot, cover, beforeHp, afterHp) {
    try {
      const shotId = shot == null ? null : shot.id;
      const coverId = cover == null ? null : cover.id;
      if (!Number.isSafeInteger(shotId) || shotId < 0 ||
          !Number.isSafeInteger(coverId) ||
          !Number.isFinite(beforeHp) || !Number.isFinite(afterHp) ||
          afterHp > beforeHp) {
        observerErrors++; return false;
      }
      if (events.length >= limit) { overflow++; return false; }
      events.push(Object.freeze({epoch, kind:'coverDamage', targetId:coverId,
        shotId, attribution:'direct', source:'battlefield',
        requestedDamage:null, effectiveDamage:Math.max(0,beforeHp-afterHp),
        timing:'unknown'}));
      return true;
    } catch (_) { observerErrors++; return false; }
  }
  function nextFrame() {
    if (scope || callbackDepth > 0)
      throw new Error('cannot advance frame inside damage callback');
    epoch++; events.length = 0; overflow = 0; unknown = 0; unidentifiedTargets = 0; observerErrors = 0; unusedScopes = 0; scopedCalls = 0; coreAttributed = 0; battlefieldAttributed = 0;
  }
  function counters() {
    // Aggregate natural-match trials need bounded scalar telemetry without
    // cloning every per-hit event on every simulation frame.
    return Object.freeze({epoch, installed, eventsCaptured:events.length,
      overflow, unknown, unidentifiedTargets, observerErrors,
      scopedCalls, unusedScopes, coreAttributed, battlefieldAttributed, bounded:overflow===0&&observerErrors===0});
  }
  function snapshot() {
    return Object.freeze({epoch, installed, events: Object.freeze(events.slice()), overflow, unknown, unidentifiedTargets, observerErrors, scopedCalls, unusedScopes, coreAttributed, battlefieldAttributed,
      bounded: overflow === 0 && observerErrors === 0,
      allCapturedCallbacksAttributed: overflow === 0 && observerErrors === 0 && unknown === 0 && unidentifiedTargets === 0});
  }
  function uninstall() {
    if (!installed) return false;
    if (scope || callbackDepth > 0)
      throw new Error('cannot uninstall inside damage callback');
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
  return Object.freeze({install, uninstall, withProjectile, recordCoverDamage, nextFrame, snapshot, counters});
}
if (typeof module !== 'undefined' && module.exports)
  module.exports = {createProjectileCallbackLedger};
if (typeof window !== 'undefined')
  window.__novaResearchProjectileCallbackLedger = {createProjectileCallbackLedger};
