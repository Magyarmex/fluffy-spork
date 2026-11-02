const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/fair-engagement-v1.11.2.js'), 'utf8');
const deploy = fs.readFileSync(path.join(__dirname, '../../.github/workflows/deploy.yml'), 'utf8');
const doctrine = fs.readFileSync(path.join(__dirname, '../../AI_DOCTRINE.md'), 'utf8');

function classes() {
  const lineages = {
    basic: 'gunner', gunner: 'gunner', marksman: 'sniper', railgun: 'sniper',
    carrier: 'controller', guardian: 'guardian', cannon: 'cannon'
  };
  return {
    CLASSES: { carrier: { droneLeash: 650 } },
    lineageForClass(id) { return lineages[id] || 'gunner'; }
  };
}

function boot() {
  const modules = {};
  modules['game/ai'] = function(module) {
    module.exports.updateAI = function(tank, game) {
      game.__legacyVisibleIds = game.tanks.map(t => t.id);
      game.__legacyPlayerId = game.player ? game.player.id : -1;
      if (game.tanks[1]) tank.ai.targetId = game.tanks[1].id;
    };
  };
  modules['game/engine'] = function(module) {
    function Game() {}
    Game.prototype.updateDrones = function() {};
    module.exports.Game = Game;
  };
  const window = { __novaModules: modules };
  const context = { window, console: { info() {}, warn() {}, error() {} }, Math, Number, Object, Array };
  vm.runInNewContext(source, context, { filename: 'fair-engagement-v1.11.2.js' });

  function load(id) {
    const module = { exports: {} };
    modules[id](module, module.exports, request => {
      if (request === './classes') return classes();
      throw new Error(`unexpected require: ${request}`);
    });
    return module.exports;
  }
  return { window, load };
}

function tank(id, x, y, extra = {}) {
  return Object.assign({
    id, x, y, vx: 0, vy: 0, hp: 100, maxHp: 100, alive: true,
    spawnShieldT: 0, cls: 'basic', tier: 1, isPlayer: false,
    ai: { state: 'hunt', targetId: -1 }
  }, extra);
}

function game(w = 1200, h = 600, zoom = 1) {
  return { w, h, cam: { zoom }, zoom, time: 1, tanks: [], getTank(id) { return this.tanks.find(t => t.id === id) || null; } };
}

test('enemy hull sight is the current gameplay rectangle and rotates with the device', () => {
  const { window } = boot();
  const T = window.__NOVA_FAIR_ENGAGEMENT_TEST__;
  const observer = tank(1, 0, 0);
  const wide = game(1200, 600, 1);
  assert.equal(T.inGameplayViewport(wide, observer, tank(2, 599, 0)), true);
  assert.equal(T.inGameplayViewport(wide, observer, tank(2, 601, 0)), false);
  assert.equal(T.inGameplayViewport(wide, observer, tank(2, 0, 301)), false);

  const portrait = game(600, 1200, 1);
  assert.equal(T.inGameplayViewport(portrait, observer, tank(2, 599, 0)), false);
  assert.equal(T.inGameplayViewport(portrait, observer, tank(2, 0, 599)), true);
});

test('current camera zoom changes AI sight by the same world-space factor as the player view', () => {
  const { window } = boot();
  const T = window.__NOVA_FAIR_ENGAGEMENT_TEST__;
  const observer = tank(1, 0, 0);
  const g = game(1000, 800, 2);
  const ext = T.viewportHalfExtents(g);
  assert.equal(ext.x, 250);
  assert.equal(ext.y, 200);
  assert.equal(T.inGameplayViewport(g, observer, tank(2, 249, 199)), true);
  assert.equal(T.inGameplayViewport(g, observer, tank(2, 251, 0)), false);
});

test('Forward Observer relay is the only deliberate off-viewport tank exception', () => {
  const { window } = boot();
  /* This unit harness loads Fair Engagement alone. The integration regression
   * spotter-ai-pre-drone-sight loads the real authoritative Spotter module. */
  window.__NOVA_SPOTTER_LIVE_RELAY__ = (g, owner, target) =>
    owner.__novaSpotterContactId === target.id && owner.__novaSpotterContactUntil > g.time;
  const T = window.__NOVA_FAIR_ENGAGEMENT_TEST__;
  const C = classes();
  const g = game(400, 300, 1); g.time = 5;
  const remote = tank(9, 900, 0);
  const sniper = tank(1, 0, 0, { cls: 'marksman', __novaSpotterContactId: 9, __novaSpotterContactUntil: 6 });
  const gunner = tank(2, 0, 0, { cls: 'gunner', __novaSpotterContactId: 9, __novaSpotterContactUntil: 6 });
  assert.equal(T.canPerceive(g, C, sniper, remote), true);
  assert.equal(T.canPerceive(g, C, gunner, remote), false);
  sniper.__novaSpotterContactUntil = 4.9;
  assert.equal(T.canPerceive(g, C, sniper, remote), false, 'expired relay memory must not become permanent radar');
  sniper.__novaSpotterContactUntil = 6;
  delete window.__NOVA_SPOTTER_LIVE_RELAY__;
  assert.equal(T.canPerceive(g, C, sniper, remote), false,
    'a missing sensor authority cannot turn a stored contact ID into radar');
});

test('target scoring is identity-neutral: toggling isPlayer alone changes nothing', () => {
  const { window } = boot();
  const T = window.__NOVA_FAIR_ENGAGEMENT_TEST__;
  const C = classes(), g = game();
  const observer = tank(1, 0, 0), target = tank(2, 200, 0);
  g.tanks = [observer, target];
  const a = observer.ai;
  target.isPlayer = false;
  const aiScore = T.scoreTarget(g, C, observer, a, target, g.time);
  target.isPlayer = true;
  const playerScore = T.scoreTarget(g, C, observer, a, target, g.time);
  assert.equal(playerScore, aiScore);
});

test('soft saturation spreads equal fights without forbidding gangs', () => {
  const { window } = boot();
  const T = window.__NOVA_FAIR_ENGAGEMENT_TEST__;
  const C = classes(), g = game();
  const observer = tank(1, 0, 0);
  const human = tank(2, 180, 0, { isPlayer: true });
  const rival = tank(3, 180, 0);
  const attackers = [4, 5, 6].map(id => tank(id, -100, id, { ai: { state: 'hunt', targetId: 2, __v1112TargetId: 2 } }));
  g.tanks = [observer, human, rival, ...attackers];
  const humanScore = T.scoreTarget(g, C, observer, observer.ai, human, g.time);
  const rivalScore = T.scoreTarget(g, C, observer, observer.ai, rival, g.time);
  assert.ok(rivalScore > humanScore, 'already-crowded target should become less attractive when alternatives are equally relevant');
  assert.ok(Number.isFinite(humanScore), 'saturation is a penalty, not a ban: a gang target remains selectable');
});

test('legacy AI chain receives only the fairly selected perceived rival', () => {
  const { load } = boot();
  const ai = load('game/ai');
  const observer = tank(1, 0, 0);
  const human = tank(2, 1700, 0, { isPlayer: true });
  const nearby = tank(3, 120, 0);
  const g = game(800, 600, 1); g.tanks = [observer, human, nearby]; g.player = human;
  ai.updateAI(observer, g, 0.016);
  assert.equal(Array.from(g.__legacyVisibleIds).join(','), '1,3');
  assert.equal(g.__legacyPlayerId, -1, 'AI-vs-AI target must not be passed through the legacy player handle');
  assert.equal(observer.ai.__v1112TargetId, 3);
  assert.equal(g.tanks.length, 3, 'full world list is restored after AI thinking');
  assert.equal(g.player.id, 2, 'real player handle is restored after AI thinking');
});

test('held Controller aim inside the old dead zone is repaired, but actual release is untouched', () => {
  const { window } = boot();
  const T = window.__NOVA_FAIR_ENGAGEMENT_TEST__;
  const repaired = T.closeAimVector({ active: true, dx: 0.25, dy: 0 }, 1.2);
  assert.equal(repaired.active, true);
  assert.ok(Math.abs(Math.hypot(repaired.dx, repaired.dy) - T.closeAimMagnitude) < 1e-9);
  const centered = T.closeAimVector({ active: true, dx: 0, dy: 0 }, Math.PI / 2);
  assert.ok(Math.abs(centered.dx) < 1e-9);
  assert.ok(centered.dy > 4, 'zero-depth held aim preserves a live minimum-range node on the last bearing');
  assert.equal(T.closeAimVector({ active: false, dx: 0, dy: 0 }, 0), null, 'release remains release/recall');
  assert.equal(T.closeAimVector({ active: true, dx: 12, dy: 0 }, 0), null, 'normal-range aim is not rewritten');
});

test('production materializer wires Fair Engagement after all earlier gameplay layers', () => {
  assert.match(deploy, /'\.\/nova-updates\/lobby-battlefield-v1\.10\.10\.js',\n\s*'\.\/nova-updates\/fair-engagement-v1\.11\.2\.js'/);
  assert.match(deploy, /grep -q 'nova-updates\/fair-engagement-v1\.11\.2\.js' index\.html\.new/);
});


test('AI doctrine cannot regress to global minimap radar or player-priority targeting', () => {
  assert.match(doctrine, /Fair Engagement perception is authoritative/);
  assert.match(doctrine, /minimap is not global AI radar/);
  assert.match(doctrine, /Player identity contributes no target-score bonus/);
  assert.doesNotMatch(doctrine, /every living tank’s current world position is legal AI knowledge/);
  assert.doesNotMatch(doctrine, /The player remains an attractive target/);
});

test('Fair Engagement cached Controller target cannot bypass a new spawn shield',()=>{
  const {load}=boot(),Game=load('game/engine').Game;
  const g=Object.assign(new Game(),game(800,600,1));
  const owner=tank(1,0,0,{cls:'carrier',ai:{state:'hunt',targetId:2,__v1112TargetId:2}});
  const shielded=tank(2,100,0,{spawnShieldT:2});
  const alternate=tank(3,180,0,{spawnShieldT:0});
  g.tanks=[owner,shielded,alternate];
  g.updateDrones(1/60);
  assert.equal(owner.__novaLiveVectorAI.targetId,alternate.id,
    'cached shielded target must not be re-injected by the outer Fair Engagement wrapper');
  assert.equal(owner.ai.__v1112TargetId,alternate.id);
});
test('Fair Engagement preserves a legitimate unshielded cached Controller target',()=>{
  const {load}=boot(),Game=load('game/engine').Game;
  const g=Object.assign(new Game(),game(800,600,1));
  const owner=tank(1,0,0,{cls:'carrier',ai:{state:'hunt',targetId:2,__v1112TargetId:2}});
  const current=tank(2,100,0,{spawnShieldT:0});
  const alternate=tank(3,180,0,{spawnShieldT:0});
  g.tanks=[owner,current,alternate];
  g.updateDrones(1/60);
  assert.equal(owner.__novaLiveVectorAI.targetId,current.id);
});

// Production authority: the outer Fair Engagement wrapper must replan the
// actual Controller's target before Live Vector uses its virtual stick.
test('shipping Fair Engagement retargets Controller AI after a bounded think tick',()=>{
  const {load}=boot(),ai=load('game/ai'),Game=load('game/engine').Game;
  const g=Object.assign(new Game(),game(800,600,1));
  const owner=tank(1,0,0,{cls:'carrier',team:'blue',
    ai:{state:'hunt',targetId:2,__v1112TargetId:2,__v1112NextThink:0}});
  const old=tank(2,300,0,{team:'red'});
  const nearer=tank(3,90,0,{team:'red'});
  g.tanks=[owner,old,nearer];g.time=7;
  ai.updateAI(owner,g,1/60);
  assert.equal(owner.ai.__v1112TargetId,nearer.id,
    'Fair Engagement must not keep a visible but inferior target forever');
  g.updateDrones(1/60);
  assert.equal(owner.__novaLiveVectorAI.targetId,nearer.id,
    'Live Vector must consume the fair retarget rather than its private sensor');
  assert.equal(owner.ai.targetId,nearer.id);
  assert.equal(g.tanks.length,3,'legacy narrow target view must be restored');
});

test('Fair Engagement Controller replan respects an existing think interval',()=>{
  const {load}=boot(),ai=load('game/ai'),Game=load('game/engine').Game;
  const g=Object.assign(new Game(),game(800,600,1));
  const owner=tank(1,0,0,{cls:'carrier',team:'blue',
    ai:{state:'hunt',targetId:2,__v1112TargetId:2,__v1112NextThink:7.15}});
  const old=tank(2,300,0,{team:'red'}),nearer=tank(3,90,0,{team:'red'});
  g.tanks=[owner,old,nearer];g.time=7;
  ai.updateAI(owner,g,1/60);g.updateDrones(1/60);
  assert.equal(owner.__novaLiveVectorAI.targetId,old.id,
    'bounded reaction cadence is a legitimate commitment, not omniscience');
  g.time=7.2;ai.updateAI(owner,g,1/60);g.updateDrones(1/60);
  assert.equal(owner.__novaLiveVectorAI.targetId,nearer.id,
    'after the scheduled think, the fair target must update');
});


/* Issue #581: a target being inside the observer-sized viewport must not
 * disclose its current coordinates through intact opaque Battlefield cover.
 * This tests the actual Fair Engagement AI wrapper, not just its score. */
test('occluded new hull is never handed to the legacy AI; actual sight reacquires it',()=>{
  const {load}=boot(),ai=load('game/ai'),observer=tank(1,-100,0),
    human=tank(2,100,0,{isPlayer:true}),g=game(800,600,1);
  g.tanks=[observer,human];g.player=human;
  g.__novaTerrain=[{shape:'rect',x:0,y:0,w:24,h:140,solid:true}];
  g.hasLineOfSight=()=>false;
  ai.updateAI(observer,g,1/60);
  assert.equal(observer.ai.__v1112TargetId,-1,'opaque cover cannot grant a new hull target');
  assert.deepEqual(Array.from(g.__legacyVisibleIds),[1],
    'legacy AI must not receive the occluded live hull');
  g.hasLineOfSight=()=>true;g.time+=.3;
  ai.updateAI(observer,g,1/60);
  assert.equal(observer.ai.__v1112TargetId,human.id,'direct visual contact reacquires the rival');
  assert.deepEqual(Array.from(g.__legacyVisibleIds),[1,2]);
});
test('occlusion gate applies to AI and player targets equally, independent of tank array order',()=>{
  for(const reverse of [false,true]){
    const {load}=boot(),ai=load('game/ai'),observer=tank(1,0,0),
      npc=tank(2,100,0),human=tank(3,-100,0,{isPlayer:true}),g=game(800,600,1);
    g.tanks=reverse?[human,npc,observer]:[observer,npc,human];g.player=human;
    g.__novaTerrain=[{shape:'rect',x:0,y:0,w:24,h:140,solid:true}];
    g.hasLineOfSight=(ax,ay,bx)=>bx<0;
    ai.updateAI(observer,g,1/60);
    assert.equal(observer.ai.__v1112TargetId,human.id,
      'the visible target must win regardless of human identity or list order');
    npc.x=-120;human.x=120;observer.ai.__v1112NextThink=0;g.time+=.3;
    ai.updateAI(observer,g,1/60);
    assert.equal(observer.ai.__v1112TargetId,npc.id,
      'a visible NPC must replace an occluded human without player-specific priority');
  }
});
test('terrain-aware perception fails closed when terrain exists but its LOS owner is absent',()=>{
  const {window}=boot(),T=window.__NOVA_FAIR_ENGAGEMENT_TEST__,
    C=classes(),observer=tank(1,0,0),target=tank(2,100,0),g=game(800,600,1);
  g.__novaTerrain=[{solid:true}];
  assert.equal(T.canPerceive(g,C,observer,target),false);
  g.__novaTerrain=[];
  assert.equal(T.canPerceive(g,C,observer,target),true,
    'legacy clear-arena harness remains usable without a Battlefield overlay');
});
test('a currently certified Sniper Observer relay remains legal through hull occlusion',()=>{
  const {window}=boot(),T=window.__NOVA_FAIR_ENGAGEMENT_TEST__,
    C=classes(),observer=tank(1,0,0,{cls:'marksman'}),
    target=tank(2,100,0),g=game(800,600,1);
  g.hasLineOfSight=()=>false;
  window.__NOVA_SPOTTER_LIVE_RELAY__=(_g,o,t)=>o===observer&&t===target;
  assert.equal(T.canPerceive(g,C,observer,target),true);
  observer.cls='gunner';
  assert.equal(T.canPerceive(g,C,observer,target),false,
    'a non-Sniper cannot borrow an Observer relay');
  observer.cls='marksman';delete window.__NOVA_SPOTTER_LIVE_RELAY__;
  assert.equal(T.canPerceive(g,C,observer,target),false,
    'expired or missing relay authority cannot resurrect hidden coordinates');
});
