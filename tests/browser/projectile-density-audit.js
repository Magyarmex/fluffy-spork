'use strict';
/* Research-only, read-only natural-match census for #147.
 * This measures necessary gates for the shipping 3..8-projectile cover
 * certificate, NOT actual certificate activations or corrected hits.
 * No changes to gameplay state, RNG, input, clocks or projectile ordering. */
(function(root){
 const names=['zero','one','two','threeToEight','nineToSixteen','seventeenToThirtyTwo','thirtyThreePlus'];
 function bucket(n){return n===0?names[0]:n===1?names[1]:n===2?names[2]:
  n<=8?names[3]:n<=16?names[4]:n<=32?names[5]:names[6];}
 function create(){
  return {schema:1,bulletUpdateCalls:0,simulatedBulletSeconds:0,
   projectileCountSum:0,peakProjectiles:0,
   projectileCountBuckets:Object.fromEntries(names.map(k=>[k,0])),
   basicEligibleFrames:0,coverBreaks:0,coverBreaksAtThreeToEight:0,
   coverBreaksAboveEight:0,coverBreaksBasicEligible:0,
   brokenCounterResets:0,
   firstEventOrdinaryShotInputs:0,firstEventExpiringShotInputs:0,
   firstEventFramesWithInputs:0};
 }
 function broken(g){
  const v=g&&g.__novaBattlefield&&g.__novaBattlefield.coverBroken;
  return Number.isFinite(v)&&v>=0?v:null;
 }
 function before(g,dt){
  const bs=Array.isArray(g.bullets)?g.bullets:[];
  const n=bs.length;
  /* Necessary conditions only. This deliberately does NOT pretend to
   * certify first-wall identity, impact times, corridor disjointness,
   * intervening bodies, cover HP, or actual player-relevant hits. */
  const eligible=n>=3&&n<=8&&dt>0&&dt<=.05&&
   g.__novaShapeSweepActive===true&&
   g.__novaFrameStartBulletEpoch===g.__novaShapeSweepEpoch&&
   bs.every(b=>b&&!b.dead&&!b.shell&&!b.beam&&!b.splash&&!b.__v17Cannon&&
    (b.hits||0)===0&&(b.knock||0)===0&&
    Number.isSafeInteger(b.pen)&&b.pen>=0&&b.pen<=4&&
    Number.isSafeInteger(b.id)&&b.id<g.__novaFrameStartBulletIdCeiling&&
    Number.isFinite(b.x)&&Number.isFinite(b.y)&&
    Number.isFinite(b.vx)&&Number.isFinite(b.vy)&&
    Number.isFinite(b.r)&&b.r>0&&Number.isFinite(b.dmg)&&b.dmg>0&&
    Number.isFinite(b.ttl)&&b.ttl>dt);
  /* Research upper bound for the read-only first-event witness (#962).
   * Counts only shot-local necessary inputs. It does NOT certify any body
   * motion, wall sweep, interception completeness or actual first event. */
  let ordinary=0,expiring=0;
  if(dt>0&&dt<=.05&&g.__novaShapeSweepActive===true&&
     g.__novaFrameStartBulletEpoch===g.__novaShapeSweepEpoch&&
     Number.isSafeInteger(g.__novaFrameStartBulletIdCeiling)){
   for(const b of bs){
    if(!b||b.dead||b.shell||b.beam||b.splash||b.__v17Cannon||
       b.pen!==0||(b.hits||0)!==0||
       !Number.isSafeInteger(b.id)||b.id>=g.__novaFrameStartBulletIdCeiling||
       !Number.isSafeInteger(b.ownerId)||
       ![b.x,b.y,b.vx,b.vy,b.r,b.ttl,b.dmg].every(Number.isFinite)||
       !(b.r>0&&b.ttl>0&&b.dmg>0))continue;
    ordinary++;if(b.ttl<=dt)expiring++;
   }
  }
  return {n,dt,eligible,broken:broken(g),ordinary,expiring};
 }
 function after(a,s,g){
  a.bulletUpdateCalls++;
  if(Number.isFinite(s.dt)&&s.dt>0)a.simulatedBulletSeconds+=s.dt;
  a.projectileCountSum+=s.n;
  a.firstEventOrdinaryShotInputs+=s.ordinary||0;
  a.firstEventExpiringShotInputs+=s.expiring||0;
  if(s.ordinary>0)a.firstEventFramesWithInputs++;
  a.peakProjectiles=Math.max(a.peakProjectiles,s.n);
  a.projectileCountBuckets[bucket(s.n)]++;
  if(s.eligible)a.basicEligibleFrames++;
  const end=broken(g);
  if(end===null||s.broken===null)return;
  if(end<s.broken){a.brokenCounterResets++;return;}
  const delta=end-s.broken;
  a.coverBreaks+=delta;
  if(s.n>=3&&s.n<=8)a.coverBreaksAtThreeToEight+=delta;
  if(s.n>8)a.coverBreaksAboveEight+=delta;
  if(s.eligible)a.coverBreaksBasicEligible+=delta;
 }
 function install(g,a){
  if(!g||typeof g.updateBullets!=='function')throw Error('real updateBullets owner missing');
  const old=g.updateBullets;
  g.updateBullets=function(dt){
   const s=before(this,dt);
   const out=old.apply(this,arguments);
   after(a,s,this);
   return out;
  };
  return a;
 }
 const api={create,before,after,install,bucket};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 if(root)root.__novaProjectileDensityAudit=api;
})(typeof window!=='undefined'?window:globalThis);
