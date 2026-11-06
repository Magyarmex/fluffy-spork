'use strict';
// Research-only fixture: static permanent terrain, no bodies or powerups.
// Reuses open-field third-projectile arbitration and supplies detached,
// pre-update Battlefield terrain times. Never changes live combat.
const { makeOpenFieldProvider } = require('./projectile-open-field-event-provider.cjs');
const { firstDetachedPermanentTerrainEvent } = require('./projectile-detached-permanent-terrain.cjs');
function makePermanentTerrainProvider(game, dt) {
  if (!game || !Array.isArray(game.bullets) || !Array.isArray(game.__novaTerrain) ||
      (game.terrain != null && (!Array.isArray(game.terrain) ||
        (game.terrain !== game.__novaTerrain && game.terrain.length > 0)))) return null;
  const emptyFixture = { bullets: game.bullets, tanks: game.tanks, shapes: game.shapes,
    drones: game.drones, powerups: game.powerups, player: game.player,
    terrain: [], __novaTerrain: [] };
  const base = makeOpenFieldProvider(emptyFixture, dt);
  if (!base) return null;
  const terrainTimes = [];
  for (const bullet of game.bullets) {
    const event = firstDetachedPermanentTerrainEvent(game, bullet, dt);
    if (!event.complete) return null;
    terrainTimes.push(event.time);
  }
  return (a,b,i,j,step) => {
    const context = base(a,b,i,j,step);
    if (!context || !Number.isInteger(i) || !Number.isInteger(j) ||
        i < 0 || j <= i || j >= terrainTimes.length) return null;
    return { ...context, aTerrain: terrainTimes[i], bTerrain: terrainTimes[j] };
  };
}
module.exports = { makePermanentTerrainProvider };
