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

function boot(updateImpl) {
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
  vm.runInNewContext(fs.readFileSync(path.join(root,
    'nova-updates/battlefield-v1.6.0.js'), 'utf8'), context);
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
