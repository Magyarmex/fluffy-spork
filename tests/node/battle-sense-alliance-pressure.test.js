const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBattleSense({spawnShot = false, moveAfterShot = false} = {}) {
  function Game() {}
  Game.prototype.tryFire = function (shooter) {
    if (spawnShot) this.bullets.push({x:shooter.x,y:shooter.y});
    if (moveAfterShot) { shooter.x += 90; shooter.y -= 60; }
  };
  Game.prototype.updatePowerups = function () {};
  const modules = {
    'game/engine': function (module) { module.exports = { Game }; },
    'game/ai': function (module) { module.exports = { updateAI() {} }; },
    'game/classes': function (module) { module.exports = { CLASSES: {}, lineageForClass() { return null; } }; },
  };
  const context = { window: { __novaModules: modules }, console, Math };
  const src = fs.readFileSync(path.join(__dirname, '../../nova-updates/battle-sense-v1.8.1.js'), 'utf8');
  vm.runInNewContext(src, context, { filename: 'battle-sense-v1.8.1.js' });
  const cache = {};
  function load(id) {
    if (cache[id]) return cache[id].exports;
    const module = { exports: {} };
    cache[id] = module;
    modules[id](module, module.exports, (spec) => {
      if (spec === './classes') return load('game/classes');
      throw new Error(`unexpected require ${spec}`);
    });
    return module.exports;
  }
  const engine=load('game/engine');
  load('game/ai');
  return Object.assign(context.window.__NOVA_BATTLE_SENSE_TEST__,{Game:engine.Game});
}

function tank(id, teamId, x = 0, y = 0) {
  const t = { id, x, y, alive: true, hp: 100, maxHp: 100 };
  if (teamId !== undefined) t.teamId = teamId;
  return t;
}

test('Battle Sense local pressure excludes allies and counts visible hostiles', () => {
  const helper = loadBattleSense();
  const self = tank(1, 7);
  const ally = tank(2, 7, 80, 0);
  const enemy = tank(3, 9, 120, 0);
  const game = {
    tanks: [self, ally, enemy],
    areAllies: (a, b) => a.teamId != null && b.teamId != null && a.teamId === b.teamId,
    areHostile: (a, b) => a.teamId != null && b.teamId != null ? a.teamId !== b.teamId : true,
    hasLineOfSight: () => true,
  };
  assert.equal(helper.localCount(game, self, 560), 1);
  assert.equal(helper.hostile(game, self, ally), false);
  assert.equal(helper.hostile(game, self, enemy), true);
});

test('Battle Sense preserves free-for-all pressure without relationship metadata', () => {
  const helper = loadBattleSense();
  const self = tank(1, undefined);
  const a = tank(2, undefined, 70, 0);
  const b = tank(3, undefined, 140, 0);
  const game = { tanks: [self, a, b], hasLineOfSight: () => true };
  assert.equal(helper.localCount(game, self, 560), 2);
});

test('Battle Sense team-field fallback excludes same-side tanks when helpers are absent', () => {
  const helper = loadBattleSense();
  const self = tank(1, 4);
  const ally = tank(2, 4, 90, 0);
  const enemy = tank(3, 5, 100, 0);
  const game = { tanks: [self, ally, enemy], hasLineOfSight: () => true };
  assert.equal(helper.localCount(game, self, 560), 1);
});


test('Battle Sense witnessed crossfire keeps its event-time firing origin after shooter relocation',()=>{
 const helper=loadBattleSense();
 const observer=tank(1,undefined,0,0);
 const target=tank(2,undefined,-100,0);
 const shooter=tank(3,undefined,0,0);
 observer.ai={__v181ObservedShotId:shooter.id,__v181ObservedShotAt:9.9,
  __v181ObservedShotAngle:0,__v181ObservedShotX:0,__v181ObservedShotY:0};
 const g={tanks:[observer,target,shooter],__novaFairVisibleTanks:[observer,target,shooter],
  time:10,areHostile:()=>true,hasLineOfSight:()=>true};
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,0,
  'an eastbound shot does not establish a duel with a target to the west');
 shooter.x=-200;
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,0,
  'moving the shooter west must not retroactively redirect the witnessed shot');
 observer.ai.__v181ObservedShotX=-200;
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,.62,
  'a genuinely west-origin eastbound witnessed shot can establish crossfire');
 observer.ai.__v181ObservedShotX=NaN;
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,0,
  'missing trusted origin fails closed instead of reading current hull location');
});

test('actual Battle Sense tryFire witness stores firing origin only on real projectile birth',()=>{
 const helper=loadBattleSense({spawnShot:true,moveAfterShot:true}),g=new helper.Game();
 const shooter={...tank(1,undefined,25,40),angle:Math.PI/4};
 const observer={...tank(2,undefined,80,40),ai:{}};
 Object.assign(g,{bullets:[],tanks:[shooter,observer],time:10,hasLineOfSight:()=>true});
 g.tryFire(shooter);
 assert.equal(g.bullets.length,1);
 assert.equal(observer.ai.__v181ObservedShotId,shooter.id);
 assert.equal(observer.ai.__v181ObservedShotX,25);
 assert.equal(observer.ai.__v181ObservedShotY,40);
 assert.equal(observer.ai.__v181ObservedShotAngle,Math.PI/4);
 assert.equal(shooter.x,115,'test weapon mutates hull after projectile birth');
 assert.equal(shooter.y,-20);
 shooter.x=200;shooter.y=-90;
 assert.equal(observer.ai.__v181ObservedShotX,25,
  'subsequent shooter movement cannot mutate the captured shot origin');
 assert.equal(observer.ai.__v181ObservedShotY,40);
 const noShot=loadBattleSense(),empty=new noShot.Game();
 const other={...tank(3,undefined,10,10),ai:{}};
 Object.assign(empty,{bullets:[],tanks:[shooter,other],time:10,hasLineOfSight:()=>true});
 empty.tryFire(shooter);
 assert.equal(other.ai.__v181ObservedShotX,undefined,
  'failed/no-projectile fire attempt cannot create an observed origin');
 const blocked=new helper.Game(),hidden={...tank(4,undefined,80,40),ai:{}};
 Object.assign(blocked,{bullets:[],tanks:[shooter,hidden],time:11,
  hasLineOfSight:()=>false});
 blocked.tryFire(shooter);
 assert.equal(blocked.bullets.length,1,'shot still physically exists behind cover');
 assert.equal(hidden.ai.__v181ObservedShotX,undefined,
  'occluded observer must not gain the firing origin');
});

test('missing witnessed shot timestamp cannot become a time-zero crossfire',()=>{
 const helper=loadBattleSense();
 const observer=tank(1,undefined,-200,0);
 const target=tank(2,undefined,0,0);
 const third=tank(3,undefined,100,0);
 observer.ai={__v181ObservedShotId:target.id,
  __v181ObservedShotAngle:0,__v181ObservedShotX:0,__v181ObservedShotY:0};
 const g={tanks:[observer,target,third],
  __novaFairVisibleTanks:[observer,target,third],
  time:0,hasLineOfSight:()=>true};
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,0,
  'an absent timestamp is not a witnessed shot at match time zero');
 observer.ai.__v181ObservedShotAt=null;
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,0,
  'a null timestamp is not a witnessed shot at match time zero');
 observer.ai.__v181ObservedShotAt='0';
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,0,
  'a string-coerced timestamp is not an authenticated numeric witness');
 observer.ai.__v181ObservedShotAt=-1;
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,0,
  'a negative pre-match time cannot masquerade as a fresh shot');
 observer.ai.__v181ObservedShotAt=0;
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,.62,
  'a genuine time-zero shot remains a valid crossfire witness');
 g.time=1.25;
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,.62,
  'the established 1.25-second witness boundary is preserved');
 g.time=1.250001;
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,0,
  'the existing witness expiry remains strict');
});

test('Battle Sense reload-punish window rejects untrusted shot times but accepts real time zero',()=>{
 const helper=loadBattleSense();
 const target={...tank(2,undefined,100,0),cls:'cannon'};
 const observer={...tank(1,undefined,0,0),ai:{__v181ObservedShotId:target.id}};
 const classes={CLASSES:{cannon:{bullet:{reload:1.2}}}};
 const g={hasLineOfSight:()=>true};
 for(const bad of [undefined,null,'0',-1,NaN,Infinity]){
  observer.ai.__v181ObservedShotAt=bad;
  assert.equal(helper.witnessedOpening(g,classes,observer,target,.2),0,
   'untrusted shot time must not grant reload-punish knowledge: '+String(bad));
 }
 observer.ai.__v181ObservedShotAt=0;
 assert.ok(helper.witnessedOpening(g,classes,observer,target,.2)>0,
  'real game-time-zero shot must retain its legitimate punish window');
});

test('missing or coerced shot bearing cannot invent an eastbound duel',()=>{
 const helper=loadBattleSense();
 const observer={...tank(1,undefined,-200,0),ai:{
  __v181ObservedShotId:2,__v181ObservedShotAt:0,
  __v181ObservedShotX:0,__v181ObservedShotY:0}};
 const target=tank(2,undefined,0,0),third=tank(3,undefined,100,0);
 const g={time:0,tanks:[observer,target,third],
  __novaFairVisibleTanks:[observer,target,third],hasLineOfSight:()=>true};
 for(const bad of [undefined,null,'0',NaN,Infinity]){
  observer.ai.__v181ObservedShotAngle=bad;
  assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,0,
   'untrusted bearing cannot imply a shot to the east: '+String(bad));
 }
 observer.ai.__v181ObservedShotAngle=0;
 assert.equal(helper.thirdPartyVector(g,observer,target,{}).weight,.62,
  'a legitimate numeric eastbound bearing remains valid');
});
