'use strict';
// Research-only geometry: one detached Battlefield index can serve multiple
// projectile queries. The live Game and its spatial hash are never queried.
// Spreading terrain drops inherited/non-enumerable fields and can invoke getters.
// Only stable, enumerable own data fields may authorize a clear-path witness.
function ownData(s, key) {
  const d = Object.getOwnPropertyDescriptor(s, key);
  return !!d && d.enumerable === true && Object.hasOwn(d, 'value');
}
function makeDetachedPermanentTerrainQuery(game) {
  if (!game || typeof game.firstTerrainHit !== 'function' ||
      !Array.isArray(game.__novaTerrain) || game.__novaTerrain.length > 256) return null;
  const firstHit = game.firstTerrainHit;
  const permanent = [], active = [];
  try {
    for (let i = 0; i < game.__novaTerrain.length; i++) {
      if (!Object.hasOwn(game.__novaTerrain, i)) return null;
      const s = game.__novaTerrain[i];
      if (!s || !['shape','x','y','solid','destructible'].every(k => ownData(s,k)) ||
          !(s.shape === 'circle' ? ownData(s,'r') :
            ownData(s,'w') && ownData(s,'h')) ||
          (s.destructible === true && !ownData(s,'hp')) ||
          (s.shape !== 'circle' && s.shape !== 'rect') ||
          (s.destructible !== true && s.destructible !== false) ||
          (s.destructible === false && s.solid !== true) ||
          !['x','y'].every(k => Number.isFinite(s[k])) ||
          (s.shape === 'circle' ? !(Number.isFinite(s.r) && s.r > 0) :
           s.shape === 'rect' ? !(Number.isFinite(s.w) && s.w > 0 && Number.isFinite(s.h) && s.h > 0) : true))
        return null;
      if (s.destructible === true && !(Number.isFinite(s.hp) && s.hp <= 0)) {
        active.push({ x:s.x, y:s.y, halfW:s.shape==='circle'?s.r:s.w/2,
          halfH:s.shape==='circle'?s.r:s.h/2 });
        continue;
      }
      const copy = { ...s };
      // A live stamp can coincide with the first query stamp in a new index.
      delete copy.__novaBattlefieldStamp;
      permanent.push(copy);
    }
  } catch (_) { return null; }
  const detached = { __novaTerrain: permanent };
  const unknown = reason => ({ complete:false, time:null, reason });
  return function query(shot, dt) {
    if (!shot || !Number.isFinite(dt) || dt <= 0 ||
        !['x','y','vx','vy','r','ttl'].every(k => Number.isFinite(shot[k])) ||
        shot.r <= 0 || shot.ttl <= 0 || shot.kind !== 'bullet' ||
        shot.dead !== false || shot.shell !== false || shot.beam !== false ||
        shot.splash || shot.__v17Cannon || shot.__novaRail ||
        shot.pen !== 0 || shot.hits !== 0) return unknown('missing-context');
    try {
      const endX=shot.x+shot.vx*dt, endY=shot.y+shot.vy*dt;
      if (![endX,endY].every(Number.isFinite)) return unknown('invalid-trajectory');
      const pad=shot.r*.45, epsilon=1e-7;
      const minX=Math.min(shot.x,endX)-pad, maxX=Math.max(shot.x,endX)+pad;
      const minY=Math.min(shot.y,endY)-pad, maxY=Math.max(shot.y,endY)+pad;
      for (const s of active)
        if (!(maxX<s.x-s.halfW-epsilon || minX>s.x+s.halfW+epsilon ||
              maxY<s.y-s.halfH-epsilon || minY>s.y+s.halfH+epsilon))
          return unknown('active-cover-corridor');
      const hit=firstHit.call(detached,shot.x,shot.y,endX,endY,pad);
      if (hit==null) return { complete:true,time:null,reason:null };
      if (!hit.hit || !Number.isFinite(hit.hit.t) ||
          hit.hit.t<0 || hit.hit.t>1 || !permanent.includes(hit.solid))
        return unknown('invalid-hit');
      return { complete:true,time:hit.hit.t*dt,reason:null };
    } catch (_) { return unknown('query-error'); }
  };
}
// Backward-compatible single-projectile API. Multi-projectile fixtures should
// explicitly create one detached query and reuse it within the same snapshot.
function firstDetachedPermanentTerrainEvent(game, shot, dt) {
  const query=makeDetachedPermanentTerrainQuery(game);
  return query?query(shot,dt):{complete:false,time:null,reason:'missing-context'};
}
module.exports={firstDetachedPermanentTerrainEvent,makeDetachedPermanentTerrainQuery};
