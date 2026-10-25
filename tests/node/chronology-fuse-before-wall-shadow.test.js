'use strict';
// Opt-in, read-only fuse-before-wall chronology audit. The shipping defect remains intentionally unchanged.
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

function boot(performance, enabled=true) {
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
  Game.prototype.clusterBurst = function(b) {this.bursts.push({x:b.x,y:b.y});};
  Game.prototype.updateBullets = coreUpdate;
  function Sfx() {}
  Sfx.prototype.resume = function(){};
  const modules = {
    'game/audio': m => {m.exports={Sfx};},
    'game/engine': m => {m.exports={Game};},
    'game/ai': m => {m.exports={updateAI(){}};},
    'game/render': m => {m.exports={render(){}};}
  };
  const ctx = {window:{__novaModules:modules,__NOVA_CHRONO_SHADOW_ENABLED__:enabled},console:{info(){},warn(){},error(){}},
    Math,Map,Set,Number,Object,Date,performance:{now:()=>0}};
  const files=['battlefield-v1.6.0.js','disciplines-v1.7.0.js'];
  if(performance)files.push('performance-v1.7.5.js');
  files.push('performance-v1.7.8.js');
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

function run(Game,hz,withWall=true,{startX=146,wallX=168,vx=380}={}){
  const g=new Game(),bursts=[];
  g.time=1;g.__novaBattlefield={coverBroken:0};
  g.__novaTerrain=withWall?[{id:-51,shape:'rect',x:wallX,y:0,w:20,h:80,
    solid:true,destructible:false}]:[];
  g.bursts=bursts;
  g.weakenBullet=()=>{};
  g.bullets=[{kind:'bullet',id:777,ownerId:1,x:startX,y:0,
    vx,vy:0,r:8.5,dmg:26,ttl:2,shell:true,pen:1,hits:0,dead:false,
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
    test(label+' diagnostic records fuse-before-wall late burst at '+hz+'Hz',()=>{
      const {bursts,g}=run(Game,hz,true);
      assert.equal(bursts.length,1);
      assert.ok(bursts[0].x>150.1,'shipping bug must still be reproduced');
      const s=g.novaChronoShadowSnapshot();
      assert.equal(s.fuseBeforeWallCandidates,1);
      assert.equal(s.fuseBeforeWallLateBursts,1);
      assert.equal(s.events.some(e=>e.kind==='fuse-before-wall-late-burst'),true);
    });
    test(label+' unobstructed Cannon fuse remains valid at '+hz+'Hz',()=>{
      const {bursts,g}=run(Game,hz,false);
      assert.equal(bursts.length,1);
      assert.ok(bursts[0].x>=148-1e-6 && bursts[0].x<=150+1e-6);
      assert.equal(g.novaChronoShadowSnapshot().fuseBeforeWallCandidates,0);
    });
  }
}

/* Reachable frame-phase variants: the shell starts just below the existing
 * 2u early-fuse threshold (x<148). A preceding frame can legitimately end
 * here without triggering the fuse. The next frame must still honor the
 * earlier programmed fuse, even if it also crosses a wall later. */
for(const optimized of [false,true]){
  const Game=boot(optimized),label=optimized?'Battlefield + Performance':'Battlefield';
  for(const {hz,startX,wallX,vx} of [
    {hz:60,startX:147.9,wallX:168,vx:380},
    {hz:120,startX:147.9,wallX:164.625,vx:380},
    // 380*(1+0.085*8)*1.35 = 861.84u/s with 8 bullet-speed points
    // and Sniper gene; a fast Cannon can encounter the same ordering defect
    // even at 240Hz. Use the actual class-derived speed, not an arbitrary 1k.
    {hz:240,startX:147.9,wallX:164.625,vx:380*(1+0.085*8)*1.35}
  ]){
    test(label+' diagnostic catches reachable subframe phase at '+hz+'Hz',()=>{
      const {bursts,g}=run(Game,hz,true,{startX,wallX,vx});
      assert.equal(bursts.length,1);
      assert.ok(bursts[0].x>150.1);
      const s=g.novaChronoShadowSnapshot();
      assert.equal(s.fuseBeforeWallCandidates,1);
      assert.equal(s.fuseBeforeWallLateBursts,1);
    });
  }
}
for (const hz of [30,60,120,240]) {
  test('disabled shadow has no state or gameplay changes at '+hz+'Hz',()=>{
    const Game=boot(false,false),{g,bursts}=run(Game,hz,true);
    assert.equal(g.__novaChronoShadow,undefined);
    assert.equal(g.novaChronoShadowSnapshot().fuseBeforeWallCandidates,0);
    assert.equal(bursts.length,1);
  });
}
