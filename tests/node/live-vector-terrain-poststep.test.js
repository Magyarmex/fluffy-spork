'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');
function boot(options={}){
  function Game(){
    this.time=10;this.w=800;this.h=600;this.input={aim:{active:false,dx:0,dy:0}};
    this.tanks=[];this.drones=[];this.player=null;
  }
  Game.prototype.updateDrones=function(){};
  Game.prototype.setClass=function(){};
  const classes={CLASSES:{carrier:{droneLeash:650},gunner:{}},lineageForClass:()=>null};
  const modules={
    'game/engine':m=>{m.exports.Game=Game;},
    'game/classes':m=>{Object.assign(m.exports,classes);},
    'game/render':m=>{m.exports.render=function(){};}
  };
  const window={__novaModules:modules};
  const document={addEventListener(){}};
  vm.runInNewContext(src,{window,document,console:{info(){},warn(){},error(){}},Math,Number,Date,WeakMap},{filename:'second-body-live-vector-v1.10.7.js'});
  const cache={};
  function load(id){
    if(cache[id])return cache[id].exports;
    const m={exports:{}};cache[id]=m;
    modules[id](m,m.exports,spec=>{
      if(spec==='./classes')return load('game/classes');
      throw Error('unexpected require '+spec);
    });
    return m.exports;
  }
  load('game/classes');load('game/engine');load('game/render');
  const g=new Game();
  const owner={id:1,cls:'carrier',isPlayer:true,alive:true,hp:100,maxHp:100,x:70,y:0,angle:0,__novaSwarm:{active:false,power:0}};
  const drone={id:101,ownerId:1,hp:10,maxHp:100,r:8,x:-18,y:0,speed:180,
    __lvVX:260,__lvVY:0,__novaVX:260,__novaVY:0,__novaPhase:'recover',
    __lvRepairing:true,__lvLastHp:10,__lvRepairWait:0};
  const others=new Map([[1,owner]]);
  g.player=owner;g.tanks=[owner];g.drones=[drone];
  g.getTank=id=>others.get(id)||null;g.areHostile=(a,b)=>a.id!==b.id;
  g.hasLineOfSight=(ax,ay,bx,by)=>ax>0&&bx>0;
  g.novaBattlefieldWaypoint=()=>({x:-20,y:100});
  g.isTerrainSafe=(x,y,pad)=>x+pad<0;
  g.firstTerrainHit=(ax,ay,bx,by,pad)=>ax+pad<0&&bx+pad>=0?{hit:{x:0,y:by}}:null;
  if(options.clear){
    g.hasLineOfSight=()=>true;g.isTerrainSafe=()=>true;g.firstTerrainHit=()=>null;
  }
  if(options.swept){
    g.isTerrainSafe=()=>true;
    g.firstTerrainHit=(ax,ay,bx,by)=>ax<-15&&bx>=-15?{hit:{x:-15,y:0}}:null;
  }
  if(options.peel){
    drone.hp=drone.maxHp=100;drone.__lvRepairing=false;
    const rival={id:2,cls:'gunner',alive:true,hp:100,maxHp:100,x:80,y:0};
    others.set(2,rival);g.tanks.push(rival);
    g.drones.push({id:202,ownerId:2,hp:100,maxHp:100,x:80,y:0,r:8});
  }
  return{g,drone,owner};
}
test('repair steering cannot step into solid cover after Terrain Intelligence has run',()=>{
  const {g,drone}=boot();
  assert.ok(g.isTerrainSafe(drone.x,drone.y,13));
  g.updateDrones(.033);
  assert.ok(g.isTerrainSafe(drone.x,drone.y,13),'repair must remain outside cover');
  assert.equal(drone.x,-18,'unsafe inertial step must be rejected');
  assert.equal(drone.__lvVX,0,'old velocity must not keep pushing into cover');
});
test('unobstructed repair steering still moves normally',()=>{
  const {g,drone}=boot({clear:true});
  g.updateDrones(.033);
  assert.ok(drone.x>-18,'repair still advances on clear terrain');
  assert.ok(drone.__lvVX>0);
});
test('swept collision rejects a thin wall even with safe endpoints',()=>{
  const {g,drone}=boot({swept:true});
  g.updateDrones(.033);
  assert.equal(drone.x,-18);
  assert.equal(drone.__novaVX,0);
});
test('local defensive peel cannot tunnel through terrain',()=>{
  const {g,drone}=boot({peel:true});
  g.updateDrones(.033);
  assert.equal(drone.x,-18);
  assert.ok(g.isTerrainSafe(drone.x,drone.y,13));
});
test('blocked movement preserves owner position and normal repair semantics',()=>{
  const {g,drone,owner}=boot();const hp=drone.hp;
  g.updateDrones(.033);
  assert.equal(owner.x,70);assert.equal(owner.y,0);
  assert.ok(drone.hp>=hp && drone.hp<=drone.maxHp, 'ordinary nearby repair remains allowed');
});
