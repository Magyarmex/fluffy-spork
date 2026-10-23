'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function boot(){
  function Game(){this.hash={query(x,y,r,out){out.length=0}};this.tmp=[]}
  for(const k of ['spawnPlayer','spawnShape','spawnPowerup','tryFire','initBulletIntegrity','resolveBulletCollisions','addParticles','splashAt','updateDrones','update'])
    Game.prototype[k]=function(){};
  Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
  Game.prototype.moveTank=function(t,vx,vy,dt){t.x+=vx*dt;t.y+=vy*dt};
  Game.prototype.getTank=()=>null;
  Game.prototype.updateBullets=function(dt){for(const b of this.bullets||[]){if(b.dead)continue;b.px=b.x;b.py=b.y;b.x+=(b.vx||0)*dt;b.y+=(b.vy||0)*dt}};
  function Sfx(){} Sfx.prototype.resume=function(){};
  const mods={'game/audio':m=>{m.exports={Sfx}},'game/engine':m=>{m.exports={Game}},'game/ai':m=>{m.exports={updateAI(){}}},'game/render':m=>{m.exports={render(){}}}};
  const ctx={window:{__novaModules:mods},console,Math,Map,Date,performance:{now:()=>0}};
  for(const f of ['battlefield-v1.6.0.js','performance-v1.7.5.js'])
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates',f),'utf8'),ctx,{filename:f});
  const m={exports:{}};mods['game/engine'](m,m.exports,s=>{
    if(s==='./classes')return {CLASSES:{scout:{size:14}}};
    if(s==='./types')return {ARENA_HALF:2250};
    throw Error('unexpected dependency '+s)
  });
  return m.exports.Game;
}
function game(Game,shape='circle'){
 const g=new Game();g.time=1;g.__novaTerrain=[{id:-1,shape,x:0,y:0,r:80,w:160,h:160,solid:true,destructible:false}];return g;
}
function bullet(x,vx){return {x,y:0,vx,vy:0,r:2,dmg:12,ownerId:1,pen:0,dead:false}}
test('origin-inside pillar stops a fast bullet before any travel at 30/60/120/240Hz',()=>{
 const Game=boot();
 for(const fps of [30,60,120,240]){
  const g=game(Game),b=bullet(0,1000);g.bullets=[b];g.updateBullets(1/fps);
  assert.equal(b.dead,true,'missed at '+fps+'Hz');assert.equal(b.x,0);
 }
});
test('barrel may originate inside pillar even when tank center is outside',()=>{
 const Game=boot(),g=game(Game),b=bullet(-67,1000);
 g.bullets=[b];g.updateBullets(.01);assert.equal(b.dead,true);assert.equal(b.x,-67);
});
test('Performance terrain override reports immediate origin contact with padding',()=>{
 const Game=boot(),g=game(Game);
 for(const [x,y] of [[0,0],[10,0],[-50,50]]){
  const h=g.firstTerrainHit(0,0,x,y,0);assert.ok(h);assert.equal(h.hit.t,0);
 }
 const padded=g.firstTerrainHit(-85,0,-100,0,10);
 assert.ok(padded);assert.equal(padded.hit.t,0);
});
test('outside-to-inside entry, misses and dead cover keep their semantics',()=>{
 const Game=boot(),g=game(Game),h=g.firstTerrainHit(-120,0,120,0,0);
 assert.ok(h);assert.ok(Math.abs(h.hit.t-1/6)<1e-12);
 assert.equal(g.firstTerrainHit(-120,120,120,120,0),null);
 g.__novaTerrain[0].solid=false;assert.equal(g.firstTerrainHit(0,0,100,0,0),null);
});
test('LOS occlusion and rectangular origin behavior remain intact',()=>{
 const Game=boot(),g=game(Game);
 assert.equal(g.hasLineOfSight(-120,0,120,0,2),false);
 assert.equal(g.hasLineOfSight(-120,120,120,120,2),true);
 const rect=game(Game,'rect'),h=rect.firstTerrainHit(0,0,10,0,0);
 assert.ok(h);assert.equal(h.hit.t,0);
});
