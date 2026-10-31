'use strict';
// Shipping acceptance: Bomber physical TTL versus later terrain chronology (#193/#147).
// Execute the materialized core in Battlefield -> Disciplines -> Performance order.
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

function boot(performance, updateImpl) {
  function Game() {
    this.hash = { query(_x,_y,_r,out) { out.length = 0; } };
    this.tmp = []; this.cam = { shake: 0 };
  }
  for (const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
    'initBulletIntegrity','resolveBulletCollisions','addParticles','addFlash',
    'addRing','splashAt','updateDrones','update']) Game.prototype[name] = function(){};
  if (typeof updateImpl === 'function') Game.prototype.update = updateImpl;
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
  const files=['battlefield-v1.6.0.js','disciplines-v1.7.0.js'];
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


/* Physical-first isolated shell expiry is required to precede later terrain.
 * Earlier wall contact and fragment birth timing remain explicit gates.
 * Contested body/projectile/cover chains remain tracked under #147. */
function runExpiry(Game,hz,{startX=0,vx=6000,ttl=.005,wallX=null,pen=1}={}){
 const g=new Game(),bursts=[];
 g.time=1;g.__novaBattlefield={coverBroken:0};
 g.__novaTerrain=wallX===null?[]:[{id:-51,shape:'rect',x:wallX,y:0,w:4,h:80,
   solid:true,destructible:false,hp:0}];
 g.clusterBurst=b=>bursts.push({x:b.x,y:b.y});
 g.weakenBullet=()=>{};
 g.bullets=[{kind:'bullet',id:777,ownerId:1,x:startX,y:0,
   vx,vy:0,r:3,dmg:26,ttl,shell:true,pen,hits:0,dead:false,
   splash:0,color:'#ffb45e'}];
 for(let frame=0;frame<6&&g.bullets.length;frame++){
  g.time+=1/hz;g.updateBullets(1/hz);
 }
 return {g,bursts};
}
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'optimized':'baseline';
 for(const hz of [30,60,120,240]){
  test('[TTL #193] '+label+' unobstructed Bomber expires at x=30, '+hz+'Hz',()=>{
   const {bursts}=runExpiry(Game,hz);
   assert.equal(bursts.length,1,'one shell, one burst');
   assert.ok(Math.abs(bursts[0].x-30)<1e-6,
    'shell must burst at x=6000*.005=30, not the frame endpoint '+bursts[0].x);
  });
  test('[TTL #193] '+label+' later wall cannot steal earlier shell expiry, '+hz+'Hz',()=>{
   const {bursts}=runExpiry(Game,hz,{wallX:45});
   assert.equal(bursts.length,1);
   assert.ok(Math.abs(bursts[0].x-30)<1e-6,
    'expiry x=30 precedes later wall, got '+bursts[0].x);
  });
 }
 test('[CONTROL] '+label+' wall physically before expiry retains priority',()=>{
  const {bursts}=runExpiry(Game,30,{wallX:18});
  assert.equal(bursts.length,1);
  assert.ok(bursts[0].x<30,'earlier wall still wins');
 });
 test('[CONTROL] '+label+' expiry exactly on 60Hz frame endpoint',()=>{
  const {bursts}=runExpiry(Game,60,{ttl:1/60});
  assert.equal(bursts.length,1);
  assert.ok(Math.abs(bursts[0].x-100)<1e-6);
 });
}

test('[TTL #193] expired Bomber children advance only the remaining subframe',()=>{
 const Game=boot(false),g=new Game(),created=[];
 g.time=1;g.__novaBattlefield={coverBroken:0};g.__novaTerrain=[];
 g.weakenBullet=()=>{};
 g.clusterBurst=function(shell){
  const child={kind:'bullet',id:778,ownerId:1,x:shell.x,y:0,
   vx:300,vy:0,r:3,dmg:2,ttl:1,pen:0,hits:0,dead:false,
   shell:false,beam:false,splash:0};
  created.push(child);this.bullets.push(child);
 };
 g.bullets=[{kind:'bullet',id:777,ownerId:1,x:0,y:0,
  vx:6000,vy:0,r:3,dmg:26,ttl:.005,pen:1,hits:0,dead:false,
  shell:true,beam:false,splash:0}];
 g.updateBullets(1/30);
 assert.equal(created.length,1,'one physical shell creates children once');
 const expected=6000*.005+300*(1/30-.005);
 assert.ok(Math.abs(created[0].x-expected)<1e-6,
  'child should be born at x=30 and advance 0.028333s to x='+expected+
  ', not start at the full-frame shell endpoint '+created[0].x);
});


/* Run350: owned Controller-gene drones cannot delay the physical expiry
 * of their own Bomber shell. Core direct/splash/fragment drone damage all
 * exclude the same ownerId; a hostile drone remains a real contender. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'optimized':'baseline';
 for(const hz of [30,60,120,240]){
  test('[TTL #193] '+label+' own drone does not delay Bomber expiry at '+hz+'Hz',()=>{
   const g=new Game(),bursts=[];
   g.time=1;g.__novaBattlefield={coverBroken:0};g.__novaTerrain=[];
   g.clusterBurst=b=>bursts.push({x:b.x,y:b.y});
   g.weakenBullet=()=>{};
   g.drones=[{kind:'drone',id:4,ownerId:1,x:30,y:0,r:8,hp:50}];
   g.bullets=[{kind:'bullet',id:777,ownerId:1,x:0,y:0,
    vx:6000,vy:0,r:3,dmg:26,ttl:.005,shell:true,pen:1,hits:0,dead:false,
    splash:0,color:'#ffb45e'}];
   for(let frame=0;frame<6&&g.bullets.length;frame++){
    g.time+=1/hz;g.updateBullets(1/hz);
   }
   assert.equal(bursts.length,1);
   assert.ok(Math.abs(bursts[0].x-30)<1e-6,
    'own drone cannot move a shell expiry beyond x=30: '+bursts[0].x);
  });
 }
}

for(const optimized of [false,true]){
 test('[CONTROL] '+(optimized?'optimized':'baseline')+
      ' hostile drone near Bomber expiry retains conservative authority',()=>{
  const Game=boot(optimized),g=new Game(),bursts=[];
  g.time=1;g.__novaBattlefield={coverBroken:0};g.__novaTerrain=[];
  g.clusterBurst=b=>bursts.push({x:b.x,y:b.y});
  g.weakenBullet=()=>{};
  g.drones=[{kind:'drone',id:4,ownerId:2,x:30,y:0,r:8,hp:50}];
  g.bullets=[{kind:'bullet',id:777,ownerId:1,x:0,y:0,
   vx:6000,vy:0,r:3,dmg:26,ttl:.005,shell:true,pen:1,hits:0,dead:false,
   splash:0,color:'#ffb45e'}];
  g.updateBullets(1/30);
  assert.equal(bursts.length,1);
  assert.ok(bursts[0].x>30,'unwitnessed hostile drone still defers early expiry');
 });
}

/* #193: high-penetration Bomber shells are produced by normal penetration
 * upgrades and Sniper gene. Penetration cannot defer expiry when no earlier
 * terrain, body or projectile event exists. Exercise the shipping core and
 * Battlefield/Disciplines/Performance composition at all supported rates. */
for(const optimized of [false,true]){
 const Game=boot(optimized),mode=optimized?'optimized':'baseline';
 for(const pen of [2,3,5]){
  for(const hz of [30,60,120,240]){
   test('[TTL #193] '+mode+' upgraded pen='+pen+' shell expires at physical x=30, '+hz+'Hz',()=>{
    const {bursts}=runExpiry(Game,hz,{pen});
    assert.equal(bursts.length,1,'one upgraded shell, one burst');
    assert.ok(Math.abs(bursts[0].x-30)<1e-6,
     'upgraded shell must expire at x=30, got '+bursts[0].x);
   });
   test('[TTL #193] '+mode+' upgraded pen='+pen+' later wall cannot precede expiry, '+hz+'Hz',()=>{
    const {bursts}=runExpiry(Game,hz,{pen,wallX:400});
    assert.equal(bursts.length,1);
    assert.ok(Math.abs(bursts[0].x-30)<1e-6,
     'far wall cannot extend upgraded shell TTL: '+bursts[0].x);
   });
  }
  test('[TTL #193] '+mode+' upgraded pen='+pen+' earlier permanent wall still wins',()=>{
   const {bursts}=runExpiry(Game,30,{pen,wallX:18});
   assert.equal(bursts.length,1);
   assert.ok(bursts[0].x<30,'wall at x=18 must beat TTL x=30');
  });
 }
}

/* Full canonical Bomber projectile lifetime and speed, rather than only an
 * artificially short remaining TTL. Pen=2 is reachable with a single normal
 * penetration upgrade; pen=3 is reachable with further build investment. */
for(const optimized of [false,true]){
 const Game=boot(optimized),mode=optimized?'optimized':'baseline';
 for(const pen of [2,3])for(const hz of [30,60,120,240]){
  test('[TTL #193] '+mode+' full-lifetime upgraded Bomber shell at '+hz+'Hz pen='+pen,()=>{
   const g=new Game(),bursts=[];
   g.time=1;g.__novaBattlefield={coverBroken:0};g.__novaTerrain=[];
   g.weakenBullet=()=>{};
   g.clusterBurst=b=>bursts.push({x:b.x,y:b.y});
   g.bullets=[{kind:'bullet',id:777,ownerId:1,x:0,y:0,
    vx:360,vy:0,r:8,dmg:20,ttl:1.1,shell:true,pen,
    hits:0,dead:false,splash:45,splashDmg:.3,color:'#ffb45e'}];
   for(let frame=0;frame<300&&g.bullets.length;frame++){
    g.time+=1/hz;g.updateBullets(1/hz);
   }
   assert.equal(bursts.length,1);
   assert.ok(Math.abs(bursts[0].x-396)<1e-6,
    '360u/s * 1.1s = 396u physical range, got '+bursts[0].x);
  });
 }
}

/* Children must inherit the remaining portion of the frame even for an
 * upgraded shell. They must not be born at the frame endpoint or inherit a
 * shortened permanent velocity after this update. */
for(const optimized of [false,true]){
 const Game=boot(optimized),mode=optimized?'optimized':'baseline';
 for(const hz of [30,120])for(const pen of [2,3]){
  test('[TTL #193] '+mode+' pen='+pen+' fragments receive remaining subframe at '+hz+'Hz',()=>{
   const g=new Game(),created=[];
   g.time=1;g.__novaBattlefield={coverBroken:0};g.__novaTerrain=[];
   g.weakenBullet=()=>{};
   g.clusterBurst=function(shell){
    const child={kind:'bullet',id:778,ownerId:1,x:shell.x,y:0,
     vx:300,vy:0,r:3,dmg:2,ttl:1,pen:0,hits:0,dead:false,
     shell:false,beam:false,splash:0};
    created.push(child);this.bullets.push(child);
   };
   g.bullets=[{kind:'bullet',id:777,ownerId:1,x:0,y:0,
    vx:6000,vy:0,r:3,dmg:26,ttl:.005,pen,hits:0,dead:false,
    shell:true,beam:false,splash:0}];
   g.updateBullets(1/hz);
   assert.equal(created.length,1);
   const expected=30+300*(1/hz-.005);
   assert.ok(Math.abs(created[0].x-expected)<1e-6,
    'fragment should travel only post-birth time: '+created[0].x+' vs '+expected);
   assert.equal(created[0].vx,300,'permanent fragment speed unchanged');
  });
 }
}


/* A shell striking solid cover partway through a frame creates fragments at
 * the physical impact instant, not at the beginning of that frame. The
 * pre-core terrain owner creates these children before the core advances
 * every bullet. The original implementation advances them a whole dt,
 * overstating reach and draining their lifetime too early. This regression
 * uses the actual materialized core and shipping Battlefield wrapper. */
function runTerrainChildBirth(Game,hz,ttl=2,wallX=20,shapeX=null){
 const g=new Game(),dt=1/hz,created=[];
 g.time=1;g.__novaBattlefield={coverBroken:0};
 g.__novaTerrain=[{id:-81,shape:'rect',x:wallX,y:0,w:4,h:80,
   solid:true,destructible:false,hp:0}];
 g.weakenBullet=()=>{};
 const shapeHits=[];
 if(Number.isFinite(shapeX)){
  const shape={id:42,kind:'shape',type:'circle',x:shapeX,y:0,
   r:.3,hp:100,flash:0};
  g.shapes=[shape];
  g.hash={query(_x,_y,_r,out){out.length=0;out.push(shape);}};
  g.damageShape=(e,dmg)=>{shapeHits.push({id:e.id,dmg});e.hp-=dmg;};
 }
 g.clusterBurst=function(parent){
  const child={kind:'bullet',id:778,ownerId:1,x:parent.x-10,y:0,
   vx:-300,vy:0,r:3,dmg:2,ttl:1,pen:0,hits:0,dead:false,
   shell:false,beam:false,splash:0};
  created.push({child,startX:child.x,startTTL:child.ttl});
  this.bullets.push(child);
 };
 const shell={kind:'bullet',id:777,ownerId:1,x:0,y:0,
   vx:6000,vy:0,r:3,dmg:26,ttl,pen:0,hits:0,dead:false,
   shell:true,beam:false,splash:0};
 g.bullets=[shell];
 g.updateBullets(dt);
 return {g,dt,shell,created,shapeHits};
}
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'optimized':'baseline';
 for(const hz of [30,60,120,240]){
  for(const ttl of [2,.0035]){
   test('[terrain child birth] '+label+' '+hz+'Hz TTL='+ttl+
    ' advances fragments only after physical wall contact',()=>{
    const {g,dt,shell,created}=runTerrainChildBirth(Game,hz,ttl);
    assert.equal(created.length,1,'one physical wall burst');
    assert.equal(shell.dead,true);
    const {child,startX,startTTL}=created[0];
    const impactT=shell.x/6000;
    assert.ok(impactT>0&&impactT<Math.min(dt,ttl),
      'wall must be struck before shell TTL and frame end');
    assert.ok(Math.abs(child.x-(startX-300*(dt-impactT)))<1e-7,
      'child traveled before it was born: x='+child.x+
      ' expected '+(startX-300*(dt-impactT)));
    assert.ok(Math.abs(child.ttl-(startTTL-(dt-impactT)))<1e-8,
      'child lost pre-birth lifetime');
    assert.equal(child.vx,-300,'full fragment speed restored for next frame');
    assert.equal(g.bullets.length,1,'outward fragment survives; parent consumed');
   });
  }
 }
 test('[terrain child birth] '+label+' wall impact at frame endpoint yields zero newborn travel',()=>{
  const hz=60,dt=1/hz,wallX=6000*dt+2+3*.45;
  const {created}=runTerrainChildBirth(Game,hz,2,wallX);
  assert.equal(created.length,1);
  assert.ok(Math.abs(created[0].child.x-created[0].startX)<1e-6,
    'newborn fragment must not travel before frame-end impact');
  assert.ok(Math.abs(created[0].child.ttl-created[0].startTTL)<1e-8);
 });
}


/* Player-facing consequence: a newly born fragment must not damage a neutral
 * shape beyond its true post-impact travel, but a shape inside the physically
 * reachable corridor must still be damaged. This uses the actual core's body
 * collision plus Battlefield's swept fallback, not just a position assertion. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'optimized':'baseline';
 for(const hz of [30,60,120,240]){
  test('[terrain child contact] '+label+' '+hz+
   'Hz rejects pre-birth shape damage while preserving reachable damage',()=>{
   const dt=1/hz,impactX=20-2-3*.45,impactT=impactX/6000;
   const initialX=impactX-10,finalX=initialX-300*(dt-impactT);
   const unreachable=runTerrainChildBirth(Game,hz,2,20,finalX-3.6);
   assert.equal(unreachable.created.length,1);
   assert.equal(unreachable.shapeHits.length,0,
    'fragment must not hit a neutral beyond its physical birth-time reach');
   const reachable=runTerrainChildBirth(Game,hz,2,20,finalX-3.0);
   assert.equal(reachable.created.length,1);
   assert.equal(reachable.shapeHits.length,1,
    'physically reachable neutral must still take canonical damage');
   assert.equal(reachable.shapeHits[0].dmg,2);
  });
 }
}
