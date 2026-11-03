'use strict';
/* #648 falsifier: if simulation step count depends on player fire input,
 * a held fire command can change AI/world evolution even when the player
 * emits ZERO projectiles. This is an opt-in research negative control.
 */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed,digest,physical}=require('./audio-rng-causal-pilot.cjs');
function run(seed,held,seconds=4){
 return withSeed(seed,draws=>{
  const g=bootGame(),p=g.player;
  g.sfx.muted=true;g.input.autofire=false;g.input.aim.active=true;g.input.aim.dx=40;
  // The sole intended intervention is the scheduler's input-dependent step
  // count. Suppress all player shots while leaving natural AI/world active.
  const original=g.tryFire;let aiAttempts=0,playerAttempts=0;
  g.tryFire=function(t){
   if(t===p){playerAttempts++;return;}
   aiAttempts++;return original.apply(this,arguments);
  };
  g.input.firing=held;
  const initial=digest(physical(g));
  for(let frame=0;frame<seconds*30;frame++){
   const steps=held?2:1;
   for(let j=0;j<steps;j++)g.update(1/(steps===2?60:30));
  }
  const result={seed,held,seconds,initial,final:digest(physical(g)),
   rngDraws:draws(),aiAttempts,playerAttempts,
   playerProjectiles:g.bullets.filter(b=>b.ownerId===p.id).length,
   enemies:g.tanks.filter(t=>t.ai).map(t=>[t.id,t.x,t.y,t.hp,t.alive])};
  g.destroy();return result;
 });
}
function suite(){
 const rows=[];
 for(const seed of [1517800,1517802,1517810]){
  const idle=run(seed,false),held=run(seed,true);
  if(idle.initial!==held.initial)throw Error('unmatched initial worlds');
  if(idle.playerProjectiles!==0||held.playerProjectiles!==0)
   throw Error('player shots escaped negative control');
  rows.push({seed,sameFinal:idle.final===held.final,
   sameRng:idle.rngDraws===held.rngDraws,
   idle:{final:idle.final,rngDraws:idle.rngDraws,aiAttempts:idle.aiAttempts},
   held:{final:held.final,rngDraws:held.rngDraws,aiAttempts:held.aiAttempts}});
 }
 return {schema:1,method:'identical seeded worlds, zero player projectiles, 30Hz presentation, only held-fire input changes adaptive 30/60Hz update count',limits:['research only','AI and ecology may diverge from timestep changes','not a physical device or human fairness study'],rows};
}
if(require.main===module)console.log(JSON.stringify(suite(),null,2));
module.exports={run,suite};
