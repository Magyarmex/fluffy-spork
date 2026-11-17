'use strict';
// Regression: public pickup coordinates do not make unseen bullets public.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function scene(){
  function Game(){}
  Game.prototype.tryFire=function(){};
  Game.prototype.moveTank=function(){};
  Game.prototype.updatePowerups=function(){};
  const classes={CLASSES:{guard:{size:15}},lineageForClass:()=> 'guardian'};
  const modules={
    'game/engine':m=>{m.exports={Game};},
    'game/ai':m=>{m.exports={updateAI(){}};}
  };
  const window={__novaModules:modules};
  const context={window,Math,Number,Object,Array,Map,console:{info(){},error(){}}};
  for(const name of ['battle-sense-v1.8.1.js','fair-engagement-v1.11.2.js'])
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates',name),'utf8'),context,{filename:name});
  const tank={id:7,cls:'guard',x:0,y:0,hp:20,maxHp:100,alive:true,ai:{}};
  const g={w:320,h:480,cam:{zoom:1},tanks:[tank],bullets:[],powerups:[
    {id:'near',type:'heal',x:600,y:0},
    {id:'far',type:'heal',x:620,y:0}
  ],hasLineOfSight:()=>true};
  return {g,tank,classes,window};
}
test('offscreen projectile cannot alter AI pickup selection but visible projectile can',()=>{
  const {g,tank,classes,window}=scene();
  const fair=window.__NOVA_FAIR_ENGAGEMENT__;
  const choose=window.__NOVA_BATTLE_SENSE_TEST__.chooseResource;
  const near=g.powerups[0],far=g.powerups[1];
  assert.equal(fair.inGameplayViewport(g,tank,near),false);
  assert.equal(fair.inGameplayViewport(g,tank,far),false);
  assert.equal(choose(g,tank,classes),near,'without projectile the closer heal wins');
  const bullet={id:7,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:1};
  assert.equal(fair.inGameplayViewport(g,tank,bullet),false);
  assert.equal(fair.inGameplayWorldPoint(g,tank,bullet.x,bullet.y),false);
  g.bullets=[bullet];
  assert.equal(choose(g,tank,classes),near,
    'an unseen projectile must not change the closer public pickup choice');
  g.w=1600;
  assert.equal(fair.inGameplayWorldPoint(g,tank,bullet.x,bullet.y),true,'wide view exposes the bullet even if its ID matches the tank');
  assert.equal(choose(g,tank,classes),far,'visible projectile risk should remain meaningful');
});

test('a viewport-visible but terrain-hidden projectile cannot poison distant pickup utility',()=>{
  const {g,tank,classes,window}=scene();
  g.w=1600;
  const choose=window.__NOVA_BATTLE_SENSE_TEST__.chooseResource;
  const near=g.powerups[0];
  const bullet={id:91,ownerId:999,x:600,y:20,vx:0,vy:0,ttl:1};
  g.bullets=[bullet];
  g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===tank.x&&ay===tank.y&&bx===bullet.x&&by===bullet.y);
  assert.equal(window.__NOVA_FAIR_ENGAGEMENT__.inGameplayWorldPoint(g,tank,bullet.x,bullet.y),true);
  assert.equal(choose(g,tank,classes),near,'terrain-hidden projectile is not observed by the evaluating tank');
});

test('irrelevant bullets do not trigger observer terrain visibility probes',()=>{
  const {g,tank,window}=scene();
  g.w=1600;
  g.bullets=Array.from({length:120},(_,id)=>({
    id:id+100,ownerId:999,x:2000+id*10,y:1500,vx:0,vy:0,ttl:1
  }));
  let probes=0;
  g.hasLineOfSight=()=>{probes++;return true;};
  const risk=window.__NOVA_BATTLE_SENSE_TEST__.laneRisk(g,600,0,tank.id,tank);
  assert.equal(risk,0);
  assert.equal(probes,0,'far bullets must not incur collision checks in resource scoring');
});

test('world-point projectile predicate matches canonical viewport geometry across zoom and orientation',()=>{
  const {g,tank,window}=scene();
  const fair=window.__NOVA_FAIR_ENGAGEMENT__;
  for(const [w,h] of [[320,480],[480,320],[900,700]]){
    for(const zoom of [.65,1,1.8]){
      g.w=w;g.h=h;g.cam.zoom=zoom;
      for(const [x,y] of [[0,0],[w/(2*zoom)-1,0],[w/(2*zoom)+1,0],[0,h/(2*zoom)+1]]){
        const target={id:999,alive:true,hp:1,x,y};
        assert.equal(fair.inGameplayWorldPoint(g,tank,x,y),
          fair.inGameplayViewport(g,tank,target),'world point disagrees with live Fair Engagement viewport');
      }
    }
  }
});

test('offscreen approaching round cannot influence a public heal before entering the gameplay viewport',()=>{
  const {g,tank,classes,window}=scene();
  const choose=window.__NOVA_BATTLE_SENSE_TEST__.chooseResource;
  const near=g.powerups[0],far=g.powerups[1];
  g.bullets=[{id:123,ownerId:999,x:400,y:0,vx:600,vy:0,ttl:1}];
  assert.equal(window.__NOVA_FAIR_ENGAGEMENT__.inGameplayWorldPoint(g,tank,400,0),false);
  assert.equal(choose(g,tank,classes),near,'unseen approaching round must not influence remote pickup valuation');
  g.w=1000;
  assert.equal(window.__NOVA_FAIR_ENGAGEMENT__.inGameplayWorldPoint(g,tank,400,0),true);
  assert.equal(choose(g,tank,classes),far,'visible approaching round retains predictive lane danger');
});

test('local combat flank dodge still reacts to nearby observed projectile',()=>{
  const {g,tank,window}=scene();
  const saferSide=window.__NOVA_BATTLE_SENSE_TEST__.saferSide;
  assert.equal(saferSide(g,tank,1,0),0,'no projectile means no lane bias');
  g.bullets=[{id:123,ownerId:999,x:110,y:115,vx:0,vy:0,ttl:1}];
  assert.equal(saferSide(g,tank,1,0),-1,
    'resource-only observer gating must not disable immediate combat flank dodge');
});

test('offscreen flank-lane projectile cannot steer Battle Sense while visible equivalent can',()=>{
  const {g,tank,window}=scene();
  const fair=window.__NOVA_FAIR_ENGAGEMENT__;
  const saferSide=window.__NOVA_BATTLE_SENSE_TEST__.saferSide;
  const bullet={id:321,ownerId:999,x:110,y:115,vx:0,vy:0,ttl:1};
  g.bullets=[bullet];
  g.w=160;g.h=160;
  assert.equal(fair.inGameplayWorldPoint(g,tank,bullet.x,bullet.y),false);
  assert.equal(saferSide(g,tank,1,0),0,
    'unseen projectile at a distant steering probe must not cause an omniscient dodge');
  g.w=320;g.h=480;
  assert.equal(fair.inGameplayWorldPoint(g,tank,bullet.x,bullet.y),true);
  assert.equal(saferSide(g,tank,1,0),-1,
    'the same observed projectile must retain local dodge counterplay');
});

test('terrain-hidden flank projectile cannot steer even when inside the viewport',()=>{
  const {g,tank,window}=scene();
  const saferSide=window.__NOVA_BATTLE_SENSE_TEST__.saferSide;
  const bullet={id:322,ownerId:999,x:110,y:115,vx:0,vy:0,ttl:1};
  g.bullets=[bullet];
  g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===tank.x&&ay===tank.y&&
    bx===bullet.x&&by===bullet.y);
  assert.equal(saferSide(g,tank,1,0),0,
    'solid cover must hide the projectile from the observing AI');
  g.hasLineOfSight=()=>true;
  assert.equal(saferSide(g,tank,1,0),-1,
    'removing cover restores a legitimately visible dodge cue');
});
