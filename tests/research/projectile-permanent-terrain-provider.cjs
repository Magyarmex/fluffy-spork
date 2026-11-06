'use strict';
// Research-only fixture: static permanent terrain, no bodies or powerups.
// Reuses open-field third-projectile arbitration and supplies detached,
// pre-update Battlefield terrain times. Never changes live combat.
const { makeOpenFieldProvider } = require('./projectile-open-field-event-provider.cjs');
const { firstDetachedPermanentTerrainEvent } = require('./projectile-detached-permanent-terrain.cjs');
function makePermanentTerrainProvider(game, dt) {
  if (!game || game.__novaResearchHostilityFixture !== true || !Array.isArray(game.bullets) || !Array.isArray(game.__novaTerrain) ||
      (game.terrain != null && (!Array.isArray(game.terrain) ||
        (game.terrain !== game.__novaTerrain && game.terrain.length > 0)))) return null;
  const emptyFixture = { bullets: game.bullets, tanks: game.tanks, shapes: game.shapes,
    drones: game.drones, powerups: game.powerups, player: game.player,
    terrain: [], __novaTerrain: [] };
  const base = makeOpenFieldProvider(emptyFixture, dt);
  if (!base) return null;
  // A callback must never certify against walls changed after its snapshot.\n  const terrainState = () => JSON.stringify(game.__novaTerrain.map(s =>\n    s && [s.id,s.shape,s.x,s.y,s.w,s.h,s.r,s.solid,s.destructible,s.hp]));\n  let initialTerrain;\n  try { initialTerrain = terrainState(); } catch (_) { return null; }\n  const terrainTimes = [];
  for (const bullet of game.bullets) {
    const event = firstDetachedPermanentTerrainEvent(game, bullet, dt);
    if (!event.complete) return null;
    terrainTimes.push(event.time);
  }
  return (a,b,i,j,step) => {
    let unchanged;\n    try { unchanged = terrainState() === initialTerrain; } catch (_) { return null; }\n    if (!unchanged || game.__novaResearchHostilityFixture !== true ||\n        game.player != null ||\n        !['tanks','shapes','drones'].every(k => Array.isArray(game[k]) && game[k].length === 0) ||\n        (game.powerups != null && (!Array.isArray(game.powerups) || game.powerups.length !== 0)) ||\n        (game.terrain != null && (!Array.isArray(game.terrain) ||\n          (game.terrain !== game.__novaTerrain && game.terrain.length !== 0)))) return null;\n    const context = base(a,b,i,j,step);
    if (!context || !Number.isInteger(i) || !Number.isInteger(j) ||
        i < 0 || j <= i || j >= terrainTimes.length) return null;
    return { ...context, aTerrain: terrainTimes[i], bTerrain: terrainTimes[j] };
  };
}
module.exports = { makePermanentTerrainProvider };
