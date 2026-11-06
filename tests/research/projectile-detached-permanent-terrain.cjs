'use strict';
// Research-only terrain event witness. Calls shipping Battlefield geometry on
// detached copies, never on the live Game or its spatial index.
function firstDetachedPermanentTerrainEvent(game, shot, dt) {
  const unknown = reason => ({ complete: false, time: null, reason });
  if (!game || typeof game.firstTerrainHit !== 'function' ||
      !Array.isArray(game.__novaTerrain) || !shot ||
      !Number.isFinite(dt) || dt <= 0 ||
      !['x','y','vx','vy','r','ttl'].every(k => Number.isFinite(shot[k])) ||
      shot.r <= 0 || shot.ttl <= 0 || shot.kind !== 'bullet' ||
      shot.dead !== false || shot.shell !== false || shot.beam !== false ||
      shot.splash || shot.__v17Cannon || shot.__novaRail ||
      shot.pen !== 0 || shot.hits !== 0) return unknown('missing-context');
  const terrain = [];
  try {
    for (let i = 0; i < game.__novaTerrain.length; i++) {
      if (!Object.hasOwn(game.__novaTerrain, i)) return unknown('sparse-terrain');
      const s = game.__novaTerrain[i];
      if (!s || (s.destructible === true && !(Number.isFinite(s.hp) && s.hp <= 0)) ||
          (s.destructible !== true && s.destructible !== false) ||
          (s.destructible === false && s.solid !== true) ||
          !['x','y'].every(k => Number.isFinite(s[k])) ||
          (s.shape === 'circle' ? !(Number.isFinite(s.r) && s.r > 0) :
           s.shape === 'rect' ? !(Number.isFinite(s.w) && s.w > 0 && Number.isFinite(s.h) && s.h > 0) : true))
        return unknown('unsupported-terrain');
      terrain.push({ ...s });
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
