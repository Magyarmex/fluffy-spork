'use strict';
// KNOWN-RED RESEARCH GATE: two physical pre-expiry contacts with one surviving
// tank must not depend on the order of the bullet array. Do not merge until
// the actual composed Game passes at 30/60/120/240 Hz.
const test=require('node:test');
const assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;

function trial(hz,reverse,fullUpdate,only=null,targetX=40,mutate=null){
 return withSeed(1517802,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  g.sfx.muted=true;
  const p=g.player;
  p.x=targetX;p.y=0;p.cls='scout';p.gene=null;p.hp=1000;p.maxHp=1000;p.alive=true;
  p.spawnShieldT=0;p.shieldT=0;p.invulnT=0;p.bulwarkT=0;p.tauntT=0;
  p.regenDelay=10;p.droneRespawnT=999;
  p.vx=0;p.vy=0;
  const owners=[101,102].map((id,i)=>({
   kind:'tank',id,cls:'scout',x:-1200,y:i?1000:-1000,
   hp:100,alive:true,vx:0,vy:0,spawnShieldT:0,shieldT:0
  }));
  g.tanks=[p];
  g.tankById=new Map([[p.id,p]]);
  const originalGetTank=g.getTank.bind(g);
  g.getTank=id=>owners.find(t=>t.id===id)||originalGetTank(id);
  g.shapes=[];g.drones=[];g.__novaTerrain=[];
  g.hash.clear();for(const tank of g.tanks)g.hash.insert(tank);
  g.time=1;
  g.shapeTimer=999;g.powerupTimer=999;g.eliteTimer=999;
  g.powerups=[];g.orbs=[];g.aiRespawns=[];
  g.input.firing=false;g.input.autofire=false;
  g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>null;
  const bullets=[
   {kind:'bullet',id:201,ownerId:101,x:0,y:0,vx:6000,vy:0,
    r:3,dmg:20,ttl:.005,pen:1,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'},
   {kind:'bullet',id:202,ownerId:102,x:89,y:0,vx:-6000,vy:0,
    r:3,dmg:20,ttl:.005,pen:1,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'}
  ];
  if(mutate)mutate(g,p,bullets);
  const selected=only==null?bullets:bullets.filter(b=>b.id===only);
  g.bullets=reverse?selected.reverse():selected;
  const contacts=[];
  const original=g.damageTank;
  g.damageTank=function(t,damage,ownerId){
   if(t===p)contacts.push({ownerId,damage});
   return original.apply(this,arguments);
  };
  for(let frame=0;frame<20&&g.bullets.some(b=>b.id===201||b.id===202);frame++){
   if(fullUpdate)g.update(1/hz);
   else {g.updateBullets(1/hz);g.time+=1/hz;}
  }
  return {hp:p.hp,contacts,remaining:g.bullets.map(b=>b.id),
   target:{x:p.x,y:p.y,alive:p.alive,shield:p.spawnShieldT,
    sweepTime:p.__novaSweepMoveTime,sweepX:p.__novaSweepPrevX},
   game:{time:g.time,status:g.status,shapeSweep:g.__novaShapeSweepActive}};
 });
}
for(const hz of [30,60,120,240])
 for(const fullUpdate of [false,true])
  test('KNOWN RED: same-victim two-shot TTL chronological parity '+hz+
       'Hz fullUpdate='+fullUpdate,()=>{
   const a=trial(hz,false,fullUpdate);
   const b=trial(hz,true,fullUpdate);
   for(const result of [a,b]){
    assert.equal(result.contacts.length,2,
      'two independently reachable nonlethal contacts must both register');
    assert.deepEqual(result.contacts.map(c=>c.ownerId).sort(),[101,102],
      'one contact from each distinct owner, never a duplicate hit');
    assert.equal(result.contacts.reduce((sum,c)=>sum+c.damage,0),40);
    assert.ok(result.hp>=959.99&&result.hp<960.5,
      'target loses 40 HP, allowing only normal end-of-update regeneration');
   }
   assert.deepEqual(
    a.contacts.map(c=>c.ownerId).sort(),
    b.contacts.map(c=>c.ownerId).sort(),
    'insertion order cannot change contact ownership');
  });

// Positive controls distinguish a broken fixture from the shared-victim
// arbitration defect. Each projectile must hit in isolation before expiry.
for(const hz of [30,60,120,240])for(const fullUpdate of [false,true])
 for(const id of [201,202])
  test('isolated full-game TTL control '+hz+'Hz update='+fullUpdate+
       ' bullet='+id,()=>{
   const result=trial(hz,false,fullUpdate,id);
   assert.equal(result.contacts.length,1,
    'an isolated pre-expiry hull contact must register: '+JSON.stringify(result));
   assert.equal(result.contacts[0].ownerId,id-100);
   assert.equal(result.contacts[0].damage,20);
  });

// Negative controls: no projectile can invent contact beyond its 5ms TTL.
for(const hz of [30,60,120,240])for(const fullUpdate of [false,true])
 test('full-game TTL no-phantom far hull '+hz+'Hz update='+fullUpdate,()=>{
  const result=trial(hz,false,fullUpdate,null,140);
  assert.equal(result.contacts.length,0);
  assert.equal(result.hp,1000);
 });

/* Adjacent safety gate: an earlier permanent wall must still intercept
 * the left shot; the independently reachable right shot must not be
 * erased by the now-dead competitor or granted a phantom wall bypass. */
for(const hz of [30,60,120,240])for(const reverse of [false,true])
 test('same-victim TTL pair preserves earlier permanent wall '+hz+
      'Hz reverse='+reverse,()=>{
  const result=trial(hz,reverse,false,null,40,g=>{
   g.__novaTerrain=[{id:-9101,shape:'rect',x:10,y:0,w:4,h:70,
    solid:true,destructible:false}];
  });
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102],
   'wall blocks left owner while right owner retains its legitimate contact');
 });
