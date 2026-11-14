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

test('projectile ID getter is sampled once before scope attribution',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  let reads=0;
  const shot={get id(){reads++;return reads===1?73:999;}};
  l.withProjectile(shot,()=>g.damageTank({id:5,hp:10},2));
  const s=l.snapshot();
  assert.equal(reads,1);
  assert.equal(s.events[0].shotId,73);
  assert.equal(s.events[0].attribution,'direct');
  assert.equal(s.observerErrors,0);
});

test('invalid sampled projectile ID cannot establish a scope or block damage',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  let reads=0;
  const shot={get id(){reads++;return NaN;}}, victim={id:1,hp:10};
  assert.equal(l.withProjectile(shot,()=>g.damageTank(victim,3)),7);
  assert.equal(reads,1);
  assert.equal(victim.hp,7);
  const s=l.snapshot();
  assert.equal(s.events[0].shotId,null);
  assert.equal(s.events[0].attribution,'unknown');
  assert.equal(s.observerErrors,1);
  assert.equal(s.bounded,false);
});

test('throwing projectile identity getter cannot interrupt damage',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  const shot={get id(){throw Error('bad observer identity');}}, victim={id:9,hp:10};
  assert.equal(l.withProjectile(shot,()=>g.damageShape(victim,4)),6);
  const s=l.snapshot();
  assert.equal(s.events[0].shotId,null);
  assert.equal(s.observerErrors,1);
  assert.equal(s.allCapturedCallbacksAttributed,false);
});

test('invalid nested projectile cannot borrow the parent shot ID',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  l.withProjectile({id:11},()=>{
    l.withProjectile({id:NaN},()=>g.damageTank({id:1,hp:10},1));
    g.damageDrone({id:2,hp:10},1);
  });
  const s=l.snapshot();
  assert.deepEqual(s.events.map(e=>e.shotId),[null,11]);
  assert.equal(s.observerErrors,1);
});

test('invalid identity fallback preserves callback exceptions and outer scope',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  assert.throws(()=>l.withProjectile({id:12},()=>
    l.withProjectile(null,()=>{throw Error('combat failure');})),/combat failure/);
  l.withProjectile({id:13},()=>g.damageTank({id:3,hp:10},1));
  assert.equal(l.snapshot().events[0].shotId,13);
  assert.equal(l.snapshot().observerErrors,1);
});

test('malformed attribution metadata never blocks combat or inherits outer identity',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  const victim={id:4,hp:10};
  l.withProjectile({id:12},()=>{
    assert.equal(l.withProjectile({id:13},()=>g.damageTank(victim,3),'unexpected'),7);
    g.damageDrone({id:5,hp:10},2);
  });
  const snap=l.snapshot();
  assert.equal(victim.hp,7);
  assert.deepEqual(snap.events.map(e=>e.shotId),[null,12]);
  assert.equal(snap.observerErrors,1);
  assert.equal(snap.bounded,false);
});


test('install samples stateful method getter once and wraps the validated callback',()=>{
  const g=game();
  const first=function(t,d){t.hp-=d;return 'first';};
  const second=function(t,d){t.hp-=d*10;return 'second';};
  let reads=0;
  Object.defineProperty(g,'damageTank',{configurable:true,enumerable:true,
    get(){reads++;return reads===1?first:second;}});
  const l=createProjectileCallbackLedger(g);
  assert.equal(l.install(),true);
  assert.equal(reads,1,'preflight and wrapping must share one method snapshot');
  const target={id:7,hp:20};
  assert.equal(l.withProjectile({id:3},()=>g.damageTank(target,2)),'first');
  assert.equal(target.hp,18);
  assert.equal(l.snapshot().events[0].shotId,3);
  assert.equal(l.uninstall(),true);
  assert.equal(Object.getOwnPropertyDescriptor(g,'damageTank').get instanceof Function,true);
});

test('throwing method getter fails preflight without partially wrapping callbacks',()=>{
  const g=game(), original=g.damageTank;
  Object.defineProperty(g,'damageShape',{configurable:true,
    get(){throw Error('unavailable callback');}});
  const l=createProjectileCallbackLedger(g);
  assert.throws(()=>l.install(),/unavailable callback/);
  assert.equal(g.damageTank,original);
  assert.equal(Object.hasOwn(g,'damageTank'),true);
});


test('unused explicit scopes are measured without manufacturing missed-hit claims',()=>{
  const g=game(), l=createProjectileCallbackLedger(g); l.install();
  const hp={id:1,hp:20};
  assert.equal(l.withProjectile({id:5},()=>{hp.hp-=3;return hp.hp;}),17);
  assert.equal(l.snapshot().unusedScopes,1);
  assert.equal(l.snapshot().scopedCalls,1);
  assert.equal(l.snapshot().events.length,0);
  assert.equal(l.snapshot().bounded,true);
  l.withProjectile({id:6},()=>g.damageTank(hp,2));
  assert.equal(l.snapshot().unusedScopes,1);
  assert.equal(l.snapshot().scopedCalls,2);
  assert.equal(l.snapshot().events[0].shotId,6);
  l.nextFrame();
  assert.equal(l.snapshot().unusedScopes,0);
  assert.equal(l.snapshot().scopedCalls,0);
  assert.equal(l.snapshot().events.length,0);
});

test('scope exhaustion is tracked even when the callback throws or observation overflows',()=>{
  const g=game(), l=createProjectileCallbackLedger(g,{limit:1}); l.install();
  assert.throws(()=>l.withProjectile({id:1},()=>{throw Error('pre-hit failure');}),/pre-hit failure/);
  assert.equal(l.snapshot().unusedScopes,1);
  l.withProjectile({id:2},()=>g.damageTank({id:1,hp:10},1));
  l.withProjectile({id:3},()=>g.damageTank({id:2,hp:10},1));
  assert.equal(l.snapshot().unusedScopes,1,'overflow still consumes the scope');
  assert.equal(l.snapshot().overflow,1);
});


test('browser research ledger loads without CommonJS and remains read-only',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const source=fs.readFileSync(path.resolve(__dirname,'../research/projectile-callback-ledger.cjs'),'utf8');
  const context=vm.createContext({window:{},Number,Object,Map,TypeError,RangeError,Error});
  new vm.Script(source).runInContext(context);
  const factory=context.window.__novaResearchProjectileCallbackLedger?.createProjectileCallbackLedger;
  assert.equal(typeof factory,'function');
  const g=game(),l=factory(g);l.install();
  const t={id:1,hp:10};
  l.withProjectile({id:7},()=>g.damageTank(t,3));
  assert.equal(t.hp,7);
  assert.equal(l.snapshot().events[0].shotId,7);
  assert.equal(l.uninstall(),true);
});


test('snapshot explicitly distinguishes installed observer from inactive research state',()=>{
  const g=game(),l=createProjectileCallbackLedger(g);
  assert.equal(l.snapshot().installed,false);
  assert.equal(l.install(),true);
  assert.equal(l.snapshot().installed,true);
  assert.equal(l.uninstall(),true);
  assert.equal(l.snapshot().installed,false);
});


test('allocation-light counters agree with event snapshot and reset per frame',()=>{
  const g=game(),l=createProjectileCallbackLedger(g,{limit:2});l.install();
  l.withProjectile({id:8},()=>g.damageTank({id:1,hp:10},2));
  l.withProjectile({id:9},()=>{});
  g.damageShape({id:2,hp:10},1);
  const s=l.snapshot(),c=l.counters();
  assert.equal(c.epoch,s.epoch);
  assert.equal(c.eventsCaptured,s.events.length);
  for(const key of ['installed','overflow','unknown','unidentifiedTargets',
    'observerErrors','scopedCalls','unusedScopes','coverAttributed','bounded'])
    assert.equal(c[key],s[key],key);
  assert.equal(c.scopedCalls,2);
  assert.equal(c.unusedScopes,1);
  assert.equal(c.unknown,1);
  assert.equal(Object.hasOwn(c,'events'),false);
  assert.equal(Object.isFrozen(c),true);
  l.nextFrame();
  assert.equal(l.counters().eventsCaptured,0);
  assert.equal(l.counters().scopedCalls,0);
  assert.equal(l.counters().unusedScopes,0);
});

test('explicit source tags distinguish core and Battlefield callbacks without changing combat',()=>{
  const game={damageTank(t,d){t.hp-=d;return t.hp;},
    damageShape(t,d){t.hp-=d;return t.hp;},
    damageDrone(t,d){t.hp-=d;return t.hp;}};
  const ledger=createProjectileCallbackLedger(game);
  ledger.install();
  const a={id:1,hp:20},b={id:2,hp:20},c={id:3,hp:20};
  assert.equal(ledger.withProjectile({id:101},()=>game.damageTank(a,3),'direct','core'),17);
  assert.equal(ledger.withProjectile({id:102},()=>game.damageShape(b,4),'direct','battlefield'),16);
  assert.equal(ledger.withProjectile({id:103},()=>game.damageDrone(c,5)),15);
  assert.deepEqual(ledger.snapshot().events.map(e=>e.source),['core','battlefield',undefined]);
  assert.equal(ledger.counters().coreAttributed,1);
  assert.equal(ledger.counters().battlefieldAttributed,1);
  assert.equal(ledger.withProjectile({id:104},()=>game.damageTank(a,1),'direct','invented'),16);
  assert.equal(ledger.snapshot().events.at(-1).shotId,null);
  assert.equal(ledger.snapshot().observerErrors,1);
  ledger.nextFrame();
  assert.equal(ledger.counters().coreAttributed,0);
  assert.equal(ledger.counters().battlefieldAttributed,0);
  ledger.uninstall();
});

test('cover HP witness caps overkill and does not claim first-contact timing',()=>{
  const g=game(),l=createProjectileCallbackLedger(g);
  assert.equal(l.recordCoverDamage({id:13},{id:-1001},7,-9),true);
  const e=l.snapshot().events[0];
  assert.equal(e.kind,'coverDamage');
  assert.equal(e.shotId,13);
  assert.equal(e.targetId,-1001);
  assert.equal(e.effectiveDamage,7,'overkill cannot count more than remaining cover HP');
  assert.equal(e.timing,'unknown');
  assert.equal(l.counters().coverAttributed,1);
  assert.equal(l.recordCoverDamage({id:14},{id:-1002},10,6),true);
  assert.equal(l.snapshot().events[1].effectiveDamage,4);
  assert.equal(l.recordCoverDamage({id:15},{id:-1003},10,11),false);
  assert.equal(l.snapshot().observerErrors,1);
  assert.equal(l.snapshot().bounded,false);
});

test('cover witness counters reset independently of core and Battlefield attribution',()=>{
  const l=createProjectileCallbackLedger(game());
  l.recordCoverDamage({id:1},{id:-1000},10,8);
  assert.equal(l.counters().coverAttributed,1);
  assert.equal(l.counters().coreAttributed,0);
  assert.equal(l.counters().battlefieldAttributed,0);
  l.nextFrame();
  assert.equal(l.counters().coverAttributed,0);
  assert.equal(l.counters().eventsCaptured,0);
});

test('retirement witness distinguishes observed terminal transition from missed-hit inference',()=>{
  const l=createProjectileCallbackLedger(game(),{limit:2});
  assert.equal(l.recordProjectileRetirement({id:19,hits:0,pen:1},'ttl'),true);
  assert.equal(l.recordProjectileRetirement({id:20},'bounds'),true);
  assert.equal(l.counters().retiredAttributed,2);
  assert.equal(l.counters().ttlRetirements,1);
  assert.equal(l.counters().rawPenOneZeroHitTtl,1);
  assert.equal(l.snapshot().events[0].priorHits,0);
  assert.equal(l.snapshot().events[0].remainingPen,1);
  assert.equal(l.snapshot().events[1].priorHits,null);
  assert.equal(l.counters().boundsRetirements,1);
  assert.equal(l.counters().ambiguousRetirements,0);
  assert.equal(l.counters().damageCallbacksCaptured,0);
  assert.equal(l.counters().eventsCaptured,2);
  assert.deepEqual(l.snapshot().events.map(e=>[e.shotId,e.reason,e.timing]),
    [[19,'ttl','upper-bound'],[20,'bounds','upper-bound']]);
  assert.equal(l.recordProjectileRetirement({id:21},'ttl'),false);
  assert.equal(l.counters().overflow,1);
  assert.equal(l.snapshot().bounded,false);
  l.nextFrame();
  assert.equal(l.counters().retiredAttributed,0);
  assert.equal(l.counters().ttlRetirements,0);
  assert.equal(l.counters().rawPenOneZeroHitTtl,0);
  assert.equal(l.counters().boundsRetirements,0);
  assert.equal(l.recordProjectileRetirement({id:22},'ttl-or-bounds'),true);
  assert.equal(l.snapshot().events[0].reason,'ttl-or-bounds');
  assert.equal(l.counters().ambiguousRetirements,1);
  assert.equal(l.recordProjectileRetirement({id:23},'guessed-hit'),false);
  assert.equal(l.recordProjectileRetirement({},'ttl'),false);
  assert.equal(l.counters().observerErrors,2);
});

test('interception witness records actual core pair without inventing contact time',()=>{
  const l=createProjectileCallbackLedger(game(),{limit:2});
  assert.equal(l.recordProjectileInterception({id:31,hp:-5},{id:32,hp:5},10,15),true);
  const e=l.snapshot().events[0];
  assert.equal(e.kind,'projectileInterception');
  assert.equal(e.shotId,31);assert.equal(e.otherShotId,32);
  assert.equal(e.beforeHpA,10);assert.equal(e.beforeHpB,15);
  assert.equal(e.afterHpA,-5);assert.equal(e.afterHpB,5);
  assert.equal(e.timing,'unknown');
  assert.equal(l.counters().coreInterceptions,1);
  assert.equal(l.counters().damageCallbacksCaptured,0);
  assert.equal(l.recordProjectileInterception({id:31},{id:31},10,15),false);
  assert.equal(l.counters().observerErrors,1);
  l.nextFrame();assert.equal(l.counters().coreInterceptions,0);
  assert.equal(l.recordProjectileInterception({id:41,hp:3},{id:42,hp:4},10,15,'sniper'),true);
  assert.equal(l.counters().sniperInterceptions,1);
  assert.equal(l.counters().damageCallbacksCaptured,0);
  assert.equal(l.snapshot().events[0].source,'sniper');
});

test('Battlefield mutual-TTL interception has independent bounded accounting',()=>{
  const l=createProjectileCallbackLedger(game(),{limit:2});
  assert.equal(l.recordProjectileInterception(
    {id:51,hp:-3},{id:52,hp:3},8,11,'battlefield-ttl'),true);
  const e=l.snapshot().events[0];
  assert.equal(e.source,'battlefield-ttl');
  assert.equal(e.kind,'projectileInterception');
  assert.equal(e.timing,'unknown');
  assert.equal(l.counters().battlefieldTtlInterceptions,1);
  assert.equal(l.counters().coreInterceptions,0);
  assert.equal(l.counters().sniperInterceptions,0);
  assert.equal(l.counters().damageCallbacksCaptured,0);
  assert.equal(l.recordProjectileInterception(
    {id:51,hp:2},{id:52,hp:1},8,11,'made-up-owner'),false);
  assert.equal(l.counters().observerErrors,1);
  l.nextFrame();
  assert.equal(l.counters().battlefieldTtlInterceptions,0);
});

test('interception witness abstains on impossible HP growth without fabricating contact',()=>{
  const l=createProjectileCallbackLedger(game());
  assert.equal(l.recordProjectileInterception(
    {id:61,hp:11},{id:62,hp:4},10,5,'battlefield-ttl'),false);
  assert.equal(l.recordProjectileInterception(
    {id:61,hp:9},{id:62,hp:6},10,5,'sniper'),false);
  assert.equal(l.counters().eventsCaptured,0);
  assert.equal(l.counters().battlefieldTtlInterceptions,0);
  assert.equal(l.counters().sniperInterceptions,0);
  assert.equal(l.counters().observerErrors,2);
  assert.equal(l.counters().bounded,false);
});

test('Sniper swept contact fraction is bounded and never presented as an absolute time',()=>{
  const l=createProjectileCallbackLedger(game());
  assert.equal(l.recordProjectileInterception({id:81,hp:1},{id:82,hp:2},4,5,'sniper',.375),true);
  const e=l.snapshot().events[0];
  assert.equal(e.timing,'normalized-sweep-fraction');
  assert.equal(e.contactFraction,.375);
  assert.equal(e.source,'sniper');
  assert.equal(l.recordProjectileInterception({id:83,hp:1},{id:84,hp:2},4,5,'sniper',null),true);
  assert.equal(l.snapshot().events[1].timing,'unknown');
  assert.equal(Object.hasOwn(l.snapshot().events[1],'contactFraction'),false);
  for(const fraction of [-.01,1.01,NaN,Infinity])
    assert.equal(l.recordProjectileInterception({id:85,hp:1},{id:86,hp:2},4,5,'sniper',fraction),false);
  assert.equal(l.recordProjectileInterception({id:87,hp:1},{id:88,hp:2},4,5,'core',.25),false);
  assert.equal(l.counters().observerErrors,5);
});

test('certified Battlefield mutual-TTL contact uses frame seconds, never Sniper fractions',()=>{
  const l=createProjectileCallbackLedger(game());
  assert.equal(l.recordProjectileInterception({id:91,hp:2},{id:92,hp:3},5,6,
    'battlefield-ttl',null,.008),true);
  const e=l.snapshot().events[0];
  assert.equal(e.timing,'certified-frame-seconds');
  assert.equal(e.contactSeconds,.008);
  assert.equal(Object.hasOwn(e,'contactFraction'),false);
  for(const time of [-1,0,.051,NaN,Infinity])
    assert.equal(l.recordProjectileInterception({id:93,hp:2},{id:94,hp:3},5,6,
      'battlefield-ttl',null,time),false);
  assert.equal(l.recordProjectileInterception({id:95,hp:2},{id:96,hp:3},5,6,
    'sniper',null,.008),false);
  assert.equal(l.counters().observerErrors,6);
});
