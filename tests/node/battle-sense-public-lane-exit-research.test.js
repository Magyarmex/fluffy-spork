'use strict';
// Research witness for #994: observed ordinary projectile motion can prove a remote lane is clear before modeled arrival.
// This variant uses public position/velocity, not private remaining TTL; local combat risk remains unchanged.
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


test('observed ordinary moving bullet exits distant heal lane before modeled arrival',()=>{
 const {g,tank,near,far,choose}=fixture();
 g.bullets=[{id:91,ownerId:999,x:600,y:0,vx:500,vy:0,ttl:10}];
 assert.equal(choose(g,tank),near,'moving-away ordinary bullet cannot still occupy remote heal lane');
 g.bullets[0].vx=50;
 assert.equal(choose(g,tank),far,'slow-moving round can remain near the heal at arrival');
 g.bullets[0].vx=0;
 assert.equal(choose(g,tank),far,'stationary danger has no certified lane-exit time');
});
test('approaching ordinary bullet can cross and leave lane before remote arrival',()=>{
 const {g,tank,near,choose}=fixture();
 g.bullets=[{id:92,ownerId:999,x:400,y:0,vx:600,vy:0,ttl:10}];
 assert.equal(choose(g,tank),near);
});
test('shell and other special trajectories retain conservative danger',()=>{
 const {g,tank,far,choose}=fixture();
 for(const flag of ['shell','splash','beam','__v17Cannon','__novaRail','__novaSniperLineage']){
   g.bullets=[{id:93,ownerId:999,x:600,y:0,vx:500,vy:0,ttl:10,[flag]:true}];
   assert.equal(choose(g,tank),far,flag+' remains dangerous');
 }
});
test('short-lived stationary bullet is not secretly dismissed by TTL knowledge',()=>{
 const {g,tank,far,choose}=fixture();
 g.bullets=[{id:94,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:.25}];
 assert.equal(choose(g,tank),far,'public geometry alone cannot infer stationary projectile expiry');
});
test('Phase Shift and its playable ancestors do not use walking-only arrival proof',()=>{
 const {g,tank,classes,far,choose}=fixture();
 g.bullets=[{id:95,ownerId:999,x:600,y:0,vx:500,vy:0,ttl:10}];
 for(const id of ['scout','marksman','ghost']){
   tank.cls=id;classes.CLASSES[id]={size:15,moveMult:1,ability:id==='ghost'?'phase':null};
   assert.equal(choose(g,tank),far,id+' may teleport after evolution');
 }
});
test('non-heal resource choices retain existing visible danger scoring',()=>{
 const {g,tank,choose}=fixture();
 g.powerups=[{id:'shield-near',type:'shield',x:350,y:0},{id:'shield-far',type:'shield',x:380,y:0}];
 assert.equal(choose(g,tank).id,'shield-near');
 g.bullets=[{id:96,ownerId:999,x:350,y:0,vx:500,vy:0,ttl:10}];
 assert.equal(choose(g,tank).id,'shield-far');
});
test('no bullets add no movement-speed work',()=>{
 const {g,tank,near,choose}=fixture();
 let calls=0;g.tankSpeed=()=>{calls++;return 114.08;};
 assert.equal(choose(g,tank),near);
 assert.equal(calls,1,'the winning heal retains its existing contest-speed query; no extra arrival-bound query without bullets');
});

test('deterministic moving-bullet differential agrees with analytic lane exit',()=>{
 const {g,tank,laneRisk}=fixture();
 let seed=20261115;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 let checked=0,discounted=0;
 for(let i=0;i<3000;i++){
   const angle=rand()*Math.PI*2,speed=30+rand()*1200;
   const dx=(rand()-.5)*400,dy=(rand()-.5)*400;
   const vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed;
   const arrival=.3+rand()*3;
   g.bullets=[{id:100+i,ownerId:999,x:600+dx,y:dy,vx,vy,ttl:10}];
   const original=laneRisk(g,600,0,tank.id,null);
   const actual=laneRisk(g,600,0,tank.id,null,arrival);
   const a=vx*vx+vy*vy,b=2*(dx*vx+dy*vy),c=dx*dx+dy*dy-150*150;
   const disc=b*b-4*a*c;
   const exit=disc>=0?(-b+Math.sqrt(disc))/(2*a):-Infinity;
   const shouldSkip=disc>=0&&exit>=0&&exit<arrival;
   if(shouldSkip){
     assert.equal(actual,0,'certified departed projectile must not penalize remote lane');
     assert.ok(Math.hypot(dx+vx*arrival,dy+vy*arrival)>150-1e-7,
       'constant-velocity bullet cannot occupy lane at arrival');
     discounted++;
   }else assert.equal(actual,original,'uncertified trajectory must preserve baseline risk');
   checked++;
 }
 assert.equal(checked,3000);
 assert.ok(discounted>200,'exercise meaningful certified exits');
});

test('shipping class movement multipliers do not exceed the conservative evolution ceiling',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
  const values=[...html.matchAll(/moveMult:\s*([0-9.]+)/g)].map(m=>Number(m[1]));
  assert.ok(values.length>=36,'expected the full materialized class roster');
  assert.ok(Math.max(...values)<=1.18,
    'a faster class requires revisiting the remote-pickup earliest-arrival ceiling');
});


test('canonical Phase Shift descendants and ancestors bypass public lane-exit bound',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
  const marker='window.__defineModule("game/classes", function (module, exports, require) {';
  const start=html.indexOf(marker),end=html.indexOf('\n});',start);
  assert.ok(start>=0&&end>start,'materialized canonical class registry exists');
  const mod={exports:{}};
  new Function('module','exports','require',html.slice(start+marker.length,end))(
    mod,mod.exports,()=>{throw Error('unexpected class-module dependency');});
  const registry=mod.exports.CLASSES;
  const phaseClasses=Object.entries(registry).filter(([,def])=>def.ability==='phase');
  assert.ok(phaseClasses.length>=1,'expected canonical Phase Shift lineage');
  const affected=new Set();
  for(const [id] of phaseClasses){
    let current=id;
    while(current){
      assert.ok(registry[current],'phase lineage parent must exist: '+current);
      affected.add(current);
      current=registry[current].parent;
    }
  }
  for(const id of affected){
    const {g,tank,classes,far,choose}=fixture();
    tank.cls=id;classes.CLASSES[id]=registry[id];
    g.bullets=[{id:110,ownerId:999,x:600,y:0,vx:500,vy:0,ttl:10}];
    assert.equal(choose(g,tank),far,
      id+' may phase now or after evolution, invalidating walking-only ETA');
  }
});

