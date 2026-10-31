'use strict';
/* Research-only, read-only 5Hz causality witness for the real composed game.
 * A moved projectile is NOT a combat consequence. Keep projectile state and
 * RNG out of both hashes; health/progression is separate from body motion.
 * These hashes are divergence indicators, never hit attribution. */
(function(root){
 function digest(value){
  const str=JSON.stringify(value);
  let h1=2166136261,h2=0x9e3779b9;
  for(let k=0;k<str.length;k++){
   const c=str.charCodeAt(k);
   h1=Math.imul(h1^c,16777619);
   h2=Math.imul(h2^c,2246822519);
  }
  return (h1>>>0).toString(16)+':'+(h2>>>0).toString(16);
 }
 function sample(g){
  if(!g||!Number.isFinite(g.time)||!Array.isArray(g.tanks)||
     !Array.isArray(g.shapes)||!Array.isArray(g.drones))
   throw Error('real combat state unavailable');
  const tanks=g.tanks.map(t=>[t.id,t.hp,t.alive,t.score,t.kills]),
   shapes=g.shapes.map(t=>[t.id,t.hp,t.type]),
   drones=g.drones.map(t=>[t.id,t.hp,t.ownerId]),
   cover=(g.__novaTerrain||[]).map(t=>[t.id,t.hp,t.solid,t.destructible]),
   pilot=[g.player?.id,g.player?.hp,g.player?.score,
    g.player?.kills,g.player?.level,g.player?.xp,g.player?.alive];
  const health=[pilot,tanks,shapes,drones,cover];
  const bodies=[
   g.tanks.map(t=>[t.id,t.x,t.y,t.hp,t.alive,t.cls,t.score,t.kills]),
   g.shapes.map(t=>[t.id,t.x,t.y,t.hp,t.type]),
   g.drones.map(t=>[t.id,t.x,t.y,t.hp,t.ownerId]),
   cover,(g.powerups||[]).map(t=>[t.id,t.x,t.y,t.type]),
   (g.orbs||[]).map(t=>[t.id,t.x,t.y,t.value]),pilot
  ];
  return {time:+g.time.toFixed(3),
   bodyHash:digest(bodies),healthHash:digest(health),
   categories:{pilot:digest(pilot),tanks:digest(tanks),
    shapes:digest(shapes),drones:digest(drones),cover:digest(cover)}};
 }
 const api={sample,digest};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.__novaResearchBomberCombatFingerprint=api;
})(typeof window!=='undefined'?window:globalThis);
