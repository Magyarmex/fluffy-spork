'use strict';
// Research-only #624: a unique aligned hostile may redirect a deliberate
// neutral-shape shot. Use the exact materialized 49-overlay Game, not a
// geometry-only proxy. This is a diagnostic, not a desired damage golden.
const test=require('node:test'),assert=require('node:assert/strict');
const prior=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(prior===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=prior;

function trial(seed,hz,mode,opts={}){
 const xpScene=!!opts.xpScene;
 const withAligned=mode!=='noAligned';
 const enemyIntent=mode.endsWith('Enemy');
 const intent=enemyIntent?Math.atan2(xpScene?70:40,xpScene?350:240):0;
 const dirX=Math.cos(intent),dirY=Math.sin(intent);
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player,others=g.tanks.filter(t=>t!==p);
  const aimQueryStates=[];
  assert.ok(others.length>=2,'use real initialized collision-capable tanks');
  const offAxis=others[0],aligned=others[1];
  for(const [t,x,y] of (xpScene?
   [[offAxis,0,130],[aligned,350,70]]:
   [[offAxis,120,70],[aligned,240,40]])){
   Object.assign(t,{x,y,vx:0,vy:0,cls:'scout',isPlayer:true,
    alive:true,hp:100,maxHp:100,spawnShieldT:0,shieldT:0,
    bulwarkT:0,tauntT:0,cloakT:0,gene:null,perk:null});
  }
  try{
   g.sfx.muted=true;g.setClass(p,'scout');
   p.x=0;p.y=0;p.vx=0;p.vy=0;p.angle=0;p.fireCd=0;
   p.spawnShieldT=0;p.stats.reload=0;
   g.tanks=[p,offAxis,...(withAligned?[aligned]:[])];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   if(g.shapeById)g.shapeById.clear();
   if(g.hash&&g.hash.clear)g.hash.clear();
   g.spawnShape('circle',true);
   const circle=g.shapes[0];
   assert.ok(circle&&circle.type==='circle');
   circle.x=mode==='corridorBehind'||mode==='shippingBehind'?270:160;
   circle.y=mode.endsWith('Edge')?-16:
    mode==='corridorOffPath'||mode==='shippingOffPath'?150:0;
   circle.vx=0;circle.vy=0;
   circle.spin=0;circle.wanderT=Infinity;
   if(g.shapeById)g.shapeById.set(circle.id,circle);
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;
   g.eliteTimer=Infinity;g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;
   g.spawnAITank=()=>null;g.spawnDrone=()=>null;
   p.droneRespawnT=Infinity;
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;
   g.w=xpScene?800:568;g.h=xpScene?400:320;
   g.status='playing';g.paused=false;g.hasLineOfSight=()=>true;
   g.input.moveVec=()=>({x:0,y:0});
   g.input.aimVec=()=>({x:dirX,y:dirY});
   g.input.aim.active=true;g.input.aim.dx=40*dirX;g.input.aim.dy=40*dirY;
   g.input.mouseActive=false;g.input.autofire=false;g.input.firing=true;
   g.input.abilityQueued=false;
   if(mode==='legacy'||mode==='legacyEdge'||mode.startsWith('corridor')||mode.startsWith('angular')){
    const nearest=g.nearestTank;
    g.nearestTank=function(x,y,max,exclude){
     if(exclude===p.id&&max===480&&x===p.x&&y===p.y){
      if(mode==='legacy'||mode==='legacyEdge')return offAxis;
      const found=nearest.apply(this,arguments);
      if(found===aligned&&circle.hp>0){
       if(aimQueryStates.length<24)aimQueryStates.push({
        time:+g.time.toFixed(5),x:+circle.x.toFixed(5),y:+circle.y.toFixed(5),
        vx:+circle.vx.toFixed(5),vy:+circle.vy.toFixed(5),
        hp:+circle.hp.toFixed(5),r:+circle.r.toFixed(5),
        lateral:+Math.abs((circle.x-p.x)*dirY-(circle.y-p.y)*dirX).toFixed(5),
        forward:+((circle.x-p.x)*dirX+(circle.y-p.y)*dirY).toFixed(5),
        corridorWouldVeto:((circle.x-p.x)*dirX+(circle.y-p.y)*dirY)>0&&
         ((circle.x-p.x)*dirX+(circle.y-p.y)*dirY)<Math.hypot(aligned.x-p.x,aligned.y-p.y)&&
         Math.abs((circle.x-p.x)*dirY-(circle.y-p.y)*dirX)<circle.r+5});
       const dx=circle.x-p.x,dy=circle.y-p.y;
       const targetDist=Math.hypot(aligned.x-p.x,aligned.y-p.y);
       if(mode.startsWith('angular')){
        const distance=Math.hypot(dx,dy);
        const shapeAngle=Math.atan2(dy,dx);
        const error=Math.abs(Math.atan2(Math.sin(shapeAngle-intent),
         Math.cos(shapeAngle-intent)));
        if(distance>0&&distance<targetDist&&
           error<Math.atan2(circle.r,distance))return null;
       }else{
        const forward=dx*dirX+dy*dirY;
        const lateral=Math.abs(dx*dirY-dy*dirX);
        if(forward>0&&forward<targetDist&&lateral<circle.r+5)return null;
       }
      }
      return found;
     }
     return nearest.apply(this,arguments);
    };
   }
   let shots=0;const bearings=[],shotShapeStates=[],original=g.tryFire;
   g.tryFire=function(t){
    const before=this.bullets.length,out=original.apply(this,arguments);
    if(t===p&&this.bullets.length>before){
     shots++;const b=this.bullets[before];
     if(shotShapeStates.length<5)shotShapeStates.push({
      x:+circle.x.toFixed(5),y:+circle.y.toFixed(5),
      vx:+circle.vx.toFixed(5),vy:+circle.vy.toFixed(5),
      r:+circle.r.toFixed(5),hp:+circle.hp.toFixed(5),
      projectileX:+b.x.toFixed(5),projectileY:+b.y.toFixed(5),
      projectileR:+b.r.toFixed(5)});
     if(bearings.length<5)bearings.push(+Math.atan2(b.vy,b.vx).toFixed(5));
    }
    return out;
   };
   const dt=1/hz;
   for(let i=0;i<Math.round((opts.seconds||1.2)*hz);i++)g.update(dt);
   const survivor=g.shapes.find(s=>s.id===circle.id);
   const hp=survivor?survivor.hp:0;
   assert.ok(Number.isFinite(aligned.hp),
    'real initialized hostile must retain finite HP after physical projectile collision');
   assert.ok(Number.isFinite(hp)&&hp>=0&&hp<=14);
   assert.ok(shots>=2,'real Scout firing must occur during the observation');
   return {seed,hz,mode,xpScene,shots,circleHp:+hp.toFixed(5),
    circleDestroyed:!survivor,playerAngle:+p.angle.toFixed(5),bearings,shotShapeStates,aimQueryStates,
    alignedHp:withAligned?+aligned.hp.toFixed(5):null,
    playerXP:+p.xp.toFixed(5),playerScore:+p.score.toFixed(5),
    uncollectedOrbXP:+g.orbs.reduce((a,o)=>a+(Number(o.xp)||0),0).toFixed(5)};
  }finally{g.destroy();}
 });
}
test('neutral-farming aim interference diagnostic in the actual composed game',()=>{
 const rows=[];
 for(const hz of [30,60,120])for(const seed of [1517800,1517802]){
  const noAligned=trial(seed,hz,'noAligned'),
   legacy=trial(seed,hz,'legacy'),shipping=trial(seed,hz,'shipping'),
   corridor=trial(seed,hz,'corridor'),
   shippingOffPath=trial(seed,hz,'shippingOffPath'),
   corridorOffPath=trial(seed,hz,'corridorOffPath'),
   shippingBehind=trial(seed,hz,'shippingBehind'),
   corridorBehind=trial(seed,hz,'corridorBehind'),
   angular=trial(seed,hz,'angular'),
   angularEnemy=trial(seed,hz,'angularEnemy'),
   legacyEdge=trial(seed,hz,'legacyEdge'),
   shippingEdge=trial(seed,hz,'shippingEdge'),
   corridorEdge=trial(seed,hz,'corridorEdge'),
   angularEdge=trial(seed,hz,'angularEdge'),
   shippingEnemy=trial(seed,hz,'shippingEnemy'),
   corridorEnemy=trial(seed,hz,'corridorEnemy');
  assert.equal(noAligned.hz,legacy.hz);
  assert.equal(legacy.hz,shipping.hz);
  assert.ok(Math.abs(noAligned.playerAngle)<1e-8,
   'without an aligned hostile the raw eastward aim remains east');
  assert.ok(Math.abs(legacy.playerAngle)<1e-8,
   'the same-world legacy nearest-before-cone query leaves raw aim east');
  assert.ok(Number.isFinite(shipping.playerAngle),
   'measure shipped steering without freezing a possibly harmful snap');
  assert.ok(Number.isFinite(corridor.playerAngle)&&Number.isFinite(corridorEnemy.playerAngle));
  assert.ok(corridor.circleDestroyed&&corridor.circleHp<shipping.circleHp,
   'the Scout corridor pilot must actually recover the observed neutral kill');
  assert.ok(shippingEnemy.alignedHp<100&&shippingOffPath.alignedHp<100,
   'hostile damage controls must hit a real initialized tank, not merely report a bearing');
  assert.ok(legacyEdge.shots>=2&&legacyEdge.shotShapeStates.length>=2,
   'the raw-east grazing negative control must record multiple real shot positions');
  assert.ok(legacyEdge.shotShapeStates.every(s=>Number.isFinite(s.x)&&Number.isFinite(s.y)&&Number.isFinite(s.vx)&&Number.isFinite(s.vy)),
   'the raw-east control must preserve physical neutral-motion evidence');
  assert.ok(angular.circleDestroyed&&angular.circleHp<shipping.circleHp,
   'center-angle neutral candidate must recover the direct-center Circle kill');
  assert.deepEqual(angularEnemy.bearings,shippingEnemy.bearings,
   'center-angle candidate must preserve deliberate hostile projectile bearings');
  assert.equal(angularEnemy.alignedHp,shippingEnemy.alignedHp,
   'center-angle candidate must preserve real hostile damage under hostile intent');
  assert.deepEqual(corridorBehind.bearings,shippingBehind.bearings,
   'a neutral behind the aligned hostile must not veto the earlier hostile shot');
  assert.equal(corridorBehind.alignedHp,shippingBehind.alignedHp,
   'a neutral behind the hostile must not change real target damage');
  assert.deepEqual(corridorOffPath.bearings,shippingOffPath.bearings,
   'a neutral outside the requested firing corridor must not change projectile bearings');
  assert.equal(corridorOffPath.alignedHp,shippingOffPath.alignedHp,
   'a neutral outside the corridor must not change hostile damage');
  assert.deepEqual(corridorEnemy.bearings,shippingEnemy.bearings,
   'deliberate hostile aim must not be vetoed by a neutral outside its shot corridor');
  assert.equal(corridorEnemy.alignedHp,shippingEnemy.alignedHp,
   'deliberate hostile aim must retain its real projectile damage');
  rows.push({noAligned,legacy,shipping,corridor,shippingEnemy,corridorEnemy,
   shippingOffPath,corridorOffPath,shippingBehind,corridorBehind,
   angular,angularEnemy,legacyEdge,shippingEdge,corridorEdge,angularEdge});
 }
 console.log('NOVA_NEUTRAL_AIM_INTERFERENCE '+JSON.stringify(rows));
});

// A neutral kill is not necessarily player progression: XP orbs have a
// physical nearest-tank magnet. Put the player closer to the Circle than
// either rival, then measure real pickup under identical 2.4s histories.
test('neutral-farming intent and real XP pickup in a player-owned corridor',()=>{
 const rows=[];
 for(const seed of [1517800,1517802]){
  const opts={xpScene:true,seconds:2.4};
  const shipping=trial(seed,60,'shipping',opts),
   corridor=trial(seed,60,'corridor',opts),
   angular=trial(seed,60,'angular',opts),
   hostile=trial(seed,60,'shippingEnemy',opts);
  for(const arm of [shipping,corridor,angular,hostile]){
   assert.ok(Number.isFinite(arm.playerScore)&&Number.isFinite(arm.playerXP));
   assert.ok(Number.isFinite(arm.uncollectedOrbXP));
   assert.ok(Number.isFinite(arm.alignedHp));
  }
  rows.push({shipping,corridor,angular,hostile});
 }
 console.log('NOVA_NEUTRAL_PLAYER_XP '+JSON.stringify(rows));
});
