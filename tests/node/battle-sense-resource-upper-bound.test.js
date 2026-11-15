'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function setup(){
  function Game(){}
  const classes={CLASSES:{guard:{size:15}},lineageForClass:()=> 'guardian'};
  const modules={
    'game/engine':m=>{m.exports={Game};},
    'game/ai':m=>{m.exports={updateAI(){}};}
  };
  const window={__novaModules:modules};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates/battle-sense-v1.8.1.js'),'utf8'),
    {window,Math,Number,Object,Array,console:{info(){},error(){}}});
  const tank={id:7,cls:'guard',x:0,y:0,hp:10,maxHp:100,alive:true,ai:{}};
  const g={tanks:[tank],bullets:[],powerups:[],hasLineOfSight:()=>false};
  return {tank,g,classes,choose:window.__NOVA_BATTLE_SENSE_TEST__.chooseResource};
}

test('an already-winning critical heal avoids an unwinnable shield route search',()=>{
  const {tank,g,classes,choose}=setup();
  const heal={id:'heal',type:'heal',x:200,y:0};
  const shield={id:'shield',type:'shield',x:450,y:0};
  g.powerups=[heal,shield];
  const calls=[];
  g.novaStrategicRouteCost=(...args)=>{calls.push(args);return 250;};
  g.novaBattlefieldWaypoint=(...args)=>{calls.push(args);return {x:10,y:0};};
  g.novaRouteLength=()=>600;
  assert.equal(choose(g,tank,classes),heal);
  assert.equal(calls.length,1,'hopeless shield must not evict a live route');
  assert.equal(calls[0][6],'heal');
});

test('optimistic pruning never rejects a potentially superior contender',()=>{
  const {tank,g,classes,choose}=setup();
  const shield={id:'shield',type:'shield',x:200,y:0};
  const heal={id:'heal',type:'heal',x:300,y:0};
  g.powerups=[shield,heal];
  const calls=[];
  g.novaStrategicRouteCost=(...args)=>{calls.push(args);return args[6]==='shield'?200:350;};
  g.novaBattlefieldWaypoint=()=>({x:10,y:0});
  g.novaRouteLength=()=>350;
  assert.equal(choose(g,tank,classes),heal);
  assert.equal(calls.length,1,'heal is not eligible for two-heal scratch pricing');
});

test('equal optimistic bound may be pruned without changing first-wins tie policy',()=>{
  const {tank,g,classes,choose}=setup();
  const first={id:'first',type:'heal',x:100,y:0};
  const second={id:'second',type:'heal',x:100,y:0};
  g.powerups=[first,second];
  let plans=0;
  g.novaStrategicRouteCost=()=>{plans++;return 100;};
  assert.equal(choose(g,tank,classes),first);
  assert.equal(plans,1,'identical candidate cannot beat the existing winner');
});
