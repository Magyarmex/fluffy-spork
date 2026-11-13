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

test('seeded nested callback stress preserves explicit attribution boundaries',()=>{
  let seed=0x12345678;
  function rand(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return (seed>>>0)/4294967296;}
  let observed=0;
  for(let k=0;k<1000;k++){
    const g=game(), l=createProjectileCallbackLedger(g,{limit:24}); l.install();
    const expected=[];
    function action(level,shot,attribution){
      if(level>3)return;
      const name=['damageTank','damageShape','damageDrone'][Math.floor(rand()*3)];
      const target={id:Math.floor(rand()*100),hp:100}, dmg=rand()*10;
      if(shot!==null)l.withProjectile({id:shot},()=>{
        expected.push({id:shot,attribution,kind:name});
        g[name](target,dmg);
        if(rand()<.2)action(level+1,null,null);
      },attribution);
      else {expected.push({id:null,attribution:'unknown',kind:name});
        g[name](target,dmg);}
    }
    for(let j=0;j<12;j++){
      const mode=rand();
      action(0,mode<.3?null:j,mode>.65?'indirect':'direct');
    }
    const snap=l.snapshot();
    assert.equal(snap.events.length,expected.length);
    for(let i=0;i<expected.length;i++){
      assert.equal(snap.events[i].shotId,expected[i].id);
      assert.equal(snap.events[i].attribution,expected[i].attribution);
      assert.equal(snap.events[i].kind,expected[i].kind);
    }
    observed+=snap.events.length;
    l.uninstall();
  }
  assert.ok(observed>10000);
});

test('active unscoped damage cannot reset frame or uninstall observer',()=>{
  const g=game(), old=g.damageTank;
  let l;
  g.damageTank=function(t,d){
    assert.throws(()=>l.nextFrame(),/inside damage callback/);
    assert.throws(()=>l.uninstall(),/inside damage callback/);
    return old.call(this,t,d);
  };
  l=createProjectileCallbackLedger(g); l.install();
  g.damageTank({id:2,hp:10},1);
  assert.equal(l.snapshot().epoch,0);
  assert.equal(l.snapshot().events.length,1);
  assert.equal(l.uninstall(),true);
});

test('malformed victim getter cannot interrupt combat or claim complete observation',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  const victim={hp:10,get id(){throw Error('observer-only identity failure');}};
  assert.equal(l.withProjectile({id:1},()=>g.damageTank(victim,3)),7);
  const snap=l.snapshot();
  assert.equal(victim.hp,7);
  assert.equal(snap.observerErrors,1);
  assert.equal(snap.bounded,false);
  assert.equal(snap.allCapturedCallbacksAttributed,false);
  assert.equal(snap.events.length,0);
});

test('observer identity failure consumes first callback scope without laundering later damage',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  const bad={hp:10,get id(){throw Error('identity unavailable');}};
  l.withProjectile({id:77},()=>{
    assert.equal(g.damageTank(bad,2),8);
    assert.equal(g.damageShape({id:5,hp:10},3),7);
  });
  const s=l.snapshot();
  assert.equal(s.observerErrors,1);
  assert.equal(s.events.length,1);
  assert.equal(s.events[0].targetId,5);
  assert.equal(s.events[0].shotId,null);
  assert.equal(s.events[0].attribution,'unknown');
  assert.equal(s.allCapturedCallbacksAttributed,false);
});

test('overflow consumes first callback scope even when no event can be stored',()=>{
  const g=game(), l=createProjectileCallbackLedger(g,{limit:1}); l.install();
  g.damageTank({id:1,hp:10},1);
  l.withProjectile({id:88},()=>{
    g.damageTank({id:2,hp:10},1);
    g.damageDrone({id:3,hp:10},1);
  });
  const s=l.snapshot();
  assert.equal(s.overflow,2);
  assert.equal(s.events.length,1);
  assert.equal(s.events[0].shotId,null);
  assert.equal(s.bounded,false);
});

test('victim ID is sampled once even when getter changes on subsequent reads',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  let reads=0;
  const victim={hp:10,get id(){reads++;return reads===1?42:999;}};
  l.withProjectile({id:7},()=>g.damageTank(victim,1));
  const s=l.snapshot();
  assert.equal(reads,1);
  assert.equal(s.events[0].targetId,42);
  assert.equal(s.events[0].shotId,7);
  assert.equal(s.observerErrors,0);
});
