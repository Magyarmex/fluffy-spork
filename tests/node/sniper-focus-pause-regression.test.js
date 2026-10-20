'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/sniper-v1.2.0.js'),'utf8');
function boot(){
 let now=100;
 const CLASSES={railgun:{fireMode:'beam',barrels:[{}]},prism:{fireMode:'beam',barrels:[{},{}]},singularity:{fireMode:'beam',barrels:[{}]},gunner:{fireMode:'burst',barrels:[{}]}};
 function Sfx(){} Sfx.prototype.resume=function(){}; Sfx.prototype.shoot=function(){};
 function Game(){this.bullets=[];this.tanks=[];this.time=0;this.w=800;this.h=600;this.cam={x:0,y:0,zoom:1};this.input={firing:false,autofire:false};this.sfx=new Sfx();this.paused=false;}
 Game.prototype.syncHud=function(){};
 Game.prototype.setPaused=function(p){this.paused=!!p;this.syncHud();};
 Game.prototype.tryFire=function(t){for(let i=0;i<CLASSES[t.cls].barrels.length;i++)this.bullets.push({ownerId:t.id,beam:true,dmg:10,vx:100,vy:0,pen:4,r:4});t.fireCd=1;};
 Game.prototype.initBulletIntegrity=function(){};
 Game.prototype.resolveBulletCollisions=function(){};
 Game.prototype.update=function(){};
 Game.prototype.weakenBullet=function(){};
 const modules={'game/classes':m=>m.exports={CLASSES},'game/audio':m=>m.exports={Sfx},'game/engine':m=>m.exports={Game},'game/render':m=>m.exports={render(){}}};
 vm.runInNewContext(src,{window:{__novaModules:modules},console,Math,navigator:{vibrate(){}},performance:{now:()=>now}},{filename:'sniper-v1.2.0.js'});
 const cache={};function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;modules[id](m,m.exports,spec=>{if(spec==='./classes')return load('game/classes');throw Error(spec)});return m.exports;}
 load('game/audio');const E=load('game/engine');load('game/render');return{Game:E.Game,setNow:v=>now=v};
}
for(const [cls,duration] of [['prism',400],['railgun',520],['singularity',650]]){
 test(cls+' pause resets focus; resumed hold does not bank wall time',()=>{
  const {Game,setNow}=boot(),g=new Game(),t={id:42,cls,isPlayer:true,alive:true,fireCd:0,angle:0,hitFlash:0};
  g.player=t;g.tanks=[t];g.input.firing=true;
  setNow(100);g.tryFire(t);setNow(100+duration/2);g.tryFire(t);
  assert.ok(Math.abs(t.__novaFocus-.5)<1e-9);
  g.__novaPlayerHeldFire=true;g.setPaused(true);
  assert.equal(t.__novaFocusStart,0);assert.equal(t.__novaFocus,0);assert.equal(g.__novaPlayerHeldFire,false);
  setNow(100+duration*20);g.setPaused(false);g.update(.016);
  assert.equal(g.bullets.length,0);
  g.tryFire(t);assert.equal(g.bullets.length,0);
  setNow(100+duration*20+duration/2);g.tryFire(t);
  assert.ok(Math.abs(t.__novaFocus-.5)<1e-9);assert.equal(g.bullets.length,0);
 });
}
test('pause preserves AI focus and ordinary player weapons',()=>{
 const {Game}=boot(),g=new Game(),pl={id:1,cls:'gunner',isPlayer:true,__novaFocusStart:123,__novaFocus:.42},ai={id:2,cls:'railgun',isPlayer:false,__novaFocusStart:321,__novaFocus:.77};
 g.player=pl;g.tanks=[pl,ai];g.setPaused(true);
 assert.equal(pl.__novaFocusStart,123);assert.equal(ai.__novaFocusStart,321);
});
test('unpause without a pause transition leaves focus unchanged',()=>{
 const {Game}=boot(),g=new Game(),pl={id:1,cls:'railgun',isPlayer:true,__novaFocusStart:123,__novaFocus:.42};
 g.player=pl;g.tanks=[pl];g.setPaused(false);assert.equal(pl.__novaFocusStart,123);
 g.setPaused(true);assert.equal(pl.__novaFocusStart,0);
});
test('visibility, evolution and pause button all route through setPaused',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 assert.match(html,/document\.hidden && this\.status === 'playing'[\s\S]{0,100}this\.setPaused\(true\)/);
 assert.match(html,/openOffer\(\)[\s\S]{0,110}this\.setPaused\(true\)/);
 assert.match(html,/onPause: \(\) => gameRef\.current\?\.setPaused\(true\)/);
});
