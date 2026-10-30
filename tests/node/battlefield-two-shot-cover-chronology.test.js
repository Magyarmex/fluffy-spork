'use strict';
/* #147: two ordinary bullets hitting the SAME destructible cover in one
 * 30Hz frame must resolve by physical contact time, not bullet array order.
 * This is a real-speed 2500u/s case with disjoint projectile lanes, a
 * nonlethal Square first, and a downstream tank reached in the next frame.
 * Exercise the materialized Game.updateBullets and actual shipping overlays.
 */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html');
function method(name,args,deps,values){
 const marker='    '+name+'('+args+') {',start=html.indexOf(marker);
 assert.ok(start>=0,'materialized core method '+name);
 let end=start+marker.length,depth=1;
 while(depth&&end<html.length){
  if(html[end]==='{')depth++;
  else if(html[end]==='}')depth--;
  end++;
 }
 assert.equal(depth,0);
 return new Function(...deps,'return function('+args+'){'+
  html.slice(start+marker.length,end-1)+'}')(...values);
}
const CLASSES={scout:{size:14}};
const core=method('updateBullets','dt',['types_1','classes_1','M'],[
 {dist2:(a,b,c,d)=>(a-c)**2+(b-d)**2},{CLASSES},2250]);
function boot(optimized){
 class Game{
  constructor(){
   this.time=1;this.bullets=[];this.tanks=[];this.shapes=[];this.drones=[];
   this.tmp=[];this.__novaTerrain=[];this.__novaBattlefield={coverBroken:0};
   this.cam={shake:0};this.sfx={};this.hits=[];
   this.player={id:999,x:1000,y:1000,alive:true};
   this.__novaShapeSweepActive=true;this.__novaShapeSweepEpoch=1;
   this.__novaFrameStartBulletEpoch=1;
   this.__novaFrameStartBulletIdCeiling=100;
   this.hash={query:(_x,_y,_r,out)=>{
    out.length=0;out.push(...this.tanks,...this.shapes,...this.drones);
   }};
  }
 }
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
  'updateDrones','update','moveTank','addParticles','splashAt',
  'initBulletIntegrity','addRing','addFlash','addImpactDebris',
  'weakenBullet','clusterBurst','damageDrone','setClass','useAbility',
  'nearestTank'])Game.prototype[name]=function(){};
 Game.prototype.getTank=id=>id===1?{id:1,cls:'scout',alive:true}:null;
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 Game.prototype.resolveBulletCollisions=function(){};
 Game.prototype.damageShape=function(s,dmg){this.hits.push(['shape',s.id]);s.hp-=dmg;};
 Game.prototype.damageTank=function(t,dmg){this.hits.push(['tank',t.id]);t.hp-=dmg;};
 Game.prototype.updateBullets=core;
 class Sfx{resume(){}}
 const modules={
  'game/engine':m=>{m.exports={Game}},
  'game/audio':m=>{m.exports={Sfx}},
  'game/ai':m=>{m.exports={updateAI(){}}},
  'game/render':m=>{m.exports={render(){}}}
 };
 const ctx={window:{__novaModules:modules},
  console:{info(){},warn(){},error(){}},Math,Map,Set,Date,Number,Object,
  performance:{now:()=>0},document:{addEventListener(){}},navigator:{}};
 const overlays=optimized?[
  'sniper-v1.2.0.js','polish-v1.3.1.js','battlefield-v1.6.0.js',
  'apex-disciplines-v1.7.1.js','performance-v1.7.5.js',
  'performance-v1.7.8.js','precision-contact-v1.8.3.js'
 ]:['battlefield-v1.6.0.js'];
 for(const file of overlays)vm.runInNewContext(
  read('nova-updates/'+file),ctx,{filename:file});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,spec=>spec==='./classes'
  ?{CLASSES,lineageForClass:()=>null}:{ARENA_HALF:2250});
 return m.exports.Game;
}
function trial(Game,{hz=30,reverse=false,competitor=true,cover=true,
 competitorY=70,competitorX=120,coverHp=1,pen=2,
 shell=false,remoteBullet=false,newborn=false}={}){
 const g=new Game(),dt=1/hz;
 const tank={kind:'tank',id:2,cls:'scout',x:110,y:0,hp:100,alive:true,
  __novaSweepMoveTime:1,__novaSweepPrevX:110,__novaSweepPrevY:0};
 const square={kind:'shape',id:50,type:'square',x:40,y:0,r:20,hp:55,
  __novaShapeSweepEpoch:1,__novaShapeSweepPrevX:40,__novaShapeSweepPrevY:0};
 g.tanks=[tank];g.shapes=[square];
 if(typeof g.hash.insert==='function'){g.hash.insert(tank);g.hash.insert(square);}
 if(cover)g.__novaTerrain=[{id:-1,shape:'rect',x:80,y:0,
  w:10,h:160,solid:true,destructible:true,hp:coverHp,maxHp:300}];
 const focal={kind:'bullet',id:10,ownerId:1,x:0,y:0,vx:2500,vy:0,
  r:3,dmg:12,pen,ttl:.15,hits:0,dead:false,shell:false,beam:false,splash:0};
 const other={kind:'bullet',id:newborn?101:11,ownerId:3,x:competitorX,y:competitorY,
  vx:-2500,vy:0,r:3,dmg:10,pen:0,ttl:.15,hits:0,dead:false,
  shell,beam:false,splash:0};
 g.bullets=competitor?[focal,other]:[focal];
 if(remoteBullet)g.bullets.push({kind:'bullet',id:12,ownerId:12,
  x:1700,y:1600,vx:0,vy:0,r:3,dmg:5,pen:0,ttl:1,
  hits:0,dead:false,shell:false,beam:false,splash:0});
 if(reverse)g.bullets.reverse();
 for(let i=0;i<Math.ceil(hz*.15);i++){
  g.updateBullets(dt);g.time+=dt;
 }
 return {tankHp:tank.hp,squareHp:square.hp,coverHp:g.__novaTerrain[0]?.hp,
  hits:g.hits,pen:focal.pen,coverBroken:g.__novaBattlefield.coverBroken};
}
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'full shipping overlay stack':'Battlefield';
 for(const hz of [30,60,120,240]){
  test(label+': physically earlier cover-breaker preserves later tank hit at '+hz+'Hz',()=>{
   for(const reverse of [false,true]){
    const r=trial(Game,{hz,reverse});
    assert.equal(r.squareHp,43,'earlier Square is hit once');
    assert.equal(r.coverHp,0,'competing shot destroys cover');
    assert.equal(r.tankHp,88,'focal shot reaches tank after the earlier breach');
    assert.deepEqual(r.hits.map(h=>h[0]),['shape','tank']);
   }
  });
 }
 test(label+': no competing breaker retains cover protection',()=>{
  const r=trial(Game,{competitor:false});
  assert.equal(r.tankHp,100);
  assert.equal(r.coverHp,0);
 });
 test(label+': no cover preserves ordinary Square and tank contacts',()=>{
  const r=trial(Game,{competitor:false,cover:false});
  assert.equal(r.squareHp,43);
  assert.equal(r.tankHp,88);
 });
 test(label+': late breaker cannot be promoted ahead of focal cover hit',()=>{
  const r=trial(Game,{competitorX:200});
  assert.equal(r.tankHp,100);
  assert.equal(r.coverHp,0);
 });
 test(label+': insufficient competing damage cannot create a breach',()=>{
  const r=trial(Game,{coverHp:100});
  assert.equal(r.tankHp,100);
  assert.ok(r.coverHp>0);
 });
 test(label+': a third shot preserves conservative existing arbitration',()=>{
  const r=trial(Game,{remoteBullet:true});
  assert.equal(r.tankHp,100);
 });
 test(label+': a newborn competitor cannot be backdated into this frame',()=>{
  const r=trial(Game,{newborn:true});
  assert.equal(r.tankHp,100);
 });
 test(label+': intersecting projectile corridors do not gain speculative priority',()=>{
  const r=trial(Game,{competitorY:0});
  assert.equal(r.tankHp,100);
 });

}
test('actual materialized game includes the corrected Battlefield owner',()=>{
 assert.ok(html.includes('nova-updates/battlefield-v1.6.0.js'));
});
