'use strict';
/* Research-only CPU/semantic pilot for the exact materialized NOVA Game.
 * Node + no-op Canvas is NOT an Android/browser frame-time measurement.
 * Synthetic extras are stress controls, never estimates of match density. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {performance}=require('node:perf_hooks');
const {bootGame,withSeed,digest,physical}=require('./audio-rng-causal-pilot.cjs');
function positiveInteger(n,min,max){return Number.isInteger(n)&&n>=min&&n<=max;}
function run({seed=1517800,hz=60,seconds=4,extraShots=0,instrument=true,cls='tempest'}={}){
 if(!positiveInteger(seed,1,0xffffffff)||![30,60,120].includes(hz)||
    !positiveInteger(seconds,1,30)||!positiveInteger(extraShots,0,600)||
    typeof cls!=='string'||!cls||typeof instrument!=='boolean')
  throw Error('invalid FPS projectile pilot configuration');
 return withSeed(seed,draws=>{
  const g=bootGame();let originalBullets,originalCollisions,originalFire;
  try{
   g.sfx.muted=true;g.sfx.startMusic=()=>{};
   g.setClass(g.player,cls);
   g.input.autofire=false;g.input.firing=true;
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   /* All extras are explicit out-of-world-owner stress controls. They
    * retain ordinary projectile geometry, TTL and collision ownership. */
   for(let i=0;i<extraShots;i++){
    const x=(Math.random()-.5)*3800,y=(Math.random()-.5)*3800;
    const angle=Math.random()*Math.PI*2;
    g.bullets.push({id:g.nextId++,kind:'bullet',ownerId:100000+i%10,
     x,y,px:x,py:y,vx:Math.cos(angle)*500,vy:Math.sin(angle)*500,
     dmg:7,r:3.8,pen:0,ttl:1.6,color:'#ff77ff',core:'#fff',
     shell:false,beam:false,hits:0,dead:false});
   }
   const timing={updateMs:0,bulletsMs:0,collisionMs:0};
   let playerVolleys=0,playerEmittedProjectiles=0;
   originalFire=g.tryFire;
   g.tryFire=function(t,...args){
    const before=this.bullets.length;
    const result=originalFire.call(this,t,...args);
    if(t===this.player&&this.bullets.length>before){
     playerVolleys++;playerEmittedProjectiles+=this.bullets.length-before;
    }
    return result;
   };
   if(instrument){
    originalBullets=g.updateBullets;originalCollisions=g.resolveBulletCollisions;
    g.resolveBulletCollisions=function(...args){
     const t=performance.now();try{return originalCollisions.apply(this,args)}
     finally{timing.collisionMs+=performance.now()-t;}
    };
    g.updateBullets=function(...args){
     const t=performance.now();try{return originalBullets.apply(this,args)}
     finally{timing.bulletsMs+=performance.now()-t;}
    };
   }
   let peak=0,projectileSamples=0,railSamples=0,peakRails=0;
   const ticks=hz*seconds;
   for(let i=0;i<ticks;i++){
    peak=Math.max(peak,g.bullets.length);
    projectileSamples+=g.bullets.length;
    const rails=g.bullets.reduce((n,b)=>n+(b&&b.__novaRail&&!b.dead?1:0),0);
    railSamples+=rails;peakRails=Math.max(peakRails,rails);
    const t=performance.now();g.update(1/hz);
    timing.updateMs+=performance.now()-t;
   }
   return {seed,hz,seconds,cls,extraShots,instrument,ticks,
    peakProjectiles:peak,meanProjectiles:projectileSamples/ticks,
    peakRails,meanRails:railSamples/ticks,
    finalProjectiles:g.bullets.length,
    physicalHash:digest({world:physical(g),weapon:{
     cls:g.player.cls,fireCd:g.player.fireCd,fireSpin:g.player.fireSpin,
     barrelIdx:g.player.barrelIdx,heat:g.player.__v17Heat,
     stability:g.player.__v17Stability,cadence:g.player.__v17Cadence,
     shotIndex:g.player.__v17ShotIndex,overheatT:g.player.overheatT}}),
    playerVolleys,playerEmittedProjectiles,rngDraws:draws(),
    terrainQueries:g.__novaPerf?.battlefieldQueries??null,
    terrainCandidates:g.__novaPerf?.battlefieldCandidates??null,
    ...timing};
  }finally{
   if(originalFire)g.tryFire=originalFire;
   if(originalBullets)g.updateBullets=originalBullets;
   if(originalCollisions)g.resolveBulletCollisions=originalCollisions;
   g.destroy();
  }
 });
}
function suite({seeds=[1517800,1517802,1517810],hzs=[30,60],seconds=4,extras=[0,240,480]}={}){
 const out=[];for(const seed of seeds)for(const hz of hzs)for(const extraShots of extras)
  out.push(run({seed,hz,seconds,extraShots}));
 return {schema:1,method:'exact 49-overlay materialized Game, Node no-op Canvas',
  limitations:['CPU measurements include instrumentation overhead and are not device frame times',
   'Synthetic extra shots are an artificial stress distribution, not natural encounter incidence',
   'Physical hashes and RNG draws are correctness checks, not evidence of fun or FPS parity'],
  observations:out};
}
if(require.main===module){
 const result=suite();console.log(JSON.stringify(result,null,2));
}
module.exports={run,suite};
