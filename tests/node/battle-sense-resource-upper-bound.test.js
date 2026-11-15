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
  return {tank,g,classes,choose:window.__NOVA_BATTLE_SENSE_TEST__.chooseResource,stats:window.__NOVA_BATTLE_SENSE__};
}

test('an already-winning critical heal avoids an unwinnable shield route search',()=>{
  const {tank,g,classes,choose,stats}=setup();
  const heal={id:'heal',type:'heal',x:200,y:0};
  const shield={id:'shield',type:'shield',x:450,y:0};
  g.powerups=[heal,shield];
  let losChecks=0;
  g.hasLineOfSight=()=>{losChecks++;return false;};
  const calls=[];
  g.novaStrategicRouteCost=(...args)=>{calls.push(args);return 250;};
  g.novaBattlefieldWaypoint=(...args)=>{calls.push(args);return {x:10,y:0};};
  g.novaRouteLength=()=>600;
  assert.equal(choose(g,tank,classes),heal);
  assert.equal(calls.length,1,'hopeless shield must not evict a live route');
  assert.equal(stats.prunedRoutes,1,'record actual skipped strategic work');
  assert.equal(losChecks,3,'one occlusion probe per candidate plus the selected route check');
  assert.equal(calls[0].length,6,'only the heal requests a live route waypoint');
});

test('optimistic pruning never rejects a potentially superior contender',()=>{
  const {tank,g,classes,choose}=setup();
  const shield={id:'shield',type:'shield',x:200,y:0};
  const heal={id:'heal',type:'heal',x:300,y:0};
  g.powerups=[shield,heal];
  const calls=[];
  g.novaStrategicRouteCost=(...args)=>{calls.push(args);return args[6]==='shield'?200:350;};
  g.novaBattlefieldWaypoint=(...args)=>{calls.push(args);return {x:10,y:0};};
  g.novaRouteLength=()=>350;
  assert.equal(choose(g,tank,classes),heal);
  assert.equal(calls.length,2,'both contenders remain eligible for live route evaluation');
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

test('nearby shield remains eligible when it can beat a distant heal',()=>{
  const {tank,g,classes,choose}=setup();
  tank.hp=34;
  const heal={id:'heal',type:'heal',x:730,y:0};
  const shield={id:'shield',type:'shield',x:25,y:0};
  g.powerups=[heal,shield];
  let plans=0;
  g.novaBattlefieldWaypoint=()=>{plans++;return {x:10,y:0};};
  g.novaRouteLength=(x,y,gx)=>gx>100?740:30;
  assert.equal(choose(g,tank,classes),shield);
  assert.equal(plans,2,'a potentially superior shield must not be pruned');
});

test('pruning a hopeless candidate preserves the existing movement-route cache',()=>{
  const {tank,g,classes,choose}=setup();
  const heal={id:'heal',type:'heal',x:200,y:0};
  const shield={id:'shield',type:'shield',x:700,y:0};
  g.powerups=[heal,shield];
  const liveRoute={goalId:'combat-target',waypoints:[{x:20,y:30}]};
  g.liveRoute=liveRoute;
  let probes=0;
  g.novaBattlefieldWaypoint=()=>{probes++;return {x:10,y:0};};
  g.novaRouteLength=()=>250;
  assert.equal(choose(g,tank,classes),heal);
  assert.equal(probes,1);
  assert.equal(g.liveRoute,liveRoute);
});

test('seeded resource mixes preserve the exhaustive winner under certified detour costs',()=>{
  const types=['heal','shield','nuke','triple','haste'];
  let state=20261115;
  const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  let pruned=0;
  for(let scene=0;scene<240;scene++){
    const {tank,g,classes,choose,stats}=setup();
    tank.hp=5+Math.floor(rand()*95);
    const count=1+Math.floor(rand()*8);
    g.powerups=Array.from({length:count},(_,id)=>({
      id,type:types[Math.floor(rand()*types.length)],x:20+rand()*720,y:0
    }));
    g.novaBattlefieldWaypoint=()=>({x:0,y:0});
    g.novaRouteLength=(x,y,gx,gy)=>Math.hypot(gx-x,gy-y)*1.2;
    g.novaStrategicRouteCost=(x,y,gx,gy)=>Math.hypot(gx-x,gy-y)*1.2;
    const hp=tank.hp/tank.maxHp;
    let best=-99,winner=null;
    for(const p of g.powerups){
      const direct=Math.hypot(p.x-tank.x,p.y-tank.y);
      const value=p.type==='heal'?(1-hp)*2.5:
        p.type==='shield'?.65+(1-hp)*.45:
        p.type==='nuke'?.45:
        p.type==='triple'?.62+(hp>.45?.25:0):
        .55+(hp>.4?.25:0);
      const score=value-direct*1.2/900-.28;
      if(score>best){best=score;winner=p;}
    }
    const expected=best>.42?winner:null;
    assert.equal(choose(g,tank,classes),expected,'winner differs in seeded scene '+scene);
    pruned+=stats.prunedRoutes;
  }
  assert.ok(pruned>0,'seeded cases must exercise pruning, not only the original path');
});

test('a low-value shield listed before any heal cannot consume the live route cache',()=>{
  const {tank,g,classes,choose,stats}=setup();
  const shield={id:'shield',type:'shield',x:700,y:0};
  const heal={id:'heal',type:'heal',x:200,y:0};
  g.powerups=[shield,heal];
  let probes=0;
  g.novaBattlefieldWaypoint=()=>{probes++;return {x:10,y:0};};
  g.novaRouteLength=()=>250;
  assert.equal(choose(g,tank,classes),heal);
  assert.equal(probes,1,'unwinnable shield is rejected before planning, even when first');
  assert.equal(stats.prunedRoutes,1);
});
