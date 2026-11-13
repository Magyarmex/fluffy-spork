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
    shotId:11,attribution:'direct',damage:12});
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
  assert.equal(s.overflow,1); assert.equal(s.complete,false);
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
