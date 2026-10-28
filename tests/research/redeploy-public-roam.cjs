'use strict';
// Research-only input policy: no hidden enemy, ecology, reward or spawn data.
// Visible neutral bodies and remembered player death position are the only
// targets. Terrain LOS/waypoints are used exactly as in the navigation pilot.
const PATROL = Object.freeze([
  [420, 0], [420, 420], [0, 420], [-420, 420],
  [-420, 0], [-420, -420], [0, -420], [420, -420]
]);
function finitePoint(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}
function visibleNeutral(game, player, fair) {
  if (!fair || typeof fair.viewportHalfExtents !== 'function') return null;
  const ext = fair.viewportHalfExtents(game);
  if (!ext || !(ext.x > 0) || !(ext.y > 0)) return null;
  const cam = game.cam || {};
  const cx = Number.isFinite(cam.x) ? cam.x : player.x;
  const cy = Number.isFinite(cam.y) ? cam.y : player.y;
  let best = null, distance = Infinity;
  for (const shape of game.shapes || []) {
    if (!shape || !(shape.hp > 0) || !finitePoint(shape) ||
      Math.abs(shape.x - player.x) > ext.x || Math.abs(shape.y - player.y) > ext.y ||
      Math.abs(shape.x - cx) > ext.x || Math.abs(shape.y - cy) > ext.y) continue;
    const d = Math.hypot(shape.x - player.x, shape.y - player.y);
    if (!(d > 1) || d >= distance ||
      typeof game.hasLineOfSight !== 'function' ||
      !game.hasLineOfSight(player.x, player.y, shape.x, shape.y, 2)) continue;
    best = shape;
    distance = d;
  }
  return best ? {x: best.x, y: best.y, distance} : null;
}
function createPublicRoam(game, player, origin, fair) {
  if (!finitePoint(origin)) throw Error('A witnessed finite death position is required');
  let patrolIndex = 0, waypointFailures = 0, routeRequests = 0, routeWaypoints = 0;
  let lastDistance = Infinity, lastProgressTime = Number.isFinite(game.time) ? game.time : 0;
  let activated = false;
  const clamp = v => Math.max(-1900, Math.min(1900, v));
  const patrolPoint = () => ({
    x: clamp(origin.x + PATROL[patrolIndex][0]),
    y: clamp(origin.y + PATROL[patrolIndex][1])
  });
  function move() {
    if (!activated) { lastProgressTime = game.time; activated = true; }
    const neutral = visibleNeutral(game, player, fair);
    // Approach a currently visible neutral, but do not chase its hidden last
    // location or stop indefinitely inside its collision radius.
    const chase = neutral && neutral.distance > 145 && neutral.distance < 460;
    let target;
    if (chase) {
      target = neutral;
      // A visible-neutral chase is not a patrol attempt. Suspend the patrol
      // stall clock and discard its old distance before resuming the route.
      lastProgressTime = game.time;
      lastDistance = Infinity;
    } else {
      target = patrolPoint();
      let d = Math.hypot(target.x - player.x, target.y - player.y);
      if (d < 95 || (Number.isFinite(game.time) && game.time - lastProgressTime > 3.5)) {
        patrolIndex = (patrolIndex + 1) % PATROL.length;
        waypointFailures += d >= 95 ? 1 : 0;
        target = patrolPoint();
        d = Math.hypot(target.x - player.x, target.y - player.y);
        lastDistance = d;
        lastProgressTime = game.time;
      } else if (d + 15 < lastDistance) {
        lastDistance = d;
        lastProgressTime = game.time;
      }
    }
    if (typeof game.hasLineOfSight === 'function' &&
      !game.hasLineOfSight(player.x, player.y, target.x, target.y, 24) &&
      typeof game.novaBattlefieldWaypoint === 'function') {
      routeRequests++;
      const waypoint = game.novaBattlefieldWaypoint(player.x, player.y,
        target.x, target.y, 24, player.id);
      if (finitePoint(waypoint) &&
        Math.hypot(waypoint.x - player.x, waypoint.y - player.y) > 5) {
        target = waypoint;
        routeWaypoints++;
      }
    }
    const dx = target.x - player.x, dy = target.y - player.y;
    const d = Math.hypot(dx, dy);
    return d > 1 ? {x: dx / d, y: dy / d} : {x: 0, y: 0};
  }
  function aim() {
    const target = visibleNeutral(game, player, fair);
    return target ? {x: (target.x - player.x) / target.distance,
      y: (target.y - player.y) / target.distance} : null;
  }
  function stats() {return {patrolIndex, waypointFailures, routeRequests, routeWaypoints};}
  return {move, aim, stats};
}
module.exports = {visibleNeutral, createPublicRoam};
