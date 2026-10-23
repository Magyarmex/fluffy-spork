'use strict';
// Contact Spark must not announce a projectile that the shipping Battlefield
// pre-pass destroys before it can enter the player's actual viewport.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

function coreBulletMethod(){
 const marker='    updateBullets(dt) {';
 const start=html.indexOf(marker);
 assert.ok(start>=0,'materialized shipping bullet updater missing');
 let end=start+marker.length,depth=1;
 while(depth&&end<html.length){
  if(html[end]==='{')depth++;
  else if(html[end]==='}')depth--;
  end++;
 }
 assert.equal(depth,0);
 return new Function('types_1','classes_1','M',
  'return function(dt){'+html.slice(start+marker.length,end-1)+'}')(
  {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
  {CLASSES:{scout:{size:15}}},2250);
}
function boot(perf){
 class Hash{
  query(x,y,r,out){out.length=0;}
 }
 class Game{
  constructor(){
   this.time=1;this.status='playing';this.w=800;this.h=600;
   this.cam={x:0,y:0,zoom:1,shake:0};
   this.player={id:1,x:0,y:0,alive:true,isPlayer:true};
   this.bullets=[];this.hash=new Hash();this.tmp=[];
   this.__novaTerrain=[];this.tanks=[];this.drones=[];this.shapes=[];
   this.sfx={shot:0,swoosh:0,novaPrecisionShotCue(){this.shot++;},
    novaPrecisionContactSwoosh(){this.swoosh++;}};
  }
 }
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','initBulletIntegrity',
  'resolveBulletCollisions','addParticles','splashAt','updateDrones','update',
  'addRing','clusterBurst','weakenBullet','addFlash','damageTank','damageShape','damageDrone'])
  Game.prototype[name]=function(){};
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 Game.prototype.moveTank=function(t,vx,vy,dt){t.x+=vx*dt;t.y+=vy*dt;};
 Game.prototype.getTank=()=>null;
 Game.prototype.tryFire=function(t){
  this.bullets.push({kind:'bullet',id:10,ownerId:t.id,x:t.x,y:t.y,
   vx:-650,vy:0,r:3,dmg:20,pen:0,ttl:3,hits:0,dead:false,
   __novaSniperLineage:true,__novaRail:false,beam:false});
 };
 Game.prototype.updateBullets=coreBulletMethod();
 function Sfx(){}
 Sfx.prototype.resume=function(){};
 const mods={
  'game/audio':m=>{m.exports={Sfx};},
  'game/engine':m=>{m.exports={Game};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/render':m=>{m.exports={render(){}};}
 };
 const context={window:{__novaModules:mods},console,Math,Map,Date,
  performance:{now:()=>0}};
 const layers=['battlefield-v1.6.0.js'];
 if(perf)layers.push('performance-v1.7.5.js');
 layers.push('precision-contact-v1.8.3.js');
 for(const f of layers)vm.runInNewContext(
  fs.readFileSync(path.join(root,'nova-updates',f),'utf8'),
  context,{filename:f});
 const m={exports:{}};
 mods['game/engine'](m,m.exports,spec=>{
  if(spec==='./classes')return{CLASSES:{scout:{size:15}}};
  if(spec==='./types')return{ARENA_HALF:2250};
  throw Error('unexpected '+spec);
 });
 return m.exports.Game;
}
function wall(x){
 return {id:-1,kind:'terrain',shape:'rect',x,y:0,w:20,h:200,
  type:'wall',solid:true,destructible:false};
}
for(const perf of [false,true]){
 const mode=perf?'Battlefield + Performance + Contact Spark':
  'Battlefield + Contact Spark';
 for(const fps of [30,60,120,240]){
  test(mode+': '+fps+' Hz permanent wall before viewport suppresses false warning',()=>{
   const Game=boot(perf),g=new Game();
   g.__novaTerrain=[wall(600)];
   g.tryFire({id:7,x:1000,y:0,isPlayer:false,alive:true});
   g.bullets[0].vx=-650*fps;
   g.updateBullets(1/fps);
   assert.equal(g.sfx.shot,1,'distant firing cue remains audible');
   assert.equal(g.sfx.swoosh,0,'blocked round must not produce arrival swoosh');
   assert.equal(g.__v183Contact.sparks.length,0);
  });
  test(mode+': '+fps+' Hz permanent wall inside viewport does not hide arrival',()=>{
   const Game=boot(perf),g=new Game();
   g.__novaTerrain=[wall(200)];
   g.tryFire({id:7,x:1000,y:0,isPlayer:false,alive:true});
   g.bullets[0].vx=-650*fps;
   g.updateBullets(1/fps);
   assert.equal(g.sfx.swoosh,1,'projectile reaches screen before hitting wall');
   assert.equal(g.__v183Contact.sparks.length,1);
  });
 }
}
