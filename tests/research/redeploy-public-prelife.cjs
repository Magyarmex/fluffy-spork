'use strict';
// Research-only pre-death play. The actor can move/aim using the same public
// camera, visible-neutral LOS and terrain-waypoint policy as the redeploy pilot.
// No hidden enemy/shape positions, sector values or future spawns drive input.
const {createPublicRoam} = require('./redeploy-public-roam.cjs');
const {aimAtVisibleHostile, dodgeVisibleProjectile} =
  require('../browser/frontlines-visible-defense.js');
function finite(p) {return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);}
function snapshot(bodies) {
  return new Map((bodies || []).filter(x => x && x.id != null)
    .map(x => [x.id, [x.x, x.y, x.hp]]));
}
function changed(before, after) {
  const now = snapshot(after);
  let count = 0;
  for (const [id, values] of before) {
    const next = now.get(id);
    if (!next || values.some((v, i) => v !== next[i])) count++;
  }
  for (const id of now.keys()) if (!before.has(id)) count++;
  return count;
}
function playPublicPrelude(game, hz, seconds, fair) {
  if (!Number.isFinite(hz) || hz < 1 || hz > 240 ||
      !Number.isFinite(seconds) || seconds <= 0 || seconds > 30)
    throw Error('Prelude requires a finite 1..240 Hz and 0..30s');
  const player = game.player;
  if (!player || !player.alive || !finite(player) || game.status !== 'playing' ||
      !game.input || !fair || typeof fair.viewportHalfExtents !== 'function')
    throw Error('Prelude requires a live player and the shipping public viewport');
  const start = {x: player.x, y: player.y}, t0 = game.time;
  const shapeStart = snapshot(game.shapes), enemyStart = snapshot((game.tanks || []).filter(t => t.ai));
  const terrainStart = snapshot(game.__novaTerrain);
  const hpStart = player.hp, scoreStart = player.score || 0;
  const xpStart = Number(game.__lfState?.stats?.playerNeutralXP) || 0;
  const roam = createPublicRoam(game, player, start, fair);
  const old = {mouseActive: game.input.mouseActive, autofire: game.input.autofire,
    firing: game.input.firing, moveVec: game.input.moveVec, aimVec: game.input.aimVec};
  let ticks = 0, travelled = 0, last = {x: player.x, y: player.y};
  try {
    game.input.mouseActive = false;
    game.input.autofire = true;
    game.input.firing = false;
    game.input.moveVec = () => {
      const desired = roam.move();
      return dodgeVisibleProjectile(game, player, fair, desired) || desired;
    };
    game.input.aimVec = () => aimAtVisibleHostile(game, player, fair) || roam.aim();
    for (let i = 0, count = Math.ceil(seconds * hz); i < count; i++) {
      if (game.status !== 'playing' || !player.alive) break;
      game.update(1 / hz);
      ticks++;
      if (finite(player)) {
        travelled += Math.hypot(player.x - last.x, player.y - last.y);
        last = {x: player.x, y: player.y};
      }
    }
  } finally {
    Object.assign(game.input, old);
  }
  if (!finite(player) || !(ticks > 0))
    throw Error('Prelude did not produce a finite witnessed death position');
  return {
    requestedSeconds: seconds, hz, ticks,
    elapsed: +(game.time - t0).toFixed(3),
    naturalDeath: !player.alive,
    origin: {x: player.x, y: player.y},
    travelled: +travelled.toFixed(2),
    hpBefore: +Number(hpStart).toFixed(2),
    hpAfter: +Number(player.hp).toFixed(2),
    scoreEarned: +(Number(player.score || 0) - Number(scoreStart)).toFixed(2),
    neutralXPEarned: +((Number(game.__lfState?.stats?.playerNeutralXP) || 0) - xpStart).toFixed(2),
    changedShapes: changed(shapeStart, game.shapes),
    changedEnemies: changed(enemyStart, (game.tanks || []).filter(t => t.ai)),
    changedTerrain: changed(terrainStart, game.__novaTerrain),
    publicRoute: roam.stats()
  };
}
module.exports = {playPublicPrelude};
