'use strict';
/* Research-only: real materialized engine + all HTML-ordered overlays.
 * No fabricated bullets, targets, shields, invulnerability or enemy positions.
 * A scripted tier-2 Carrier holds the normal right stick and navigates using
 * the existing public-viewport pilot. This is NOT human-match frequency.
 * The observer reads the live projectile owner and never grants damage. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed,digest,physical}=require('./audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;
const {createPublicRoam}=require('./redeploy-public-roam.cjs');
const {aimAtVisibleHostile,dodgeVisibleProjectile}=
 require('../browser/frontlines-visible-defense.js');
const root=path.resolve(__dirname,'../..');
const finite=Number.isFinite;
function distanceSegment(x,y,ax,ay,bx,by){
 const dx=bx-ax,dy=by-ay,q=dx*dx+dy*dy;
 const t=q>1e-12?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/q)):0;
 return Math.hypot(ax+dx*t-x,ay+dy*t-y);
}
function create(){
 return {schema:1,frames:0,bulletFrames:0,expiringShotFrames:0,
  expiringShots:0,commandRawDrones:0,commandCertifiedDrones:0,
  framesWithCommandCertificate:0,certifiedWithExpiringShot:0,
  possiblePairs:0,geometricGuarantees:0,
  certifiedDroneHpLossEvents:0,certifiedDroneHpLost:0,
  observedCertifiedDroneDeaths:0,observerErrors:0,rawExpiringShots:0,rawExpiringNonShell:0,rawExpiringPenZero:0,rawExpiringHitsZero:0,rawPenZeroHitsZero:0,rawPenZeroHitsPositive:0,rawPenPositiveHitsZero:0,rawPenPositiveHitsPositive:0,rawDead:0,rawCannon:0,playerCommandInputFrames:0,playerDroneFrames:0,playerFormDroneFrames:0,examples:[],bulletSamples:[]};
}
function before(g,dt){
 const epoch=g.__novaShapeSweepEpoch,ds=g.drones||[],bs=g.bullets||[];
 const live=ds.filter(d=>d&&d.hp>0&&d.__novaChronoDroneEpoch===epoch);
 const raw=live.filter(d=>d.__novaChronoCommandRawEpoch===epoch);
 const certified=live.filter(d=>d.__novaChronoCommandBoundedEpoch===epoch&&
  d.__novaChronoCommandRawEpoch===epoch&&
  d.__novaChronoCommandRawDt===dt&&
  d.__novaChronoCommandRawX===d.__novaChronoDronePrevX&&
  d.__novaChronoCommandRawY===d.__novaChronoDronePrevY&&
  d.__novaChronoCommandRawEndX===d.x&&
  d.__novaChronoCommandRawEndY===d.y&&
  finite(d.__novaChronoCommandSpeedBound)&&d.__novaChronoCommandSpeedBound>0);
 const rawExpiring=bs.filter(b=>b&&finite(b.ttl)&&b.ttl>0&&b.ttl<=dt);
 const playerDrones=ds.filter(d=>d&&d.hp>0&&d.ownerId===g.player?.id);
 const expiring=bs.filter(b=>b&&!b.dead&&!b.shell&&!b.beam&&!b.splash&&
  !b.__v17Cannon&&b.pen===0&&(b.hits||0)===0&&
  finite(b.ttl)&&b.ttl>0&&b.ttl<=dt&&
  [b.x,b.y,b.vx,b.vy,b.r].every(finite)&&b.r>0);
 let possible=0,guaranteed=0;
 for(const d of certified)for(const b of expiring){
  if(b.ownerId===d.ownerId||!finite(d.__novaChronoDronePrevX)||
     !finite(d.__novaChronoDronePrevY)||!(d.r>0))continue;
  const sx=d.__novaChronoDronePrevX,sy=d.__novaChronoDronePrevY,
   endX=b.x+b.vx*b.ttl,endY=b.y+b.vy*b.ttl,
   radius=b.r+d.r+1,bound=d.__novaChronoCommandSpeedBound;
  if(distanceSegment(sx,sy,b.x,b.y,endX,endY)>radius+bound*b.ttl)continue;
  possible++;
  /* Sufficient geometric proof only, NOT collision authority. Earlier
   * cover, shields, other projectiles and body priority may veto a hit. */
  for(let k=1;k<=20;k++){
   const t=b.ttl*k/20;
   if(Math.hypot(b.x+b.vx*t-sx,b.y+b.vy*t-sy)+bound*t<radius-1e-5){
    guaranteed++;break;
   }
  }
 }
 return {raw:raw.length,certified,expiring:expiring.length,
  bullets:bs.length,possible,guaranteed,time:g.time,
  rawExpiring:rawExpiring.length,
  rawNonShell:rawExpiring.filter(b=>!b.shell&&!b.beam&&!b.splash).length,
  rawPenZero:rawExpiring.filter(b=>b.pen===0).length,
  rawHitsZero:rawExpiring.filter(b=>(b.hits||0)===0).length,
  rawPenZeroHitsZero:rawExpiring.filter(b=>b.pen===0&&(b.hits||0)===0).length,
  rawPenZeroHitsPositive:rawExpiring.filter(b=>b.pen===0&&(b.hits||0)>0).length,
  rawPenPositiveHitsZero:rawExpiring.filter(b=>b.pen>0&&(b.hits||0)===0).length,
  rawPenPositiveHitsPositive:rawExpiring.filter(b=>b.pen>0&&(b.hits||0)>0).length,
  rawDead:rawExpiring.filter(b=>b.dead).length,
  rawCannon:rawExpiring.filter(b=>b.__v17Cannon).length,
  playerCommandInput:!!(g.player?.cls==='carrier'&&g.input?.aim?.active),
  playerDrones:playerDrones.length,
  playerFormDrones:playerDrones.filter(d=>d.__novaPhase==='form').length,
  bulletSample:bs.length?{ttl:bs[0].ttl,pen:bs[0].pen,hits:bs[0].hits,
   shell:!!bs[0].shell,beam:!!bs[0].beam,splash:bs[0].splash,
   dead:!!bs[0].dead,kind:bs[0].kind}:null};
}
function after(a,s){
 a.frames++;if(s.bullets)a.bulletFrames++;
 if(s.expiring)a.expiringShotFrames++;
 a.expiringShots+=s.expiring;
 a.rawExpiringShots+=s.rawExpiring;
 a.rawExpiringNonShell+=s.rawNonShell;
 a.rawExpiringPenZero+=s.rawPenZero;
 a.rawExpiringHitsZero+=s.rawHitsZero;
 a.rawPenZeroHitsZero+=s.rawPenZeroHitsZero;
 a.rawPenZeroHitsPositive+=s.rawPenZeroHitsPositive;
 a.rawPenPositiveHitsZero+=s.rawPenPositiveHitsZero;
 a.rawPenPositiveHitsPositive+=s.rawPenPositiveHitsPositive;
 a.rawDead+=s.rawDead;a.rawCannon+=s.rawCannon;
 if(s.playerCommandInput)a.playerCommandInputFrames++;
 a.playerDroneFrames+=s.playerDrones;
 a.playerFormDroneFrames+=s.playerFormDrones;
 if(s.bulletSample&&a.bulletSamples.length<6)a.bulletSamples.push(s.bulletSample);
 a.commandRawDrones+=s.raw;
 a.commandCertifiedDrones+=s.certified.length;
 if(s.certified.length)a.framesWithCommandCertificate++;
 if(s.certified.length&&s.expiring)a.certifiedWithExpiringShot++;
 a.possiblePairs+=s.possible;
 a.geometricGuarantees+=s.guaranteed;
 for(const [d,hp] of s.health){
  if(d.hp<hp){
   a.certifiedDroneHpLossEvents++;
   a.certifiedDroneHpLost+=hp-d.hp;
   if(d.hp<=0)a.observedCertifiedDroneDeaths++;
  }
 }
 if(a.examples.length<16&&(s.guaranteed||s.possible||
   (s.certified.length&&s.expiring)))
  a.examples.push({time:finite(s.time)?+s.time.toFixed(3):null,certified:s.certified.length,
   expiring:s.expiring,possible:s.possible,guaranteed:s.guaranteed});
}
function install(g,a){
 if(!g||typeof g.updateBullets!=='function'||!a||a.schema!==1)
  throw Error('actual projectile owner and schema required');
 const old=g.updateBullets;
 g.updateBullets=function(dt){
  let s;
  try{
   s=before(this,dt);
   s.health=new Map(s.certified.map(d=>[d,d.hp]));
  }catch(e){a.observerErrors++;}
  let out,thrown;
  try{out=old.apply(this,arguments);}catch(e){thrown=e;}
  if(s)try{after(a,s);}catch(e){a.observerErrors++;}
  if(thrown)throw thrown;
  return out;
 };
 return a;
}
function run(seed,hz,observe,seconds=20){
 return withSeed(seed,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  assert.ok(g.player?.alive&&g.status==='playing','real playable world');
  const p=g.player;
  assert.equal(p.cls,'scout','start from canonical Scout');
  g.setClass(p,'carrier');
  assert.equal(p.cls,'carrier','canonical class evolution applied');
  g.sfx.muted=true;
  const fair=g.__testFair;
  assert.ok(fair&&typeof fair.viewportHalfExtents==='function');
  const roam=createPublicRoam(g,p,{x:p.x,y:p.y},fair);
  const a=observe?install(g,create()):null;
  g.input.mouseActive=false;g.input.autofire=true;g.input.firing=false;
  g.input.moveVec=()=>{
   const desired=roam.move();
   return dodgeVisibleProjectile(g,p,fair,desired)||desired;
  };
  let aim={x:1,y:0};
  g.input.aimVec=()=>aim;
  const initial=digest(physical(g)),trace=[],dt=1/hz;
  let ticks=0;
  for(let i=0;i<Math.ceil(seconds*hz)&&g.status==='playing'&&p.alive;i++){
   aim=aimAtVisibleHostile(g,p,fair)||roam.aim()||{x:1,y:0};
   const mag=Math.hypot(aim.x,aim.y);
   if(!(mag>0)||!finite(mag))aim={x:1,y:0};
   else aim={x:aim.x/mag,y:aim.y/mag};
   g.input.aim.active=true;
   g.input.aim.dx=aim.x*50;g.input.aim.dy=aim.y*50;
   g.update(dt);ticks++;
   if(ticks%hz===0||g.status!=='playing'||!p.alive)
    trace.push({tick:ticks,hash:digest(physical(g)),
     hp:p.hp,score:p.score,alive:p.alive});
  }
  return {seed,hz,seconds,initial,ticks,trace,final:digest(physical(g)),
   status:g.status,alive:!!p.alive,score:p.score,
   pilotClass:p.cls,observer:a,remainingDrones:g.drones.length};
 });
}
function main(){
 const results=[];
 for(const hz of [30,60])for(const seed of [1517840,1517854,1517875]){
  const baseline=run(seed,hz,false),observed=run(seed,hz,true),
   replay=run(seed,hz,true);
  assert.equal(baseline.initial,observed.initial,'identical initial world');
  assert.equal(baseline.final,observed.final,'observer changed physical outcome');
  assert.deepEqual(baseline.trace,observed.trace,'observer changed physical trace');
  assert.deepEqual(observed,replay,'observer replay not deterministic');
  assert.equal(observed.observer.observerErrors,0,'observer failed');
  assert.ok(observed.ticks>0&&observed.observer.frames>0);
  assert.ok(observed.observer.geometricGuarantees<=observed.observer.possiblePairs);
  assert.ok(observed.observer.possiblePairs<=
   observed.observer.expiringShots*Math.max(1,observed.observer.commandCertifiedDrones));
  results.push({seed,hz,ticks:observed.ticks,status:observed.status,
   alive:observed.alive,score:observed.score,observer:observed.observer});
 }
 const summary={schema:1,method:'exact materialized 48-overlay VM, ordinary AI and bullets; scripted tier-2 Carrier public-viewport pilot, 20s maximum, 30/60Hz, three predeclared seeds, observer-on/off/replay',
  limits:['Not Chromium or human play','Carrier class granted at level 1 to obtain controlled exposure','Possible and geometric-guaranteed pairs do not prove damage or bypass earlier collision priority','Deaths censor subsequent exposure','Observer instrumentation has no gameplay authority'],
  trials:results.length,totals:{},results};
 for(const key of Object.keys(create()).filter(k=>typeof create()[k]==='number'))
  summary.totals[key]=results.reduce((sum,r)=>sum+r.observer[key],0);
 const dir=path.join(root,'artifacts','controller-command-natural');
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'census.json'),JSON.stringify(summary,null,2));
 console.log('NOVA_CONTROLLER_COMMAND_NATURAL '+JSON.stringify({
  trials:summary.trials,totals:summary.totals,
  deaths:results.filter(r=>!r.alive).length,
  exposure:results.map(r=>({seed:r.seed,hz:r.hz,ticks:r.ticks,
   certified:r.observer.commandCertifiedDrones,
   expiring:r.observer.expiringShots,
   possible:r.observer.possiblePairs,guaranteed:r.observer.geometricGuarantees}))}));
}
if(require.main===module)try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={distanceSegment,create,before,after,install,run};
