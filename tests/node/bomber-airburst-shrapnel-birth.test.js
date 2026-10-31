'use strict';
// Real materialized core + Battlefield -> Three Disciplines -> Apex -> Performance.
// Regression for #193: an isolated, physically rewound Cannon airburst must
// not leave its fragments stationary for the remaining fraction of the frame.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function coreMethod(name,arg){
 const marker='    '+name+'('+arg+') {',start=html.indexOf(marker);
 assert.ok(start>=0,'materialized core method '+name+' missing');
 let end=start+marker.length,depth=1;
 for(;end<html.length&&depth;end++){
  if(html[end]==='{')depth++;
  else if(html[end]==='}')depth--;
 }
 assert.equal(depth,0,'unbalanced materialized '+name);
 const types={TAU:Math.PI*2,rnd:(a,b)=>(a+b)/2,
  dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2};
 return new Function('types_1','classes_1','M',
  'return function('+arg+'){'+html.slice(start+marker.length,end-1)+'}')(
  types,{CLASSES:{scout:{size:14},bomber:{size:17}}},2250);
}
const coreUpdate=coreMethod('updateBullets','dt');
const coreCluster=coreMethod('clusterBurst','b');
function boot(optimized,apex){
 function Game(){
  this.hash={query(_x,_y,_r,out){out.length=0;}};
  this.tmp=[];this.cam={shake:0};this.nextId=100;
  this.sfx={explode(){},novaFuseBurst(){}};
  this.__testOwner={id:1,cls:'bomber',kind:'tank',x:-1000,y:-1000,
   alive:true,stats:{damage:0},level:1,angle:0};
  this.tanks=[this.__testOwner];this.shapes=[];this.drones=[];
  this.bullets=[];this.__novaTerrain=[];
  this.__novaBattlefield={coverBroken:0};
  this.time=12;
 }
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
  'initBulletIntegrity','resolveBulletCollisions','addParticles','addFlash',
  'addRing','splashAt','updateDrones','update','weakenBullet',
  'damageShape','damageTank','damageDrone','addText'])
  Game.prototype[name]=function(){};
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 Game.prototype.moveTank=function(t,vx,vy,dt){t.x+=vx*dt;t.y+=vy*dt;};
 Game.prototype.getTank=function(id){return id===1?this.__testOwner:null;};
 Game.prototype.updateBullets=coreUpdate;
 Game.prototype.clusterBurst=coreCluster;
 function Sfx(){}
 Sfx.prototype.resume=function(){};
 const CLASSES={scout:{size:14},bomber:{size:17,bullet:{cluster:6}}};
 const modules={
  'game/audio':m=>{m.exports={Sfx};},
  'game/classes':m=>{m.exports={CLASSES,
   lineageForClass:id=>id==='bomber'?'cannon':'scout'};},
  'game/engine':m=>{m.exports={Game};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/render':m=>{m.exports={render(){}};}
 };
 const ctx={window:{__novaModules:modules},console:{info(){},warn(){},error(){}},
  Math,Map,Date,performance:{now:()=>0}};
 const files=['battlefield-v1.6.0.js','disciplines-v1.7.0.js'];
 if(apex)files.push('apex-disciplines-v1.7.1.js');
 if(optimized)files.push('performance-v1.7.5.js');
 for(const file of files)vm.runInNewContext(
  fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
  ctx,{filename:file});
 const cm={exports:{}};modules['game/classes'](cm,cm.exports,()=>{});
 const em={exports:{}};modules['game/engine'](em,em.exports,spec=>{
  if(spec==='./classes')return cm.exports;
  if(spec==='./types')return {ARENA_HALF:2250};
  throw Error('Unexpected dependency '+spec);
 });
 return em.exports.Game;
}
function fire(Game,hz,opts={}){
 const g=new Game(),dt=1/hz,speed=2000;
 const x0=150-speed*dt*.35;
 const shell={id:70,kind:'bullet',ownerId:1,x:x0,y:0,
  vx:speed,vy:0,r:3,dmg:26,ttl:1,pen:opts.pen??0,hits:0,
  shell:true,beam:false,dead:false,color:'#f80',clusterDmg:8,
  splash:0,__v17Cannon:true,__v17FuseDist:150,
  __v17SpawnX:0,__v17SpawnY:0,__v17FuseArmed:true};
 if(opts.shape)g.shapes.push({id:10,kind:'shape',type:'circle',
  x:150,y:15,r:3,hp:100,vx:0,vy:0});
 if(opts.remoteShape)g.shapes.push({id:11,kind:'shape',type:'circle',
  x:900,y:900,r:12,hp:100,vx:0,vy:0});
 if(opts.terrain)g.__novaTerrain=[{id:-52,shape:'rect',x:150,y:4,
  w:8,h:4,solid:true,destructible:false,hp:0}];
 if(opts.drone)g.drones.push({id:12,kind:'drone',ownerId:9,
  x:150,y:15,r:5,hp:100,vx:0,vy:0});
 if(opts.remoteDrone){
  const d={id:13,kind:'drone',ownerId:9,r:7,hp:100,
   x:opts.remoteDrone==='near'?150:opts.remoteDrone==='crossing'?260:900,
   y:opts.remoteDrone==='near'?15:opts.remoteDrone==='crossing'?0:900,
   speed:240,__novaChronoDronePrevSpeed:240,
   __novaChronoDronePrevV:200,__novaPhase:'form',
   __novaChronoDronePrevPhase:'form',__novaCommitted:false,
   __novaChronoDronePrevCommitted:false};
  if(opts.remoteDrone!=='unknown'){
   g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
   d.__novaChronoDroneEpoch=7;
   d.__novaChronoDronePrevX=opts.remoteDrone==='teleport'?600:
    opts.remoteDrone==='crossing'?330:d.x;
   d.__novaChronoDronePrevY=d.y;
  }
  if(opts.remoteDrone==='dash')d.__novaPhase='dash';
  if(opts.remoteDrone==='speed')d.speed=900;
  if(opts.remoteDrone==='crossing'){
   d.speed=400;d.__novaChronoDronePrevSpeed=400;
  }
  g.drones.push(d);
 }
 if(opts.tank)g.tanks.push({id:2,kind:'tank',cls:'scout',
  x:150,y:45,alive:true,vx:0,vy:0});
 g.bullets=[shell];
 if(opts.otherBullet)g.bullets.push({id:71,kind:'bullet',ownerId:9,
  x:1000,y:1000,vx:0,vy:0,r:3,dmg:1,ttl:1,pen:0,hits:0,
  shell:false,dead:false,color:'#fff'});
 g.updateBullets(dt);
 const children=g.bullets.filter(b=>b.ownerId===1&&b!==shell);
 return {g,dt,shell,children,remain:dt*.65};
}
for(const optimized of [false,true]){
 for(const apex of [false,true]){
  const label=(optimized?'optimized':'baseline')+(apex?'+Apex':'');
  const Game=boot(optimized,apex);
  for(const hz of [30,60,120,240]){
   test(label+' isolated airburst shrapnel advances only after fuse at '+hz+'Hz',()=>{
    const {children,remain}=fire(Game,hz);
    assert.equal(children.length,6,'canonical Bomber child count');
    for(const c of children){
     assert.ok(Math.abs(c.x-c.px-c.vx*remain)<1e-6,
      'missing or excessive physical birth-frame X travel');
     assert.ok(Math.abs(c.y-c.py-c.vy*remain)<1e-6,
      'missing or excessive physical birth-frame Y travel');
     assert.ok(Math.abs(c.ttl-(.7-remain))<1e-6,
      'birth-frame TTL must match actual physical age');
    }
   });
  }

  for(const hz of [30,60,120,240]){
   test(label+' witnessed remote ordinary drone permits safe Cannon fragment birth at '+hz+'Hz',()=>{
    const {children,remain}=fire(Game,hz,{remoteDrone:'witnessed'});
    assert.equal(children.length,6);
    assert.ok(children.every(c=>Math.abs(c.x-c.px-c.vx*remain)<1e-6));
    assert.ok(children.every(c=>Math.abs(c.ttl-(.7-remain))<1e-6));
   });
  }
  for(const mode of ['unknown','near','dash','teleport','speed','crossing']){
   test(label+' remote-drone certificate fails closed for '+mode,()=>{
    const {children}=fire(Game,mode==='crossing'?30:60,{remoteDrone:mode});
    assert.equal(children.length,6);
    assert.ok(children.every(c=>c.x===c.px&&c.y===c.py),
     'uncertified or nearby drone must retain normal collision authority');
    assert.ok(children.every(c=>Math.abs(c.ttl-.7)<1e-8));
   });
  }
  test(label+' near neutral prevents speculative child advance',()=>{
   const {children}=fire(Game,60,{shape:true});
   assert.equal(children.length,6);
   assert.ok(children.every(c=>c.x===c.px&&c.y===c.py),
    'uncertain body/fragment first contact must retain original authority');
   assert.ok(children.every(c=>Math.abs(c.ttl-.7)<1e-8));
  });
  test(label+' unrelated remote neutral does not veto isolated airburst',()=>{
   const {children,remain}=fire(Game,60,{remoteShape:true});
   assert.equal(children.length,6);
   assert.ok(children.every(c=>Math.abs(c.x-c.px-c.vx*remain)<1e-6));
  });
  for(const [kind,opts] of [
   ['terrain',{terrain:true}],['hostile drone',{drone:true}],
   ['near tank',{tank:true}]
  ]){
   test(label+' '+kind+' cannot be bypassed by late shrapnel',()=>{
    const {children}=fire(Game,60,opts);
    assert.equal(children.length,6);
    assert.ok(children.every(c=>c.x===c.px&&c.y===c.py),
     'potential first contact must retain normal collision authority');
    assert.ok(children.every(c=>Math.abs(c.ttl-.7)<1e-8));
   });
  }
  test(label+' next frame uses full fragment velocity',()=>{
   const {g,children,dt}=fire(Game,60);
   assert.equal(children.length,6);
   const before=children.map(c=>({c,x:c.x,y:c.y,ttl:c.ttl,vx:c.vx,vy:c.vy}));
   g.time+=dt;g.updateBullets(dt);
   for(const b of before){
    assert.ok(Math.abs(b.c.x-b.x-b.vx*dt)<1e-6);
    assert.ok(Math.abs(b.c.y-b.y-b.vy*dt)<1e-6);
    assert.ok(Math.abs(b.c.ttl-(b.ttl-dt))<1e-6);
    assert.equal(b.c.vx,b.vx);assert.equal(b.c.vy,b.vy);
   }
  });
  test(label+' competing projectile retains legacy ordering',()=>{
   const {children}=fire(Game,60,{otherBullet:true});
   assert.equal(children.length,6);
   assert.ok(children.every(c=>c.x===c.px&&c.y===c.py));
  });
  test(label+' penetrating Cannon shell retains existing collision authority',()=>{
   const {children}=fire(Game,60,{pen:2});
   assert.equal(children.length,6);
   assert.ok(children.every(c=>c.x===c.px&&c.y===c.py));
  });
 }
}
