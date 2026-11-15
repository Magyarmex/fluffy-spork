'use strict';
// Research-only #994: actual composed Game projectile births, movement,
// collision/damage and pickup owner under sustained versus stopped Minigun fire.
// Observational, not a golden for whether risky healing is desirable.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const DT=1/60,STEPS=480;
function run(seed,policy){
 return withSeed(seed,()=>{
  const g=bootGame(),p=g.player,bot=g.tanks.find(t=>t!==p&&t.ai);
  assert.ok(p&&bot,'real composed Game must contain player and AI');
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,'minigun');
  g.setClass(bot,'guard');
  Object.assign(p,{x:800,y:0,vx:0,vy:0,angle:Math.PI,
   hp:1000000,maxHp:1000000,spawnShieldT:0,droneRespawnT:Infinity});
  Object.assign(bot,{x:0,y:0,vx:0,vy:0,hp:20,maxHp:100,
   spawnShieldT:0,shieldT:0,alive:true,isPlayer:false});
  p.stats.reload=4;
  bot.stats.speed=0;
  bot.ai.state='wander';bot.ai.targetId=-1;bot.ai.thinkT=0;
  bot.ai.__v181Think=0;bot.ai.__v181Mode='none';
  bot.ai.__v181ResourceId=null;
  g.tanks=[p,bot];g.tankById=new Map([[p.id,p],[bot.id,bot]]);
  g.shapes=[];g.drones=[];g.orbs=[];g.bullets=[];
  g.powerups=[{id:'near',type:'heal',x:600,y:0},
   {id:'safe',type:'heal',x:600,y:220}];
  g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;
  g.spawnAITank=()=>null;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;
  g.input.autofire=false;g.input.mouseActive=false;
  g.input.aim.active=true;g.input.aim.dx=-40;g.input.aim.dy=0;
  let shots=0,hits=0,damage=0,acquired=null,resourceFrames=0;
  const originalFire=g.tryFire,originalDamage=g.damageTank,trace=[];
  g.tryFire=function(t){
   const before=this.bullets.length,out=originalFire.apply(this,arguments);
   if(t===p&&this.bullets.length>before)shots++;
   return out;
  };
  g.damageTank=function(t){
   const hp=t.hp,out=originalDamage.apply(this,arguments);
   if(t===bot&&t.hp<hp){hits++;damage+=hp-t.hp;}
   return out;
  };
  try{
   for(let i=0;i<STEPS;i++){
    const time=i*DT;
    g.input.firing=policy==='continuous'||time<.15;
    g.update(DT);
    if(bot.ai.__v181Mode==='resource')resourceFrames++;
    if(!acquired&&g.powerups.length<2){
     acquired={time:+time.toFixed(3),
      id:g.powerups.some(x=>x.id==='near')?'safe':'near'};
    }
    if(i%60===0)trace.push({t:+time.toFixed(2),x:+bot.x.toFixed(2),
     y:+bot.y.toFixed(2),hp:+bot.hp.toFixed(2),
     goal:bot.ai.__v181ResourceId||null,mode:bot.ai.__v181Mode,
     bullets:g.bullets.length});
    if(!bot.alive)break;
   }
   return {seed,policy,shots,hits,damage:+damage.toFixed(3),
    acquired,resourceFrames,alive:bot.alive,hp:+bot.hp.toFixed(3),trace};
  }finally{g.destroy();}
 });
}
test('research: real Minigun firing continuity versus critical heal pursuit',()=>{
 const rows=[];
 for(const seed of [1517800,1517802])
  for(const policy of ['stopped','continuous']){
   const r=run(seed,policy);
   assert.ok(Number.isFinite(r.damage)&&Number.isFinite(r.hp));
   assert.ok(r.shots>=1,'the actual player must fire a real projectile');
   rows.push(r);
  }
 console.log('BATTLE_SENSE_REPLENISHED_REAL_DAMAGE '+JSON.stringify(rows));
});
