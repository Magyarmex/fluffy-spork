'use strict';
// Research-only fixture: static permanent terrain, no bodies or powerups.
// Reuses open-field snapshot verification, then arbitrates competing contacts
// against detached, pre-update Battlefield terrain times. Never changes combat.
const { makeOpenFieldProvider } = require('./projectile-open-field-event-provider.cjs');
const { firstContact } = require('./projectile-first-event-certificate.cjs');
const { firstDetachedPermanentTerrainEvent } = require('./projectile-detached-permanent-terrain.cjs');
function makePermanentTerrainProvider(game, dt) {
  if (!game || game.__novaResearchHostilityFixture !== true || !Array.isArray(game.bullets) || !Array.isArray(game.__novaTerrain) ||
      (game.terrain != null && (!Array.isArray(game.terrain) ||
        (game.terrain !== game.__novaTerrain && game.terrain.length > 0)))) return null;
  const sourceBullets = game.bullets;
  const sourceTerrain = game.__novaTerrain;
  const sourceTerrainQuery = game.firstTerrainHit;
  const emptyFixture = { bullets: game.bullets, tanks: game.tanks, shapes: game.shapes,
    drones: game.drones, powerups: game.powerups, player: game.player,
    terrain: [], __novaTerrain: [] };
  const base = makeOpenFieldProvider(emptyFixture, dt, { deferSharedEarliestTie: true });
  if (!base) return null;
  // A callback must never certify against walls changed after its snapshot.
  const terrainState = () => JSON.stringify(game.__novaTerrain.map(s =>
    s && [s.id,s.shape,s.x,s.y,s.w,s.h,s.r,s.solid,s.destructible,s.hp]));
  let initialTerrain;
  try { initialTerrain = terrainState(); } catch (_) { return null; }
  const terrainTimes = [];
  for (const bullet of game.bullets) {
    const event = firstDetachedPermanentTerrainEvent(game, bullet, dt);
    if (!event.complete) return null;
    terrainTimes.push(event.time);
  }
  // Geometry-only competing contacts can be physically impossible when a
  // permanent wall stops one of their participants first. Build the competing
  // event ledger using terrain-qualified contact times, not the open-field
  // ledger, or an impossible earlier contact can hide a later real one.
  // Snapshot only the immutable fields used by the contact oracle. Avoid
  // copying unrelated bullet payloads or invoking unrelated property getters.
  let shots;
  try {
    shots = game.bullets.map(s => Object.freeze({
      kind: s.kind, dead: s.dead, shell: s.shell, beam: s.beam,
      splash: s.splash, __v17Cannon: s.__v17Cannon, __novaRail: s.__novaRail,
      pen: s.pen, hits: s.hits, x: s.x, y: s.y, vx: s.vx, vy: s.vy,
      ttl: s.ttl, r: s.r, ownerId: s.ownerId
    }));
  } catch (_) { return null; }
  const times = Array.from({ length: shots.length }, () => Array(shots.length).fill(null));
  for (let i = 0; i < shots.length; i++) for (let j = i + 1; j < shots.length; j++) {
    const context = { complete: true, allied: false, unscanned: false,
      aTerrain: terrainTimes[i], bTerrain: terrainTimes[j],
      aBody: null, bBody: null, aOtherProjectile: null, bOtherProjectile: null };
    const t = firstContact(shots[i], shots[j], dt, context);
    times[i][j] = times[j][i] = t;
  }
  const events = [];
  for (let i = 0; i < shots.length; i++) for (let j = i + 1; j < shots.length; j++)
    if (times[i][j] !== null) events.push({ i, j, t: times[i][j] });
  events.sort((a, b) => a.t - b.t);
  if (events.length > 1) {
    const earliest = events[0].t;
    for (let a = 0; a < events.length && events[a].t <= earliest + 1e-9; a++)
      for (let b = a + 1; b < events.length && events[b].t <= earliest + 1e-9; b++) {
        const x = events[a], y = events[b];
        if (x.i === y.i || x.i === y.j || x.j === y.i || x.j === y.j) return null;
      }
  }
  return (a,b,i,j,step) => {
    let unchanged;
    try { unchanged = terrainState() === initialTerrain; } catch (_) { return null; }
    if (!unchanged || game.bullets !== sourceBullets ||
        game.__novaTerrain !== sourceTerrain ||
        game.firstTerrainHit !== sourceTerrainQuery ||
        game.__novaResearchHostilityFixture !== true ||
        game.player != null ||
        !['tanks','shapes','drones'].every(k => Array.isArray(game[k]) && game[k].length === 0) ||
        (game.powerups != null && (!Array.isArray(game.powerups) || game.powerups.length !== 0)) ||
        (game.terrain != null && (!Array.isArray(game.terrain) ||
          (game.terrain !== game.__novaTerrain && game.terrain.length !== 0)))) return null;
    const context = base(a,b,i,j,step);
    if (!context || !Number.isInteger(i) || !Number.isInteger(j) ||
        i < 0 || j <= i || j >= terrainTimes.length) return null;
    let aOther = null, bOther = null;
    for (let k = 0; k < times.length; k++) if (k !== i && k !== j) {
      const x = times[i][k], y = times[j][k];
      if (x !== null && (aOther === null || x < aOther)) aOther = x;
      if (y !== null && (bOther === null || y < bOther)) bOther = y;
    }
    return { ...context, aTerrain: terrainTimes[i], bTerrain: terrainTimes[j],
      aOtherProjectile: aOther, bOtherProjectile: bOther };
  };
}
module.exports = { makePermanentTerrainProvider };
