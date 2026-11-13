'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createProjectileCallbackLedger} = require('../research/projectile-callback-ledger.cjs');
function game() {
  return {damageTank(t,d) {t.hp -= d; return t.hp;},
    damageShape(t,d) {t.hp -= d; return t.hp;},
    damageDrone(t,d) {t.hp -= d; return t.hp;}};
}
test('preserves damage semantics, return values and lethal attribution', () => {
  const g=game(), original=g.damageTank, ledger=createProjectileCallbackLedger(g);
  const target={id:7,hp:10}; ledger.install();
  assert.equal(ledger.withProjectile({id:11},()=>g.damageTank(target,12)), -2);
  assert.deepEqual(ledger.snapshot().events[0],{epoch:0,kind:'damageTank',targetId:7,
    shotId:11,attribution:'direct',requestedDamage:12});
  ledger.uninstall(); assert.equal(g.damageTank,original);
});
test('unscoped callbacks remain unknown, never owner-attributed', () => {
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  g.damageShape({id:5,hp:10},2,123);
  assert.equal(l.snapshot().events[0].attribution,'unknown');
  assert.equal(l.snapshot().events[0].shotId,null);
});
test('nested indirect splash and exceptions restore attribution scope', () => {
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  assert.throws(()=>l.withProjectile({id:1},()=>{
    g.damageTank({id:2,hp:10},1);
    l.withProjectile({id:1},()=>g.damageShape({id:3,hp:10},2),'indirect');
    throw Error('callback failure');
  }),/callback failure/);
  g.damageDrone({id:4,hp:10},1);
  assert.deepEqual(l.snapshot().events.map(e=>e.attribution),['direct','indirect','unknown']);
});
test('budget overflow explicitly invalidates completeness', () => {
  const g=game(), l=createProjectileCallbackLedger(g,{limit:1}); l.install();
  g.damageTank({hp:10},1); g.damageTank({hp:10},1);
  const s=l.snapshot(); assert.equal(s.events.length,1);
  assert.equal(s.overflow,1); assert.equal(s.bounded,false);
  assert.equal(s.allCapturedCallbacksAttributed,false);
  assert.ok(Object.isFrozen(s.events));
});
test('frame epoch cannot advance during callback scope', () => {
  const l=createProjectileCallbackLedger(game());
  assert.throws(()=>l.withProjectile({id:2},()=>l.nextFrame()),/inside/);
  l.nextFrame(); assert.equal(l.snapshot().epoch,1);
});
test('failed install never partially wraps a game', () => {
  const g=game(), old=g.damageTank; delete g.damageDrone;
  const l=createProjectileCallbackLedger(g);
  assert.throws(()=>l.install(),/damageDrone/);
  assert.equal(g.damageTank,old);
});

test('nested unscoped damage cannot inherit parent shot identity', () => {
  const g=game(), original=g.damageTank;
  g.damageTank=function(t,d) { const v=original.call(this,t,d);
    this.damageDrone({id:99,hp:10},1); return v; };
  const l=createProjectileCallbackLedger(g); l.install();
  l.withProjectile({id:4},()=>g.damageTank({id:7,hp:10},2));
  const e=l.snapshot().events;
  assert.equal(e[0].shotId,4);
  assert.equal(e[1].shotId,null);
  assert.equal(e[1].attribution,'unknown');
});
test('each frame has independent bounded complete event ledger', () => {
  const g=game(), l=createProjectileCallbackLedger(g,{limit:1}); l.install();
  g.damageTank({hp:10},1); g.damageTank({hp:10},1);
  assert.equal(l.snapshot().bounded,false);
  l.nextFrame();
  assert.equal(l.snapshot().events.length,0);
  assert.equal(l.snapshot().overflow,0);
  g.damageShape({id:3,hp:10},1);
  assert.equal(l.snapshot().bounded,true);
  assert.equal(l.snapshot().allCapturedCallbacksAttributed,false);
  assert.equal(l.snapshot().unknown,1);
  assert.equal(l.snapshot().events[0].epoch,1);
});

test('fully scoped callback reports captured attribution, not whole-game completeness',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  l.withProjectile({id:8},()=>g.damageTank({id:2,hp:10},3));
  const s=l.snapshot();
  assert.equal(s.bounded,true);
  assert.equal(s.allCapturedCallbacksAttributed,true);
  assert.equal(Object.hasOwn(s,'complete'),false,
    'the ledger cannot certify terrain, direct HP writes or missed contacts');
});

test('install and uninstall restore inherited prototype methods exactly',()=>{
  class Game {damageTank(t,d){t.hp-=d;} damageShape(t,d){t.hp-=d;}
    damageDrone(t,d){t.hp-=d;}}
  const g=new Game(), l=createProjectileCallbackLedger(g);
  assert.equal(Object.hasOwn(g,'damageTank'),false);
  l.install(); assert.equal(Object.hasOwn(g,'damageTank'),true);
  l.uninstall(); assert.equal(Object.hasOwn(g,'damageTank'),false);
  assert.equal(g.damageTank,Game.prototype.damageTank);
});
test('own descriptor and enumerable flags survive installation',()=>{
  const g=game(), original=Object.getOwnPropertyDescriptor(g,'damageTank');
  const l=createProjectileCallbackLedger(g);
  l.install(); l.uninstall();
  assert.deepEqual(Object.getOwnPropertyDescriptor(g,'damageTank'),original);
});
test('external callback replacement cannot be clobbered by uninstall',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  const replacement=function(){return 'external';};g.damageTank=replacement;
  assert.throws(()=>l.uninstall(),/changed after ledger install/);
  assert.equal(g.damageTank,replacement);
});
test('non-configurable methods fail before any partial wrapping',()=>{
  const g=game(), old=g.damageTank;
  Object.defineProperty(g,'damageDrone',{value:g.damageDrone,configurable:false});
  const l=createProjectileCallbackLedger(g);
  assert.throws(()=>l.install(),/cannot be safely wrapped/);
  assert.equal(g.damageTank,old);
});

test('missing victim identity prevents fully attributed claims',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  l.withProjectile({id:2},()=>g.damageTank({hp:10},3));
  const s=l.snapshot();
  assert.equal(s.events[0].targetId,null);
  assert.equal(s.unidentifiedTargets,1);
  assert.equal(s.allCapturedCallbacksAttributed,false);
});

test('one explicit scope cannot misattribute a second unrelated callback',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  l.withProjectile({id:17},()=>{
    g.damageTank({id:2,hp:10},1);
    g.damageDrone({id:3,hp:10},1);
  });
  const e=l.snapshot().events;
  assert.equal(e[0].shotId,17);
  assert.equal(e[1].shotId,null);
  assert.equal(e[1].attribution,'unknown');
  assert.equal(l.snapshot().allCapturedCallbacksAttributed,false);
});
test('explicit nested indirect callback still has its own single-event scope',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  l.withProjectile({id:4},()=>{
    g.damageTank({id:1,hp:10},1);
    l.withProjectile({id:4},()=>g.damageDrone({id:2,hp:10},1),'indirect');
  });
  assert.deepEqual(l.snapshot().events.map(e=>e.attribution),['direct','indirect']);
});
