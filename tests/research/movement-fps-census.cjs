'use strict';
// Reproducible natural-world FPS census. Public-only input; legal Later offers.
// Usage: node tests/research/movement-fps-census.cjs > fps.jsonl
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed,digest,physical}=require('./audio-rng-causal-pilot.cjs');
const {createPublicRoam}=require('./redeploy-public-roam.cjs');
const {dodgeVisibleProjectile,aimAtVisibleHostile}=require('../browser/frontlines-visible-defense.js');
const seeds=Object.freeze([
 1517800,1517804,1517816,1517820, // Crossfire
 1517802,1517806,1517808,1517812, // Four Gates
 1517810,1517814,1517827,1517831  // Split Horizon
]);
function run(seed,hz,seconds=30){return withSeed(seed,draws=>{
 const g=bootGame(),p=g.player,F=g.__testFair;
 const initial=digest(physical(g)),layout=g.__novaBattlefield.name;
 const roam=createPublicRoam(g,p,{x:p.x,y:p.y},F);
 g.input.mouseActive=false;g.input.autofire=true;g.input.firing=false;
 g.input.moveVec=()=>{const desired=roam.move();return dodgeVisibleProjectile(g,p,F,desired)||desired;};
 g.input.aimVec=()=>aimAtVisibleHostile(g,p,F)||roam.aim();
 let offers=0,firstOffer=null,death=null,steps=0;
 const checkpoints=[],every=Math.max(1,Math.round(hz));
 for(let i=0;i<Math.round(hz*seconds);i++){
  if(g.status!=='playing'||!p.alive){death=g.time;break;}
  if(g.paused){if(!g.pendingOffer)throw Error('unexpected paused game');g.dismissOffer();offers++;}
  g.update(1/hz);steps++;
  if(g.paused&&g.pendingOffer){if(firstOffer===null)firstOffer=g.time;g.dismissOffer();offers++;}
  if(steps%every===0||!p.alive)checkpoints.push({t:+g.time.toFixed(3),x:+p.x.toFixed(3),y:+p.y.toFixed(3),
   vx:+p.vx.toFixed(3),vy:+p.vy.toFixed(3),hp:+p.hp.toFixed(2),score:+p.score.toFixed(2),
   neutralXP:+(g.__lfState?.stats?.playerNeutralXP||0).toFixed(2),level:p.level,
   draws:draws(),tanks:g.tanks.length,shapes:g.shapes.length});
 }
 return {seed,hz,layout,initial,offers,firstOffer,death,steps,
  alive:p.alive,elapsed:+g.time.toFixed(3),score:+p.score.toFixed(2),
  neutralXP:+(g.__lfState?.stats?.playerNeutralXP||0).toFixed(2),checkpoints};
});}
if(require.main===module){
 const seconds=Number(process.env.NOVA_SECONDS||30),hzs=(process.env.NOVA_HZS||'30,60,120').split(',').map(Number);
 if(!Number.isFinite(seconds)||seconds<=0||seconds>120||hzs.some(h=>!Number.isInteger(h)||h<10||h>240))
  throw Error('Invalid NOVA_SECONDS or NOVA_HZS');
 const results=[];
 for(const seed of seeds)for(const hz of hzs){const r=run(seed,hz,seconds);results.push(r);console.log(JSON.stringify(r));}
 console.error('completed',results.length,'natural-game runs');
}
module.exports={run,seeds};
