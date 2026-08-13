const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadCombinedArms() {
  const CLASSES = {
    cannon:{id:'cannon',size:16}, siegebomber:{id:'siegebomber',size:17},
    guard:{id:'guard',size:16}, twin:{id:'twin',size:14}, carrier:{id:'carrier',size:15}
  };
  function lineageForClass(id){
    if(id==='cannon'||id==='siegebomber') return 'cannon';
    if(id==='guard') return 'guardian';
    if(id==='twin') return 'gunner';
    if(id==='carrier') return 'controller';
    return 'scout';
  }

  function Game(){
    this.time=10; this.bullets=[]; this.tanks=[]; this.drones=[]; this.player=null;
    this.cam={x:0,y:0,zoom:1}; this.w=390; this.h=800; this.dpr=1;
    this.input={aim:{active:true,dx:55,dy:0},mouseActive:false}; this.sfx={};
    this.block=null; this.blockAll=false;
  }
  Game.prototype.splashAt=function(x,y,r,frac,owner,knock,color,dmg){
    for(const t of this.tanks) this.damageTank(t,dmg||50,owner,100,0);
  };
  Game.prototype.damageTank=function(t,dmg){t.hp-=dmg;return dmg;};
  Game.prototype.tryFire=function(t){
    if(t.fireCd>0)return;
    this.bullets.push({ownerId:t.id,x:t.x,y:t.y,vx:400,vy:0,dmg:20,pen:1,dead:false});
    t.fireCd=.2;
  };
  Game.prototype.moveTank=function(t,vx,vy,dt){t.x+=vx*dt;t.y+=vy*dt;t.vx=vx;t.vy=vy;};
  Game.prototype.updateDrones=function(){};
  Game.prototype.update=function(){};
  Game.prototype.weaponRange=function(){return 600;};
  Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
  Game.prototype.addText=function(){};
  Game.prototype.isTerrainSafe=function(){return true;};
  Game.prototype.hasLineOfSight=function(){return !this.blockAll;};
  Game.prototype.firstTerrainHit=function(){
    if(!this.block)return null;
    return {solid:this.block,hit:{x:0,y:0,nx:-1,ny:0,t:.5}};
  };

  function Sfx(){}
  Sfx.prototype.resume=function(){};

  const modules={
    'game/classes':function(module){module.exports={CLASSES,lineageForClass};},
    'game/audio':function(module){module.exports={Sfx};},
    'game/engine':function(module){module.exports={Game};},
    'game/ai':function(module){module.exports={updateAI(){}};},
    'game/render':function(module){module.exports={render(){}};}
  };
  const context={window:{__novaModules:modules},console,Math,performance:{now:()=>0}};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/combined-arms-v1.7.2.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'combined-arms-v1.7.2.js'});

  const cache={};
  function load(id){
    if(cache[id])return cache[id].exports;
    const m={exports:{}};cache[id]=m;
    modules[id](m,m.exports,(spec)=>{
      if(spec==='./classes')return load('game/classes');
      throw new Error(`unexpected require ${spec}`);
    });
    return m.exports;
  }
  const engine=load('game/engine');
  const ai=load('game/ai');
  load('game/audio'); load('game/render');
  return {context,Game:engine.Game,ai};
}

function tank(id,cls,extra={}){
  return Object.assign({id,cls,x:0,y:0,angle:0,hp:100,alive:true,isPlayer:false,fireCd:0,vx:0,vy:0},extra);
}

test('Combined Arms publishes v1.7.2',()=>{
  const {context}=loadCombinedArms();
  assert.equal(context.window.__NOVA_COMBINED_ARMS_RELEASE__.version,'1.7.2');
  assert.equal(context.window.__NOVA_COMBINED_ARMS_RELEASE__.codename,'Combined Arms');
});

test('solid cover fully occludes splash damage',()=>{
  const {Game}=loadCombinedArms(),g=new Game(),t=tank(1,'guard',{x:100});
  g.tanks=[t];g.blockAll=true;
  g.splashAt(0,0,100,.4,2,0,'#fff',40);
  assert.equal(t.hp,100);
});

test('unoccluded splash retains normal damage',()=>{
  const {Game}=loadCombinedArms(),g=new Game(),t=tank(1,'guard',{x:100});
  g.tanks=[t];g.blockAll=false;
  g.splashAt(0,0,100,.4,2,0,'#fff',40);
  assert.equal(t.hp,60);
});

test('partial blast exposure uses weighted hull samples',()=>{
  const {context}=loadCombinedArms();
  assert.equal(context.window.__NOVA_COMBINED_ARMS_TEST__.blastWeights(false,true,false),.22);
  assert.equal(context.window.__NOVA_COMBINED_ARMS_TEST__.blastWeights(true,false,false),.56);
  assert.equal(context.window.__NOVA_COMBINED_ARMS_TEST__.blastWeights(true,true,true),1);
});

test('local routing selects a waypoint around a rectangular blocker',()=>{
  const {Game}=loadCombinedArms(),g=new Game();
  g.block={id:-1,shape:'rect',x:0,y:0,w:80,h:120,destructible:false};
  g.hasLineOfSight=()=>false;g.isTerrainSafe=()=>true;
  const wp=g.novaBattlefieldWaypoint(-200,0,200,0,18,1);
  assert.ok(wp);
  assert.ok(Math.abs(wp.y)>60,`expected corner detour, got ${JSON.stringify(wp)}`);
});

test('Cannon fuse preview reports an earlier physical impact',()=>{
  const {Game}=loadCombinedArms(),g=new Game(),t=tank(2,'cannon',{x:-200,isPlayer:true});
  g.player=t;g.tanks=[t];g.block={id:-2,shape:'rect',x:0,y:0,w:50,h:100,destructible:true,hp:100,maxHp:200};
  const pv=g.novaFusePreview(t);
  assert.equal(pv.blocked,true);
  assert.equal(pv.solid.id,-2);
  assert.ok(pv.actualDist<pv.programDist);
});

test('Cannon breach fire marks structural intent without hidden-target aim',()=>{
  const {Game}=loadCombinedArms(),g=new Game(),t=tank(2,'cannon',{x:-200,ai:{targetId:7}});
  g.tanks=[t];g.block={id:-2,shape:'rect',x:0,y:0,w:50,h:100,destructible:true,hp:100,maxHp:200};
  const fired=g.novaBreachCover(t,{solid:g.block,hit:{x:-25,y:0}});
  assert.equal(fired,true);
  assert.equal(g.bullets[0].__v172BreachIntent,true);
  assert.ok(g.bullets[0].__novaStructureMult>1);
  assert.equal(t.ai.targetId,7);
});

test('AI last-seen memory freezes hidden target coordinates',()=>{
  const {Game,ai}=loadCombinedArms(),g=new Game();
  const hunter=tank(1,'twin',{ai:{targetId:7,state:'hunt',isElite:false}}),target=tank(7,'guard',{x:120,y:30});
  g.tanks=[hunter,target];g.hasLineOfSight=()=>true;
  ai.updateAI(hunter,g,.1);
  assert.equal(hunter.ai.__v172LastSeenX,120);
  target.x=500;target.y=400;g.time=10.5;g.hasLineOfSight=()=>false;hunter.ai.targetId=-1;
  ai.updateAI(hunter,g,.1);
  assert.equal(hunter.ai.__v172LastSeenX,120);
  assert.equal(hunter.ai.__v172LastSeenY,30);
  assert.equal(hunter.ai.__v172Investigating,true);
});
