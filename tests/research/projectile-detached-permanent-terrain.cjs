'use strict';
// Research-only terrain event witness. Calls shipping Battlefield geometry on
// detached copies, never on the live Game or its spatial index.
function firstDetachedPermanentTerrainEvent(game, shot, dt) {
  const unknown = reason => ({ complete: false, time: null, reason });
  if (!game || typeof game.firstTerrainHit !== 'function' ||
      !Array.isArray(game.__novaTerrain) || game.__novaTerrain.length > 256 || !shot ||
      !Number.isFinite(dt) || dt <= 0 ||
      !['x','y','vx','vy','r','ttl'].every(k => Number.isFinite(shot[k])) ||
      shot.r <= 0 || shot.ttl <= 0 || shot.kind !== 'bullet' ||
      shot.dead !== false || shot.shell !== false || shot.beam !== false ||
      shot.splash || shot.__v17Cannon || shot.__novaRail ||
      shot.pen !== 0 || shot.hits !== 0) return unknown('missing-context');
  const terrain = [];
  try {
    const endX = shot.x + shot.vx * dt, endY = shot.y + shot.vy * dt;
    if (![endX,endY].every(Number.isFinite)) return unknown('invalid-trajectory');
    // A necessary-only swept bounding-box check: an active cover object
    // outside this entire padded corridor cannot affect this projectile.
    // Every possibly intersecting active cover still forces abstention.
    const pad = shot.r * .45;
    const minX = Math.min(shot.x,endX) - pad, maxX = Math.max(shot.x,endX) + pad;
    const minY = Math.min(shot.y,endY) - pad, maxY = Math.max(shot.y,endY) + pad;
    for (let i = 0; i < game.__novaTerrain.length; i++) {
      if (!Object.hasOwn(game.__novaTerrain, i)) return unknown('sparse-terrain');
      const s = game.__novaTerrain[i];
      if (!s ||
          (s.destructible !== true && s.destructible !== false) ||
          (s.destructible === false && s.solid !== true) ||
          !['x','y'].every(k => Number.isFinite(s[k])) ||
          (s.shape === 'circle' ? !(Number.isFinite(s.r) && s.r > 0) :
           s.shape === 'rect' ? !(Number.isFinite(s.w) && s.w > 0 && Number.isFinite(s.h) && s.h > 0) : true))
        return unknown('unsupported-terrain');
      if (s.destructible === true && !(Number.isFinite(s.hp) && s.hp <= 0)) {
        // The expanded AABB is intentionally larger than the exact circle
        // or rectangle: false positives abstain, false negatives are unsafe.
        const halfW = s.shape === 'circle' ? s.r : s.w / 2;
        const halfH = s.shape === 'circle' ? s.r : s.h / 2;
        const epsilon = 1e-7;
        if (!(maxX < s.x - halfW - epsilon || minX > s.x + halfW + epsilon ||
              maxY < s.y - halfH - epsilon || minY > s.y + halfH + epsilon))
          return unknown('active-cover-corridor');
        continue;
      }
      const copy = { ...s };
      // The detached index starts at stamp 1. Reusing a live stamp of 1
      // would silently skip this wall during its first spatial query.
      delete copy.__novaBattlefieldStamp;
      terrain.push(copy);
    }
    // firstTerrainHit builds a spatial index and stamps solids. Both mutations
    // must remain confined to this disposable detached object.
    const detached = { __novaTerrain: terrain };
    const x1 = shot.x + shot.vx * dt, y1 = shot.y + shot.vy * dt;
    if (![x1,y1].every(Number.isFinite)) return unknown('invalid-trajectory');
    const hit = game.firstTerrainHit.call(detached, shot.x, shot.y,
      x1, y1, shot.r * .45);
    if (hit == null) return { complete: true, time: null, reason: null };
    if (!hit.hit || !Number.isFinite(hit.hit.t) ||
        hit.hit.t < 0 || hit.hit.t > 1 || !terrain.includes(hit.solid))
      return unknown('invalid-hit');
    return { complete: true, time: hit.hit.t * dt, reason: null };
  } catch (_) { return unknown('query-error'); }
}
module.exports = { firstDetachedPermanentTerrainEvent };
