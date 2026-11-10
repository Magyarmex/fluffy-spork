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

function rival(id,x,y){
 return {id,x,y,r:14,hp:100,maxHp:100,alive:true,cls:'scout',
  isPlayer:true,vx:0,vy:0,angle:0,stats:{},spawnShieldT:0};
}
function trial(seed,hz,mode){
 const withAligned=mode!=='noAligned';
 const enemyIntent=mode.endsWith('Enemy');
 const intent=enemyIntent?Math.atan2(40,240):0;
 const dirX=Math.cos(intent),dirY=Math.sin(intent);
 return withSeed(seed,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const p=g.player,offAxis=rival(9801,120,70),
   aligned=rival(9802,240,40);
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
   circle.x=160;circle.y=0;circle.vx=0;circle.vy=0;
   circle.spin=0;circle.wanderT=Infinity;
   if(g.shapeById)g.shapeById.set(circle.id,circle);
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;
   g.eliteTimer=Infinity;g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;
   g.spawnAITank=()=>null;g.spawnDrone=()=>null;
   p.droneRespawnT=Infinity;
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   g.cam.x=0;g.cam.y=0;g.cam.zoom=1;g.zoom=1;g.w=568;g.h=320;
   g.status='playing';g.paused=false;g.hasLineOfSight=()=>true;
   g.input.moveVec=()=>({x:0,y:0});
   g.input.aimVec=()=>({x:dirX,y:dirY});
   g.input.aim.active=true;g.input.aim.dx=40*dirX;g.input.aim.dy=40*dirY;
   g.input.mouseActive=false;g.input.autofire=false;g.input.firing=true;
   g.input.abilityQueued=false;
   if(mode==='legacy'||mode.startsWith('corridor')){
    const nearest=g.nearestTank;
    g.nearestTank=function(x,y,max,exclude){
     if(exclude===p.id&&max===480&&x===p.x&&y===p.y){
      if(mode==='legacy')return offAxis;
      const found=nearest.apply(this,arguments);
      if(found===aligned&&circle.hp>0){
       const dx=circle.x-p.x,dy=circle.y-p.y;
       const forward=dx*dirX+dy*dirY;
       const lateral=Math.abs(dx*dirY-dy*dirX);
       if(forward>0&&forward<Math.hypot(aligned.x-p.x,aligned.y-p.y)&&
          lateral<circle.r+5)return null;
      }
      return found;
     }
     return nearest.apply(this,arguments);
    };
   }
   let shots=0;const bearings=[],original=g.tryFire;
   g.tryFire=function(t){
    const before=this.bullets.length,out=original.apply(this,arguments);
    if(t===p&&this.bullets.length>before){
     shots++;const b=this.bullets[before];
     if(bearings.length<5)bearings.push(+Math.atan2(b.vy,b.vx).toFixed(5));
    }
    return out;
   };
   const dt=1/hz;
   for(let i=0;i<Math.round(1.2*hz);i++)g.update(dt);
   const survivor=g.shapes.find(s=>s.id===circle.id);
   const hp=survivor?survivor.hp:0;
   assert.ok(Number.isFinite(hp)&&hp>=0&&hp<=14);
   assert.ok(shots>=2,'real Scout firing must occur during the observation');
   return {seed,hz,mode,shots,circleHp:+hp.toFixed(5),
    circleDestroyed:!survivor,playerAngle:+p.angle.toFixed(5),bearings,
    alignedHp:withAligned?+aligned.hp.toFixed(5):null};
  }finally{g.destroy();}
 });
}
test('neutral-farming aim interference diagnostic in the actual composed game',()=>{
 const rows=[];
 for(const hz of [30,60,120])for(const seed of [1517800,1517802]){
  const noAligned=trial(seed,hz,'noAligned'),
   legacy=trial(seed,hz,'legacy'),shipping=trial(seed,hz,'shipping'),
   corridor=trial(seed,hz,'corridor'),
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
  rows.push({noAligned,legacy,shipping,corridor,shippingEnemy,corridorEnemy});
 }
 console.log('NOVA_NEUTRAL_AIM_INTERFERENCE '+JSON.stringify(rows));
});
