'use strict';
// Research-only #1025: compare hidden-slot saturation with public turret-bearing
// evidence. This is NOT a production AI replacement or a natural-match verdict.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../nova-updates/fair-engagement-v1.11.2.js'), 'utf8');
function boot() {
  const window = { __novaModules: {} };
  vm.runInNewContext(source, { window, Math, Number, Object, Array, Map,
    console: { info() {}, warn() {}, error() {} } });
  return window.__NOVA_FAIR_ENGAGEMENT_TEST__;
}
const classes = { lineageForClass() { return 'gunner'; } };
function alive(t) { return t && t.alive !== false && (t.hp == null || t.hp > 0); }
function allied(g, a, b) {
  if (typeof g.areAllies === 'function') return !!g.areAllies(a, b);
  for (const key of ['teamId', 'team', 'factionId', 'faction', 'side']) {
    if (a[key] != null && b[key] != null) return a[key] === b[key];
  }
  return false; // No evidence of alliance: do not assume cooperation.
}
function hostile(g, a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (typeof g.areAllies === 'function' && g.areAllies(a, b)) return false;
  if (typeof g.areHostile === 'function') return !!g.areHostile(a, b);
  for (const key of ['teamId', 'team', 'factionId', 'faction', 'side']) {
    if (a[key] != null && b[key] != null) return a[key] !== b[key];
  }
  return true; // Free-for-all: every distinct tank can be a third-party attacker.
}
function assigned(a) {
  return a.__v1112TargetId >= 0 ? a.__v1112TargetId :
    a.__v1105TargetId >= 0 ? a.__v1105TargetId :
    a.__v180TargetId >= 0 ? a.__v180TargetId : a.targetId;
}
function active(a) {
  return a.state === 'hunt' || ['pressure', 'flank', 'route'].includes(a.__v180Posture);
}
function privateCount(g, observer, target) {
  return g.tanks.filter(q => q && q.id !== observer.id && q.ai && alive(q) &&
    active(q.ai) && assigned(q.ai) === target.id).length;
}
// Prototype: only directly visible, target-hostile hulls pointing toward a
// visible target. A bearing is a weak public signal, NOT proof of an attack.
// No private AI slot or other tank's speed/upgrade data is read here.
function bearingCount(T, g, observer, target, C = classes) {
  let count = 0;
  for (const q of g.tanks) {
    if (!q || q.id === observer.id || q.id === target.id || !alive(q) ||
        !hostile(g, q, target) || !T.canPerceive(g, C, observer, q)) continue;
    const dx = target.x - q.x, dy = target.y - q.y;
    if (dx * dx + dy * dy > 500 * 500 || dx * dx + dy * dy < 1) continue;
    if (!Number.isFinite(q.angle)) continue;
    const delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - q.angle),
      Math.cos(Math.atan2(dy, dx) - q.angle));
    if (Math.abs(delta) > 0.32) continue;
    // Cheap angle/distance gates precede both potentially costly terrain
    // queries; only plausible public attack bearings ask about solid cover.
    if (typeof g.hasLineOfSight === 'function' &&
        (!g.hasLineOfSight(observer.x, observer.y, q.x, q.y, 18) ||
         !g.hasLineOfSight(q.x, q.y, target.x, target.y, 18))) continue;
    count++;
  }
  return count;
}
// Battle Sense currently remembers only the latest witnessed shooter, so this
// can certify at most one public attacker; it is not a multi-attacker census.
function witnessedShotCount(T, g, observer, target, C = classes) {
  const a = observer.ai || {};
  const at = Number(a.__v181ObservedShotAt);
  if (!Number.isFinite(at) || g.time - at < 0 || g.time - at > 1.25) return 0;
  const shooter = g.tanks.find(q => q && q.id === a.__v181ObservedShotId);
  if (!shooter || !alive(shooter) || shooter.id === observer.id ||
      shooter.id === target.id || !hostile(g, shooter, target) ||
      !T.canPerceive(g, C, observer, shooter)) return 0;
  const angle = Number(a.__v181ObservedShotAngle);
  if (!Number.isFinite(angle)) return 0;
  const toward = Math.atan2(target.y - shooter.y, target.x - shooter.x);
  if (Math.cos(angle - toward) < Math.cos(0.32)) return 0;
  if (typeof g.hasLineOfSight === 'function' &&
      !g.hasLineOfSight(shooter.x, shooter.y, target.x, target.y, 18)) return 0;
  return 1;
}
// Third RESEARCH alternative: an observer-owned, event-time confirmed-hit
// witness. Unlike a turret bearing or stale shot angle, the victim identity
// is fixed when physical damage occurs. No private target slot is consulted.
// This does not claim every hit is visible, or that late evidence can replace
// early anti-dogpile coordination in natural matches.
const hitWitnesses=new WeakMap();
function recordVisibleHit(T,g,observer,shooter,target,C=classes){
 if(!observer||!shooter||!target||observer===shooter||observer===target||
    !alive(observer)||!alive(shooter)||!alive(target)||
    !hostile(g,shooter,target)||
    !T.canPerceive(g,C,observer,shooter)||
    !T.canPerceive(g,C,observer,target))return false;
 if(typeof g.hasLineOfSight!=='function'||
    !g.hasLineOfSight(observer.x,observer.y,shooter.x,shooter.y,2)||
    !g.hasLineOfSight(observer.x,observer.y,target.x,target.y,2))return false;
 const at=Number(g.time);
 if(!Number.isFinite(at))return false;
 const prior=hitWitnesses.get(observer)||[];
 const valid=prior.filter(e=>at>=e.at&&at-e.at<=1.25&&
  alive(e.shooter)&&alive(e.target));
 const oldIndex=valid.findIndex(e=>e.shooter===shooter&&e.target===target);
 if(oldIndex>=0)valid.splice(oldIndex,1);
 valid.push({shooter,target,at}); // recency order for bounded eviction
 if(valid.length>13)valid.splice(0,valid.length-13);
 hitWitnesses.set(observer,valid);
 return true;
}
function clearHitWitness(observer){hitWitnesses.delete(observer);}
function confirmedHitCount(g,observer,target){
 const now=Number(g.time);
 if(!Number.isFinite(now))return 0;
 let count=0;
 for(const e of hitWitnesses.get(observer)||[]){
  if(e.target!==target||now<e.at||now-e.at>1.25||
     !(g.tanks||[]).includes(e.shooter)||
     !alive(e.shooter)||!alive(e.target)||
     !hostile(g,e.shooter,e.target))continue;
  count++;
 }
 return Math.min(4,count);
}
// Exact non-saturation terms from shipping scoreTarget. Unlike subtracting a
// private count after calling scoreTarget, this candidate NEVER reads another
// AI's private target slots. The source-parity regression below detects drift.
function basePublicScore(T, g, C, observer, target) {
  if (!alive(target) || !hostile(g, observer, target) || target.spawnShieldT > 0 ||
      !T.canPerceive(g, C, observer, target)) return -Infinity;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = Math.hypot(target.x - observer.x, target.y - observer.y);
  const near = 1 / (1 + dist / 720);
  const hp = clamp(Number(target.hp) /
    Math.max(1, Number(target.maxHp) || Number(target.hp) || 1), 0, 1);
  const ln = C && typeof C.lineageForClass === 'function' ?
    C.lineageForClass(target.cls) : null;
  let danger = .45;
  if (ln === 'sniper') danger = .78;
  else if (ln === 'cannon') danger = .72;
  else if (ln === 'controller') danger = .68;
  else if (ln === 'guardian') danger = .64;
  else if (ln === 'gunner') danger = .62;
  if (target.tier >= 3) danger += .12;
  danger = clamp(danger, 0, 1);
  let score = near * 1.16 + (1 - hp) * .48 + danger * .30;
  const a = observer.ai;
  if (a && a.__v1112TargetId === target.id) score += .16;
  if (a && a.__v180LastAttacker === target.id &&
      g.time - Number(a.__v180HitAt || -99) < 2.2) score += .34;
  const seed = Math.sin((observer.id || 1) * 17.17 +
    (target.id || 1) * 31.73) * 43758.5453;
  score += (seed - Math.floor(seed) - .5) * .04;
  return score;
}
function publicChoice(T, g, observer, C = classes, mode = 'bearing') {
  let best = null, bestScore = -Infinity;
  for (const target of g.tanks) {
    if (!target || target.id === observer.id || !alive(target) ||
        allied(g, observer, target)) continue;
    const base = basePublicScore(T, g, C, observer, target);
    if (!Number.isFinite(base)) continue;
    const score = base - (mode === 'hit' ?
      confirmedHitCount(g, observer, target) : mode === 'shot' ?
      witnessedShotCount(T, g, observer, target, C) :
      bearingCount(T, g, observer, target, C)) * T.saturationPenalty;
    if (score > bestScore) { bestScore = score; best = target; }
  }
  return best;
}
function tank(id, x, y, team, angle = 0) {
  return { id, x, y, team, angle, hp: 100, maxHp: 100, alive: true,
    spawnShieldT: 0, cls: 'twin', tier: 1,
    ai: { state: 'wander', __v1112TargetId: -1, targetId: -1 } };
}
function world() {
  const observer = tank(1, 0, 0, 1);
  const a = tank(10, 100, 0, 2);
  const b = tank(11, -100, 0, 2);
  const hidden = tank(2, 2000, 2000, 1);
  hidden.ai.state = 'hunt';
  const g = { tanks: [observer, a, b, hidden], w: 900, h: 700,
    cam: { zoom: 1 }, time: 10, hasLineOfSight: () => true };
  return { g, observer, a, b, hidden };
}
test('public base score exactly matches shipping before private saturation', () => {
  const T = boot(), { g, observer, a, b, hidden } = world();
  for (const target of [a, b]) {
    for (const id of [a.id, b.id, -1]) {
      hidden.ai.__v1112TargetId = id;
      const raw = T.scoreTarget(g, classes, observer, observer.ai, target, g.time);
      const recovered = raw + privateCount(g, observer, target) * T.saturationPenalty;
      const publicScore = basePublicScore(T, g, classes, observer, target);
      assert.ok(Math.abs(recovered - publicScore) < 1e-12,
        'base score diverged from materialized scoreTarget');
    }
  }
});
test('public score reconstruction preserves all five lineage danger bands and own commitments', () => {
  const T = boot(), { g, observer, a, hidden } = world();
  const C = { lineageForClass(id) { return id; } };
  for (const lineage of ['gunner', 'sniper', 'cannon', 'controller', 'guardian', 'unknown']) {
    for (const tier of [0, 1, 3, 4]) {
      for (const hp of [20, 65, 100]) {
        a.cls = lineage; a.tier = tier; a.hp = hp;
        observer.ai.__v1112TargetId = a.id;
        observer.ai.__v180LastAttacker = a.id;
        observer.ai.__v180HitAt = g.time - 0.4;
        hidden.ai.__v1112TargetId = a.id;
        const shipping = T.scoreTarget(g, C, observer, observer.ai, a, g.time);
        const recovered = shipping + privateCount(g, observer, a) * T.saturationPenalty;
        const publicScore = basePublicScore(T, g, C, observer, a);
        assert.ok(Math.abs(recovered - publicScore) < 1e-12,
          'source parity drift: ' + lineage + ' tier=' + tier + ' hp=' + hp);
      }
    }
  }
});
test('public-bearing prototype is invariant to offscreen private target assignments', () => {
  const T = boot(), { g, observer, a, b, hidden } = world();
  hidden.ai.__v1112TargetId = a.id;
  const first = publicChoice(T, g, observer)?.id;
  const shippingFirst = T.chooseTarget(g, classes, observer, observer.ai, g.time)?.id;
  hidden.ai.__v1112TargetId = b.id;
  const second = publicChoice(T, g, observer)?.id;
  const shippingSecond = T.chooseTarget(g, classes, observer, observer.ai, g.time)?.id;
  assert.equal(first, second, 'offscreen private slot must not change public score');
  assert.notEqual(shippingFirst, shippingSecond,
    'fixture must remain sensitive to shipping private-slot scoring');
});
test('public choices never read other bots private target slots', () => {
  const T = boot(), { g, observer, hidden } = world();
  const forbidden = new Set(['__v1112TargetId', '__v1105TargetId',
    '__v180TargetId', 'targetId', '__lfEcoKey']);
  for (const q of g.tanks) {
    if (q.id === observer.id || !q.ai) continue;
    q.ai = new Proxy(q.ai, { get(target, key, receiver) {
      if (forbidden.has(key)) throw new Error('private AI slot read: ' + key);
      return Reflect.get(target, key, receiver);
    } });
  }
  assert.ok(publicChoice(T, g, observer));
  assert.ok(publicChoice(T, g, observer, classes, 'shot'));
  assert.equal(hidden.ai.state, 'hunt');
});
test('visible allied bearing is public evidence, not hidden target ID', () => {
  const T = boot(), { g, observer, a, b, hidden } = world();
  hidden.ai.state = 'wander';
  const witness = tank(3, 0, 100, 1, Math.atan2(-100, 100));
  g.tanks.push(witness);
  assert.equal(bearingCount(T, g, observer, a), 1);
  assert.equal(bearingCount(T, g, observer, b), 0);
  witness.ai.state = 'hunt';
  witness.ai.__v1112TargetId = b.id;
  assert.equal(bearingCount(T, g, observer, a), 1,
    'private assignment must not override public turret direction');
  witness.x = 2000; witness.y = 2000;
  assert.equal(bearingCount(T, g, observer, a), 0,
    'offscreen hull direction is not observer evidence');
});
test('bearing prototype excludes target allies, dead hulls, and non-finite angles', () => {
  const T = boot(), { g, observer, a } = world();
  const witness = tank(3, 0, 100, 2, Math.atan2(-100, 100));
  g.tanks.push(witness);
  assert.equal(bearingCount(T, g, observer, a), 0);
  witness.team = 1; witness.alive = false;
  assert.equal(bearingCount(T, g, observer, a), 0);
  witness.alive = true; witness.angle = NaN;
  assert.equal(bearingCount(T, g, observer, a), 0);
});

test('free-for-all third-party attack bearings remain observable without team metadata', () => {
  const T = boot(), { g, observer, a, b } = world();
  b.angle = Math.PI; // Prevent the other visible opponent from also aiming at a.
  for (const t of g.tanks) delete t.team;
  const witness = tank(3, 0, 100, 3, Math.atan2(-100, 100));
  delete witness.team;
  g.tanks.push(witness);
  assert.equal(bearingCount(T, g, observer, a), 1,
    'free-for-all pressure must not disappear when team IDs are absent');
});
test('public bearing cannot see through cover between observer, shooter or target', () => {
  const T = boot(), { g, observer, a } = world();
  const witness = tank(3, 0, 100, 1, Math.atan2(-100, 100));
  g.tanks.push(witness);
  g.hasLineOfSight = (x1, y1, x2, y2) => !(x1 === observer.x &&
    y1 === observer.y && x2 === witness.x && y2 === witness.y);
  assert.equal(bearingCount(T, g, observer, a), 0, 'hidden hull is not evidence');
  g.hasLineOfSight = (x1, y1, x2, y2) => !(x1 === witness.x &&
    y1 === witness.y && x2 === a.x && y2 === a.y);
  assert.equal(bearingCount(T, g, observer, a), 0, 'blocked shot lane is not evidence');
  g.hasLineOfSight = () => true;
  assert.equal(bearingCount(T, g, observer, a), 1);
});
test('latest witnessed shot is bounded, public and cannot imply multiple attackers', () => {
  const T = boot(), { g, observer, a, b } = world();
  const shooter = tank(3, 0, 100, 1);
  g.tanks.push(shooter);
  observer.ai.__v181ObservedShotId = shooter.id;
  observer.ai.__v181ObservedShotAt = g.time - 0.2;
  observer.ai.__v181ObservedShotAngle = Math.atan2(-100, 100);
  assert.equal(witnessedShotCount(T, g, observer, a), 1);
  assert.equal(witnessedShotCount(T, g, observer, b), 0);
  shooter.ai.__v1112TargetId = b.id;
  assert.equal(witnessedShotCount(T, g, observer, a), 1,
    'witness must not consume private shooter target slots');
  observer.ai.__v181ObservedShotAt = g.time - 1.3;
  assert.equal(witnessedShotCount(T, g, observer, a), 0);
  observer.ai.__v181ObservedShotAt = g.time - 0.2;
  shooter.team = 2;
  assert.equal(witnessedShotCount(T, g, observer, a), 0);
});
test('unfired public bearing can redirect target choice, unlike shot-only evidence', () => {
  const T = boot(), { g, observer, a, b, hidden } = world();
  hidden.ai.state = 'wander';
  a.hp = 85; // Public vulnerability wins without third-party pressure.
  const witness = tank(3, 0, 100, 1, Math.atan2(-100, 100));
  g.tanks.push(witness);
  assert.equal(publicChoice(T, g, observer, classes, 'bearing')?.id, b.id,
    'bearing-only candidate reacts to a turret that has not fired');
  assert.equal(publicChoice(T, g, observer, classes, 'shot')?.id, a.id,
    'shot-only candidate must not invent a witnessed firing event');
  witness.angle = Math.PI; // Public aim moves away; no private AI slot changed.
  assert.equal(publicChoice(T, g, observer, classes, 'bearing')?.id, a.id,
    'bearing candidate must recover when the unfired turret turns away');
});

test('latest-shot bearing can misattribute pressure after target movement', () => {
  const T = boot(), { g, observer, a, b } = world();
  const shooter = tank(3, 0, 100, 1);
  g.tanks.push(shooter);
  observer.ai.__v181ObservedShotId = shooter.id;
  observer.ai.__v181ObservedShotAt = g.time - 0.2;
  observer.ai.__v181ObservedShotAngle = Math.atan2(-100, 100);
  assert.equal(witnessedShotCount(T, g, observer, a), 1);
  assert.equal(witnessedShotCount(T, g, observer, b), 0);
  // No second shot occurs. The target swaps positions after the witnessed
  // event, so the same stored angle now falsely credits the other target.
  a.x = 250; a.y = 250;
  b.x = 100; b.y = 0;
  assert.equal(witnessedShotCount(T, g, observer, b), 1,
    'negative control: latest-shot angle lacks shot-time target geometry');
});

test('public witnessed fire can redirect a real target score without private intent', () => {
  const T = boot(), { g, observer, a, b, hidden } = world();
  hidden.ai.state = 'wander';
  a.hp = 85; // Modest public vulnerability makes a preferable before evidence.
  const shooter = tank(3, 0, 100, 1, Math.atan2(-100, 100));
  g.tanks.push(shooter);
  const before = publicChoice(T, g, observer, classes, 'shot')?.id;
  observer.ai.__v181ObservedShotId = shooter.id;
  observer.ai.__v181ObservedShotAt = g.time - 0.2;
  observer.ai.__v181ObservedShotAngle = shooter.angle;
  const after = publicChoice(T, g, observer, classes, 'shot')?.id;
  assert.equal(before, a.id, 'vulnerable target should initially win');
  assert.equal(after, b.id, 'witnessed third-party pressure should redirect choice');
  shooter.ai.__v1112TargetId = b.id;
  assert.equal(publicChoice(T, g, observer, classes, 'shot')?.id, b.id,
    'changing private target slot must not undo public evidence');
});
test('negative control: human hit can redirect AI toward the human',()=>{
 const T=boot(),{g,observer,a,b,hidden}=world();
 hidden.ai.state='wander';
 a.hp=85;b.team=3;b.isPlayer=true;b.ai=null;
 assert.equal(publicChoice(T,g,observer,classes,'hit')?.id,a.id);
 assert.equal(recordVisibleHit(T,g,observer,b,a),true);
 assert.equal(publicChoice(T,g,observer,classes,'hit')?.id,b.id,
  'unfiltered player hits can perversely amplify human-target pressure');
 // This is a design BLOCKER, not a desired golden. Shipping private
 // saturation only counts AI commitments; do not promote this candidate.
});
test('unfired aim and shot-memory alone cannot create confirmed-hit pressure',()=>{
 const T=boot(),{g,observer,a,hidden}=world();
 hidden.ai.state='wander';a.hp=85;
 const shooter=tank(3,0,100,1,Math.atan2(-100,100));
 g.tanks.push(shooter);
 const before=publicChoice(T,g,observer,classes,'hit')?.id;
 observer.ai.__v181ObservedShotId=shooter.id;
 observer.ai.__v181ObservedShotAt=g.time-.2;
 observer.ai.__v181ObservedShotAngle=shooter.angle;
 assert.equal(publicChoice(T,g,observer,classes,'hit')?.id,before,
  'aim and an unconfirmed shot cannot impersonate a damage event');
 shooter.angle=Math.PI;
 assert.equal(publicChoice(T,g,observer,classes,'hit')?.id,before);
});
test('confirmed public hit changes real target score without private intent',()=>{
 const T=boot(),{g,observer,a,b,hidden}=world();
 hidden.ai.state='wander';
 a.hp=85;
 const shooter=tank(3,0,100,1);
 g.tanks.push(shooter);
 assert.equal(publicChoice(T,g,observer,classes,'hit')?.id,a.id);
 assert.equal(recordVisibleHit(T,g,observer,shooter,a),true);
 assert.equal(publicChoice(T,g,observer,classes,'hit')?.id,b.id,
  'a confirmed third-party hit should reduce another observer\'s dogpile');
 hidden.ai.__v1112TargetId=b.id;
 assert.equal(publicChoice(T,g,observer,classes,'hit')?.id,b.id,
  'private offscreen assignment cannot affect hit-based score');
});
test('event-time confirmed hits retain victim identity after movement',()=>{
 const T=boot(),{g,observer,a,b,hidden}=world();
 const shooter=tank(3,0,100,1);
 g.tanks.push(shooter);
 assert.equal(recordVisibleHit(T,g,observer,shooter,a),true);
 assert.equal(confirmedHitCount(g,observer,a),1);
 assert.equal(confirmedHitCount(g,observer,b),0);
 a.x=250;a.y=250;b.x=100;b.y=0;
 assert.equal(confirmedHitCount(g,observer,a),1,
  'moving another tank into the old shot lane cannot steal hit credit');
 assert.equal(confirmedHitCount(g,observer,b),0);
 hidden.ai.__v1112TargetId=b.id;
 assert.equal(confirmedHitCount(g,observer,a),1,
  'offscreen private intent cannot change an observed hit');
});
test('confirmed hit witness fails closed without terrain sight owner',()=>{
 const T=boot(),{g,observer,a}=world();
 const shooter=tank(3,0,100,1);g.tanks.push(shooter);
 delete g.hasLineOfSight;
 assert.equal(recordVisibleHit(T,g,observer,shooter,a),false);
 assert.equal(confirmedHitCount(g,observer,a),0);
});
test('confirmed hit witness requires public event-time sight and real hostility',()=>{
 const T=boot(),{g,observer,a}=world();
 const shooter=tank(3,0,100,1);
 g.tanks.push(shooter);
 g.hasLineOfSight=()=>false;
 assert.equal(recordVisibleHit(T,g,observer,shooter,a),false);
 assert.equal(confirmedHitCount(g,observer,a),0);
 g.hasLineOfSight=()=>true;
 shooter.x=2000;shooter.y=2000;
 assert.equal(recordVisibleHit(T,g,observer,shooter,a),false,
  'offscreen shooter must not create event-time witness');
 shooter.x=0;shooter.y=100;
 shooter.team=a.team;
 assert.equal(recordVisibleHit(T,g,observer,shooter,a),false);
 shooter.team=observer.team;
 assert.equal(recordVisibleHit(T,g,observer,shooter,a),true);
 assert.equal(confirmedHitCount(g,observer,a),1);
 g.time+=1.26;
 assert.equal(confirmedHitCount(g,observer,a),0);
});
test('confirmed hit witness supports multiple attackers without recycled IDs',()=>{
 const T=boot(),{g,observer,a}=world();
 const one=tank(3,0,100,1),two=tank(4,0,-100,1);
 g.tanks.push(one,two);
 assert.equal(recordVisibleHit(T,g,observer,one,a),true);
 assert.equal(recordVisibleHit(T,g,observer,two,a),true);
 assert.equal(confirmedHitCount(g,observer,a),2);
 assert.equal(recordVisibleHit(T,g,observer,one,a),true);
 assert.equal(confirmedHitCount(g,observer,a),2,'repeat hits do not multiply attackers');
 one.alive=false;
 const recycled=tank(one.id,0,100,1);
 g.tanks.push(recycled);
 assert.equal(confirmedHitCount(g,observer,a),1,
  'recycled numeric shooter ID cannot inherit an old observed hit');
 g.tanks=g.tanks.filter(t=>t!==two);
 assert.equal(confirmedHitCount(g,observer,a),0,
  'despawned shooter cannot remain a phantom attacker');
});
test('explicit life reset invalidates old hit evidence',()=>{
 const T=boot(),{g,observer,a}=world();
 const shooter=tank(3,0,100,1);g.tanks.push(shooter);
 assert.equal(recordVisibleHit(T,g,observer,shooter,a),true);
 assert.equal(confirmedHitCount(g,observer,a),1);
 // A production implementation must attach this clear to the canonical
 // tank-life transition. Game time alone cannot identify every restart.
 clearHitWitness(observer);
 g.time=10.2;
 assert.equal(confirmedHitCount(g,observer,a),0);
});
test('bounded hit memory evicts oldest unrefreshed identity',()=>{
 const T=boot(),{g,observer,a}=world();
 const shooters=Array.from({length:14},(_,i)=>tank(100+i,0,80+i*5,1));
 g.tanks.push(...shooters);
 for(const shooter of shooters.slice(0,13))
  assert.equal(recordVisibleHit(T,g,observer,shooter,a),true);
 assert.equal(hitWitnesses.get(observer).length,13);
 g.time+=.1;
 assert.equal(recordVisibleHit(T,g,observer,shooters[0],a),true);
 g.time+=.1;
 assert.equal(recordVisibleHit(T,g,observer,shooters[13],a),true);
 const kept=hitWitnesses.get(observer);
 assert.equal(kept.length,13);
 assert.ok(kept.some(e=>e.shooter===shooters[0]),
  'recently refreshed evidence must not be evicted');
 assert.ok(!kept.some(e=>e.shooter===shooters[1]),
  'oldest unrefreshed witness should leave first');
});
test('confirmed-hit prototype can be fed by actual composed Game damage',()=>{
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 withSeed(1517800,()=>{
  const g=bootGame();
  try{
   const T=g.__testFair;
   const C=g.__testWindow.__novaMakeRequire('')('game/classes');
   const [observer,shooter,victim]=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
   assert.ok(observer&&shooter&&victim);
   for(const [t,x,y] of [[observer,0,0],[shooter,0,100],[victim,100,0]])
    Object.assign(t,{x,y,hp:100,maxHp:100,alive:true,
     spawnShieldT:0,shieldT:0,bulwarkT:0,cloakT:0,tauntT:0,invulnT:0});
   g.tanks=[observer,shooter,victim];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.w=800;g.h=600;g.cam.zoom=1;g.time=10;
   g.status='playing';g.paused=false;
   // Isolate the event visibility gate from unrelated map geometry. This
   // is a real composed damage owner, not a physical projectile-hit claim.
   g.hasLineOfSight=()=>true;
   const before=victim.hp;
   const original=g.damageTank;
   g.damageTank=function(target,amount,ownerId,...rest){
    const result=original.call(this,target,amount,ownerId,...rest);
    if(target.hp<before&&ownerId===shooter.id)
     recordVisibleHit(T,this,observer,shooter,target,C);
    return result;
   };
   g.damageTank(victim,20,shooter.id,0,0);
   assert.ok(victim.hp<before,'real damage owner must lower target HP');
   assert.equal(confirmedHitCount(g,observer,victim),1);
  }finally{g.destroy();}
 });
});
test('real composed AI acquisition cannot leak hidden intent into public candidate', () => {
  const { bootGame, withSeed } = require('../research/audio-rng-causal-pilot.cjs');
  withSeed(1517800, () => {
    const g = bootGame();
    try {
      const T = g.__testFair, win = g.__testWindow;
      const C = win.__novaMakeRequire('')('game/classes');
      const ai = win.__novaMakeRequire('')('game/ai');
      const bots = g.tanks.filter(t => t && t.ai && !t.isPlayer);
      assert.ok(bots.length >= 4);
      const [observer, a, b, hidden] = bots;
      function place(t, x, state) {
        Object.assign(t, { x, y: 0, hp: 100, maxHp: 100, alive: true,
          spawnShieldT: 0, cls: 'twin', tier: 1 });
        t.ai = { ...t.ai, state,
          __v180Posture: state === 'hunt' ? 'pressure' : 'hold',
          targetId: -1, __v180TargetId: -1, __v1105TargetId: -1,
          __v1112TargetId: -1, __v1112NextThink: 0,
          __v180LastAttacker: -1, __v180HitAt: -99 };
      }
      place(observer, 0, 'hunt');
      place(a, 80, 'wander');
      place(b, -130, 'wander');
      place(hidden, 450, 'hunt');
      if (g.player) { g.player.x = -2000; g.player.y = -2000; }
      g.tanks = [observer, a, b, hidden, ...(g.player ? [g.player] : [])];
      g.tankById = new Map(g.tanks.map(t => [t.id, t]));
      g.w = 800; g.h = 600; g.cam.zoom = 1; g.time = 10;
      g.status = 'playing'; g.paused = false;
      assert.equal(T.canPerceive(g, C, observer, hidden), false);
      assert.equal(T.canPerceive(g, C, hidden, a), true);
      const replansBefore = win.__NOVA_FAIR_ENGAGEMENT__.targetReplans;
      ai.updateAI(hidden, g, 1 / 60);
      assert.ok(win.__NOVA_FAIR_ENGAGEMENT__.targetReplans > replansBefore,
        'composed Fair Engagement replan wrapper must actually execute');
      assert.equal(hidden.ai.__v1112TargetId, a.id,
        'real AI must acquire the visible target through shipping wrapper');
      assert.equal(T.canPerceive(g, C, observer, hidden), false);
      const publicBefore = publicChoice(T, g, observer, C)?.id;
      const shotBefore = publicChoice(T, g, observer, C, 'shot')?.id;
      const shippingBefore = T.chooseTarget(g, C, observer, observer.ai, g.time)?.id;
      const keys = ['__v1112TargetId', '__v1105TargetId', '__v180TargetId', 'targetId'];
      const saved = keys.map(k => [k, hidden.ai[k]]);
      let publicAfter, shotAfter, shippingAfter;
      try {
        for (const key of keys) hidden.ai[key] = -1;
        publicAfter = publicChoice(T, g, observer, C)?.id;
        shotAfter = publicChoice(T, g, observer, C, 'shot')?.id;
        shippingAfter = T.chooseTarget(g, C, observer, observer.ai, g.time)?.id;
      } finally {
        for (const [key, value] of saved) hidden.ai[key] = value;
      }
      assert.equal(publicBefore, publicAfter,
        'public bearing candidate must ignore naturally acquired hidden intent');
      assert.equal(shotBefore, shotAfter,
        'public witnessed-shot candidate must ignore naturally acquired hidden intent');
      assert.ok([a.id, b.id].includes(publicBefore));
      console.log('NOVA_PUBLIC_SATURATION_COMPOSED_HIDDEN_ACQUISITION ' +
        JSON.stringify({ shippingBefore, shippingAfter, publicBefore, publicAfter,
          shotBefore, shotAfter }));
    } finally { g.destroy(); }
  });
});

test('natural composed worlds report public-bearing sensitivity without changing gameplay', () => {
  const { bootGame, withSeed, digest, physical } =
    require('../research/audio-rng-causal-pilot.cjs');
  const seeds = [1517800, 1517802, 1517810];
  function run(seed, observe) {
    return withSeed(seed, draws => {
      const g = bootGame();
      g.sfx.muted = true;
      g.sfx.startMusic = () => {};
      const T = g.__testFair;
      const C = g.__testWindow.__novaMakeRequire('')('game/classes');
      const result = { observerSamples: 0, multiVisible: 0,
        changedSelections: 0, shotChangedSelections: 0,
        publicBearingContacts: 0, publicShotContacts: 0, selected: 0,
        publicChoiceLOSCalls: 0, publicDiagnosticLOSCalls: 0,
        physicalDamageEvents: 0, potentialHitWitnessPairs: 0,
        droneDamageEvents: 0, reflectionDamageEvents: 0,
        splashDamageEvents: 0, bodyDamageEvents: 0,
        nestedDamageEvents: 0, knownNonProjectileWitnessPairs: 0,
        maxPotentialHitWitnessPairs: 0,
        acceptedHitWitnessPairs: 0, hitWitnessLOSCalls: 0,
        hitChangedSelections: 0, hitHumanSelections: 0,
        shippingHumanSelections: 0, publicHitContacts: 0 };
      const originalDamage=g.damageTank;
      const hadOwnDamage=Object.prototype.hasOwnProperty.call(g,'damageTank');
      const originalDrones=g.updateDrones;
      const hadOwnDrones=Object.prototype.hasOwnProperty.call(g,'updateDrones');
      const originalBodies=g.bodyCollisions;
      const hadOwnBodies=Object.prototype.hasOwnProperty.call(g,'bodyCollisions');
      let droneScope=0,bodyScope=0,damageDepth=0;
      if(observe)g.updateDrones=function(...args){
        droneScope++;
        try{return originalDrones.apply(this,args);}finally{droneScope--;}
      };
      if(observe)g.bodyCollisions=function(...args){
        bodyScope++;
        try{return originalBodies.apply(this,args);}finally{bodyScope--;}
      };
      if(observe)g.damageTank=function(victim,amount,srcId,...rest){
        const hp=Number(victim&&victim.hp),nested=damageDepth>0;
        let out;
        damageDepth++;
        try{out=originalDamage.call(this,victim,amount,srcId,...rest);}
        finally{damageDepth--;}
        if(Number.isFinite(hp)&&victim&&victim.hp<hp){
          result.physicalDamageEvents++;
          // A physical call-site scope can disprove a credited owner as the
          // actual shooter. Reflection outranks its nested caller; splash
          // outranks the generic owner ID. Unclassified is NOT projectile.
          const nonProjectile=this.__v17ReflectingIronWill?'reflection':
            nested?'nested':this.__v172HardBlast?.active?'splash':
            droneScope?'drone':bodyScope?'body':null;
          if(nonProjectile==='drone')result.droneDamageEvents++;
          if(nonProjectile==='reflection')result.reflectionDamageEvents++;
          if(nonProjectile==='splash')result.splashDamageEvents++;
          if(nonProjectile==='body')result.bodyDamageEvents++;
          if(nonProjectile==='nested')result.nestedDamageEvents++;
          const shooter=(this.tanks||[]).find(t=>t&&t.id===srcId);
          if(shooter&&shooter!==victim){
            let possible=0,accepted=0;
            // The cheap two-hull viewport gate precedes expensive terrain
            // checks. Count direct LOS calls rather than guessing from the
            // engine's unrelated cumulative performance counter.
            const originalLOS=this.hasLineOfSight;
            const hadOwnLOS=Object.prototype.hasOwnProperty.call(this,'hasLineOfSight');
            if(typeof originalLOS==='function')
              this.hasLineOfSight=function(...args){
                result.hitWitnessLOSCalls++;
                return originalLOS.apply(this,args);
              };
            try{
              for(const observer of this.tanks||[]){
                if(!observer||!observer.ai||observer===shooter||
                   observer===victim||!alive(observer))continue;
                if(!T.inGameplayViewport(this,observer,shooter)||
                   !T.inGameplayViewport(this,observer,victim))continue;
                possible++;
                if(recordVisibleHit(T,this,observer,shooter,victim,C))accepted++;
              }
            }finally{
              if(hadOwnLOS)this.hasLineOfSight=originalLOS;
              else delete this.hasLineOfSight;
            }
            result.potentialHitWitnessPairs+=possible;
            result.acceptedHitWitnessPairs+=accepted;
            if(nonProjectile)result.knownNonProjectileWitnessPairs+=accepted;
            result.maxPotentialHitWitnessPairs=Math.max(
             result.maxPotentialHitWitnessPairs,possible);
          }
        }
        return out;
      };
      try {
        g.status = 'playing';
        g.paused = false;
        for (let tick = 1; tick <= 720; tick++) {
          g.update(1 / 60);
          if (!observe || tick % 12 || g.status !== 'playing') continue;
          for (const observer of g.tanks) {
            if (!observer || !observer.ai || observer.isPlayer || !alive(observer)) continue;
            result.observerSamples++;
            const visible = g.tanks.filter(q => q && q.id !== observer.id &&
              alive(q) && !allied(g, observer, q) &&
              T.canPerceive(g, C, observer, q) && !(q.spawnShieldT > 0));
            if (visible.length < 2) continue;
            result.multiVisible++;
            const shipping = T.chooseTarget(g, C, observer, observer.ai, g.time);
            // Instrument candidate-only LOS work. The game's existing perf
            // counter does not necessarily include these direct terrain calls.
            // Restore the exact original method before the next game update.
            const originalLOS = g.hasLineOfSight;
            const hadOwnLOS = Object.prototype.hasOwnProperty.call(g, 'hasLineOfSight');
            let queryPhase = 'choice';
            if (typeof originalLOS === 'function') {
              g.hasLineOfSight = function (...args) {
                if (queryPhase === 'choice') result.publicChoiceLOSCalls++;
                else result.publicDiagnosticLOSCalls++;
                return originalLOS.apply(this, args);
              };
            }
            try {
              const proposed = publicChoice(T, g, observer, C);
              const shotProposed = publicChoice(T, g, observer, C, 'shot');
              const hitProposed = publicChoice(T, g, observer, C, 'hit');
              if (shipping && proposed) {
                result.selected++;
                if (shipping.id !== proposed.id) result.changedSelections++;
                if (shotProposed && shipping.id !== shotProposed.id)
                  result.shotChangedSelections++;
                if(hitProposed && shipping.id !== hitProposed.id)
                  result.hitChangedSelections++;
                if(shipping.isPlayer)result.shippingHumanSelections++;
                if(hitProposed&&hitProposed.isPlayer)result.hitHumanSelections++;
              }
              queryPhase = 'diagnostic';
              for (const target of visible) {
                result.publicBearingContacts += bearingCount(T, g, observer, target, C);
                result.publicShotContacts += witnessedShotCount(T, g, observer, target, C);
                result.publicHitContacts += confirmedHitCount(g, observer, target);
              }
            } finally {
              if (hadOwnLOS) g.hasLineOfSight = originalLOS;
              else delete g.hasLineOfSight;
            }
          }
        }
        return { ...result,
          terrainQueries: Number(g.__novaPerf?.terrainQueries || 0),
          hash: digest(physical(g)),
          privateHash: digest((g.tanks || []).map(t => t && t.ai ?
            [t.id, t.ai.state, t.ai.__v180Posture, t.ai.__v1112TargetId,
             t.ai.__v1105TargetId, t.ai.__v180TargetId, t.ai.targetId,
             t.ai.__v1112NextThink, t.ai.__v181ObservedShotId,
             t.ai.__v181ObservedShotAt] : null)),
          draws: draws() };
      } finally {
        if(observe){
          if(hadOwnDamage)g.damageTank=originalDamage;
          else delete g.damageTank;
          if(hadOwnDrones)g.updateDrones=originalDrones;
          else delete g.updateDrones;
          if(hadOwnBodies)g.bodyCollisions=originalBodies;
          else delete g.bodyCollisions;
          assert.equal(droneScope,0,'research drone scope must not leak');
          assert.equal(bodyScope,0,'research body scope must not leak');
          assert.equal(damageDepth,0,'research damage recursion must unwind');
        }
        g.destroy();
      }
    });
  }
  const rows = [];
  for (const seed of seeds) {
    const control = run(seed, false);
    const observed = run(seed, true);
    assert.equal(observed.hash, control.hash, 'research changed physical state');
    assert.equal(observed.draws, control.draws, 'research consumed gameplay RNG');
    assert.equal(observed.privateHash, control.privateHash,
      'research changed private AI state');
    assert.ok(observed.observerSamples > 0, 'must inspect live AI observers');
    assert.ok(observed.acceptedHitWitnessPairs <= observed.potentialHitWitnessPairs,
      'physical evidence cannot exceed eligible public observer pairs');
    assert.ok(observed.knownNonProjectileWitnessPairs <= observed.acceptedHitWitnessPairs,
      'known non-projectile witness subset cannot exceed all witnesses');
    assert.ok(observed.hitWitnessLOSCalls <= 2 * observed.potentialHitWitnessPairs,
      'bounded event-time witness must use at most two LOS checks per pair');
    if (observed.publicBearingContacts > 0 || observed.publicShotContacts > 0)
      assert.ok(observed.publicChoiceLOSCalls + observed.publicDiagnosticLOSCalls > 0,
        'public pressure was observed but no direct terrain queries were counted');
    rows.push({ seed, observerSamples: observed.observerSamples,
      multiVisible: observed.multiVisible, selected: observed.selected,
      changedSelections: observed.changedSelections,
      shotChangedSelections: observed.shotChangedSelections,
      hitChangedSelections: observed.hitChangedSelections,
      hitHumanSelections: observed.hitHumanSelections,
      shippingHumanSelections: observed.shippingHumanSelections,
      publicHitContacts: observed.publicHitContacts,
      publicBearingContacts: observed.publicBearingContacts,
      publicShotContacts: observed.publicShotContacts,
      publicChoiceLOSCalls: observed.publicChoiceLOSCalls,
      publicDiagnosticLOSCalls: observed.publicDiagnosticLOSCalls,
      extraTerrainQueries: observed.terrainQueries - control.terrainQueries,
      physicalDamageEvents: observed.physicalDamageEvents,
      droneDamageEvents: observed.droneDamageEvents,
      reflectionDamageEvents: observed.reflectionDamageEvents,
      splashDamageEvents: observed.splashDamageEvents,
      bodyDamageEvents: observed.bodyDamageEvents,
      nestedDamageEvents: observed.nestedDamageEvents,
      knownNonProjectileWitnessPairs: observed.knownNonProjectileWitnessPairs,
      potentialHitWitnessPairs: observed.potentialHitWitnessPairs,
      acceptedHitWitnessPairs: observed.acceptedHitWitnessPairs,
      hitWitnessLOSCalls: observed.hitWitnessLOSCalls,
      maxPotentialHitWitnessPairs: observed.maxPotentialHitWitnessPairs });
  }
  console.log('NOVA_PUBLIC_BEARING_SATURATION_CENSUS ' + JSON.stringify(rows));
});

test('real composed projectile first-contact can create observer-owned confirmed-hit evidence',()=>{
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const T=g.__testFair,C=g.__testWindow.__novaMakeRequire('')('game/classes');
  const shooter=g.player;
  const [observer,victim]=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
  assert.ok(shooter&&observer&&victim);
  try{
   g.sfx.muted=true;g.sfx.startMusic=()=>{};
   g.setClass(shooter,'twin');
   for(const [t,x,y] of [[shooter,0,0],[observer,0,90],[victim,180,0]])
    Object.assign(t,{x,y,vx:0,vy:0,hp:1000,maxHp:1000,alive:true,
     spawnShieldT:0,shieldT:0,bulwarkT:0,cloakT:0,tauntT:0,invulnT:0});
   shooter.angle=0;shooter.fireCd=0;shooter.droneRespawnT=Infinity;
   // Keep non-shooters stationary; projectile collision and damage remain
   // owned by the actual 49-overlay Game.update path.
   observer.isPlayer=true;victim.isPlayer=true;
   g.tanks=[shooter,observer,victim];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.orbs=[];
   g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   if(g.shapeById)g.shapeById.clear();
   if(g.hash&&g.hash.clear)g.hash.clear();
   g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
   g.crasherTimer=Infinity;g.aiRespawns=[];
   g.spawnShape=()=>null;g.spawnPowerup=()=>null;
   g.spawnAITank=()=>null;g.spawnDrone=()=>null;
   g.w=800;g.h=600;g.cam.zoom=1;
   g.status='playing';g.paused=false;
   g.input.autofire=false;g.input.mouseActive=false;
   g.input.moveVec=()=>({x:0,y:0});
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   const originalFire=g.tryFire,originalDamage=g.damageTank;
   let births=0,contacts=0,recorded=0,otherDamage=0;
   g.tryFire=function(t){
    const n=this.bullets.length,out=originalFire.apply(this,arguments);
    if(t===shooter&&this.bullets.length>n)births+=this.bullets.length-n;
    return out;
   };
   g.damageTank=function(target,amount,ownerId,...rest){
    const hp=target.hp;
    const out=originalDamage.call(this,target,amount,ownerId,...rest);
    if(target===victim&&target.hp<hp){
     contacts++;
     assert.equal(ownerId,shooter.id,'physical projectile must retain shooter ownership');
     if(recordVisibleHit(T,this,observer,shooter,target,C))recorded++;
    }else if(target!==victim&&target.hp<hp)otherDamage++;
    return out;
   };
   g.input.firing=true;
   for(let tick=0;tick<90&&contacts===0;tick++){
    g.update(1/60);
    if(tick===0)g.input.firing=false;
   }
   assert.ok(births>0,'real player input must create a projectile');
   assert.ok(contacts>0,'projectile must reach the victim through Game.update');
   assert.equal(otherDamage,0,'fixture must not injure the observer');
   assert.ok(recorded>0,'visible projectile contact must record public evidence');
   assert.equal(confirmedHitCount(g,observer,victim),1);
   assert.ok(victim.hp<1000,'physical first contact must lower HP');
  }finally{g.destroy();}
 });
});


// Source-attribution negative control: Iron Will's actual reflected damage
// credits the Guardian's tank id even though the Guardian never fired.
// A public confirmed-hit witness MUST NOT infer a visible firing hull from
// damageTank's srcId alone. This test observes production composition; it
// does not enable the research target-selection proposal.
test('composed Iron Will reflection credits a non-firing tank as damage source',()=>{
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const guard=g.player,attacker=g.tanks.find(t=>t&&t!==guard);
  assert.ok(guard&&attacker,'composed Game must provide two tanks');
  try{
   g.sfx.muted=true;
   g.setClass(guard,'fortress');
   g.setClass(attacker,'scout');
   Object.assign(guard,{x:0,y:0,vx:0,vy:0,angle:0,
    hp:1000,maxHp:1000,alive:true,spawnShieldT:0,shieldT:0,
    invulnT:0,bulwarkT:0,tauntT:2,__v17PerfectGuardUntil:-1});
   Object.assign(attacker,{x:120,y:0,vx:0,vy:0,angle:Math.PI,
    hp:1000,maxHp:1000,alive:true,spawnShieldT:0,shieldT:0,
    invulnT:0,bulwarkT:0,tauntT:0,gene:null,perk:null});
   g.tanks=[guard,attacker];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.bullets=[];g.drones=[];g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
   g.time=10;
   const original=g.damageTank,observed=[];
   g.damageTank=function(target,amount,sourceId,...rest){
    const before=target.hp,reflecting=!!this.__v17ReflectingIronWill;
    const result=original.call(this,target,amount,sourceId,...rest);
    if(target.hp<before)observed.push({victim:target.id,sourceId,reflecting});
    return result;
   };
   g.damageTank(guard,20,attacker.id);
   assert.equal(g.bullets.length,0,'Guardian must not emit a projectile');
   assert.ok(observed.some(e=>e.victim===attacker.id&&
    e.sourceId===guard.id&&e.reflecting),
    'actual reflected HP loss must credit non-firing Guardian owner');
   assert.ok(attacker.hp<1000,'reflection must physically damage attacker');
  }finally{g.destroy();}
 });
});


// A normal non-Controller drone can credit its owner's tank id without
// the Controller dash presentation flag. A credited owner is not a physical
// shooter witness. This uses the real composed Game's drone contact path.
test('composed legacy drone contact credits owner without Controller dash flag',()=>{
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const owner=g.player,victim=g.tanks.find(t=>t&&t!==owner);
  assert.ok(owner&&victim);
  try{
   g.sfx.muted=true;
   g.setClass(owner,'scout');owner.gene='controller';
   Object.assign(owner,{x:0,y:0,vx:0,vy:0,hp:1000,maxHp:1000,
    alive:true,spawnShieldT:0,droneRespawnT:Infinity,swarmT:0});
   Object.assign(victim,{x:70,y:0,vx:0,vy:0,hp:1000,maxHp:1000,
    alive:true,spawnShieldT:0,shieldT:0,bulwarkT:0,invulnT:0,
    droneRespawnT:Infinity});
   g.tanks=[owner,victim];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.drones=[];g.bullets=[];g.shapes=[];g.__novaTerrain=[];
   g.__novaBattlefieldIndex=null;
   g.spawnDrone(owner,0);
   assert.equal(g.drones.length,1);
   const d=g.drones[0];
   Object.assign(d,{x:65,y:0,speed:0,attackCd:0,
    targetRef:victim,targetId:victim.id,retargetT:1,hitFlash:0});
   const original=g.damageTank,events=[];
   g.damageTank=function(target,amount,sourceId,...rest){
    const before=target.hp,flag=this.__novaDroneDamageOwner;
    const out=original.call(this,target,amount,sourceId,...rest);
    if(target.hp<before)events.push({targetId:target.id,sourceId,
     flagged:flag===owner.id});
    return out;
   };
   g.updateDrones(1/60);
   assert.ok(events.some(e=>e.targetId===victim.id&&e.sourceId===owner.id&&!e.flagged),
    'real legacy drone contact credits owner without a dash flag');
   assert.equal(g.bullets.length,0,'owner did not fire a projectile');
   assert.ok(victim.hp<1000,'legacy drone caused actual HP damage');
  }finally{g.destroy();}
 });
});


// Research falsification: a credited owner is NOT proof that the owner fired.
// The legacy gene drone hits through the composed updateDrones path; a naive
// srcId-based public witness accepts that owner as a shooter despite zero
// projectile births. This must be rejected by a typed physical-cause gate
// before the hit-pressure prototype can be considered for production.
test('composed drone damage would forge a naive visible-owner hit witness',()=>{
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const owner=g.player;
  const [victim,observer]=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
  assert.ok(owner&&victim&&observer);
  try{
   g.sfx.muted=true;
   g.setClass(owner,'scout');owner.gene='controller';
   Object.assign(owner,{x:0,y:0,vx:0,vy:0,hp:1000,maxHp:1000,
    alive:true,spawnShieldT:0,droneRespawnT:Infinity,swarmT:0});
   Object.assign(victim,{x:70,y:0,vx:0,vy:0,hp:1000,maxHp:1000,
    alive:true,spawnShieldT:0,shieldT:0,bulwarkT:0,invulnT:0});
   Object.assign(observer,{x:0,y:90,vx:0,vy:0,hp:1000,maxHp:1000,
    alive:true,spawnShieldT:0,shieldT:0,bulwarkT:0,invulnT:0});
   g.tanks=[owner,victim,observer];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.drones=[];g.bullets=[];g.shapes=[];g.__novaTerrain=[];
   g.__novaBattlefieldIndex=null;
   g.w=800;g.h=600;g.cam.zoom=1;g.time=10;
   g.spawnDrone(owner,0);
   assert.equal(g.drones.length,1);
   Object.assign(g.drones[0],{x:65,y:0,speed:0,attackCd:0,
    targetRef:victim,targetId:victim.id,retargetT:1,hitFlash:0});
   const T=g.__testFair,C=g.__testWindow.__novaMakeRequire('')('game/classes');
   const original=g.damageTank,originalDrones=g.updateDrones;
   let causeScope=null,contact=0,forged=0;
   // Scope is owned by the physical update path, not the credited owner ID.
   // try/finally prevents a thrown drone update from contaminating later hits.
   g.updateDrones=function(...args){
    const previous=causeScope;causeScope='drone';
    try{return originalDrones.apply(this,args);}finally{causeScope=previous;}
   };
   g.damageTank=function(target,amount,srcId,...rest){
    const before=target.hp;
    const out=original.call(this,target,amount,srcId,...rest);
    if(target===victim&&target.hp<before){
     contact++;
     assert.equal(srcId,owner.id,'drone hit credits its owner');
     assert.equal(causeScope,'drone','event-time physical update owns cause');
     if(recordVisibleHit(T,this,observer,owner,target,C))forged++;
    }
    return out;
   };
   g.updateDrones(1/60);
   assert.equal(causeScope,null,'physical cause scope must clear after update');
   assert.ok(contact>0,'real gene drone must damage victim');
   assert.equal(g.bullets.length,0,'credited owner fired no projectile');
   assert.ok(forged>0,'naive srcId witness falsely treats drone owner as shooter');
   assert.equal(confirmedHitCount(g,observer,victim),1,
    'naive hit-pressure count is contaminated by owner attribution');
  }finally{g.destroy();}
 });
});


// Composed splash attribution control: the tank credited for an explosion
// need not have a currently visible projectile. The Blast Hardening scope is
// authoritative evidence of splash, not proof of a direct shooter hit.
test('composed splash marks physical blast cause before owner-credit witness',()=>{
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const owner=g.player;
  const [victim,observer]=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
  assert.ok(owner&&victim&&observer);
  try{
   g.sfx.muted=true;
   g.setClass(owner,'scout');
   for(const [t,x,y] of [[owner,0,0],[victim,70,0],[observer,0,90]])
    Object.assign(t,{x,y,vx:0,vy:0,hp:1000,maxHp:1000,alive:true,
     spawnShieldT:0,shieldT:0,bulwarkT:0,invulnT:0,tauntT:0});
   g.tanks=[owner,victim,observer];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.shapes=[];g.drones=[];g.bullets=[];g.__novaTerrain=[];
   g.__novaBattlefieldIndex=null;g.tmp=[];
   if(g.hash&&g.hash.clear)g.hash.clear();
   for(const t of g.tanks)g.hash.insert(t);
   g.w=800;g.h=600;g.cam.zoom=1;g.time=10;
   const T=g.__testFair,C=g.__testWindow.__novaMakeRequire('')('game/classes');
   const original=g.damageTank;
   let splashContacts=0,naiveWitnesses=0;
   g.damageTank=function(target,amount,srcId,...rest){
    const before=target.hp,blast=!!this.__v172HardBlast?.active;
    const out=original.call(this,target,amount,srcId,...rest);
    if(target===victim&&target.hp<before){
     splashContacts++;
     assert.ok(blast,'blast context must be active during physical damage');
     assert.equal(srcId,owner.id,'splash credits explosion owner');
     if(recordVisibleHit(T,this,observer,owner,target,C))naiveWitnesses++;
    }
    return out;
   };
   g.splashAt(0,0,120,.5,owner.id,0,'#fff',60);
   assert.ok(splashContacts>0,'real composed blast must reduce victim HP');
   assert.equal(g.bullets.length,0,'blast fixture emitted no projectile');
   assert.ok(naiveWitnesses>0,'owner-ID witness wrongly implies direct fire');
   assert.equal(g.__v172HardBlast.active,false,'blast scope must restore');
  }finally{g.destroy();}
 });
});


// A tank-to-tank body collision credits the other hull's ID, yet neither
// hull fires a projectile. The actual composed bodyCollisions callsite is a
// fourth non-projectile physical cause for event-time public-hit attribution.
test('composed tank collision credits non-firing hull as damage owner',()=>{
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const owner=g.player;
  const [victim,observer]=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
  assert.ok(owner&&victim&&observer);
  try{
   g.sfx.muted=true;
   g.setClass(owner,'scout');g.setClass(victim,'scout');
   for(const [t,x,y] of [[owner,0,0],[victim,10,0],[observer,0,90]])
    Object.assign(t,{x,y,vx:0,vy:0,hp:1000,maxHp:1000,alive:true,
     spawnShieldT:0,shieldT:0,bulwarkT:0,invulnT:0,tauntT:0,
     stampedeT:0,perk:null,gene:null});
   g.tanks=[owner,victim,observer];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.shapes=[];g.drones=[];g.bullets=[];g.__novaTerrain=[];
   g.__novaBattlefieldIndex=null;g.tmp=[];g.bodyCd=new Map();
   if(g.hash&&g.hash.clear)g.hash.clear();
   for(const t of g.tanks)g.hash.insert(t);
   g.w=800;g.h=600;g.cam.zoom=1;g.time=10;
   const T=g.__testFair,C=g.__testWindow.__novaMakeRequire('')('game/classes');
   const original=g.damageTank;
   let contacts=0,naiveWitnesses=0,inBody=false;
   g.damageTank=function(target,amount,srcId,...rest){
    const before=target.hp;
    const out=original.call(this,target,amount,srcId,...rest);
    if(target===victim&&target.hp<before){
     contacts++;
     assert.ok(inBody,'damage must originate inside body collision');
     assert.equal(srcId,owner.id,'body hit credits colliding owner');
     if(recordVisibleHit(T,this,observer,owner,target,C))naiveWitnesses++;
    }
    return out;
   };
   const originalBodies=g.bodyCollisions;
   g.bodyCollisions=function(...args){
    inBody=true;try{return originalBodies.apply(this,args);}
    finally{inBody=false;}
   };
   g.bodyCollisions(1/60);
   assert.ok(contacts>0,'actual body collision must lower victim HP');
   assert.equal(g.bullets.length,0,'colliding hull fired no projectile');
   assert.ok(naiveWitnesses>0,'owner-ID witness confuses collision with fire');
   assert.equal(inBody,false,'body provenance scope must clear');
  }finally{g.destroy();}
 });
});


// Core Guardian-style taunt reflection is a separate recursive damageTank
// cause, even without the later Iron Will overlay's explicit reflection flag.
// Its credited defender ID must not certify that the defender fired.
test('composed core taunt reflection credits non-firing defender via nested damage',()=>{
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const defender=g.player,attacker=g.tanks.find(t=>t&&t!==defender);
  assert.ok(defender&&attacker);
  try{
   g.sfx.muted=true;
   g.setClass(defender,'scout');g.setClass(attacker,'scout');
   Object.assign(defender,{x:0,y:0,hp:1000,maxHp:1000,alive:true,
    spawnShieldT:0,shieldT:0,bulwarkT:0,invulnT:0,tauntT:2});
   Object.assign(attacker,{x:100,y:0,hp:1000,maxHp:1000,alive:true,
    spawnShieldT:0,shieldT:0,bulwarkT:0,invulnT:0,tauntT:0});
   g.tanks=[defender,attacker];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.bullets=[];g.drones=[];g.__novaTerrain=[];g.time=10;
   const original=g.damageTank,events=[];
   let depth=0;
   g.damageTank=function(target,amount,srcId,...rest){
    const nested=depth>0,wasIronWill=!!this.__v17ReflectingIronWill;
    const before=target.hp;
    depth++;
    let out;
    try{out=original.call(this,target,amount,srcId,...rest);}
    finally{depth--;}
    if(target.hp<before)events.push({target:target.id,srcId,nested,wasIronWill});
    return out;
   };
   g.damageTank(defender,20,attacker.id);
   assert.equal(depth,0,'nested damage scope must unwind');
   assert.equal(g.bullets.length,0,'defender did not fire');
   assert.ok(events.some(e=>e.target===attacker.id&&
    e.srcId===defender.id&&e.nested&&!e.wasIronWill),
    'core taunt must credit non-firing defender without Iron Will flag');
   assert.ok(attacker.hp<1000,'real nested reflection must damage attacker');
  }finally{g.destroy();}
 });
});


// A collectible nuke deals area damage and credits its collector's tank ID.
// It creates no direct projectile and must never certify visible gunfire.
test('composed nuke pickup credits a non-firing collector on real HP damage',()=>{
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  const owner=g.player;
  const [victim,observer]=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
  assert.ok(owner&&victim&&observer);
  try{
   g.sfx.muted=true;
   g.setClass(owner,'scout');g.setClass(victim,'scout');
   for(const [t,x,y] of [[owner,0,0],[victim,70,0],[observer,0,90]])
    Object.assign(t,{x,y,vx:0,vy:0,hp:1000,maxHp:1000,alive:true,
     spawnShieldT:0,shieldT:0,bulwarkT:0,invulnT:0,tauntT:0});
   g.tanks=[owner,victim,observer];
   g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
   g.shapes=[];g.drones=[];g.bullets=[];g.__novaTerrain=[];
   g.__novaBattlefieldIndex=null;g.tmp=[];
   if(g.hash&&g.hash.clear)g.hash.clear();
   for(const t of g.tanks)g.hash.insert(t);
   g.w=800;g.h=600;g.cam.zoom=1;g.time=10;
   const T=g.__testFair,C=g.__testWindow.__novaMakeRequire('')('game/classes');
   const original=g.damageTank,originalPowerup=g.applyPowerup;
   let contacts=0,naiveWitnesses=0,causeScope=null;
   g.applyPowerup=function(t,type){
    const previous=causeScope;
    if(type==='nuke')causeScope='nuke';
    try{return originalPowerup.call(this,t,type);}
    finally{causeScope=previous;}
   };
   g.damageTank=function(target,amount,srcId,...rest){
    const before=target.hp;
    const out=original.call(this,target,amount,srcId,...rest);
    if(target===victim&&target.hp<before){
     contacts++;
     assert.equal(causeScope,'nuke','pickup must own physical cause');
     assert.equal(srcId,owner.id,'nuke credits collector ID');
     if(recordVisibleHit(T,this,observer,owner,target,C))naiveWitnesses++;
    }
    return out;
   };
   g.status='playing';
   g.powerups=[{id:987654,kind:'powerup',type:'nuke',x:0,y:0,ttl:20,born:g.time}];
   g.updatePowerups(1/60);
   assert.equal(g.powerups.length,0,'real pickup collection must consume nuke');
   assert.ok(contacts>0,'collected nuke must reduce target HP');
   assert.equal(g.bullets.length,0,'collector fired no projectile');
   assert.ok(naiveWitnesses>0,'naive owner-ID hit witness mistakes nuke for fire');
   assert.equal(causeScope,null,'nuke scope must unwind after pickup');
  }finally{g.destroy();}
 });
});
