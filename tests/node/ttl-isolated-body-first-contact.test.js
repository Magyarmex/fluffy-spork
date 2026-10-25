'use strict';
// Bounded physical-first-contact regression for ordinary projectiles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function shippingCoreBullets() {
  const marker = '    updateBullets(dt) {';
  const start = html.indexOf(marker);
  assert.ok(start >= 0, 'materialized core bullet updater missing');
  let end = start + marker.length, depth = 1;
  while (depth && end < html.length) {
    if (html[end] === '{') depth++;
    else if (html[end] === '}') depth--;
    end++;
  }
  assert.equal(depth, 0);
  return new Function('types_1', 'classes_1', 'M',
    'return function(dt){' + html.slice(start + marker.length, end - 1) + '}')(
    { dist2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2 },
    { CLASSES: { scout: { size: 15 } } }, 2250);
}

function boot(updateImpl, optimized = false) {
  class Game {
    constructor() {
      this.time = 1;
      this.bullets = []; this.tmp = []; this.__novaTerrain = [];
      this.tanks = []; this.shapes = []; this.drones = [];
      this.cam = { shake: 0 }; this.sfx = {};
      this.player = { id: 999, x: 1000, y: 1000, alive: true };
      this.hits = 0;
      this.hash = { query: (_x, _y, _r, out) => {
        out.length = 0;
        out.push(...this.tanks, ...this.shapes, ...this.drones);
      } };
    }
  }
  for (const method of ['spawnPlayer', 'spawnShape', 'spawnPowerup',
    'tryFire', 'updateDrones', 'update', 'moveTank', 'addParticles',
    'splashAt', 'initBulletIntegrity', 'addRing', 'addFlash',
    'addImpactDebris', 'damageShape', 'damageDrone', 'weakenBullet',
    'clusterBurst']) Game.prototype[method] = function() {};
  if (typeof updateImpl === 'function') Game.prototype.update = updateImpl;
  Game.prototype.randSpawnPos = () => ({ x: 1500, y: 1500 });
  Game.prototype.getTank = () => null;
  Game.prototype.resolveBulletCollisions = function() {};
  Game.prototype.damageTank = function() { this.hits++; };
  Game.prototype.damageShape = function() { this.hits++; };
  Game.prototype.damageDrone = function() { this.hits++; };
  Game.prototype.updateBullets = shippingCoreBullets();
  class Sfx { resume() {} }
  const modules = {
    'game/engine': m => { m.exports = { Game }; },
    'game/audio': m => { m.exports = { Sfx }; },
    'game/ai': m => { m.exports = { updateAI() {} }; },
    'game/render': m => { m.exports = { render() {} }; }
  };
  const context = { window: { __novaModules: modules },
    console: { info() {}, warn() {}, error() {} },
    Math, Map, Set, Date, performance: { now: () => 0 } };
  const layers = ['battlefield-v1.6.0.js'];
  if (optimized) layers.push('performance-v1.7.5.js');
  for (const file of layers) vm.runInNewContext(fs.readFileSync(path.join(root,
    'nova-updates', file), 'utf8'), context, { filename: file });
  const module = { exports: {} };
  modules['game/engine'](module, module.exports, spec => spec === './classes'
    ? { CLASSES: { scout: { size: 15 } } }
    : { ARENA_HALF: 2250 });
  return module.exports.Game;
}

function simulate(Game, fps, x, velocity, ttl, pen = 0) {
  const g = new Game();
  g.tanks = [{ kind: 'tank', id: 2, x, y: 0,
    cls: 'scout', hp: 100, alive: true }];
  g.bullets = [{ kind: 'bullet', id: 1, ownerId: 1, x: 0, y: 0,
    vx: velocity, vy: 0, r: 3, dmg: 20, ttl, pen,
    hits: 0, dead: false, shell: false, beam: false }];
  for (let i = 0; i < 20 && g.bullets.length; i++) {
    g.updateBullets(1 / fps);
    g.time += 1 / fps;
  }
  return g.hits;
}

const Game = boot();
for (const fps of [30, 60, 120, 240]) {
  test('isolated TTL first-contact: reachable target takes damage before TTL at ' + fps + 'Hz', () => {
    // Swept radius: bullet.r + scout.size + 3 = 21.
    // First contact x=19 at 0.0031667s; expiry x=30 at 0.005s.
    assert.equal(simulate(Game, fps, 40, 6000, .005), 1);
  });
  test('unreachable target beyond TTL never takes phantom damage at ' + fps + 'Hz', () => {
    assert.equal(simulate(Game, fps, 100, 6000, .005), 0);
  });
}

test('isolated TTL first-contact: seeded reachable-body parity across frame rates', () => {
  let seed = 20261024;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const worlds = Array.from({ length: 300 }, () => ({
    x: 30 + rand() * 120, velocity: 3000 + rand() * 6000,
    ttl: .003 + rand() * .027
  }));
  const summary = [];
  for (const fps of [30, 60, 120, 240]) {
    let missed = 0, phantom = 0;
    for (const w of worlds) {
      const expected = (w.x - 21) / w.velocity <= w.ttl;
      const actual = simulate(Game, fps, w.x, w.velocity, w.ttl) > 0;
      if (expected && !actual) missed++;
      if (!expected && actual) phantom++;
    }
    summary.push({ fps, missed, phantom });
  }
  assert.ok(summary.every(s => s.missed === 0 && s.phantom === 0),
    'first-contact TTL violations: ' + JSON.stringify(summary));
});


for (const fps of [30, 60, 120, 240]) {
  test('isolated TTL first-contact: moving scout crossed before TTL is hit at ' + fps + 'Hz', () => {
    const g = new Game();
    g.tanks = [{ kind: 'tank', id: 2, x: 25, y: -20,
      cls: 'scout', hp: 100, alive: true,
      __novaSweepMoveTime: g.time,
      __novaSweepPrevX: 25, __novaSweepPrevY: 20 }];
    g.bullets = [{ kind: 'bullet', id: 1, ownerId: 1, x: 0, y: 0,
      vx: 6000, vy: 0, r: 3, dmg: 20, ttl: .005, pen: 0,
      hits: 0, dead: false, shell: false, beam: false }];
    g.updateBullets(1 / fps);
    assert.equal(g.hits, 1,
      'moving body swept across reachable projectile segment before expiration');
  });
}

/* A real-world-speed acceptance gate: ordinary NOVA weapons use speeds in
 * this range and commonly have base penetration >=1. The first surface
 * contact at x=2 occurs at 0.004s, before expiry at x=2.5. */
for (const fps of [30, 60, 120, 240]) {
  test('isolated TTL first-contact: 500u/s penetrating round hits before TTL at ' + fps + 'Hz', () => {
    assert.equal(simulate(Game, fps, 23, 500, .005, 1), 1);
  });
}


/* Exact TTL == frame step is also a missed hit: core checks <=0 before bodies.
 * First contact at t=.004s, strictly before each 30/60/120/240Hz expiry. */
for (const fps of [30, 60, 120, 240]) {
  test('isolated TTL first-contact: exact-frame TTL penetrating round hits at ' + fps + 'Hz', () => {
    assert.equal(simulate(Game, fps, 23, 500, 1 / fps, 1), 1);
  });
}


/* Run 334: the same real materialized TTL-before-contact defect affects
 * neutral farming and drone combat, not only tank hulls. Ordinary 500u/s
 * projectiles expire at x=2.5; first physical contact is at x=1 (t=.002s).
 * Keep these RED gates until all three body types resolve chronologically. */
for (const kind of ['shape']) {
  for (const fps of [30, 60, 120, 240]) {
    test('isolated TTL first-contact: reachable ' + kind + ' is hit before TTL at ' + fps + 'Hz', () => {
      const g = new Game();
      const target = kind === 'shape'
        ? { kind: 'shape', id: 2, x: 16, y: 0, r: 12, hp: 100 }
        : { kind: 'drone', id: 2, ownerId: 2, x: 13, y: 0, r: 8, hp: 100 };
      if (kind === 'shape') g.shapes = [target];
      else g.drones = [target];
      g.bullets = [{ kind: 'bullet', id: 1, ownerId: 1,
        x: 0, y: 0, vx: 500, vy: 0, r: 3, dmg: 20,
        ttl: .005, pen: 1, hits: 0, dead: false,
        shell: false, beam: false }];
      for (let frame = 0; frame < 20 && g.bullets.length; frame++) {
        g.updateBullets(1 / fps);
        g.time += 1 / fps;
      }
      assert.equal(g.hits, 1,
        kind + ' first contact at x=1 must precede expiry at x=2.5');
    });
  }
}


// Negative controls: a future fix must not create hits past physical TTL.
for (const kind of ['shape']) {
  for (const fps of [30, 60, 120, 240]) {
    test('unreachable ' + kind + ' beyond TTL takes no phantom hit at ' + fps + 'Hz', () => {
      const g = new Game();
      const target = kind === 'shape'
        ? { kind: 'shape', id: 2, x: 30, y: 0, r: 12, hp: 100 }
        : { kind: 'drone', id: 2, ownerId: 2, x: 25, y: 0, r: 8, hp: 100 };
      if (kind === 'shape') g.shapes = [target];
      else g.drones = [target];
      g.bullets = [{ kind: 'bullet', id: 1, ownerId: 1,
        x: 0, y: 0, vx: 500, vy: 0, r: 3, dmg: 20,
        ttl: .005, pen: 1, hits: 0, dead: false,
        shell: false, beam: false }];
      for (let frame = 0; frame < 20 && g.bullets.length; frame++) {
        g.updateBullets(1 / fps);
        g.time += 1 / fps;
      }
      assert.equal(g.hits, 0, 'expiration at x=2.5 precedes any contact');
    });
  }
}


/* Canonical Minigun projectile configuration from materialized CLASSES:
 * speed=480, base radius=3.8, pen=1, ttl=.8. At level 1 the emitted
 * damage is 7.084 and the physical radius is 3.8*(1+7.084*.0085).
 * A canonical Circle at x=396, r=12 is reached at t=.791607s,
 * before expiry at x=384.
 * This is a full-lifetime class-configuration regression, not a fabricated
 * initially short-TTL projectile. Existing 60Hz execution misses it. */
for (const fps of [30, 60, 120, 240]) {
  test('isolated TTL first-contact: full-lifetime Minigun round reaches neutral shape at ' + fps + 'Hz', () => {
    const g = new Game();
    g.shapes = [{ kind: 'shape', id: 2, x: 396, y: 0, r: 12, hp: 100 }];
    g.bullets = [{ kind: 'bullet', id: 1, ownerId: 1,
      x: 0, y: 0, vx: 480, vy: 0, r: 3.8 * (1 + 7.084 * 0.0085), dmg: 7.084,
      ttl: .8, pen: 1, hits: 0, dead: false,
      shell: false, beam: false }];
    for (let frame = 0; frame < 300 && g.bullets.length; frame++) {
      g.updateBullets(1 / fps);
      g.time += 1 / fps;
    }
    assert.equal(g.hits, 1,
      'physical first contact at .791607s must precede .8s expiry');
  });
  test('full-lifetime Minigun round cannot hit shape beyond TTL at ' + fps + 'Hz', () => {
    const g = new Game();
    g.shapes = [{ kind: 'shape', id: 2, x: 405, y: 0, r: 12, hp: 100 }];
    g.bullets = [{ kind: 'bullet', id: 1, ownerId: 1,
      x: 0, y: 0, vx: 480, vy: 0, r: 3.8 * (1 + 7.084 * 0.0085), dmg: 7.084,
      ttl: .8, pen: 1, hits: 0, dead: false,
      shell: false, beam: false }];
    for (let frame = 0; frame < 300 && g.bullets.length; frame++) {
      g.updateBullets(1 / fps);
      g.time += 1 / fps;
    }
    assert.equal(g.hits, 0);
  });
}

/* Safety gates: the partial recovery must abstain rather than steal
 * chronological authority from terrain, projectiles, defenses or drones. */
function isolatedWorld({x=40,vx=6000,ttl=.005,pen=0,extraTanks=[],drones=[],otherBullets=[],terrain=[]}={}){
  const g=new Game();
  g.tanks=[{kind:'tank',id:2,x,y:0,cls:'scout',hp:100,alive:true},...extraTanks];
  g.drones=drones;g.__novaTerrain=terrain;
  g.bullets=[{kind:'bullet',id:1,ownerId:1,x:0,y:0,vx,vy:0,r:3,
    dmg:20,ttl,pen,hits:0,dead:false,shell:false,beam:false},...otherBullets];
  return g;
}
test('partial TTL recovery never crosses earlier permanent cover',()=>{
 const g=isolatedWorld({terrain:[{id:-1,shape:'rect',x:10,y:0,w:4,h:80,solid:true,destructible:false}]});
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
test('partial TTL recovery ignores spatially distant competing bullets',()=>{
 const g=isolatedWorld({otherBullets:[{kind:'bullet',id:4,ownerId:3,x:200,y:200,vx:0,vy:0,r:3,ttl:1,pen:0,hits:0,dead:false}]});
 g.updateBullets(1/30);
 assert.equal(g.hits,1);
});
test('potential earlier projectile interception blocks shortcut',()=>{
 const g=isolatedWorld({otherBullets:[{kind:'bullet',id:4,ownerId:3,x:10,y:0,vx:0,vy:0,r:3,ttl:1,pen:0,hits:0,dead:false}]});
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
test('active drone movement uncertainty blocks shortcut',()=>{
 const g=isolatedWorld({drones:[{kind:'drone',id:5,ownerId:3,x:200,y:200,r:8,hp:20}]});
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
test('spawn-shielded target is not assigned synthetic damage',()=>{
 const g=isolatedWorld();g.tanks[0].spawnShieldT=1;
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
test('explicit allied tank is not damaged by partial TTL recovery',()=>{
 const g=isolatedWorld();g.tanks[0].teamId='blue';
 g.getTank=()=>({id:1,teamId:'blue'});
 g.areAllies=(a,b)=>a.teamId===b.teamId;
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
test('simultaneous body contacts defer to full chronological solver',()=>{
 const g=isolatedWorld({extraTanks:[{kind:'tank',id:3,x:40,y:0,cls:'scout',hp:100,alive:true}]});
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
test('physical arena exit precedes an outside-arena target',()=>{
 const g=isolatedWorld({x:2300});
 g.bullets[0].x=2200;
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
test('splash projectiles retain original arbitration until unified solver',()=>{
 const g=isolatedWorld();g.bullets[0].splash=40;
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});

test('projected-work budget defers all dense simultaneous expirations',()=>{
 const g=isolatedWorld();
 g.bullets=Array.from({length:50},(_,i)=>({kind:'bullet',id:i+1,ownerId:1,
  x:0,y:0,vx:6000,vy:0,r:3,dmg:20,ttl:.005,pen:0,hits:0,
  dead:false,shell:false,beam:false}));
 g.updateBullets(1/30);
 assert.equal(g.hits,0,'no array-order subset may steal kill credit');
});
test('single isolated expiry still works among distant live projectiles',()=>{
 const g=isolatedWorld();
 g.bullets.push(...Array.from({length:200},(_,i)=>({kind:'bullet',id:i+2,
  ownerId:3,x:1000+i*2,y:1000,vx:0,vy:0,r:3,dmg:8,
  ttl:1,pen:0,hits:0,dead:false,shell:false,beam:false})));
 g.updateBullets(1/30);
 assert.equal(g.hits,1);
});

test('same-frame child shape cannot receive backdated projectile contact',()=>{
 const g=isolatedWorld({x:100});
 const child={id:9,kind:'shape',type:'circle',x:12,y:0,r:5,hp:20,maxHp:20,born:g.time};
 g.shapes=[child];
 g.damageShape=(victim,damage)=>{victim.hp-=damage;};
 g.updateBullets(1/30);
 assert.equal(child.hp,20,'newborn has no proven earlier existence interval');
});
test('older neutral shape remains a valid isolated TTL contact',()=>{
 const g=isolatedWorld({x:100});
 const shape={id:9,kind:'shape',type:'circle',x:12,y:0,r:5,hp:20,maxHp:20,born:g.time-1};
 g.shapes=[shape];
 g.damageShape=(victim,damage)=>{victim.hp-=damage;};
 g.updateBullets(1/30);
 assert.equal(shape.hp,0,'older neutral must still receive physical contact');
});

test('distant same-frame child does not suppress an unrelated tank hit',()=>{
 const g=isolatedWorld();
 g.shapes=[{id:9,kind:'shape',type:'circle',x:900,y:900,r:5,hp:20,born:g.time}];
 g.updateBullets(1/30);
 assert.equal(g.hits,1,'only newborn shapes in the swept corridor are ambiguous');
});

/* Run347: the observed drone-motion corridor can exclude remote drones.
 * Unknown, near, stale or discontinuous drone motion remains a blocker. */
for(const hz of [30,60,120,240]){
 test('isolated TTL body contact survives witnessed distant drone at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:28,vx:6000,ttl:.002,drones:[{
   kind:'drone',id:5,ownerId:3,x:1000,y:1000,r:8,hp:20,
   __novaChronoDroneEpoch:7,__novaChronoDronePrevX:999,__novaChronoDronePrevY:1000
  }]});
  g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
  g.updateBullets(1/hz);
  assert.equal(g.hits,1,'remote observed drone must not erase a physical hit');
 });
}
test('nearby witnessed drone preserves authoritative interception order',()=>{
 const g=isolatedWorld({drones:[{
  kind:'drone',id:5,ownerId:3,x:12,y:0,r:8,hp:20,
  __novaChronoDroneEpoch:7,__novaChronoDronePrevX:12,__novaChronoDronePrevY:0
 }]});
 g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
test('witnessed drone crossing the projectile corridor prevents shortcut',()=>{
 const g=isolatedWorld({drones:[{
  kind:'drone',id:5,ownerId:3,x:35,y:-15,r:8,hp:20,
  __novaChronoDroneEpoch:7,__novaChronoDronePrevX:20,__novaChronoDronePrevY:15
 }]});
 g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
test('stale or discontinuous drone history cannot authorize TTL shortcut',()=>{
 for(const drone of [
  {__novaChronoDroneEpoch:6,__novaChronoDronePrevX:1000,__novaChronoDronePrevY:1000},
  {__novaChronoDroneEpoch:7,__novaChronoDronePrevX:800,__novaChronoDronePrevY:800},
  {__novaChronoDroneEpoch:7,__novaChronoDronePrevX:NaN,__novaChronoDronePrevY:1000}
 ]){
  const g=isolatedWorld({drones:[{kind:'drone',id:5,ownerId:3,
   x:1000,y:1000,r:8,hp:20,...drone}]});
  g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
  g.updateBullets(1/30);
  assert.equal(g.hits,0);
 }
});
test('real Battlefield Game.update snapshots distant drone before projectile TTL',()=>{
 const FullGame=boot(function(dt){
  this.time+=dt;
  this.drones[0].x+=2;
  this.updateBullets(dt);
 });
 const g=new FullGame();
 g.tanks=[{kind:'tank',id:2,x:28,y:0,cls:'scout',hp:100,alive:true}];
 g.drones=[{kind:'drone',id:5,ownerId:3,x:1000,y:1000,r:8,hp:20}];
 g.bullets=[{kind:'bullet',id:1,ownerId:1,x:0,y:0,vx:6000,vy:0,
  r:3,dmg:20,ttl:.002,pen:0,hits:0,dead:false,shell:false,beam:false}];
 g.update(1/30);
 assert.equal(g.hits,1,'materialized Game.update must allow remote-drone hit');
 assert.equal(g.__novaShapeSweepActive,false);
});

test('extreme-speed remote drone cannot be ruled out by TTL shortcut',()=>{
 const g=isolatedWorld({drones:[{kind:'drone',id:5,ownerId:3,
  x:500,y:0,r:8,hp:20,speed:4000,
  __novaChronoDroneEpoch:7,__novaChronoDronePrevX:500,__novaChronoDronePrevY:0}]});
 g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
 g.updateBullets(1/30);
 assert.equal(g.hits,0,'a high-speed drone can traverse this corridor');
});
test('nonfinite drone speed keeps TTL recovery conservative',()=>{
 const g=isolatedWorld({drones:[{kind:'drone',id:5,ownerId:3,
  x:1000,y:1000,r:8,hp:20,speed:NaN,
  __novaChronoDroneEpoch:7,__novaChronoDronePrevX:1000,__novaChronoDronePrevY:1000}]});
 g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});


/* Run349: a remote tank's defensive state cannot cancel a physically valid
 * contact with a different, unprotected tank. Broad-phase must precede
 * defensive/alliance uncertainty, while near contenders remain conservative. */
for (const hz of [30,60,120,240]) {
 test('remote spawn-shielded tank does not suppress TTL hit at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:28,vx:6000,ttl:.002,extraTanks:[{
   kind:'tank',id:3,x:1000,y:1000,cls:'scout',hp:100,alive:true,
   spawnShieldT:1,shieldT:1,bulwarkT:1,tauntT:1
  }]});
  g.updateBullets(1/hz);
  assert.equal(g.hits,1,'distant defensive tank must not erase the reachable hit');
 });
 test('remote allied tank does not suppress TTL hit at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:28,vx:6000,ttl:.002,extraTanks:[{
   kind:'tank',id:3,x:1000,y:1000,cls:'scout',hp:100,alive:true,teamId:'red'
  }]});
  g.tanks[0].teamId='blue';
  g.getTank=()=>({id:1,teamId:'red'});
  g.areAllies=(a,b)=>a.teamId===b.teamId;
  g.updateBullets(1/hz);
  assert.equal(g.hits,1,'distant ally must not cancel an unrelated enemy contact');
 });
}
test('near shielded contender still defers physical TTL contact',()=>{
 const g=isolatedWorld({x:40,extraTanks:[{
  kind:'tank',id:3,x:20,y:0,cls:'scout',hp:100,alive:true,spawnShieldT:1
 }]});
 g.updateBullets(1/30);
 assert.equal(g.hits,0,'nearby defensive collision remains chronologically uncertain');
});
test('near allied contender still defers physical TTL contact',()=>{
 const g=isolatedWorld({x:40,extraTanks:[{
  kind:'tank',id:3,x:20,y:0,cls:'scout',hp:100,alive:true,teamId:'blue'
 }]});
 g.tanks[0].teamId='red';
 g.getTank=()=>({id:1,teamId:'blue'});
 g.areAllies=(a,b)=>a.teamId===b.teamId;
 g.updateBullets(1/30);
 assert.equal(g.hits,0,'nearby allied collision remains chronologically uncertain');
});


/* Verify the real Game.update wrapper captures the moving shielded tank
 * before the projectile updater; also run the optimized production layer. */
for (const optimized of [false, true]) {
 for (const hz of [30, 60, 120, 240]) {
  test('materialized update ignores remote moving shielded tank ('+
       (optimized?'optimized':'baseline')+', '+hz+'Hz)',()=>{
   const FullGame=boot(function(dt){
    this.time+=dt;
    const remote=this.tanks[1];
    remote.__novaSweepPrevX=remote.x;remote.__novaSweepPrevY=remote.y;
    remote.x+=2;remote.__novaSweepMoveTime=this.time;
    this.updateBullets(dt);
   },optimized);
   const g=new FullGame();
   g.tanks=[
    {kind:'tank',id:2,x:28,y:0,cls:'scout',hp:100,alive:true},
    {kind:'tank',id:3,x:1000,y:1000,cls:'scout',hp:100,alive:true,spawnShieldT:1}
   ];
   g.bullets=[{kind:'bullet',id:1,ownerId:1,x:0,y:0,vx:6000,vy:0,
    r:3,dmg:20,ttl:.002,pen:0,hits:0,dead:false,shell:false,beam:false}];
   g.update(1/hz);
   assert.equal(g.hits,1,'remote moving spawn shield must not suppress hit');
  });
 }
}


test('remote shield with witnessed small movement still permits TTL hit',()=>{
 const g=isolatedWorld({x:28,vx:6000,ttl:.002,extraTanks:[{
  kind:'tank',id:3,x:1000,y:1000,cls:'scout',hp:100,alive:true,spawnShieldT:1,
  __novaSweepPrevX:999,__novaSweepPrevY:1000
 }]});
 g.tanks[1].__novaSweepMoveTime=g.time;
 g.updateBullets(1/30);
 assert.equal(g.hits,1);
});
test('shielded tank crossing the shot corridor remains ambiguous',()=>{
 const g=isolatedWorld({x:28,vx:6000,ttl:.002,extraTanks:[{
  kind:'tank',id:3,x:1000,y:1000,cls:'scout',hp:100,alive:true,spawnShieldT:1,
  __novaSweepPrevX:20,__novaSweepPrevY:0
 }]});
 g.tanks[1].__novaSweepMoveTime=g.time;
 g.updateBullets(1/30);
 assert.equal(g.hits,0,'observed moving protected tank could have intercepted');
});
test('nonfinite moving-tank history cannot authorize speculative TTL damage',()=>{
 for (const position of ['target','remote']) {
  const g=isolatedWorld({x:28,vx:6000,ttl:.002,extraTanks:[{
   kind:'tank',id:3,x:1000,y:1000,cls:'scout',hp:100,alive:true,spawnShieldT:1
  }]});
  const tank=position==='target'?g.tanks[0]:g.tanks[1];
  tank.__novaSweepMoveTime=g.time;
  tank.__novaSweepPrevX=NaN;tank.__novaSweepPrevY=0;
  g.updateBullets(1/30);
  assert.equal(g.hits,0,'invalid '+position+' movement must defer');
 }
});


/* Run350: an owned drone is not a projectile interceptor. A hostile drone
 * can only veto an earlier tank/shape contact if its observed movement could
 * reach the bullet BEFORE that contact, not merely before projectile expiry.
 * These tests execute the shipping core + Battlefield (and optimized update
 * composition separately), not a stand-alone collision helper. */
for (const hz of [30,60,120,240]) {
 test('TTL contact ignores own drone on projectile corridor at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:28,vx:6000,ttl:.002,drones:[{
   kind:'drone',id:5,ownerId:1,x:4,y:0,r:8,hp:20
  }]});
  // Owned drones do not require hostile-motion evidence.
  g.updateBullets(1/hz);
  assert.equal(g.hits,1,'own drone cannot veto a reachable enemy tank hit');
 });
 test('TTL contact precedes witnessed hostile drone beyond first body at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:28,vx:6000,ttl:.002,drones:[{
   kind:'drone',id:5,ownerId:3,x:53,y:0,r:8,hp:20,
   __novaChronoDroneEpoch:7,__novaChronoDronePrevX:53,__novaChronoDronePrevY:0
  }]});
  g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
  g.updateBullets(1/hz);
  assert.equal(g.hits,1,'later remote drone must not erase earlier physical contact');
 });
 test('TTL contact still defers witnessed hostile drone ahead of body at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:28,vx:6000,ttl:.002,drones:[{
   kind:'drone',id:5,ownerId:3,x:8,y:0,r:8,hp:20,
   __novaChronoDroneEpoch:7,__novaChronoDronePrevX:8,__novaChronoDronePrevY:0
  }]});
  g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
  g.updateBullets(1/hz);
  assert.equal(g.hits,0,'potential earlier drone contact must keep original authority');
 });
}
test('moving hostile drone crossing the first-contact corridor remains ambiguous',()=>{
 const g=isolatedWorld({x:28,vx:6000,ttl:.002,drones:[{
  kind:'drone',id:5,ownerId:3,x:4,y:0,r:8,hp:20,
  __novaChronoDroneEpoch:7,__novaChronoDronePrevX:30,__novaChronoDronePrevY:20
 }]});
 g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
test('stale hostile drone behind the first contact cannot authorize shortcut',()=>{
 const g=isolatedWorld({x:28,vx:6000,ttl:.002,drones:[{
  kind:'drone',id:5,ownerId:3,x:53,y:0,r:8,hp:20,
  __novaChronoDroneEpoch:6,__novaChronoDronePrevX:53,__novaChronoDronePrevY:0
 }]});
 g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});
for(const optimized of [false,true]){
 test('materialized update permits own drone and later hostile drone ('+
      (optimized?'optimized':'baseline')+')',()=>{
  const FullGame=boot(function(dt){
   this.time+=dt;
   this.updateBullets(dt);
  },optimized);
  const g=new FullGame();
  g.tanks=[{kind:'tank',id:2,x:28,y:0,cls:'scout',hp:100,alive:true}];
  g.drones=[
   {kind:'drone',id:5,ownerId:1,x:4,y:0,r:8,hp:20},
   {kind:'drone',id:6,ownerId:3,x:53,y:0,r:8,hp:20}
  ];
  g.bullets=[{kind:'bullet',id:1,ownerId:1,x:0,y:0,vx:6000,vy:0,
   r:3,dmg:20,ttl:.002,pen:0,hits:0,dead:false,shell:false,beam:false}];
  g.update(1/30);
  assert.equal(g.hits,1);
  assert.equal(g.__novaShapeSweepActive,false);
 });
}

for(const hz of [30,60,120,240]){
 test('neutral first contact survives own and later hostile drones at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:200,vx:500,ttl:.002,pen:1,drones:[
   {kind:'drone',id:5,ownerId:1,x:.3,y:0,r:8,hp:20},
   {kind:'drone',id:6,ownerId:3,x:43,y:0,r:8,hp:20,
    __novaChronoDroneEpoch:7,__novaChronoDronePrevX:43,__novaChronoDronePrevY:0}
  ]});
  const shape={kind:'shape',id:9,type:'circle',x:15.5,y:0,r:12,hp:100,born:g.time-1};
  g.shapes=[shape];
  g.damageShape=(target,damage)=>{target.hp-=damage;g.hits++;};
  g.__novaShapeSweepActive=true;g.__novaShapeSweepEpoch=7;
  g.updateBullets(1/hz);
  assert.equal(g.hits,1,'neutral farming hit must not depend on unrelated drones');
  assert.equal(shape.hp,80);
 });
}

/* Canonical Minigun round reaches a Circle near its natural .8s lifetime.
 * A same-owner Controller drone on that firing lane cannot suppress farming. */
for(const hz of [30,60,120,240]){
 test('full-lifetime Minigun farming ignores owned drone at '+hz+'Hz',()=>{
  const g=new Game();
  g.shapes=[{kind:'shape',id:2,x:396,y:0,r:12,hp:100,born:g.time-1}];
  g.drones=[{kind:'drone',id:5,ownerId:1,x:380,y:0,r:8,hp:20}];
  g.bullets=[{kind:'bullet',id:1,ownerId:1,x:0,y:0,vx:480,vy:0,
   r:3.8*(1+7.084*.0085),dmg:7.084,ttl:.8,pen:1,
   hits:0,dead:false,shell:false,beam:false}];
  for(let frame=0;frame<300&&g.bullets.length;frame++){
   g.updateBullets(1/hz);g.time+=1/hz;
  }
  assert.equal(g.hits,1,'owner drone is transparent to Minigun neutral contact');
 });
}


/* Run351: an unrelated stationary shielded or allied tank PHYSICALLY AFTER
 * an earlier unprotected contact must not veto that first contact. A blocker
 * before or simultaneous with the hit remains authoritative/uncertain. */
for (const hz of [30,60,120,240]) {
 test('later stationary spawn shield does not erase earlier TTL hit at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:28,vx:12000,ttl:.004,extraTanks:[{
   kind:'tank',id:3,x:60,y:0,cls:'scout',hp:100,alive:true,spawnShieldT:1
  }]});
  const victims=[];g.damageTank=e=>victims.push(e.id);
  g.updateBullets(1/hz);
  assert.deepEqual(victims,[2],'only the physically earlier unshielded tank is hit');
 });
 test('later stationary ally does not erase earlier TTL hit at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:28,vx:12000,ttl:.004,extraTanks:[{
   kind:'tank',id:3,x:60,y:0,cls:'scout',hp:100,alive:true,teamId:'blue'
  }]});
  g.tanks[0].teamId='red';
  g.getTank=()=>({id:1,teamId:'blue'});
  g.areAllies=(a,b)=>a.teamId===b.teamId;
  const victims=[];g.damageTank=e=>victims.push(e.id);
  g.updateBullets(1/hz);
  assert.deepEqual(victims,[2],'later ally cannot veto earlier enemy hit');
 });
 test('earlier stationary shield still vetoes TTL shortcut at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:60,vx:12000,ttl:.004,extraTanks:[{
   kind:'tank',id:3,x:20,y:0,cls:'scout',hp:100,alive:true,spawnShieldT:1
  }]});
  g.updateBullets(1/hz);
  assert.equal(g.hits,0);
 });
}
test('moving protected tank beyond hit remains conservative',()=>{
 const g=isolatedWorld({x:28,vx:12000,ttl:.004,extraTanks:[{
  kind:'tank',id:3,x:60,y:0,cls:'scout',hp:100,alive:true,spawnShieldT:1,
  __novaSweepPrevX:58,__novaSweepPrevY:0
 }]});
 g.tanks[1].__novaSweepMoveTime=g.time;
 g.updateBullets(1/30);
 assert.equal(g.hits,0,'moving shield chronology is not certified');
});
test('same-location shield and unshielded contact remains conservative',()=>{
 const g=isolatedWorld({x:28,vx:12000,ttl:.004,extraTanks:[{
  kind:'tank',id:3,x:28,y:0,cls:'scout',hp:100,alive:true,spawnShieldT:1
 }]});
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});


/* Adjacent defenses and neutral farming share the same first-event rule. */
for(const field of ['shieldT','bulwarkT','tauntT']){
 test('later stationary '+field+' cannot erase earlier TTL hit',()=>{
  const late={kind:'tank',id:3,x:60,y:0,cls:'scout',hp:100,alive:true};
  late[field]=1;
  const g=isolatedWorld({x:28,vx:12000,ttl:.004,extraTanks:[late]});
  const victims=[];g.damageTank=e=>victims.push(e.id);
  g.updateBullets(1/30);
  assert.deepEqual(victims,[2]);
 });
}
test('near-miss protected tank cannot veto earlier hit',()=>{
 const g=isolatedWorld({x:28,vx:12000,ttl:.004,extraTanks:[{
  kind:'tank',id:3,x:60,y:20,cls:'scout',hp:100,alive:true,spawnShieldT:1
 }]});
 const victims=[];g.damageTank=e=>victims.push(e.id);
 g.updateBullets(1/30);
 assert.deepEqual(victims,[2]);
});
test('multiple later protected tanks do not veto earliest valid hit',()=>{
 const g=isolatedWorld({x:28,vx:12000,ttl:.004,extraTanks:[
  {kind:'tank',id:3,x:60,y:0,cls:'scout',hp:100,alive:true,spawnShieldT:1},
  {kind:'tank',id:4,x:65,y:0,cls:'scout',hp:100,alive:true,shieldT:1}
 ]});
 const victims=[];g.damageTank=e=>victims.push(e.id);
 g.updateBullets(1/30);
 assert.deepEqual(victims,[2]);
});
test('earlier neutral shape can be farmed ahead of later protected tank',()=>{
 const g=isolatedWorld({x:100,vx:12000,ttl:.004,extraTanks:[{
  kind:'tank',id:3,x:60,y:0,cls:'scout',hp:100,alive:true,spawnShieldT:1
 }]});
 const shape={kind:'shape',id:8,x:15,y:0,r:5,hp:20,born:g.time-1};
 g.shapes=[shape];
 const hits=[];g.damageShape=e=>hits.push(e.id);
 g.updateBullets(1/30);
 assert.deepEqual(hits,[8]);
});
test('moving allied tank in corridor still vetoes unproven contact order',()=>{
 const g=isolatedWorld({x:28,vx:12000,ttl:.004,extraTanks:[{
  kind:'tank',id:3,x:60,y:0,cls:'scout',hp:100,alive:true,teamId:'blue',
  __novaSweepPrevX:58,__novaSweepPrevY:0
 }]});
 g.tanks[0].teamId='red';g.getTank=()=>({id:1,teamId:'blue'});
 g.areAllies=(a,b)=>a.teamId===b.teamId;
 g.tanks[1].__novaSweepMoveTime=g.time;
 g.updateBullets(1/30);
 assert.equal(g.hits,0);
});


/* Run351 follow-up: discontinuous tank relocations are NOT swept movement.
 * A short-lived projectile must not damage a tank that teleported across
 * its corridor without physically travelling through the intervening space.
 * The existing shape sweep already rejects jumps over 96 units. */
for(const hz of [30,60,120,240]){
 test('TTL recovery does not backdate large tank teleport away at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:1000,vx:12000,ttl:.004});
  const t=g.tanks[0];t.__novaSweepMoveTime=g.time;
  t.__novaSweepPrevX=-30;t.__novaSweepPrevY=0;
  g.updateBullets(1/hz);
  assert.equal(g.hits,0,'teleport departure is not a swept body contact');
 });
 test('TTL recovery does not backdate large tank teleport across at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:-1000,vx:12000,ttl:.004});
  const t=g.tanks[0];t.__novaSweepMoveTime=g.time;
  t.__novaSweepPrevX=120;t.__novaSweepPrevY=0;
  g.updateBullets(1/hz);
  assert.equal(g.hits,0,'teleport arrival/departure cannot claim intervening hit');
 });
 test('ordinary witnessed tank movement still allows real TTL hit at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:40,vx:12000,ttl:.004});
  const t=g.tanks[0];t.__novaSweepMoveTime=g.time;
  t.__novaSweepPrevX=30;t.__novaSweepPrevY=0;
  g.updateBullets(1/hz);
  assert.equal(g.hits,1,'small observed motion retains swept contact');
 });
 test('large remote tank relocation cannot manufacture contact at '+hz+'Hz',()=>{
  const g=isolatedWorld({x:1200,vx:12000,ttl:.004});
  const t=g.tanks[0];t.__novaSweepMoveTime=g.time;
  t.__novaSweepPrevX=1500;t.__novaSweepPrevY=1500;
  g.updateBullets(1/hz);
  assert.equal(g.hits,0);
 });
}


test('distant discontinuous tank relocation does not veto an unrelated real hit',()=>{
 const g=isolatedWorld({x:28,vx:12000,ttl:.004,extraTanks:[{
  kind:'tank',id:3,x:1500,y:1500,cls:'scout',hp:100,alive:true,
  __novaSweepPrevX:1200,__novaSweepPrevY:1200
 }]});
 g.tanks[1].__novaSweepMoveTime=g.time;
 const victims=[];g.damageTank=e=>victims.push(e.id);
 g.updateBullets(1/30);
 assert.deepEqual(victims,[2],'remote discontinuity must not be a global veto');
});
