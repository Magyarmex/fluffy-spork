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
  squareY=0,wallY=0,born=false,moved=false,teleport=false,extraBullet=false,
  extraTank=false,fragile=false,pen=1,extraSquare=false,cover=false,
  dmg=12,radius=3,ttl=1,wallHeight=80}={}){
 const g=new Game();
 const square={kind:'shape',id:50,type:'square',x:squareX,y:squareY,r:20,hp:fragile?10:55};
 if(born)square.born=g.time;
 g.shapes=[square];
 if(extraSquare)g.shapes.push({kind:'shape',id:51,type:'square',
  x:squareX+9,y:squareY,r:20,hp:55});
 g.__novaTerrain=[{id:-51,shape:'rect',x:wallX,y:wallY,w:8,h:wallHeight,
  solid:true,destructible:cover,hp:cover?300:0}];
 g.bullets=[{kind:'bullet',id:10,ownerId:1,x:0,y:0,vx,vy:0,
  r:radius,dmg,ttl,pen,hits:0,dead:false,shell:false,beam:false,splash:0}];
 if(extraBullet)g.bullets.push({kind:'bullet',id:11,ownerId:3,
  x:extraBullet==='remote'?1000:0,y:extraBullet==='remote'?1000:0,vx:0,vy:0,r:3,dmg:20,ttl:1,pen:0,hits:0,dead:extraBullet==='dead'});
 if(extraTank)g.tanks.push({kind:'tank',id:2,cls:'scout',alive:true,hp:100,x:30,y:0});
 if(moved||teleport){
  const oldUpdate=g.update.bind(g);
  g.update=function(dt){square.x=squareX;square.y=teleport?120:squareY;oldUpdate(dt);};
  // Capture the actual frame-start shape, then move inside core update.
  const original=g.updateBullets.bind(g);
  g.updateBullets=function(dt){square.x=squareX;square.y=teleport?squareY:squareY+10;return original(dt);};
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
   assert.equal(square.hp,43);
   assert.equal(g.__novaTerrain[0].solid,true);
  });
  test(mode+' square behind cover is never hit at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,squareX:120});
   assert.equal(square.hp,55);
   assert.deepEqual(g.hits,[]);
  });
 }
 /* Regression-first: a shot that reaches both contacts before its lifetime
  * ends must not be discarded merely because TTL < simulation dt.
  * At 30..240 Hz, 30,000u/s x 0.0035s = 105u, past the square
  * (first contact ~17u) and wall (~75u). Both occur before expiry. */
 for(const hz of [30,60,120,240]){
  test(mode+' expiring projectile still hits square before wall at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,ttl:.0035});
   assert.equal(square.hp,43,'first square contact precedes TTL and wall');
   assert.deepEqual(g.hits,[50]);
  });
 }
 /* Real canonical Assassin profile (1500u/s, pen=4, 47 damage,
  * radius 5.8*(1+47*.0085)): a grazing square and a thin separated
  * permanent wall both lie within the final 3ms of flight. The square
  * circle bottom is y=6, while the wall top is y=4: no overlap. */
 for(const hz of [30,60,120,240]){
  test(mode+' expiring Assassin grazes square before thin wall at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,vx:1500,squareX:11,squareY:26,
    wallX:10,wallHeight:8,pen:4,dmg:47,
    radius:5.8*(1+47*.0085),ttl:.003});
   assert.equal(square.hp,8,'actual class weapon must not lose first contact');
   assert.deepEqual(g.hits,[50]);
  });
 }
 test(mode+' expiring pen=0 shot consumes itself before cover',()=>{
  const {g,square}=trial(Game,{hz:30,ttl:.0035,pen:0,cover:true});
  assert.equal(square.hp,43);
  assert.equal(g.__novaTerrain[0].hp,300);
 });
 test(mode+' expiring pen=1 shot damages square then destructible cover',()=>{
  const {g,square}=trial(Game,{hz:30,ttl:.0035,pen:1,cover:true});
  assert.equal(square.hp,43);
  assert.equal(g.__novaTerrain[0].hp,288);
 });
 test(mode+' expiring square after wall is never backdated',()=>{
  const {g,square}=trial(Game,{hz:240,vx:1500,squareX:25,squareY:26,
   wallX:10,wallHeight:8,pen:4,dmg:47,
   radius:5.8*(1+47*.0085),ttl:.003});
  assert.equal(square.hp,55);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' moving square with partial lifetime conservatively defers',()=>{
  const {g,square}=trial(Game,{hz:240,vx:1500,squareX:11,squareY:26,
   wallX:10,wallHeight:8,pen:4,dmg:47,
   radius:5.8*(1+47*.0085),ttl:.003,moved:true});
  assert.equal(square.hp,55);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' actual-speed nonlethal square hit precedes later cover',()=>{
  const {g,square}=trial(Game,{hz:30,vx:2000,squareX:32,wallX:65});
  assert.equal(square.hp,43);
  assert.deepEqual(g.hits,[50]);
 });
 test(mode+' newborn square cannot receive backdated contact',()=>{
  const {g,square}=trial(Game,{born:true});
  assert.equal(square.hp,55);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' competing shot near square preserves original arbitration',()=>{
  const {g,square}=trial(Game,{extraBullet:true});
  assert.equal(square.hp,55);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' remote projectile does not suppress independent square hit',()=>{
  const {g,square}=trial(Game,{extraBullet:'remote'});
  assert.equal(square.hp,43);assert.deepEqual(g.hits,[50]);
 });
 test(mode+' previously dead competing bullet cannot certify its old corridor',()=>{
  const {g,square}=trial(Game,{extraBullet:'dead'});
  assert.equal(square.hp,55);assert.deepEqual(g.hits,[]);
 });
 test(mode+' witnessed bounded square motion receives real first contact',()=>{
  const {g,square}=trial(Game,{moved:true});
  assert.equal(square.hp,43);assert.deepEqual(g.hits,[50]);
 });
 test(mode+' discontinuous square teleport cannot create backdated contact',()=>{
  const {g,square}=trial(Game,{teleport:true});
  assert.equal(square.hp,55);assert.deepEqual(g.hits,[]);
 });
 test(mode+' two potential square victims defer instead of choosing array order',()=>{
  const {g}=trial(Game,{extraSquare:true});
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' lethal square damage defers to full chronology',()=>{
  const {g,square}=trial(Game,{fragile:true});
  assert.equal(square.hp,10);assert.deepEqual(g.hits,[]);
 });
 test(mode+' pen=1 square first then damages later destructible cover',()=>{
  const {g,square}=trial(Game,{cover:true});
  assert.equal(square.hp,43);
  assert.deepEqual(g.hits,[50]);
  assert.equal(g.__novaTerrain[0].hp,288,'surviving pen=1 bullet must still strike cover');
  assert.equal(g.__novaTerrain[0].solid,true);
 });
 test(mode+' pen=0 square first does not damage later destructible cover',()=>{
  const {g,square}=trial(Game,{pen:0,cover:true});
  assert.equal(square.hp,43);
  assert.equal(g.__novaTerrain[0].hp,300,'consumed pen=0 shot never reaches cover');
 });
 test(mode+' pen=0 square hit consumes bullet before later wall',()=>{
  const {g,square}=trial(Game,{pen:0});
  assert.equal(square.hp,43);assert.deepEqual(g.hits,[50]);
  assert.equal(g.__novaTerrain[0].solid,true);
 });
 test(mode+' pen=2 round hits square then permanent wall',()=>{
  const {g,square}=trial(Game,{pen:2});
  assert.equal(square.hp,43);assert.deepEqual(g.hits,[50]);
 });
 test(mode+' canonical Assassin 1500u/s pen=4 hits square before permanent wall',()=>{
  const {g,square}=trial(Game,{hz:30,vx:1500,squareX:30,wallX:57,
    pen:4,dmg:47,radius:5.8*(1+47*.0085)});
  assert.equal(square.hp,8);assert.deepEqual(g.hits,[50]);
 });
 test(mode+' pen=4 destructible wall retains legacy arbitration',()=>{
  const {g,square}=trial(Game,{hz:30,vx:1500,squareX:30,wallX:57,
    pen:4,dmg:47,radius:5.8*(1+47*.0085),cover:true});
  assert.equal(square.hp,55);assert.deepEqual(g.hits,[]);
 });
 test(mode+' competing tank before square preserves original arbitration',()=>{
  const {g,square}=trial(Game,{extraTank:true});
  assert.equal(square.hp,55);
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
 test('full shipping stack honors expiring square before wall at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz,ttl:.0035});
  assert.equal(square.hp,43);assert.deepEqual(g.hits,[50]);
 });
 test('full shipping stack expiring Assassin square-before-wall at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz,vx:1500,squareX:11,squareY:26,
   wallX:10,wallHeight:8,pen:4,dmg:47,
   radius:5.8*(1+47*.0085),ttl:.003});
  assert.equal(square.hp,8);assert.deepEqual(g.hits,[50]);
 });
 test('full shipping collision stack honors square before wall at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz});
  assert.deepEqual(g.hits,[50]);assert.equal(square.hp,43);
 });
 test('full shipping collision stack keeps wall before square at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz,squareX:120});
  assert.deepEqual(g.hits,[]);assert.equal(square.hp,55);
 });
}
