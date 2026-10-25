'use strict';
// KNOWN-RED acceptance gate for #147/#193. Do NOT merge until a chronological
// resolver orders Cannon fuse and terrain BEFORE applying either side effect.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function materializedCoreUpdater() {
  const marker = '    updateBullets(dt) {', start = html.indexOf(marker);
  assert.ok(start >= 0, 'actual materialized core missing');
  let end = start + marker.length, depth = 1;
  for (; end < html.length && depth; end++) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
  }
  assert.equal(depth, 0, 'core updater unbalanced');
  return new Function('types_1', 'classes_1', 'M',
    'return function(dt){' + html.slice(start + marker.length, end - 1) + '}')(
      { dist2: (ax, ay, bx, by) => (ax-bx)**2 + (ay-by)**2 },
      { CLASSES: { scout: { size: 14 }, cannon: { size: 15 } } }, 2250);
}
const coreUpdate = materializedCoreUpdater();

function boot(performance) {
  function Game() {
    this.hash = { query(_x,_y,_r,out) { out.length = 0; } };
    this.tmp = []; this.cam = { shake: 0 };
  }
  for (const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
    'initBulletIntegrity','resolveBulletCollisions','addParticles','addFlash',
    'addRing','splashAt','updateDrones','update']) Game.prototype[name] = function(){};
  Game.prototype.randSpawnPos = () => ({x:1500,y:1500});
  Game.prototype.moveTank = function(t,vx,vy,dt) {t.x+=vx*dt;t.y+=vy*dt;};
  Game.prototype.getTank = () => null;
  Game.prototype.updateBullets = coreUpdate;
  function Sfx() {}
  Sfx.prototype.resume = function(){};
  const modules = {
    'game/audio': m => {m.exports={Sfx};},
    'game/engine': m => {m.exports={Game};},
    'game/ai': m => {m.exports={updateAI(){}};},
    'game/render': m => {m.exports={render(){}};}
  };
  const ctx = {window:{__novaModules:modules},console:{info(){},warn(){},error(){}},
    Math,Map,Date,performance:{now:()=>0}};
  const files=['disciplines-v1.7.0.js','battlefield-v1.6.0.js'];
  if(performance)files.push('performance-v1.7.5.js');
  for(const file of files)vm.runInNewContext(
    fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),ctx,{filename:file});
  const m={exports:{}};
  modules['game/engine'](m,m.exports,spec=>{
    if(spec==='./classes')return {CLASSES:{scout:{size:14},cannon:{size:15}},
      lineageForClass:id=>id==='cannon'?'cannon':'scout'};
    if(spec==='./types')return {ARENA_HALF:2250};
    throw Error('unexpected dependency '+spec);
  });
  return m.exports.Game;
}

function run(Game,hz,withWall=true){
  const g=new Game(),bursts=[];
  g.time=1;g.__novaBattlefield={coverBroken:0};
  g.__novaTerrain=withWall?[{id:-51,shape:'rect',x:168,y:0,w:20,h:80,
    solid:true,destructible:false}]:[];
  g.clusterBurst=b=>bursts.push({x:b.x,y:b.y});
  g.weakenBullet=()=>{};
  g.bullets=[{kind:'bullet',id:777,ownerId:1,x:146,y:0,
    vx:380,vy:0,r:8.5,dmg:26,ttl:2,shell:true,pen:1,hits:0,dead:false,
    __v17Cannon:true,__v17FuseDist:150,__v17SpawnX:0,__v17SpawnY:0,
    __v17FuseArmed:false,splash:72,splashDmg:.4,color:'#ffb45e'}];
  for(let frame=0;frame<10&&g.bullets.length;frame++){
    g.time+=1/hz;g.updateBullets(1/hz);
  }
  return {g,bursts};
}

for(const optimized of [false,true]){
  const label=optimized?'Battlefield + Performance':'Battlefield';
  const Game=boot(optimized);
  for(const hz of [30,60,120,240]){
    test(label+' Cannon fuse physically before later wall at '+hz+'Hz',()=>{
      // Fuse at x=150: (150-146)/380=0.0105263158s.
      // Wall face x=158, padded contact x=154.175:
      // (154.175-146)/380=0.0215131579s.
      // At 30Hz both events lie in one frame; the earlier fuse must win.
      const {bursts,g}=run(Game,hz,true);
      assert.equal(bursts.length,1,'exactly one shell burst');
      assert.ok(bursts[0].x>=148-1e-6 && bursts[0].x<=150+1e-6,
        'fuse (with existing 2u early tolerance) must precede wall; got x='+bursts[0].x);
      assert.equal(g.bullets.length,0);
    });
    test(label+' unobstructed Cannon fuse remains valid at '+hz+'Hz',()=>{
      const {bursts}=run(Game,hz,false);
      assert.equal(bursts.length,1);
      assert.ok(bursts[0].x>=148-1e-6 && bursts[0].x<=150+1e-6);
    });
  }
}
