'use strict';
// Research witness for #994: visible but short-lived bullets can bias remote pickup decisions.
// This intentionally captures current behavior; it is not a production fix.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function fixture(){
  function Game(){}
  Game.prototype.tryFire=function(){};
  Game.prototype.moveTank=function(){};
  Game.prototype.updatePowerups=function(){};
  const modules={
    'game/engine':m=>{m.exports={Game};},
    'game/ai':m=>{m.exports={updateAI(){}};}
  };
  const window={__novaModules:modules};
  const context={window,Math,Number,Object,Array,Map,console:{info(){},error(){}}};
  for(const file of ['battle-sense-v1.8.1.js','fair-engagement-v1.11.2.js'])
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates',file),'utf8'),context,{filename:file});
  const tank={id:7,cls:'guard',x:0,y:0,hp:20,maxHp:100,alive:true,ai:{}};
  const near={id:'near',type:'heal',x:600,y:0};
  const far={id:'far',type:'heal',x:620,y:0};
  const g={w:1600,h:480,cam:{zoom:1},tanks:[tank],bullets:[],powerups:[near,far],
    hasLineOfSight:()=>true,tankSpeed:()=>114.08};
  return {g,tank,near,far,choose:window.__NOVA_BATTLE_SENSE_TEST__.chooseResource,
    visible:window.__NOVA_FAIR_ENGAGEMENT__.inGameplayWorldPoint};
}

test('research: expiring stationary visible bullet still changes a distant heal choice',()=>{
  const {g,tank,near,far,choose,visible}=fixture();
  assert.equal(choose(g,tank),near);
  const bullet={id:91,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:.25};
  g.bullets=[bullet];
  assert.equal(visible(g,tank,bullet.x,bullet.y),true);
  assert.ok(600/g.tankSpeed(tank)>5,'straight-line travel already exceeds five seconds');
  assert.ok(bullet.ttl<600/g.tankSpeed(tank),'bullet expires before even unobstructed arrival at current speed');
  assert.equal(choose(g,tank),far,
    'current scoring prices the immediate bullet at the remote pickup, despite expiry before arrival');
  bullet.ttl=10;
  assert.equal(choose(g,tank),far,'long-lived projectile also affects the remote pickup');
  bullet.ttl=0;
  assert.equal(choose(g,tank),near,'already expired projectile does not affect selection');
});

test('research control: offscreen bullet cannot bias remote heal selection',()=>{
  const {g,tank,near,choose,visible}=fixture();
  g.w=320;
  g.bullets=[{id:91,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:.25}];
  assert.equal(visible(g,tank,600,0),false);
  assert.equal(choose(g,tank),near);
});

test('research control: a short-lived observed bullet remains meaningful at a nearby heal',()=>{
  const {g,tank,choose,visible}=fixture();
  g.powerups=[{id:'near',type:'heal',x:60,y:0},{id:'far',type:'heal',x:80,y:0}];
  assert.equal(choose(g,tank).id,'near');
  const bullet={id:92,ownerId:999,x:60,y:0,vx:0,vy:0,ttl:.25};
  g.bullets=[bullet];
  assert.equal(visible(g,tank,bullet.x,bullet.y),true);
  assert.equal(choose(g,tank).id,'far',
    'a broad TTL-only filter would wrongly remove legitimate immediate pickup danger');
});
