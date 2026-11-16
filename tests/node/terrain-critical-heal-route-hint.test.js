'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function scene(){
  function Game(){}
  Game.prototype.novaBattlefieldWaypoint=function(x,y,gx,gy){return{x:gx,y:gy};};
  Game.prototype.moveTank=function(t,vx,vy,dt){
    return this.novaBattlefieldWaypoint(t.x,t.y,t.x+100,t.y,23,t.id);
  };
  const mods={'game/engine':m=>{m.exports={Game};}};
  const w={__novaModules:mods};
  const source=fs.readFileSync(path.resolve(__dirname,'../../nova-updates/terrain-intelligence-v1.10.2.js'),'utf8');
  vm.runInNewContext(source,{window:w,Math,Number,Object,Array,console:{info(){},error(){}}});
  const m={exports:{}};
  mods['game/engine'](m,m.exports,()=>({
    CLASSES:{guard:{size:15}},lineageForClass:()=> 'guardian'
  }));
  const g=new m.exports.Game();
  g.time=10;
  g.hasLineOfSight=()=>true;
  g.isTerrainSafe=()=>true;
  g.powerups=[{id:'heal-1',type:'heal',x:340,y:-40}];
  g.getTank=()=>null;
  const tank={id:7,cls:'guard',x:0,y:0,hp:10,maxHp:100,isPlayer:false,
    ai:{targetId:-1,__v172LastSeenAt:null,__v172LastSeenId:-1,
      __v181Mode:'resource',__v181BiasW:1.05,__v181ResourceId:'heal-1'}};
  return{g,tank};
}

test('critical-heal movement reuses the selected physical resource goal',()=>{
  const {g,tank}=scene(),before=JSON.stringify(g.powerups);
  const wp=g.moveTank(tank,100,0,1/60);
  assert.equal(wp.x,340);
  assert.equal(wp.y,-40);
  assert.equal(g.__v1102RouteContext,undefined,'temporary route context must restore');
  assert.equal(JSON.stringify(g.powerups),before,'route hint cannot consume or mutate pickups');
});

test('resource hint fails closed for stale goals, non-heals, ordinary HP and absent mode',()=>{
  for(const kind of ['missing','non-heal','healthy','none','weak-bias','distant']){
    const {g,tank}=scene();
    if(kind==='missing')g.powerups=[];
    if(kind==='non-heal')g.powerups[0].type='shield';
    if(kind==='healthy')tank.hp=70;
    if(kind==='none')tank.ai.__v181Mode='none';
    if(kind==='weak-bias')tank.ai.__v181BiasW=.72;
    if(kind==='distant')g.powerups[0].x=900;
    const wp=g.moveTank(tank,100,0,1/60);
    assert.equal(wp.x,100,kind+' must keep ordinary movement goal');
    assert.equal(wp.y,0,kind+' must keep ordinary movement bearing');
  }
});

test('observed combat and active anti-stuck escape preempt critical-heal route hints',()=>{
  {
    const {g,tank}=scene();
    const enemy={id:99,x:80,y:0,alive:true};
    tank.ai.targetId=99;
    g.getTank=id=>id===99?enemy:null;
    const wp=g.moveTank(tank,100,0,1/60);
    assert.equal(wp.x,100,'observed enemy must preserve combat steering authority');
  }
  {
    const {g,tank}=scene();
    tank.ai.__v1102Nav={escapeUntil:11,escapeX:0,escapeY:1};
    const wp=g.moveTank(tank,100,0,1/60);
    assert.equal(wp.x,100,'active recovery must preempt resource goal');
  }
});

test('temporary resource route context restores even if movement throws',()=>{
  const {g,tank}=scene();
  g.novaBattlefieldWaypoint=()=>{throw Error('waypoint-failure');};
  assert.throws(()=>g.moveTank(tank,100,0,1/60),/waypoint-failure/);
  assert.equal(g.__v1102RouteContext,undefined,
    'a failed movement call must not leak resource steering to another tank');
});

test('recent quiet critical-heal intent survives one transient scoring gap, then expires',()=>{
  const {g,tank}=scene();
  tank.ai.__v181Mode='none';
  tank.ai.__v181BiasW=0;
  tank.ai.__v181ResourceAt=9.5;
  const before=JSON.stringify(g.powerups);
  const wp=g.moveTank(tank,100,0,1/60);
  assert.deepEqual({x:wp.x,y:wp.y},{x:340,y:-40});
  assert.equal(JSON.stringify(g.powerups),before);
  assert.equal(g.__v1102RouteContext,undefined);
  g.time=10.3;
  const expired=g.moveTank(tank,100,0,1/60);
  assert.deepEqual({x:expired.x,y:expired.y},{x:100,y:0},
    'expired intent must return control to ordinary steering');
});
test('transient healing continuity yields immediately to projectile, pickup loss and recovery',()=>{
  for(const kind of ['projectile','pickup-removed','shield','escape','healthy','future']){
    const {g,tank}=scene();
    tank.ai.__v181Mode='none';
    tank.ai.__v181BiasW=0;
    tank.ai.__v181ResourceAt=9.7;
    if(kind==='projectile')g.bullets=[{id:1,x:5000,y:5000}];
    if(kind==='pickup-removed')g.powerups=[];
    if(kind==='shield')g.powerups[0].type='shield';
    if(kind==='escape')tank.ai.__v1102Nav={escapeUntil:11,escapeX:0,escapeY:1};
    if(kind==='healthy')tank.hp=70;
    if(kind==='future')tank.ai.__v181ResourceAt=10.5;
    const wp=g.moveTank(tank,100,0,1/60);
    assert.deepEqual({x:wp.x,y:wp.y},{x:100,y:0},kind);
  }
});
