'use strict';
// Bounded first-fuse-before-later-terrain acceptance tests for #147/#193.
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

function run(Game,hz,withWall=true,{startX=146,wallX=168,vx=380,ttl=2,pen=1,cover=false,shell=true,spawnX=0,fuseDist=150,extras=null}={}){
  const g=new Game(),bursts=[];
  g.time=1;g.__novaBattlefield={coverBroken:0};
  g.__novaTerrain=withWall?[{id:-51,shape:'rect',x:wallX,y:0,w:20,h:80,
    solid:true,destructible:cover,hp:cover?100:0}]:[];
  g.clusterBurst=b=>bursts.push({x:b.x,y:b.y});
  g.rings=[];g.addRing=(x,y)=>g.rings.push({x,y});
  g.weakenBullet=()=>{};
  g.bullets=[{kind:'bullet',id:777,ownerId:1,x:startX,y:0,
    vx,vy:0,r:8.5,dmg:26,ttl,shell,pen,hits:0,dead:false,
    __v17Cannon:true,__v17FuseDist:fuseDist,__v17SpawnX:spawnX,__v17SpawnY:0,
    __v17FuseArmed:false,splash:72,splashDmg:.4,color:'#ffb45e'}];
  if(extras)extras(g);
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
    test(label+' reachable subframe phase: fuse beats later wall at '+hz+'Hz',()=>{
      const {bursts}=run(Game,hz,true,{startX,wallX,vx});
      assert.equal(bursts.length,1);
      assert.ok(bursts[0].x>=148-1e-6&&bursts[0].x<=150+1e-6,
        'wall pre-pass must not override earlier fuse; burst x='+bursts[0].x);
    });
  }
}

/* Negative controls: this correction must not steal authority from earlier
 * terrain, nearby bodies, moving drones, competing projectiles or expiry. */
for (const optimized of [false,true]) {
  const Game=boot(optimized),prefix=optimized?'optimized':'baseline';
  test(prefix+' earlier wall still wins before Cannon fuse',()=>{
    const {bursts}=run(Game,30,true,{wallX:160});
    assert.equal(bursts.length,1);
    assert.ok(bursts[0].x<148);
  });
  test(prefix+' later cover receives only physically reachable fuse splash',()=>{
    const {g,bursts}=run(Game,30,true,{cover:true});
    assert.equal(bursts.length,1);
    assert.ok(Math.abs(bursts[0].x-150)<1e-6);
    assert.ok(g.__novaTerrain[0].hp>80&&g.__novaTerrain[0].hp<100,
      'splash may reach cover, but the later direct shell impact must not occur');
  });
  test(prefix+' distant live opponent does not prevent valid fuse',()=>{
    const {bursts}=run(Game,30,true,{extras:g=>{
      g.tanks=[{id:2,kind:'tank',cls:'scout',x:1000,y:1000,alive:true}];
    }});
    assert.equal(bursts.length,1);
    assert.ok(Math.abs(bursts[0].x-150)<1e-6);
  });
  test(prefix+' near hostile tank keeps chronology conservative',()=>{
    const {bursts}=run(Game,30,true,{extras:g=>{
      g.tanks=[{id:2,kind:'tank',cls:'scout',x:151,y:0,alive:true}];
    }});
    assert.equal(bursts.length,1);
    assert.ok(bursts[0].x>150,'do not skip wall while a tank may be hit');
  });
  test(prefix+' live drone keeps chronology conservative',()=>{
    const {bursts}=run(Game,30,true,{extras:g=>{
      g.drones=[{id:4,kind:'drone',x:2000,y:2000,r:8,hp:50}];
    }});
    assert.equal(bursts.length,1);
    assert.ok(bursts[0].x>150);
  });
  test(prefix+' potentially intercepting bullet keeps chronology conservative',()=>{
    const {bursts}=run(Game,30,true,{extras:g=>{
      g.bullets.push({kind:'bullet',id:778,ownerId:8,x:150,y:0,
        vx:0,vy:0,r:3,dmg:5,ttl:2,pen:0,hits:0,dead:false});
    }});
    assert.equal(bursts.length,1);
    assert.ok(bursts[0].x>150);
  });
  test(prefix+' short TTL does not trigger speculative fuse-first shortcut',()=>{
    const {bursts}=run(Game,30,true,{ttl:.005});
    assert.equal(bursts.length,1);
    assert.ok(bursts[0].x>150);
  });
  test(prefix+' high penetration leaves original terrain authority intact',()=>{
    const {bursts}=run(Game,30,true,{pen:2});
    assert.equal(bursts.length,1);
    assert.ok(bursts[0].x>150);
  });
}

for(const optimized of [false,true]){
 const Game=boot(optimized),prefix=optimized?'optimized':'baseline';
 test(prefix+' a relocating neutral shape forces conservative event ordering',()=>{
  const {bursts}=run(Game,30,true,{extras:g=>{
   g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=3;
   g.shapes=[{kind:'shape',id:12,x:2000,y:2000,r:10,hp:10,
     __novaShapeSweepEpoch:3,__novaShapeSweepPrevX:1900,__novaShapeSweepPrevY:2000}];
  }});
  assert.equal(bursts.length,1);
  assert.ok(bursts[0].x>150,'unknown relocation must not be backdated');
 });
 test(prefix+' near-boundary fuse start abstains from numerical speculation',()=>{
  const {bursts}=run(Game,30,true,{startX:149.999999999});
  assert.equal(bursts.length,1);
  assert.ok(bursts[0].x>150);
 });
}

for(const optimized of [false,true]){
 const Game=boot(optimized),prefix=optimized?'optimized':'baseline';
 for(const hz of [30,60,120,240]){
  test(prefix+' ordinary noncluster Cannon airburst precedes later wall at '+hz+'Hz',()=>{
   const phase=hz===30?{startX:146,wallX:168,vx:380}:
     hz===60?{startX:147.9,wallX:168,vx:380}:
     hz===120?{startX:147.9,wallX:164.625,vx:380}:
       {startX:147.9,wallX:164.625,vx:861.84};
   const {g,bursts}=run(Game,hz,true,{...phase,shell:false,pen:0});
   assert.equal(bursts.length,0,'ordinary Cannon does not cluster');
   assert.equal(g.bullets.length,0);
   assert.ok(g.rings.some(r=>Math.abs(r.x-150)<1e-6),
     'ordinary Cannon must detonate at the programmed fuse');
  });
 }
 test(prefix+' owner tank near the muzzle is not mistaken for an opponent',()=>{
  const {bursts}=run(Game,30,true,{extras:g=>{
   g.tanks=[{id:1,kind:'tank',cls:'cannon',x:130,y:0,alive:true}];
  }});
  assert.equal(bursts.length,1);
  assert.ok(Math.abs(bursts[0].x-150)<1e-6);
 });
 test(prefix+' swept shape crossing the projectile corridor prevents speculative skipping',()=>{
  const {bursts}=run(Game,30,true,{extras:g=>{
   g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=5;
   g.shapes=[{kind:'shape',id:16,x:180,y:80,r:10,hp:10,
     __novaShapeSweepEpoch:5,__novaShapeSweepPrevX:150,__novaShapeSweepPrevY:0}];
  }});
  assert.equal(bursts.length,1);
  assert.ok(bursts[0].x>150);
 });
 test(prefix+' distant ordinary shape does not block provable fuse',()=>{
  const {bursts}=run(Game,30,true,{extras:g=>{
   g.shapes=[{kind:'shape',id:17,x:1000,y:1000,r:12,hp:10}];
  }});
  assert.equal(bursts.length,1);
  assert.ok(Math.abs(bursts[0].x-150)<1e-6);
 });
}

for(const optimized of [false,true]){
 const Game=boot(optimized),prefix=optimized?'optimized':'baseline';
 test(prefix+' arena exit later in frame prevents unsafe post-core fuse deferral',()=>{
  // Fuse at x=2204, later wall at x=2210, but full-frame endpoint x=2270
  // is outside the arena. Core would delete the shell before Disciplines.
  const {bursts}=run(Game,30,true,{
   startX:2200,wallX:2223.825,vx:2100,spawnX:2054,fuseDist:150
  });
  assert.equal(bursts.length,1,'must not silently delete a shell at arena exit');
  assert.ok(bursts[0].x>2204,'unsafe case retains existing wall burst');
 });
}

/* Run 347: a distant, observed drone must not globally veto a proven
 * fuse-before-wall event. A nearby, stale, or discontinuously relocated
 * drone remains a chronological ambiguity. */
for(const optimized of [false,true]){
 const Game=boot(optimized),prefix=optimized?'optimized':'baseline';
 test(prefix+' observed distant drone allows earlier Cannon fuse',()=>{
  const {bursts}=run(Game,30,true,{extras:g=>{
   g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=5;
   g.drones=[{id:4,kind:'drone',x:2000,y:2000,r:8,hp:50,
     __novaChronoDroneEpoch:5,__novaChronoDronePrevX:1999,__novaChronoDronePrevY:2000}];
  }});
  assert.equal(bursts.length,1);
  assert.ok(Math.abs(bursts[0].x-150)<1e-6,
   'observed remote drone cannot force a physically later wall burst');
 });
 test(prefix+' observed nearby drone retains collision authority',()=>{
  const {bursts}=run(Game,30,true,{extras:g=>{
   g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=5;
   g.drones=[{id:4,kind:'drone',x:152,y:28,r:8,hp:50,
     __novaChronoDroneEpoch:5,__novaChronoDronePrevX:152,__novaChronoDronePrevY:28}];
  }});
  assert.equal(bursts.length,1);
  assert.ok(bursts[0].x>150,'potential contact must retain existing ordering');
 });
 test(prefix+' stale drone history cannot authorize speculative fuse',()=>{
  const {bursts}=run(Game,30,true,{extras:g=>{
   g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=5;
   g.drones=[{id:4,kind:'drone',x:2000,y:2000,r:8,hp:50,
     __novaChronoDroneEpoch:4,__novaChronoDronePrevX:2000,__novaChronoDronePrevY:2000}];
  }});
  assert.equal(bursts.length,1);
  assert.ok(bursts[0].x>150);
 });
 test(prefix+' discontinuous drone relocation cannot authorize fuse',()=>{
  const {bursts}=run(Game,30,true,{extras:g=>{
   g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=5;
   g.drones=[{id:4,kind:'drone',x:2000,y:2000,r:8,hp:50,
     __novaChronoDroneEpoch:5,__novaChronoDronePrevX:1800,__novaChronoDronePrevY:1800}];
  }});
  assert.equal(bursts.length,1);
  assert.ok(bursts[0].x>150);
 });
}
test('Battlefield Game.update captures live drone start before movement and bullets',()=>{
 const Game=boot(false,function(dt){
  this.time+=dt;
  this.drones[0].x+=2;
  this.updateBullets(dt);
 });
 const g=new Game(),bursts=[];
 g.time=1;g.status='playing';g.tanks=[];g.shapes=[];g.drones=[
  {id:4,kind:'drone',x:1998,y:2000,r:8,hp:50}];
 g.__novaBattlefield={coverBroken:0};
 g.__novaTerrain=[{id:-51,shape:'rect',x:168,y:0,w:20,h:80,
   solid:true,destructible:false,hp:0}];
 g.clusterBurst=b=>bursts.push({x:b.x,y:b.y});
 g.weakenBullet=()=>{};g.rings=[];g.addRing=(x,y)=>g.rings.push({x,y});
 g.bullets=[{kind:'bullet',id:777,ownerId:1,x:146,y:0,vx:380,vy:0,
   r:8.5,dmg:26,ttl:2,shell:true,pen:1,hits:0,dead:false,
   __v17Cannon:true,__v17FuseDist:150,__v17SpawnX:0,__v17SpawnY:0,
   __v17FuseArmed:false,splash:72,splashDmg:.4,color:'#ffb45e'}];
 g.update(1/30);
 assert.equal(bursts.length,1);
 assert.ok(Math.abs(bursts[0].x-150)<1e-6,
   'full shipping update must preserve distant-drone chronology');
 assert.equal(g.__novaShapeSweepActive,false);
});

/* Frame-phase parity and adversarial drone-motion gates. */
for(const optimized of [false,true]){
 const Game=boot(optimized),label=optimized?'optimized':'baseline';
 for(const {hz,startX,wallX,vx} of [
  {hz:60,startX:147.9,wallX:168,vx:380},
  {hz:120,startX:147.9,wallX:164.625,vx:380},
  {hz:240,startX:147.9,wallX:164.625,vx:861.84}
 ]){
  test(label+' remote witnessed drone does not veto fuse at '+hz+'Hz',()=>{
   const {bursts}=run(Game,hz,true,{startX,wallX,vx,extras:g=>{
    g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=8;
    g.drones=[{id:6,kind:'drone',x:2000,y:2000,r:8,hp:50,
      __novaChronoDroneEpoch:8,__novaChronoDronePrevX:1998,__novaChronoDronePrevY:1999}];
   }});
   assert.equal(bursts.length,1);
   assert.ok(Math.abs(bursts[0].x-150)<1e-6);
  });
 }
 test(label+' drone moving across the shot corridor defers',()=>{
  const {bursts}=run(Game,30,true,{extras:g=>{
   g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=9;
   g.drones=[{id:6,kind:'drone',x:170,y:-10,r:8,hp:50,
     __novaChronoDroneEpoch:9,__novaChronoDronePrevX:120,__novaChronoDronePrevY:70}];
  }});
  assert.equal(bursts.length,1);
  assert.ok(bursts[0].x>150);
 });
 test(label+' nonfinite drone history defers instead of granting fuse',()=>{
  const {bursts}=run(Game,30,true,{extras:g=>{
   g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=9;
   g.drones=[{id:6,kind:'drone',x:2000,y:2000,r:8,hp:50,
     __novaChronoDroneEpoch:9,__novaChronoDronePrevX:NaN,__novaChronoDronePrevY:2000}];
  }});
  assert.equal(bursts.length,1);
  assert.ok(bursts[0].x>150);
 });
}
