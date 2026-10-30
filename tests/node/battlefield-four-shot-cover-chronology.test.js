'use strict';
/* #147: four disjoint ordinary shots share one destructible cover in a 30Hz frame.
 * A damages cover, B damages cover, C destroys it, and later F passes
 * through the former cover and hits a downstream tank. The 2500u/s speed
 * is a controlled stress fixture, not a class loadout. */
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

function trial4(Game,order,hz=30,{extraBullet=false,liveDrone=false,newborn=false,credit=false}={}){
 const g=new Game(),dt=1/hz;
 if(credit){g.coverXP=[];g.getTank=id=>({id,alive:true,isPlayer:false});
  g.gainXP=(owner,amount)=>g.coverXP.push([owner.id,amount]);}
 const tank={kind:'tank',id:2,cls:'scout',x:110,y:0,hp:100,alive:true,
  __novaSweepMoveTime:1,__novaSweepPrevX:110,__novaSweepPrevY:0};
 g.tanks=[tank];g.shapes=[];g.drones=[];
 if(liveDrone)g.drones.push({kind:'drone',id:88,ownerId:88,x:1700,y:1700,r:8,hp:20});
 if(typeof g.hash.insert==='function')g.hash.insert(tank);
 g.__novaTerrain=[{id:-1,shape:'rect',x:80,y:0,w:10,h:160,
  solid:true,destructible:true,hp:25,maxHp:300}];
 const shots={
  F:{kind:'bullet',id:10,ownerId:1,x:0,y:0,vx:2500,vy:0,r:3,
   dmg:12,pen:2,ttl:.15,hits:0,dead:false,shell:false,beam:false,splash:0},
  A:{kind:'bullet',id:11,ownerId:3,x:120,y:50,vx:-2500,vy:0,r:3,
   dmg:10,pen:1,ttl:.15,hits:0,dead:false,shell:false,beam:false,splash:0},
  B:{kind:'bullet',id:newborn?101:12,ownerId:4,x:130,y:-50,vx:-2500,vy:0,r:3,
   dmg:10,pen:1,ttl:.15,hits:0,dead:false,shell:false,beam:false,splash:0},
  C:{kind:'bullet',id:13,ownerId:5,x:140,y:75,vx:-2500,vy:0,r:3,
   dmg:10,pen:1,ttl:.15,hits:0,dead:false,shell:false,beam:false,splash:0}
 };
 g.bullets=order.split('').map(k=>shots[k]);
 if(extraBullet)g.bullets.push({kind:'bullet',id:14,ownerId:6,x:1700,y:1700,vx:0,vy:0,r:3,
  dmg:5,pen:1,ttl:.15,hits:0,dead:false,shell:false,beam:false,splash:0});
 for(let i=0;i<Math.ceil(hz*.15);i++){
  /* Witness a stationary tank at the actual current frame timestamp.
   * The production movement owner refreshes this history each tick. */
  g.__novaShapeSweepEpoch=i+1;
  g.__novaFrameStartBulletEpoch=i+1;
  tank.__novaSweepMoveTime=g.time;
  tank.__novaSweepPrevX=tank.x;
  tank.__novaSweepPrevY=tank.y;
  g.updateBullets(dt);g.time+=dt;
 }
 return {tankHp:tank.hp,coverHp:g.__novaTerrain[0]?.hp,hits:g.hits,
  coverXP:g.coverXP||[]};
}
function permutations(s){return s.length===1?[s]:[...s].flatMap((c,i)=>permutations(s.slice(0,i)+s.slice(i+1)).map(t=>c+t));}
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'full shipping overlays':'Battlefield';
 for(const hz of [30,60,120,240]){
  test(label+': four-shot chronological cover breach at '+hz+'Hz',()=>{
   for(const order of permutations('ABCF')){
    const r=trial4(Game,order,hz);
    assert.equal(r.coverHp,0,'third breaker must destroy cover');
    assert.equal(r.tankHp,88,'physical chronology cannot depend on order '+order);
   }
  });
 }
}

for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'full shipping overlays':'Battlefield';
 for(const veto of ['extraBullet','liveDrone','newborn']){
  test(label+': '+veto+' preserves conservative four-shot arbitration',()=>{
   const r=trial4(Game,'FABC',30,{[veto]:true});
   assert.equal(r.tankHp,100,'uncertain multi-shot ordering must abstain');
  });
 }
}

for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'full shipping overlays':'Battlefield';
 test(label+': third physical cover breaker receives the single structural reward',()=>{
  for(const order of ['ABCF','FABC','FCBA']){
   const r=trial4(Game,order,30,{credit:true});
   assert.deepEqual(r.coverXP,[[5,18]],'cover break belongs to C in '+order);
  }
 });
}
