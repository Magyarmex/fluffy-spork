'use strict';
// Research witness for #994: visible but short-lived bullets can bias remote pickup decisions.
// Prototype acceptance: remote ordinary bullets expire before earliest plausible arrival; local bullets remain dangerous.
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
  const classes={CLASSES:{guard:{size:15,moveMult:.92}}};
  const g={w:1600,h:480,cam:{zoom:1},tanks:[tank],bullets:[],powerups:[near,far],
    hasLineOfSight:()=>true,tankSpeed:()=>114.08};
  return {g,tank,near,far,classes,laneRisk:window.__NOVA_BATTLE_SENSE_TEST__.laneRisk,choose:(game,bot)=>window.__NOVA_BATTLE_SENSE_TEST__.chooseResource(game,bot,classes),
    visible:window.__NOVA_FAIR_ENGAGEMENT__.inGameplayWorldPoint};
}

test('remote ordinary projectile guaranteed to expire before arrival does not alter heal choice',()=>{
  const {g,tank,near,far,choose,visible}=fixture();
  assert.equal(choose(g,tank),near);
  const bullet={id:91,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:.25};
  g.bullets=[bullet];
  assert.equal(visible(g,tank,bullet.x,bullet.y),true);
  assert.ok(600/g.tankSpeed(tank)>5,'straight-line travel already exceeds five seconds');
  assert.ok(bullet.ttl<600/g.tankSpeed(tank),'bullet expires before even unobstructed arrival at current speed');
  assert.equal(choose(g,tank),near,
    'remote projectile should expire before any plausible arrival');
  bullet.ttl=10;
  assert.equal(choose(g,tank),far,'long-lived projectile also affects the remote pickup');
  bullet.ttl=0;
  assert.equal(choose(g,tank),near,'already expired projectile does not affect selection');
});

test('offscreen bullet cannot bias remote heal selection',()=>{
  const {g,tank,near,choose,visible}=fixture();
  g.w=320;
  g.bullets=[{id:91,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:.25}];
  assert.equal(visible(g,tank,600,0),false);
  assert.equal(choose(g,tank),near);
});

test('short-lived observed bullet remains meaningful at a nearby heal',()=>{
  const {g,tank,choose,visible}=fixture();
  g.powerups=[{id:'near',type:'heal',x:60,y:0},{id:'far',type:'heal',x:80,y:0}];
  assert.equal(choose(g,tank).id,'near');
  const bullet={id:92,ownerId:999,x:60,y:0,vx:0,vy:0,ttl:.25};
  g.bullets=[bullet];
  assert.equal(visible(g,tank,bullet.x,bullet.y),true);
  assert.equal(choose(g,tank).id,'far',
    'a broad TTL-only filter would wrongly remove legitimate immediate pickup danger');
});

test('shell retains burst danger even when its ordinary TTL is shorter than travel',()=>{
  const {g,tank,near,far,choose}=fixture();
  g.bullets=[{id:95,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:.25,shell:true}];
  assert.equal(choose(g,tank),far,'shell expiry can create a dangerous burst');
  g.bullets[0].shell=false;
  assert.equal(choose(g,tank),near,'ordinary projectile expires without burst');
});

test('short-lived moving bullet is ignored only for remote pickup utility',()=>{
  const {g,tank,near,far,choose}=fixture();
  const bullet={id:96,ownerId:999,x:400,y:0,vx:600,vy:0,ttl:.25};
  g.bullets=[bullet];
  assert.equal(choose(g,tank),near,'short-lived incoming round expires before remote acquisition');
  bullet.ttl=1;
  assert.equal(choose(g,tank),far,'long-lived incoming round retains predictive danger');
});

test('special expiry-effect projectiles remain conservative even at distant pickups',()=>{
  const {g,tank,near,far,choose}=fixture();
  const bullet={id:97,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:.25};
  for(const flag of ['shell','splash','beam','__v17Cannon']){
    g.bullets=[{...bullet,[flag]:true}];
    assert.equal(choose(g,tank),far,flag+' should retain danger without a proven inert expiry contract');
  }
  g.bullets=[bullet];
  assert.equal(choose(g,tank),near,'plain ordinary projectile is filtered when expiry precedes arrival');
});

test('unknown speed contract fails open and local tactical risk is unchanged',()=>{
  const {g,tank,classes,near,far,choose,laneRisk}=fixture();
  const bullet={id:98,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:.25};
  g.bullets=[bullet];
  assert.ok(laneRisk(g,600,0,tank.id,tank)>0,'local risk does not use travel-time filtering');
  classes.CLASSES.guard.moveMult=undefined;
  assert.equal(choose(g,tank),far,'unknown class speed must preserve existing visible threat');
  classes.CLASSES.guard.moveMult=.92;
  assert.equal(choose(g,tank),near,'certified conservative travel bound permits the remote expiry filter');
});

test('phase-capable tank keeps visible bullet danger because blink breaks travel-time bound',()=>{
  const {g,tank,classes,near,far,choose}=fixture();
  g.bullets=[{id:99,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:.25}];
  classes.CLASSES.guard.ability='phase';
  assert.equal(choose(g,tank),far,'a 420-unit phase blink invalidates ordinary walking arrival time');
  classes.CLASSES.guard.ability='stampede';
  assert.equal(choose(g,tank),near,'bounded speed boosts are covered by conservative speed ceiling');
});
