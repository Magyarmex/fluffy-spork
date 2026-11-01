'use strict';
/*
 * Read-only, actual 48-overlay game comparator for #610. It is NOT a frame
 * rate fix. The deliberately constant east input isolates physical integration
 * from an adaptive pilot; AI, ecology, bullets and terrain still execute.
 *
 * Usage: node tests/research/fps-first-cause.cjs
 *        NOVA_FPS_CAUSE_SECONDS=3 NOVA_FPS_CAUSE_SEEDS=1517800,1517802,1517810 \
 *        node tests/research/fps-first-cause.cjs > first-cause.json
 *
 * Hashes, AI positions and RNG counts are observation only. They NEVER feed
 * movement or aiming. The observer records the actual Game.moveTank wrapper
 * result, including Battlefield resolution and Scout witness validity.
 */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';
const {bootGame,withSeed,digest,physical} = require('./audio-rng-causal-pilot.cjs');
const DEFAULT_SEEDS = Object.freeze([1517800,1517802,1517810]);
const DEFAULT_HZS = Object.freeze([30,60,120]);
function snapshot(g,draws) {
 const p=g.player;
 return {time:+g.time.toFixed(9),player:{x:p.x,y:p.y,vx:p.vx,vy:p.vy,
   hp:p.hp,score:p.score,alive:p.alive},
  enemyHash:digest(g.tanks.filter(t=>t.ai).map(t=>[t.id,t.x,t.y,t.vx,t.vy,t.hp,t.alive,
    t.ai?.thinkT,t.ai?.state,t.ai?.targetId])),
  // Separate continuous integration from discrete AI choices. Do not put
  // countdown timers in the decision hash: rounding can differ harmlessly.
  enemyMotionHash:digest(g.tanks.filter(t=>t.ai).map(t=>[t.id,t.x,t.y,t.vx,t.vy])),
  enemyDecisionHash:digest(g.tanks.filter(t=>t.ai).map(t=>[t.id,t.ai.state,
   t.ai.targetId,t.ai.strafe,t.ai.wanderA,t.ai.__v180TargetId,
   t.ai.__v180FlankSide,t.ai.preferredRange])),
  shapeHash:digest(g.shapes.map(s=>[s.id,s.x,s.y,s.vx,s.vy,s.hp])),
  bulletHash:digest(g.bullets.map(b=>[b.id,b.x,b.y,b.ttl,b.dead])),
  neutralXP:g.__lfState?.stats?.playerNeutralXP||0,draws:draws()};
}
function run(seed,hz,seconds=1,observe=true){
 if(!Number.isSafeInteger(seed)||seed<=0||!Number.isInteger(hz)||hz<30||hz>240||hz%30!==0||
    !Number.isInteger(seconds)||seconds<1||seconds>30)throw Error('invalid seed, Hz or seconds');
 return withSeed(seed,draws=>{
  const g=bootGame();if(!g.player)g.redeploy();g.sfx.muted=true;
  const p=g.player,initial=digest(physical(g)),layout=g.__novaBattlefield?.name||null;
  const input=g.input;
  input.mouseActive=false;input.autofire=false;input.firing=false;
  input.moveVec=()=>({x:1,y:0});input.aimVec=()=>null;
  let moves=0,linearValid=0,linearInvalid=0,nonLinear=0,damageEventsTotal=0;
  const movement=[],damageEvents=[];
  if(observe){
   // Damage is an observed engine effect, not proof of which projectile won
   // the chronological first-contact race. Keep that distinction explicit.
   for(const kind of ['damageTank','damageDrone','damageShape']){
    const old=g[kind];if(typeof old!=='function')continue;
    g[kind]=function(target){
     const before=target&&target.hp, result=old.apply(this,arguments);
     if(target&&target.hp!==before){
      damageEventsTotal++;
      if(damageEvents.length<40)
       damageEvents.push({kind,time:this.time,targetId:target.id,
        before,after:target.hp});
     }
     return result;
    };
   }
   const oldMove=g.moveTank;
   g.moveTank=function(t,vx,vy,dt){
    const sx=t.x,sy=t.y,svx=t.vx,svy=t.vy;
    const result=oldMove.apply(this,arguments);
    if(t===p){
     moves++;
     const displacement=Math.hypot(t.x-sx,t.y-sy);
     if(t.__novaLinearMoveValid===true)linearValid++;
     else linearInvalid++;
     if(displacement>1e-8&&Math.hypot(t.x-sx-t.vx*dt,t.y-sy-t.vy*dt)>1e-6)nonLinear++;
     if(movement.length<8)movement.push({dt,requested:[vx,vy],from:[sx,sy,svx,svy],
      to:[t.x,t.y,t.vx,t.vy],linearWitness:t.__novaLinearMoveValid===true});
    }
    return result;
   };
  }
  const checkpoints=[snapshot(g,draws)];
  const every=hz/30;
  let ticks=0;
  for(let i=1;i<=seconds*hz;i++){
   if(g.status!=='playing'||!p.alive)break;
   if(g.paused&&g.pendingOffer)g.dismissOffer();
   g.update(1/hz);ticks++;
   if(i%every===0||!p.alive)checkpoints.push(snapshot(g,draws));
  }
  return {seed,hz,seconds,layout,initial,final:digest(physical(g)),
   draws:draws(),ticks,checkpoints,
   observer:observe?{moves,linearValid,linearInvalid,nonLinear,movement,
    damageEvents,damageEventsTotal,damageEventsTruncated:damageEventsTotal>damageEvents.length}:null};
 });
}
function compare(a,b){
 if(a.seed!==b.seed||a.seconds!==b.seconds||a.initial!==b.initial)
  throw Error('unmatched initial worlds');
 // Deaths and offers can stop one arm between 30-Hz checkpoints. Match by
 // actual simulated time, NEVER by array index or nominal frame number.
 const byTime=new Map(b.checkpoints.map(c=>[c.time.toFixed(6),c]));
 const pairs=a.checkpoints.map(c=>[c,byTime.get(c.time.toFixed(6))])
  .filter(pair=>pair[1]&&Math.abs(pair[0].time-pair[1].time)<1e-6);
 if(!pairs.length)throw Error('no common simulated-time checkpoint');
 const fields=['player','enemyMotionHash','enemyDecisionHash','shapeHash',
  'bulletHash','neutralXP','draws'],first={};
 for(const field of fields){
  const i=pairs.findIndex(pair=>JSON.stringify(pair[0][field])!==JSON.stringify(pair[1][field]));
  first[field]=i<0?null:{checkpoint:i,time:pairs[i][0].time};
 }
 const last=pairs[pairs.length-1],firstLive=pairs[1];
 const diff=pair=>pair?{time:pair[0].time,
  dx:pair[0].player.x-pair[1].player.x,
  dvx:pair[0].player.vx-pair[1].player.vx,
  rngDrawDifference:pair[0].draws-pair[1].draws}:null;
 return {seed:a.seed,comparedHz:[a.hz,b.hz],sameInitial:true,
  comparedSamples:pairs.length,
  censored:last[0].time<a.seconds-1e-6||
   last[0].time<a.checkpoints[a.checkpoints.length-1].time-1e-6||
   last[0].time<b.checkpoints[b.checkpoints.length-1].time-1e-6,
  first,firstCommon:diff(firstLive),lastCommon:diff(last)};
}
function parseList(s,fallback){if(!s)return fallback;const v=s.split(',').map(Number);
 if(v.length<1||v.some(x=>!Number.isSafeInteger(x)))throw Error('invalid list');return v;}
if(require.main===module){
 const seeds=parseList(process.env.NOVA_FPS_CAUSE_SEEDS,DEFAULT_SEEDS);
 const hzs=parseList(process.env.NOVA_FPS_CAUSE_HZS,DEFAULT_HZS);
 const seconds=Number(process.env.NOVA_FPS_CAUSE_SECONDS||1);
 if(!hzs.includes(60))throw Error('reference 60 Hz required');
 const worlds=[];
 for(const seed of seeds){const arms=hzs.map(hz=>run(seed,hz,seconds));
  const ref=arms.find(x=>x.hz===60);
  worlds.push({seed,layout:ref.layout,arms,comparisons:arms.filter(x=>x!==ref).map(x=>compare(x,ref))});
 }
 process.stdout.write(JSON.stringify({schema:1,contract:'read-only fixed-east-input actual materialized Game; no claims about human-play frequency',worlds},null,2)+'\n');
}
module.exports={run,compare,snapshot};
