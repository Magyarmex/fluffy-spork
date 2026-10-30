'use strict';
// Issue #147: a nonlethal neutral contact physically before solid cover
// must win over the later wall, even when the frame endpoint lies beyond it.
// Execute the actual materialized Game.updateBullets and shipping Battlefield.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function coreBullets(){
 const marker='    updateBullets(dt) {',start=html.indexOf(marker);
 assert.ok(start>=0,'materialized core missing');
 let pos=start+marker.length,depth=1;
 while(depth&&pos<html.length){if(html[pos]==='{')depth++;else if(html[pos]==='}')depth--;pos++;}
 assert.equal(depth,0);
 return new Function('types_1','classes_1','M',
  'return function(dt){'+html.slice(start+marker.length,pos-1)+'}')(
  {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
  {CLASSES:{scout:{size:15}}},2250);
}
function boot(optimized,full=false){
 class Game{
  constructor(){
   this.time=1;this.nextId=100;this.status='playing';
   this.bullets=[];this.tanks=[];this.shapes=[];this.drones=[];this.tmp=[];
   this.__novaTerrain=[];this.__novaBattlefield={name:'TEST',announced:true,coverBroken:0};
   this.cam={shake:0};this.sfx={};this.hits=[];this.tankById=new Map();
   this.hash={query:(_x,_y,_r,out)=>{out.length=0;out.push(...this.tanks,...this.shapes,...this.drones);}};
  }
 }
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire','updateDrones',
   'moveTank','addParticles','addRing','addFlash','addImpactDebris','splashAt',
   'initBulletIntegrity','resolveBulletCollisions','clusterBurst','weakenBullet',
   'setClass','useAbility','addText','nearestTank'])
  Game.prototype[name]=function(){};
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 Game.prototype.getTank=()=>null;
 Game.prototype.damageShape=function(s,dmg){this.hits.push(s.id);s.hp-=dmg;};
 Game.prototype.damageTank=function(t,dmg){this.hits.push(t.id);t.hp-=dmg;};
 Game.prototype.damageDrone=function(d,dmg){this.hits.push(d.id);d.hp-=dmg;};
 Game.prototype.updateBullets=coreBullets();
 Game.prototype.update=function(dt){this.updateBullets(dt);};
 class Sfx{resume(){}}
 const modules={'game/engine':m=>{m.exports={Game};},
  'game/audio':m=>{m.exports={Sfx};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/render':m=>{m.exports={render(){}};}};
 const context={window:{__novaModules:modules},console:{info(){},warn(){},error(){}},
  Math,Map,Set,Date,Number,Object,performance:{now:()=>0},
  document:{addEventListener(){}},navigator:{}};
 const overlays=full?['sniper-v1.2.0.js','polish-v1.3.1.js',
  'battlefield-v1.6.0.js','apex-disciplines-v1.7.1.js',
  'performance-v1.7.5.js','performance-v1.7.8.js',
  'precision-contact-v1.8.3.js']:['battlefield-v1.6.0.js'];
 if(optimized&&!full)overlays.push('performance-v1.7.5.js');
 for(const file of overlays)vm.runInNewContext(
  fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),context,{filename:file});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,spec=>spec==='./classes'
  ?{CLASSES:{scout:{size:15}}}
  :{ARENA_HALF:2250});
 return m.exports.Game;
}
function trial(Game,{hz=30,vx=30000,squareX=40,wallX=80,
  squareY=0,wallY=0,born=false,moved=false,extraBullet=false,
  extraTank=false,fragile=false,pen=0,extraSquare=false}={}){
 const g=new Game();
 const square={kind:'shape',id:50,type:'square',x:squareX,y:squareY,r:12,hp:fragile?10:100};
 if(born)square.born=g.time;
 if(moved){square.__novaTestMove=true;}
 g.shapes=[square];
 if(extraSquare)g.shapes.push({kind:'shape',id:51,type:'square',
  x:squareX+9,y:squareY,r:12,hp:100});
 g.__novaTerrain=[{id:-51,shape:'rect',x:wallX,y:wallY,w:8,h:80,
  solid:true,destructible:false,hp:0}];
 g.bullets=[{kind:'bullet',id:10,ownerId:1,x:0,y:0,vx,vy:0,
  r:3,dmg:20,ttl:1,pen,hits:0,dead:false,shell:false,beam:false,splash:0}];
 if(extraBullet)g.bullets.push({kind:'bullet',id:11,ownerId:3,
  x:extraBullet==='remote'?1000:20,y:extraBullet==='remote'?1000:0,vx:0,vy:0,r:3,dmg:20,ttl:1,pen:0,hits:0,dead:false});
 if(extraTank)g.tanks.push({kind:'tank',id:2,cls:'scout',alive:true,hp:100,x:30,y:0});
 if(moved){
  const oldUpdate=g.update.bind(g);
  g.update=function(dt){square.x=squareX;square.y=squareY;oldUpdate(dt);};
  // The actual owner would move after the Battlefield snapshot. We inject
  // a witnessed movement inside the core update, not an invented history.
  const original=g.updateBullets.bind(g);
  g.updateBullets=function(dt){square.x=squareX;square.y=squareY+10;return original(dt);};
 }
 g.update(1/hz);
 return {g,square};
}
for(const optimized of [false,true]){
 const Game=boot(optimized),mode=optimized?'optimized':'baseline';
 for(const hz of [30,60,120,240]){
  test(mode+' square physically before cover is hit at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz});
   assert.deepEqual(g.hits,[50],'square must win the physical first contact');
   assert.equal(square.hp,80);
   assert.equal(g.__novaTerrain[0].solid,true);
  });
  test(mode+' square behind cover is never hit at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,squareX:120});
   assert.equal(square.hp,100);
   assert.deepEqual(g.hits,[]);
  });
 }
 test(mode+' actual-speed nonlethal square hit precedes later cover',()=>{
  const {g,square}=trial(Game,{hz:30,vx:1600,squareX:20,wallX:40});
  assert.equal(square.hp,80);
  assert.deepEqual(g.hits,[50]);
 });
 test(mode+' newborn square cannot receive backdated contact',()=>{
  const {g,square}=trial(Game,{born:true});
  assert.equal(square.hp,100);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' competing shot near square preserves original arbitration',()=>{
  const {g,square}=trial(Game,{extraBullet:true});
  assert.equal(square.hp,100);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' remote projectile does not suppress independent square hit',()=>{
  const {g,square}=trial(Game,{extraBullet:'remote'});
  assert.equal(square.hp,80);assert.deepEqual(g.hits,[50]);
 });
 test(mode+' witnessed moving square defers ambiguous first-contact proof',()=>{
  const {g,square}=trial(Game,{moved:true});
  assert.equal(square.hp,100);assert.deepEqual(g.hits,[]);
 });
 test(mode+' two potential square victims defer instead of choosing array order',()=>{
  const {g}=trial(Game,{extraSquare:true});
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' lethal square damage defers to full chronology',()=>{
  const {g,square}=trial(Game,{fragile:true});
  assert.equal(square.hp,10);assert.deepEqual(g.hits,[]);
 });
 test(mode+' piercing rounds keep existing wall arbitration',()=>{
  const {g,square}=trial(Game,{pen:1});
  assert.equal(square.hp,100);assert.deepEqual(g.hits,[]);
 });
 test(mode+' competing tank before square preserves original arbitration',()=>{
  const {g,square}=trial(Game,{extraTank:true});
  assert.equal(square.hp,100);
  assert.ok(g.hits.every(id=>id!==50));
 });
}
test('actual production loads Battlefield before Performance',()=>{
 const b=html.indexOf('nova-updates/battlefield-v1.6.0.js');
 const p=html.indexOf('nova-updates/performance-v1.7.5.js');
 assert.ok(b>=0&&p>b);
});

/* Integration owner: the full shipping collision/presentation overlay stack
 * must not resurrect the wall hit or award a phantom contact behind cover. */
const FullGame=boot(true,true);
for(const hz of [30,60,120,240]){
 test('full shipping collision stack honors square before wall at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz});
  assert.deepEqual(g.hits,[50]);assert.equal(square.hp,80);
 });
 test('full shipping collision stack keeps wall before square at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz,squareX:120});
  assert.deepEqual(g.hits,[]);assert.equal(square.hp,100);
 });
}
