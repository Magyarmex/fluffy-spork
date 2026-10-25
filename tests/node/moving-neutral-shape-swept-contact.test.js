'use strict';
// Real materialized core bullet method + shipping Battlefield overlay.
// The simulated frame moves shapes BEFORE projectile processing, exactly as
// Game.update does; this preserves the physical history missing from endpoint-only fixtures.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const battlefield=fs.readFileSync(path.join(root,'nova-updates/battlefield-v1.6.0.js'),'utf8');
function coreBullets(){
 const marker='    updateBullets(dt) {',at=html.indexOf(marker);
 assert.ok(at>=0,'materialized core method absent');
 let p=at+marker.length,depth=1;
 while(depth&&p<html.length){if(html[p]==='{')depth++;else if(html[p]==='}')depth--;p++;}
 assert.equal(depth,0);
 return new Function('types_1','classes_1','M',
  'return function(dt){'+html.slice(at+marker.length,p-1)+'}')(
  {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2,
   clamp:(x,lo,hi)=>Math.max(lo,Math.min(hi,x))},
  {CLASSES:{scout:{size:15}}},2250);
}
function boot(){
 class Game{
  constructor(){
   this.bullets=[];this.shapes=[];this.tanks=[];this.drones=[];
   this.tmp=[];this.time=1;this.__novaTerrain=[];this.hits=[];
   this.cam={shake:0};this.sfx={explode(){}};
   this.hash={query:(x,y,r,out)=>{
    out.length=0;
    for(const e of this.shapes)
     if(Math.hypot(e.x-x,e.y-y)<=r+(e.r||0))out.push(e);
   }};
  }
 }
 for(const name of ['spawnShape','spawnPlayer','spawnPowerup','tryFire',
  'moveTank','updateDrones','addParticles','addImpactDebris',
  'addRing','damageTank','damageDrone','splashAt','initBulletIntegrity',
  'resolveBulletCollisions','clusterBurst','useAbility','addFlash']){
  Game.prototype[name]=function(){};
 }
 Game.prototype.updateBullets=coreBullets();
 Game.prototype.update=function(dt){
  this.time+=dt;
  if(this.__testShapeMotion)this.__testShapeMotion(dt);
  else for(const s of this.shapes){s.x+=(s.vx||0)*dt;s.y+=(s.vy||0)*dt;}
  this.updateBullets(dt);
 };
 Game.prototype.damageShape=function(s,dmg){s.hp-=dmg;this.hits.push(s.id);};
 Game.prototype.randSpawnPos=()=>({x:1000,y:1000});
 const modules={
  'game/engine':m=>{m.exports.Game=Game;},
  'game/ai':m=>{m.exports.updateAI=()=>{};},
  'game/render':m=>{m.exports.render=()=>{};},
  'game/audio':m=>{m.exports.Sfx=class{};}
 };
 const window={__novaModules:modules};
 new Function('window','console',battlefield)(window,{info(){},warn(){},error(){}});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,id=>id.includes('classes')
  ?{CLASSES:{scout:{size:15}}}:{ARENA_HALF:2250});
 return new m.exports.Game();
}
function bullet(){return{id:3,kind:'bullet',ownerId:1,
 x:0,y:0,vx:1500,vy:0,r:3,dmg:10,pen:0,ttl:1,
 hits:0,dead:false,shell:false,beam:false};}
function world(fps,initialY,vy){
 const g=boot(),dt=1/fps;
 const s={id:5,kind:'shape',type:'crasher',x:10,y:initialY,
  vx:0,vy,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[bullet()];
 for(let i=0;i<Math.ceil(fps/10)&&g.bullets.length;i++)g.update(dt);
 return{hits:g.hits.length,hp:s.hp};
}
for(const fps of [30,60,120,240]){
 test('real shipping moving Crasher contact at '+fps+' Hz',()=>{
  const v=world(fps,17,105);
  assert.equal(v.hits,1,'moving Crasher crosses projectile before it passes');
  assert.equal(v.hp,10);
 });
 test('no phantom hit from moving Crasher at '+fps+' Hz',()=>{
  const v=world(fps,20.5,-105);
  assert.equal(v.hits,0,'Crasher enters old projectile path only after shot passes');
  assert.equal(v.hp,20);
 });
}
test('static neutral shape outside projectile corridor stays untouched',()=>{
 const v=world(30,20.5,0);assert.equal(v.hits,0);assert.equal(v.hp,20);
});
test('stationary neutral shape in projectile corridor still takes damage',()=>{
 const v=world(30,0,0);assert.equal(v.hits,1);assert.equal(v.hp,10);
});
test('materialized production includes Battlefield overlay',()=>{
 assert.ok(html.includes('nova-updates/battlefield-v1.6.0.js'));
});

for(const reverse of [false,true]){
 test('earliest moving Crasher beats a later static shape, reverse='+reverse,()=>{
  const g=boot(),dt=1/30;
  const cr={id:5,kind:'shape',type:'crasher',x:10,y:17,vx:0,vy:105,r:15,hp:20,maxHp:20};
  const later={id:6,kind:'shape',type:'square',x:34,y:0,vx:0,vy:0,r:15,hp:20,maxHp:20};
  g.shapes=reverse?[later,cr]:[cr,later];g.bullets=[bullet()];
  g.update(dt);
  assert.deepEqual(g.hits,[5],'first physical shape must win, regardless of insertion order');
  assert.equal(cr.hp,10);assert.equal(later.hp,20);
 });
}
test('teleported shape does not invent a hit along its relocation gap',()=>{
 const g=boot(),s={id:5,kind:'shape',type:'star',x:10,y:150,
  vx:0,vy:0,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[bullet()];
 g.__testShapeMotion=()=>{s.y=0;}; // instant relocation, not physical movement
 g.update(1/30);
 assert.equal(g.hits.length,0);
 assert.equal(s.hp,20);
});
test('moving shape can be hit on the next frame after a teleport',()=>{
 const g=boot(),s={id:5,kind:'shape',type:'star',x:10,y:150,
  vx:0,vy:0,r:15,hp:20,maxHp:20};
 g.shapes=[s];g.bullets=[bullet()];
 g.__testShapeMotion=()=>{s.y=0;};
 g.update(1/30);assert.equal(g.hits.length,0);
 g.__testShapeMotion=null;g.bullets=[bullet()];
 g.update(1/30);
 assert.equal(g.hits.length,1);
});
