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

function trial(hz,reverse,fullUpdate){
 return withSeed(1517802,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  g.sfx.muted=true;
  const p=g.player;
  p.x=40;p.y=0;p.cls='scout';p.gene=null;p.hp=1000;p.maxHp=1000;p.alive=true;
  p.spawnShieldT=0;p.shieldT=0;p.invulnT=0;p.bulwarkT=0;p.tauntT=0;
  p.regenDelay=10;
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
  g.bullets=reverse?bullets.reverse():bullets;
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
  return {hp:p.hp,contacts,remaining:g.bullets.map(b=>b.id)};
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
    assert.equal(result.contacts.reduce((sum,c)=>sum+c.damage,0),40);
    assert.ok(result.hp>=959.99&&result.hp<960.5,
      'target loses 40 HP, allowing only normal end-of-update regeneration');
   }
   assert.deepEqual(
    a.contacts.map(c=>c.ownerId).sort(),
    b.contacts.map(c=>c.ownerId).sort(),
    'insertion order cannot change contact ownership');
  });
