const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadCombinedArms() {
  const CLASSES = {
    cannon:{id:'cannon',size:16}, siegebomber:{id:'siegebomber',size:17}, quake:{id:'quake',size:17},
    guard:{id:'guard',size:16}, twin:{id:'twin',size:14}, carrier:{id:'carrier',size:15}
  };
  function lineageForClass(id){
    if(id==='cannon'||id==='siegebomber'||id==='quake') return 'cannon';
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


test('canonical Quake AI breach fire uses its intended structural impact multiplier',()=>{
 const {Game}=loadCombinedArms(),g=new Game(),t=tank(2,'quake',{x:-200,ai:{targetId:7}});
 g.tanks=[t];g.block={id:-2,shape:'rect',x:0,y:0,w:50,h:100,
   destructible:true,hp:100,maxHp:200};
 assert.equal(g.novaBreachCover(t,{solid:g.block,hit:{x:-25,y:0}}),true);
 assert.equal(g.bullets[0].__v172BreachIntent,true);
 assert.ok(g.bullets[0].__novaStructureMult>=2,
   'Quake breach fire must receive the same canonical structural specialization as its design');
 assert.equal(t.ai.targetId,7,'breaching must not expose hidden target coordinates');
});

test('AI tank movement delegates to the composed waypoint owner',()=>{
  const {Game}=loadCombinedArms(),g=new Game(),t=tank(7,'twin',{x:-200,y:0,ai:{}});
  g.block={id:-1,shape:'rect',x:0,y:0,w:80,h:120,destructible:false};
  let calls=0,args=null,probePads=[];
  g.firstTerrainHit=(x,y,ax,ay,pad)=>{probePads.push(pad);return{solid:g.block,hit:{x:0,y:0,nx:-1,ny:0,t:.5}};};
  g.novaBattlefieldWaypoint=(...a)=>{calls++;args=a;return{x:-150,y:100};};
  g.moveTank(t,100,0,.016);
  assert.equal(calls,1,'Terrain Intelligence must be able to replace the one-corner waypoint owner');
  assert.equal(probePads[0],17,'movement probes must use the twin tank body radius');
  assert.equal(args[4],22,'twin movement keeps the radius-plus-five route margin');
  assert.equal(args[5],t.id);
});

test('active Controller drones delegate route choice and test their physical radius',()=>{
  const {Game}=loadCombinedArms(),g=new Game(),owner=tank(1,'carrier',{__novaSwarm:{active:true,nodeX:220,nodeY:0}});
  const d={id:9,ownerId:owner.id,x:-100,y:0,r:8,hp:20,__novaTarget:{x:220,y:0},__novaVX:0,__novaVY:0};
  g.tanks=[owner];g.drones=[d];g.block={id:-1,shape:'rect',x:0,y:0,w:80,h:120,destructible:false};
  const pads=[];g.hasLineOfSight=(ax,ay,bx,by,pad)=>{pads.push(pad);return false;};
  let calls=0,args=null;
  g.novaBattlefieldWaypoint=(...a)=>{calls++;args=a;return{x:-40,y:100};};
  g.updateDrones(.1);
  assert.equal(calls,1,'active drone movement must use the composed route owner');
  assert.equal(pads[0],8,'drone visibility must use its actual body radius');
  assert.equal(args[4],13,'drone route pad is radius plus the five-unit safety margin');
  assert.equal(args[5],d.id);
});

test('AI drops a stale corner behind its intended clear forward lane',()=>{
 const {Game}=loadCombinedArms(),g=new Game(),t=tank(7,'guard',{
  x:100,y:210,ai:{__v172Waypoint:{x:68,y:238},__v172WaypointUntil:11}
 });
 g.firstTerrainHit=()=>null;
 g.moveTank(t,100,-50,.1);
 assert.equal(t.ai.__v172Waypoint,null,
  'an already passed corner must not keep pulling the tank backward');
 assert.ok(t.vx>80&&t.vy<0,
  'unobstructed intended movement should recover promptly after the corner');
});

test('AI clears a reached corner from persistent waypoint state',()=>{
 const {Game}=loadCombinedArms(),g=new Game(),t=tank(7,'guard',{
  x:60,y:225,ai:{__v172Waypoint:{x:68,y:238},__v172WaypointUntil:11}
 });
 g.firstTerrainHit=()=>null;
 g.moveTank(t,100,0,.1);
 assert.equal(t.ai.__v172Waypoint,null,
  'a reached corner must not be resurrected from stored AI state next frame');
});

test('AI retains a waypoint when forward terrain still blocks movement',()=>{
 const {Game}=loadCombinedArms(),g=new Game(),wp={x:68,y:238},t=tank(7,'guard',{
  x:100,y:210,ai:{__v172Waypoint:wp,__v172WaypointUntil:11}
 });
 g.firstTerrainHit=()=>({solid:{id:1},hit:{x:110,y:210,nx:-1,ny:0}});
 g.moveTank(t,100,-50,.1);
 assert.equal(t.ai.__v172Waypoint,wp,
  'do not discard a needed detour merely because the corner is behind the current aim');
});

test('certified critical-heal corner owns movement when short collision probe misses',()=>{
 const {Game}=loadCombinedArms();
 function run(certified){
  const g=new Game(),t=tank(8,'guard',{ai:{targetId:-1}});
  g.block=null;g.isTerrainSafe=()=>!certified;g.__v1102RouteContext={lineage:'resource',forceGoal:true,target:{x:340,y:-40}};
  if(certified)g.__v1102Routes={'8:6':{gx:340,gy:-40,points:[{x:0,y:100}]}};
  t.ai.__v172Waypoint={x:0,y:100};t.ai.__v172WaypointUntil=11;
  g.moveTank(t,100,0,.1);
  return {x:t.x,y:t.y};
 }
 const certified=run(true),uncertified=run(false);
 assert.ok(Math.abs(certified.x)<1e-8&&certified.y>9.9,'certified corner must dominate');
 assert.ok(uncertified.x>1&&uncertified.y>1,'uncertified fallback retains existing blend');
});


test('certified critical-heal route corner overrides a conflicting local waypoint at the wall',()=>{
 const {Game}=loadCombinedArms(),g=new Game(),t=tank(8,'guard',{
  x:81,y:-205,ai:{targetId:-1,__v172Waypoint:{x:195,y:-235},__v172WaypointUntil:11}
 });
 g.firstTerrainHit=()=>({solid:{id:91003},hit:{x:100,y:-205,nx:-1,ny:0}});
 g.isTerrainSafe=(x,y)=>x!==81;
 g.__v1102RouteContext={lineage:'resource',forceGoal:true,target:{x:340,y:-40}};
 g.__v1102Routes={'8:6':{gx:340,gy:-40,index:0,points:[{x:65,y:-235},{x:195,y:-235}]}};
 g.moveTank(t,100,0,.1);
 assert.ok(t.vx<=0&&t.vy<0,
  'the certified first corner is west/south; a stale eastward local corner must not own steering');
 assert.equal(t.ai.__v172Waypoint.x,195,
  'the local waypoint owner is not silently rewritten by a transient certified steering override');
});


test('certified corner authority does not leak to combat, mismatched goals or unsafe corners',()=>{
 const {Game}=loadCombinedArms();
 function run(mode,unsafe){
  const g=new Game(),t=tank(8,'guard',{
   x:81,y:-205,ai:{__v172Waypoint:{x:195,y:-235},__v172WaypointUntil:11}
  });
  g.firstTerrainHit=()=>({solid:{id:91003},hit:{x:100,y:-205,nx:-1,ny:0}});
  g.isTerrainSafe=(x,y)=>x!==81&&!(unsafe&&x===65);
  g.__v1102RouteContext=mode==='combat'?{lineage:'combat',forceGoal:true,target:{x:340,y:-40}}:
   {lineage:'resource',forceGoal:true,target:{x:mode==='changed'?330:340,y:-40}};
  g.__v1102Routes={'8:6':{gx:340,gy:-40,index:0,points:[{x:65,y:-235}]}};
  g.moveTank(t,100,0,.1);
  return t.vx;
 }
 assert.ok(run('combat',false)>0,'combat keeps its local waypoint owner');
 assert.ok(run('changed',false)>0,'a different resource goal cannot borrow the old route corner');
 assert.ok(run('heal',true)>0,'an unsafe certified corner must not gain steering authority');
});


test('critical-heal certified corner survives small wall-clearance jitter but not open space',()=>{
 const {Game}=loadCombinedArms();
 function trial(x){
  const g=new Game(),t=tank(8,'guard',{
   x,y:210,ai:{__v172Waypoint:{x:65,y:235},__v172WaypointUntil:11}
  });
  g.firstTerrainHit=()=>({solid:{id:1},hit:{x:-30,y:210,nx:-1,ny:0}});
  g.isTerrainSafe=(px,py,pad)=>!(pad>=21&&px>=-51&&px<=-49);
  g.__v1102RouteContext={lineage:'resource',forceGoal:true,target:{x:340,y:40}};
  g.__v1102Routes={'8:6':{gx:340,gy:40,index:0,points:[{x:-65,y:235}]}};
  g.moveTank(t,100,0,.1);
  return t.vx;
 }
 assert.ok(trial(-50.5)<0,'a 1.5-unit safe-side jitter must not restore the blocked eastward corner');
 assert.ok(trial(-53)>0,'the special authority must stop outside the bounded wall band');
});
