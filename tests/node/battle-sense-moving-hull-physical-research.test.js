'use strict';
// RESEARCH ONLY: even zero velocity at projectile birth does not prove a
// stationary miss; the real Game.moveTank can accelerate a hull into a lane.
// This is a controlled reachable engine scenario, not natural-match incidence.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame}=require('../research/audio-rng-causal-pilot.cjs');
const {projectileCandidate}=require('../research/battle-sense-projectile-candidate.cjs');
test('research: a birth-time stationary miss can become a real Game projectile hit',()=>{
 const g=bootGame();
 try{
  const shooter=g.player,victim=g.tanks.find(t=>t!==shooter&&t.ai);
  assert.ok(shooter&&victim);
  g.sfx.muted=true;g.status='playing';g.paused=false;g.time=10;
  g.setClass(shooter,'scout');
  g.setClass(victim,'scout');
  victim.stats.speed=0;victim.hasteT=0;victim.stampedeT=0;
  victim.perk=null;victim.gene=null;
  const legalSpeed=g.tankSpeed(victim);
  assert.equal(legalSpeed,124,'use a legal unbuffed Scout movement command');
  shooter.x=0;shooter.y=0;shooter.angle=0;shooter.fireCd=0;
  victim.x=200;victim.y=42;victim.vx=0;victim.vy=0;
  victim.alive=true;victim.spawnShieldT=0;victim.shieldT=0;
  victim.bulwarkT=0;
  g.tanks=[shooter,victim];g.shapes=[];g.drones=[];g.powerups=[];
  g.__novaTerrain=[];
  delete g.__novaBattlefieldIndex;delete g.__novaPerfTerrainIndex;
  const before=g.bullets.length;
  g.tryFire(shooter);
  const fired=g.bullets.slice(before).filter(b=>b.ownerId===shooter.id);
  assert.ok(fired.length>0,'the shipping Game must emit a real scout bullet');
  const staticOracle=projectileCandidate(g,shooter,victim,before,{terrain:false});
  assert.equal(staticOracle.possible,false,'birth-time hull starts off the lane');
  assert.equal(staticOracle.known,true,'current research oracle calls this a static miss');
  const initialHp=victim.hp;
  let contactFrame=-1;
  for(let i=0;i<60;i++){
   // Game's actual easing/acceleration owner, not an instantaneous teleport.
   g.moveTank(victim,0,-legalSpeed,1/60);
   if(g.hash?.clear){g.hash.clear();for(const t of g.tanks)g.hash.insert(t);}
   g.updateBullets(1/60);
   g.time+=1/60;
   if(victim.hp<initialHp||fired.some(b=>b.hits>0)){
    contactFrame=i+1;break;
   }
  }
  console.log('NOVA_MOVING_HULL_PHYSICAL_RESEARCH '+JSON.stringify({
   contactFrame,initialHp,finalHp:victim.hp,
   victimY:victim.y,bulletHits:fired.map(b=>b.hits),
   staticOracle
  }));
  assert.ok(contactFrame>0,
   'a physically accelerating target can enter a projectile lane after birth');
 }finally{g.destroy();}
});
