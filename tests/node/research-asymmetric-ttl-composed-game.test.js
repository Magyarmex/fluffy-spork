'use strict';
// Full 49-overlay composed-Game gate for hostile projectile interception.
// Unlike isolated updateBullets fixtures, this exercises the actual
// Game.update frame-start projectile and moving-body witnesses.
const test=require('node:test');
const assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;

function trial(fps,reverse=false,mode='hostile'){
 return withSeed(1208417,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  g.sfx.muted=true;
  const p=g.player;
  p.x=900;p.y=900;p.vx=0;p.vy=0;p.alive=true;
  p.droneRespawnT=999;p.spawnShieldT=0;
  const owners=[101,102].map((id,i)=>({
   kind:'tank',id,cls:'scout',x:1000+i*100,y:-1000,
   vx:0,vy:0,hp:100,alive:true,spawnShieldT:0,shieldT:0
  }));
  if(mode==='allied')owners[1].teamId=owners[0].teamId=17;
  g.tanks=[p];g.tankById=new Map([[p.id,p],...owners.map(o=>[o.id,o])]);
  const getTank=g.getTank.bind(g);
  g.getTank=id=>owners.find(o=>o.id===id)||getTank(id);
  g.shapes=[];g.drones=[];g.__novaTerrain=[];
  g.hash.clear();g.hash.insert(p);
  g.shapeTimer=999;g.powerupTimer=999;g.eliteTimer=999;
  g.powerups=[];g.orbs=[];g.aiRespawns=[];
  g.input.firing=false;g.input.autofire=false;
  g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>null;
  const left={kind:'bullet',id:201,ownerId:101,x:-20,y:0,vx:6000,vy:0,
   r:3,hp:1,maxHp:1,baseDmg:8,dmg:8,ttl:.005,pen:0,hits:0,
   shell:false,beam:false,dead:false,color:'#fff'};
  const right={kind:'bullet',id:202,ownerId:102,x:mode==='late'?50:20,y:0,
   vx:-6000,vy:0,r:3,hp:1,maxHp:1,baseDmg:8,dmg:8,ttl:.005,
   pen:0,hits:0,shell:false,beam:false,dead:false,color:'#fff'};
  if(mode==='asym'||mode==='asymLate'||mode==='asymSameOwner'){
   right.hp=right.maxHp=3;
   if(mode==='asymLate')right.x=50;
   if(mode==='asymSameOwner')right.ownerId=left.ownerId;
  }
  if(mode==='canonical'){
   left.x=-227.43;right.x=227.43;
   left.vx=540;right.vx=-540;
   left.r=right.r=4.2;left.ttl=right.ttl=.42;
  }
  g.bullets=reverse?[right,left]:[left,right];
  g.nextId=Math.max(g.nextId||0,1200);
  const contacts=[];
  const weaken=g.weakenBullet.bind(g);
  g.weakenBullet=function(b,dmg){if(b===left||b===right)
    contacts.push({id:b.id,dmg});return weaken(b,dmg);};
  for(let i=0;i<(mode==='canonical'?fps:3);i++){
   g.update(1/fps);
   if(!g.bullets.some(b=>b===left||b===right))break;
  }
  return {contacts,left,right};
 });
}

/* KNOWN-RED research gate. Both opposing bullets physically intersect at
 * 2.708ms, strictly before either 5ms TTL. The stronger shot survives
 * with two integrity points. Unlike an isolated updater fixture, this
 * uses the complete Game.update with real frame-start witnesses. */
for(const fps of [30,60,120,240])for(const reverse of [false,true]){
 test('KNOWN RED: composed asymmetric hostile TTL first contact '+fps+
      'Hz reverse='+reverse,()=>{
  const {contacts,left,right}=trial(fps,reverse,'asym');
  assert.deepEqual(contacts.map(c=>c.id).sort(),[201,202],
   'both projectiles must exchange integrity before physical expiry');
  assert.equal(left.dead,true);
  assert.equal(right.hp,2,
   'surviving projectile retains two integrity points after interception');
  assert.ok(Math.abs(right.dmg-8*2/3)<1e-9,
   'surviving projectile damage scales with remaining integrity');
 });
}

/* Safety: unequal HP cannot manufacture a collision after either TTL,
 * and two shots owned by the same tank must never intercept. */
for(const fps of [30,60,120,240])for(const reverse of [false,true]){
 test('asymmetric no post-TTL interception '+fps+'Hz reverse='+reverse,()=>{
  const {contacts}=trial(fps,reverse,'asymLate');
  assert.deepEqual(contacts,[]);
 });
 test('asymmetric same-owner shots do not intercept '+fps+
      'Hz reverse='+reverse,()=>{
  const {contacts}=trial(fps,reverse,'asymSameOwner');
  assert.deepEqual(contacts,[]);
 });
}
