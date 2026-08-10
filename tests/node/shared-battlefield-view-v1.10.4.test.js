const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadShared(){
  const CLASSES={
    twin:{id:'twin',size:14,ability:null,bullet:{speed:470}},
    marksman:{id:'marksman',size:14,ability:null,bullet:{speed:1050}},
    cannon:{id:'cannon',size:15,ability:'ragnarok',bullet:{speed:380}},
    carrier:{id:'carrier',size:14,ability:'swarm',bullet:{speed:430}},
    guard:{id:'guard',size:16,ability:'bulwark',bullet:{speed:420}},
  };
  function lineageForClass(id){
    if(id==='marksman')return 'sniper';
    if(id==='cannon')return 'cannon';
    if(id==='carrier')return 'controller';
    if(id==='guard')return 'guardian';
    if(id==='twin')return 'gunner';
    return null;
  }
  function Game(){
    this.time=10;this.tanks=[];this.bullets=[];this.drones=[];this.shapes=[];this.player=null;this.moves=[];this.fires=0;this.abilities=0;
    this.blockAll=false;this.coverMode=false;this.wall=null;
  }
  Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
  Game.prototype.getShape=function(id){return this.shapes.find(s=>s.id===id)||null;};
  Game.prototype.nearestShape=function(){return null;};
  Game.prototype.tankSpeed=function(){return 120;};
  Game.prototype.weaponRange=function(t){return t.cls==='marksman'?1100:650;};
  Game.prototype.bulletSpeed=function(t){return CLASSES[t.cls].bullet.speed;};
  Game.prototype.hasLineOfSight=function(){return !this.blockAll;};
  Game.prototype.isTerrainSafe=function(){return true;};
  Game.prototype.firstTerrainHit=function(){return this.blockAll&&this.wall?{solid:this.wall,hit:{x:120,y:0,nx:-1,ny:0}}:null;};
  Game.prototype.moveTank=function(t,vx,vy,dt){this.moves.push([vx,vy]);t.x+=vx*dt;t.y+=vy*dt;t.vx=vx;t.vy=vy;};
  Game.prototype.tryFire=function(){this.fires++;};
  Game.prototype.useAbility=function(t){this.abilities++;t.abilityCd=5;};
  Game.prototype.damageTank=function(t,dmg){t.hp-=dmg;return dmg;};
  Game.prototype.spawnAITank=function(){};
  Game.prototype.updateDrones=function(){};

  const modules={
    'game/classes':function(module){module.exports={CLASSES,lineageForClass};},
    'game/engine':function(module){module.exports={Game};},
    'game/ai':function(module){module.exports={updateAI(t,g,dt){
      if(t.ai.state==='hunt'){
        const target=t.ai.targetId>=0&&g.getTank(t.ai.targetId);
        if(target)t.angle=Math.atan2(target.y-t.y,target.x-t.x);
        g.moveTank(t,0,0,dt);
        g.tryFire(t);
        if(t.abilityCd<=0)g.useAbility(t);
      }
    }};},
  };
  const context={window:{__novaModules:modules},console,Math,performance:{now:()=>0}};
  const predator=fs.readFileSync(path.join(__dirname,'../../nova-updates/predator-doctrine-v1.8.0.js'),'utf8');
  const shared=fs.readFileSync(path.join(__dirname,'../../nova-updates/shared-battlefield-view-v1.10.4.js'),'utf8');
  vm.runInNewContext(predator,context,{filename:'predator-doctrine-v1.8.0.js'});
  vm.runInNewContext(shared,context,{filename:'shared-battlefield-view-v1.10.4.js'});
  const cache={};
  function load(id){
    if(cache[id])return cache[id].exports;
    const m={exports:{}};cache[id]=m;
    modules[id](m,m.exports,(spec)=>{
      if(spec==='./classes')return load('game/classes');
      throw new Error('unexpected require '+spec);
    });
    return m.exports;
  }
  const engine=load('game/engine'),ai=load('game/ai');
  return {context,Game:engine.Game,ai,CLASSES,lineageForClass,src:shared};
}
function tank(id,cls,extra={}){
  return Object.assign({id,cls,x:0,y:0,vx:0,vy:0,angle:0,hp:100,maxHp:100,level:20,tier:2,alive:true,isPlayer:false,spawnShieldT:0,abilityCd:99,ai:null},extra);
}
function brain(extra={}){
  return Object.assign({state:'wander',thinkT:0,targetId:-1,strafe:1,dodgeX:0,dodgeY:0,dodgeT:0,preferredRange:0,archetype:'brawler',aggression:.6,isElite:false,fireHold:0,__v180PlanT:0},extra);
}

test('v1.10.4 declares player-map information parity without granting physical cheats',()=>{
  const {context,src}=loadShared();
  const c=context.window.__NOVA_SHARED_BATTLEFIELD_VIEW__.contract;
  assert.equal(context.window.__NOVA_SHARED_BATTLEFIELD_VIEW_RELEASE__.version,'1.10.4');
  assert.equal(c.playerMinimapParity,true);
  assert.equal(c.globalLivingTankTracking,true);
  assert.equal(c.occlusionBreaksAwareness,false);
  assert.equal(c.occlusionBlocksDirectFire,true);
  assert.equal(c.physicalTerrain,true);
  assert.equal(c.statBuffs,false);
  assert.equal(/dmgMult\s*=/.test(src),false,'shared awareness must not add damage multipliers');
  assert.equal(/moveMult\s*=/.test(src),false,'shared awareness must not add movement multipliers');
});

test('cover no longer freezes or expires a live target coordinate',()=>{
  const {Game,ai}=loadShared(),g=new Game();
  const hunter=tank(1,'twin',{ai:brain()}),player=tank(7,'guard',{isPlayer:true,x:260,y:40,vx:20});
  g.tanks=[hunter,player];g.player=player;
  ai.updateAI(hunter,g,.16);
  const firedVisible=g.fires;
  assert.equal(hunter.ai.__v1104TargetId,7);
  player.x=910;player.y=705;player.vx=55;player.vy=-30;
  g.blockAll=true;g.time+=.2;hunter.ai.__v1104PlanT=0;
  ai.updateAI(hunter,g,.16);
  assert.equal(hunter.ai.__v1104TargetId,7);
  assert.equal(hunter.ai.__v180LastSeenX,910);
  assert.equal(hunter.ai.__v180LastSeenY,705);
  assert.equal(hunter.ai.__v172LastSeenX,910);
  assert.equal(hunter.ai.__v172LastSeenY,705);
  assert.equal(hunter.ai.state,'hunt');
  assert.equal(g.fires,firedVisible,'knowledge through cover must not become through-wall fire');
});

test('map awareness has no tank-centric vision radius',()=>{
  const {Game,ai}=loadShared(),g=new Game();
  const hunter=tank(1,'twin',{x:-1900,ai:brain()}),player=tank(7,'guard',{isPlayer:true,x:1900});
  g.tanks=[hunter,player];g.player=player;
  ai.updateAI(hunter,g,.16);
  assert.equal(hunter.ai.__v1104TargetId,7,'a living tank shown on the minimap remains knowable across the arena');
  assert.equal(hunter.ai.targetId,7);
});

test('permanent cover blocks fire even while the target remains tracked',()=>{
  const {Game,ai}=loadShared(),g=new Game();
  const hunter=tank(1,'twin',{ai:brain()}),player=tank(7,'guard',{isPlayer:true,x:250});
  g.tanks=[hunter,player];g.player=player;g.blockAll=true;g.wall={id:99,solid:true,destructible:false,hp:999};
  ai.updateAI(hunter,g,.16);
  assert.equal(hunter.ai.__v1104TargetId,7);
  assert.equal(g.fires,0);
});

test('Cannon may intentionally attack destructible cover protecting a known target',()=>{
  const {Game,ai}=loadShared(),g=new Game();
  const hunter=tank(1,'cannon',{ai:brain()}),player=tank(7,'guard',{isPlayer:true,x:250});
  g.tanks=[hunter,player];g.player=player;g.blockAll=true;g.wall={id:99,solid:true,destructible:true,hp:120};
  ai.updateAI(hunter,g,.16);
  assert.equal(hunter.ai.__v1104TargetId,7);
  assert.equal(g.fires,1,'existing Cannon breach execution should stay available against destructible cover');
});

test('AI Controllers inherit the same global target knowledge while drones keep their own mechanics',()=>{
  const {Game}=loadShared(),g=new Game();
  const controller=tank(1,'carrier',{x:-1700,ai:brain()}),player=tank(7,'guard',{isPlayer:true,x:1700});
  g.tanks=[controller,player];g.player=player;g.blockAll=true;
  g.updateDrones(.16);
  assert.ok(controller.__novaCommandAI,'Controller tactical plan should exist');
  assert.equal(controller.__novaCommandAI.targetId,7);
  assert.equal(controller.ai.targetId,7);
});

test('shared awareness preserves a bounded reaction cadence',()=>{
  const {Game,ai}=loadShared(),g=new Game();
  const hunter=tank(1,'twin',{ai:brain()}),player=tank(7,'guard',{isPlayer:true,x:420});
  g.tanks=[hunter,player];g.player=player;
  ai.updateAI(hunter,g,.016);
  assert.ok(hunter.ai.__v1104PlanT>.07,'planning should remain reaction-limited rather than frame-perfect');
});

test('active diagnostics supersede the old wall-vision wording',()=>{
  const {context}=loadShared(),fair=context.window.__NOVA_AI_DIRECTOR__.fairPlay;
  assert.equal(fair.wallVision,'player-map-parity');
  assert.equal(fair.hiddenTracking,'not-hidden-to-player');
  assert.equal(fair.occlusionBlocksFire,true);
  assert.equal(fair.occlusionBreaksAwareness,false);
});