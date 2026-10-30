'use strict';
// Count actual Star births, not only Director-created fallback Stars.
// The ordinary Star is usually adopted, so the former denominator was zero
// even when a player physically intercepted that Star.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const files=['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js'];
function boot(){
 const defs={star:{xp:500,speed:78,r:24,hp:340},circle:{xp:10,speed:12,r:12,hp:14}};
 const window={__novaModules:{}};
 function Game(){
  this.time=10;this.nextId=1;this.shapes=[];this.orbs=[];this.tanks=[];
  this.bullets=[];this.status='playing';
 }
 Game.prototype.spawnShape=function(type){
  const d=defs[type],s={id:this.nextId++,kind:'shape',type,x:0,y:0,
   r:d.r,hp:d.hp,maxHp:d.hp,vx:0,vy:0,born:this.time};
  this.shapes.push(s);return s;
 };
 Game.prototype.killShape=function(s){
  const i=this.shapes.indexOf(s);
  if(i>=0)this.shapes.splice(i,1);
  this.orbs.push({id:this.nextId++,xp:defs[s.type].xp,x:s.x,y:s.y});
 };
 Game.prototype.getShape=function(id){return this.shapes.find(s=>s.id===id)||null;};
 Game.prototype.redeploy=function(){this.time=0;};
 Game.prototype.update=function(dt){this.time+=dt;};
 Game.prototype.destroy=function(){};
 Game.prototype.drawMinimap=function(){};
 window.__novaModules['game/engine']=function(module){module.exports.Game=Game;};
 const context={window,Math,Number,Object,Array,Date,JSON,Map,Set,WeakSet,
  performance:{now:()=>0},console:{info(){},warn(){},error(){}}};
 for(const name of files)
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),
   context,{filename:name});
 const module={exports:{}};
 window.__novaModules['game/engine'](module,module.exports,()=>({SHAPE_DEFS:defs}));
 return {g:new module.exports.Game(),LF:window.__NOVA_LIVING_FRONT_INTERNAL__,defs};
}
test('ordinary naturally spawned Star is counted before Director adoption',()=>{
 const {g,LF}=boot();
 const star=g.spawnShape('star');
 assert.equal(g.__lfState.stats.starsSpawned,1);
 assert.equal(star.__lfStarBorn,10);
 assert.equal(LF.snapshot(g).stats.starsSpawned,1);
 g.killShape(star);
 assert.equal(g.__lfState.stats.starsIntercepted,1);
 assert.equal(LF.snapshot(g).starInterceptionRate,1,
  'a real Star kill must not report a 0% rate from a zero denominator');
});
test('created-Star fallback is counted once, not at spawn AND initStar',()=>{
 const {g,LF}=boot();
 const star=g.spawnShape('star');
 assert.equal(g.__lfState.stats.starsSpawned,1);
 LF.initStar(g,g.__lfState,star);
 assert.equal(g.__lfState.stats.starsSpawned,1);
 LF.initStar(g,g.__lfState,star);
 assert.equal(g.__lfState.stats.starsSpawned,1);
 g.killShape(star);
 assert.equal(LF.snapshot(g).starInterceptionRate,1);
});
test('direct created-Star initialization still counts its birth once',()=>{
 const {g,LF,defs}=boot();
 const star={id:42,kind:'shape',type:'star',x:0,y:0,r:24,hp:340};
 g.shapes.push(star);
 const st=LF.ensure(g,defs);
 LF.initStar(g,st,star);
 assert.equal(st.stats.starsSpawned,1);
});
test('redeploy begins a new cohort including surviving Star, not stale denominator',()=>{
 const {g,LF,defs}=boot();
 const star=g.spawnShape('star');
 assert.equal(g.__lfState.stats.starsSpawned,1);
 g.time=25;
 g.redeploy();
 const st=LF.ensure(g,defs);
 assert.equal(st.stats.starsSpawned,1,'a survivor is a real exposure in the new life');
 assert.equal(st.stats.starsIntercepted,0);
 assert.equal(star.__lfStarBorn,-15,'surviving Star age must remain continuous');
 g.killShape(star);
 assert.equal(LF.snapshot(g).starInterceptionRate,1);
});
test('other neutral shapes do not inflate the Star denominator',()=>{
 const {g,LF}=boot();
 for(let i=0;i<20;i++)g.spawnShape('circle');
 assert.equal(g.__lfState.stats.starsSpawned,0);
 assert.equal(LF.snapshot(g).starInterceptionRate,0);
});
test('materialized runtime loads exactly one canonical Core and Instincts owner',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const name of files)
  assert.equal(html.split('src="./nova-updates/'+name+'"').length-1,1);
});
