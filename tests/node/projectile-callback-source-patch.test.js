'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {patchBattlefieldMutualInterception, patchSniperInterception, patchMaterializedCore, patchMaterializedRetirement, patchMaterializedInterception, patchBattlefieldCallbacks, patchBattlefieldCover, guardedShotCall, CALLS} = require('../research/projectile-callback-source-patch.cjs');
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
test('research patch changes exactly three authoritative core callbacks, not splash or overlays',()=>{
  const patched = patchMaterializedCore(html);
  assert.notEqual(patched, html);
  assert.equal((patched.match(/method\.call\(ledger,b,\(\)=>/g)||[]).length,3);
  const start=html.indexOf('    updateBullets(dt) {');
  const end=html.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {',start);
  assert.equal(patched.slice(0,start),html.slice(0,start));
  const patchedEnd=patched.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {',start);
  assert.equal(patched.slice(patchedEnd),html.slice(end));
  for(const call of CALLS)assert.ok(patched.includes(' : '+call.slice(0,-1)+';})();'));
});
test('research patch fails closed on changed or ambiguous callback ownership',()=>{
  for(const call of CALLS){
    assert.throws(()=>patchMaterializedCore(html.replace(call,'/* changed callback */')),
      /expected one core callback/);
    const start=html.indexOf('    updateBullets(dt) {');
    assert.throws(()=>patchMaterializedCore(html.slice(0,start+'    updateBullets(dt) {'.length)+call+'\n'+html.slice(start+'    updateBullets(dt) {'.length)),
      /expected one core callback/);
  }
  assert.throws(()=>patchMaterializedCore('not a game'),/shipping core boundaries/);
});
test('patched materialized core inline JavaScript remains syntactically valid',()=>{
  const patched=patchMaterializedCore(html);
  const blocks=[...patched.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length>0);
  for(const block of blocks)new vm.Script(block[1],{filename:'research-patched-index.html'});
});


function compileUpdater(source){
  const marker='    updateBullets(dt) {',at=source.indexOf(marker);
  assert.ok(at>=0);
  let pos=at+marker.length,depth=1;
  while(depth&&pos<source.length){
    if(source[pos]==='{')depth++;
    else if(source[pos]==='}')depth--;
    pos++;
  }
  assert.equal(depth,0);
  const body=source.slice(at+marker.length,pos-1);
  return new Function('types_1','classes_1','M','return function(dt){'+body+'}')(
    {dist2:(x,y,a,b)=>(x-a)**2+(y-b)**2},{CLASSES:{scout:{size:15}}},2250);
}
function fixture(source,observe,kind='shape',hz=30){
  const shape={kind,id:41,x:0,y:0,r:10,hp:10,alive:true,cls:'scout',ownerId:99};
  const bullet={kind:'bullet',id:29,ownerId:5,x:0,y:0,vx:0,vy:0,
    ttl:1,r:5,dmg:2,pen:1,hits:0,dead:false,shell:false,beam:false};
  const g={bullets:[bullet],tmp:[],hash:{query(_x,_y,_r,out){out.push(shape);}},
    initBulletIntegrity(){},cosmeticRandom(){return 1;},
    resolveBulletCollisions(){},addParticles(){},
    damageShape(t,d){t.hp-=d;return t.hp;},
    damageTank(t,d){t.hp-=d;return t.hp;},
    damageDrone(t,d){t.hp-=d;return t.hp;}};
  const ledger=observe?require('../research/projectile-callback-ledger.cjs')
    .createProjectileCallbackLedger(g):null;
  if(ledger){ledger.install();g.__novaShotLedger=ledger;}
  if(observe==='malformed')g.__novaShotLedger={};
  if(observe==='throwing-ledger')Object.defineProperty(g,'__novaShotLedger',{
    configurable:true,get(){throw Error('research ledger getter');}});
  if(observe==='throwing-callable-before')g.__novaShotLedger={withProjectile(){throw Error('observer before');}};
  if(observe==='throwing-callable-after')g.__novaShotLedger={withProjectile(_shot,fn){fn();throw Error('observer after');}};
  if(observe==='ignoring-callable')g.__novaShotLedger={withProjectile(){return 99;}};
  if(observe==='twice-callable')g.__novaShotLedger={withProjectile(_shot,fn){fn();fn();}};
  if(observe==='throwing-method')g.__novaShotLedger=Object.defineProperty({},
    'withProjectile',{get(){throw Error('research method getter');}});
  compileUpdater(source).call(g,1/hz);
  const result={hp:shape.hp,pen:bullet.pen,hits:bullet.hits,dead:bullet.dead,
    ttl:bullet.ttl,bulletCount:g.bullets.length,
    events:ledger?ledger.snapshot().events:[]};
  if(ledger)ledger.uninstall();
  return result;
}
test('patched actual shipping updater preserves damage and records explicit shot ID',()=>{
  const baseline=fixture(html,false);
  const observed=fixture(patchMaterializedCore(html),true);
  assert.deepEqual({...observed,events:[]},baseline);
  assert.equal(observed.hp,8);
  assert.equal(observed.pen,0);
  assert.deepEqual(observed.events.map(e=>[e.shotId,e.targetId,e.kind,e.requestedDamage]),
    [[29,41,'damageShape',2]]);
});

test('malformed observer falls back to unmodified core damage across simulation rates',()=>{
  for(const hz of [30,60,120,240]){
    const base=fixture(html,false,'shape',hz);
    for(const mode of ['malformed','throwing-ledger','throwing-method','throwing-callable-before','throwing-callable-after','ignoring-callable','twice-callable']){
      const malformed=fixture(patchMaterializedCore(html),mode,'shape',hz);
      // The installed passive damage observer can still record an unknown-origin
      // callback even when the explicit shot scope is unavailable. Compare
      // physical outcomes independently of that legitimate observation.
      assert.deepEqual({...malformed,events:[]},base,mode+' at '+hz+'Hz');
      assert.ok(malformed.events.every(event=>event.shotId===null),
        'unavailable observer must never manufacture projectile attribution');
    }
  }
});
test('browser-only patch preserves tank/drone/shape damage across 30–240Hz',()=>{
  for(const kind of ['shape','tank','drone'])for(const hz of [30,60,120,240]){
    const base=fixture(html,false,kind,hz);
    const observed=fixture(patchMaterializedCore(html),true,kind,hz);
    assert.deepEqual({...observed,events:[]},base,kind+' at '+hz+'Hz');
    assert.equal(observed.hp,8);
    assert.equal(observed.events.length,1);
    assert.equal(observed.events[0].shotId,29);
    assert.equal(observed.events[0].targetId,41);
    assert.equal(observed.events[0].source,'core');
    assert.equal(observed.events[0].kind,
      kind==='shape'?'damageShape':kind==='tank'?'damageTank':'damageDrone');
  }
});

test('research source instrumentation refuses a second patch',()=>{
  assert.throws(()=>patchMaterializedCore(patchMaterializedCore(html)),/already installed/);
});

test('terminal core retirement witness preserves actual projectile removal and timing uncertainty',()=>{
  const patched=patchMaterializedRetirement(html);
  assert.notEqual(patched,html);
  assert.throws(()=>patchMaterializedRetirement(patched),/already installed/);
  assert.throws(()=>patchMaterializedRetirement('not a game'),/shipping core boundaries/);
  const scripts=[...patched.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  for(const script of scripts)new vm.Script(script[1],{filename:'retirement-research-index.html'});
  for(const mode of ['ttl','bounds','both','already-dead']){
    const run=(source,observed)=>{
      const bullet={id:311,ownerId:1,x:mode==='bounds'||mode==='both'?2235:0,
        y:0,vx:0,vy:0,ttl:mode==='ttl'||mode==='both'?0.001:1,
        r:2,dmg:3,pen:1,hits:0,dead:mode==='already-dead',shell:false,beam:false};
      const g={bullets:[bullet],initBulletIntegrity(){},cosmeticRandom(){return 1;},
        resolveBulletCollisions(){},hash:{query(){throw Error('live projectile not expected');}},
        damageTank(){},damageShape(){},damageDrone(){}};
      let ledger=null;
      if(observed){ledger=require('../research/projectile-callback-ledger.cjs')
        .createProjectileCallbackLedger(g);ledger.install();g.__novaShotLedger=ledger;}
      compileUpdater(source).call(g,1/30);
      const result={count:g.bullets.length,dead:bullet.dead,ttl:bullet.ttl,x:bullet.x,
        events:ledger?ledger.snapshot().events:[]};
      if(ledger)ledger.uninstall();
      return result;
    };
    const base=run(html,false),actual=run(patched,true);
    assert.deepEqual({...actual,events:[]},base,mode);
    assert.equal(actual.events.length,mode==='already-dead'?0:1,mode);
    if(actual.events.length){
      const event=actual.events[0];
      assert.equal(event.shotId,311);
      assert.equal(event.kind,'projectileRetirement');
      assert.equal(event.reason,mode==='both'?'ttl-or-bounds':mode);
      assert.equal(event.timing,'upper-bound');
      assert.equal(event.priorHits,0);
      assert.equal(event.remainingPen,1);
    }
  }
});

test('retirement observation is fail-open under malformed getters and callbacks',()=>{
  const patched=patchMaterializedRetirement(html);
  for(const mode of ['missing','throwing-ledger','throwing-method','throwing-callback','malformed']){
    const bullet={id:47,x:0,y:0,vx:0,vy:0,ttl:0.001,r:2,dead:false,
      beam:false,shell:false};
    const g={bullets:[bullet],initBulletIntegrity(){},cosmeticRandom(){return 1;},
      resolveBulletCollisions(){},damageTank(){},damageShape(){},damageDrone(){}};
    if(mode==='throwing-ledger')Object.defineProperty(g,'__novaShotLedger',{
      get(){throw Error('observer getter');}});
    if(mode==='throwing-method')g.__novaShotLedger=Object.defineProperty({},
      'recordProjectileRetirement',{get(){throw Error('method getter');}});
    if(mode==='throwing-callback')g.__novaShotLedger={
      recordProjectileRetirement(){throw Error('observer callback');}};
    if(mode==='malformed')g.__novaShotLedger={recordProjectileRetirement:17};
    assert.doesNotThrow(()=>compileUpdater(patched).call(g,1/30),mode);
    assert.equal(bullet.dead,true,mode);
    assert.equal(g.bullets.length,0,mode);
  }
});

test('pre-terminal external death is not misclassified as TTL retirement',()=>{
  const patched=patchMaterializedRetirement(html);
  const {createProjectileCallbackLedger}=require('../research/projectile-callback-ledger.cjs');
  const g={bullets:[{id:61,x:0,y:0,vx:0,vy:0,ttl:0.001,r:2,dead:false,
    shell:false,beam:false}],initBulletIntegrity(b){b.dead=true;},cosmeticRandom(){return 1;},
    resolveBulletCollisions(){},damageTank(){},damageShape(){},damageDrone(){}};
  const ledger=createProjectileCallbackLedger(g);ledger.install();g.__novaShotLedger=ledger;
  compileUpdater(patched).call(g,1/30);
  assert.equal(g.bullets.length,0);
  assert.equal(ledger.counters().retiredAttributed,0,
    'already-dead at terminal check is not evidence of a TTL-caused death');
  ledger.uninstall();
});

test('terminal shell retirement is witnessed even if burst marks the shot dead',()=>{
  const patched=patchMaterializedRetirement(html);
  const {createProjectileCallbackLedger}=require('../research/projectile-callback-ledger.cjs');
  const g={bullets:[{id:52,x:0,y:0,vx:0,vy:0,ttl:0.001,r:2,dead:false,
    shell:true,beam:false}],initBulletIntegrity(){},cosmeticRandom(){return 1;},
    clusterBurst(b){b.dead=true;b.x=3000;b.ttl=1;},resolveBulletCollisions(){},
    damageTank(){},damageShape(){},damageDrone(){}};
  const ledger=createProjectileCallbackLedger(g);ledger.install();g.__novaShotLedger=ledger;
  compileUpdater(patched).call(g,1/30);
  assert.equal(g.bullets.length,0);
  assert.equal(ledger.snapshot().events.length,1);
  assert.equal(ledger.snapshot().events[0].shotId,52);
  assert.equal(ledger.snapshot().events[0].reason,'ttl');
  ledger.uninstall();
});

test('actual core endpoint interception witness preserves both projectile outcomes',()=>{
  const patched=patchMaterializedInterception(html);
  assert.throws(()=>patchMaterializedInterception(patched),/already installed/);
  assert.throws(()=>patchMaterializedInterception('not a game'),/interception boundaries/);
  const compile=source=>{
    const marker='    resolveBulletCollisions() {',at=source.indexOf(marker);
    assert.ok(at>=0);let i=at+marker.length,depth=1;
    while(depth&&i<source.length){if(source[i]==='{')depth++;
      else if(source[i]==='}')depth--;i++;}
    assert.equal(depth,0);
    return new Function('types_1','return function(){'+source.slice(at+marker.length,i-1)+'}')
      ({dist2:(x,y,a,b)=>(x-a)**2+(y-b)**2});
  };
  const run=(source,mode)=>{
    const a={id:71,ownerId:1,x:0,y:0,r:4,hp:10,dead:false,vx:20,vy:0,color:'#fff',shell:false};
    const b={id:72,ownerId:2,x:0,y:0,r:4,hp:15,dead:false,vx:-20,vy:0,color:'#fff',shell:false};
    const g={bullets:[b,a],initBulletIntegrity(){},
      weakenBullet(shot,absorbed){shot.hp-=absorbed;if(shot.hp<=0)shot.dead=true;},
      addImpactDebris(){},addRing(){},cosmeticRandom(){return 1;},clusterBurst(){}};
    const {createProjectileCallbackLedger}=require('../research/projectile-callback-ledger.cjs');
    const ledger=mode==='valid'?createProjectileCallbackLedger(g):null;
    if(ledger)g.__novaShotLedger=ledger;
    if(mode==='throwing')g.__novaShotLedger={recordProjectileInterception(){throw Error('observer');}};
    compile(source).call(g);
    return {aHp:a.hp,bHp:b.hp,aDead:a.dead,bDead:b.dead,
      events:ledger?ledger.snapshot().events:[]};
  };
  const baseline=run(html,'missing'),observed=run(patched,'valid');
  assert.deepEqual({...observed,events:[]},baseline);
  assert.equal(observed.events.length,1);
  assert.equal(observed.events[0].shotId,71);
  assert.equal(observed.events[0].otherShotId,72);
  assert.equal(observed.events[0].timing,'unknown');
  assert.equal(observed.events[0].afterHpA,-5);
  assert.equal(observed.events[0].afterHpB,5);
  assert.deepEqual(run(patched,'throwing'),baseline,
    'observer exception must not change either projectile outcome');
});

test('research Sniper patch observes the actual shipping swept interception owner',()=>{
  const sniper=fs.readFileSync(path.resolve(__dirname,'../../nova-updates/sniper-v1.2.0.js'),'utf8');
  const patched=patchSniperInterception(sniper);
  assert.notEqual(patched,sniper);
  assert.equal((patched.match(/recordProjectileInterception/g)||[]).length,1);
  assert.ok(patched.includes("method.call(ledger,a,b,ah,bh,'sniper',firstTime)"));
  assert.ok(patched.indexOf('var firstTime = firstProjectileContactTime(a, b, rr);') <
    patched.indexOf("method.call(ledger,a,b,ah,bh,'sniper',firstTime)"),
    'witness must use actual computed swept-contact fraction');
  new vm.Script(patched,{filename:'research-patched-sniper.js'});
  assert.throws(()=>patchSniperInterception(patched),/already installed/);
  assert.throws(()=>patchSniperInterception(sniper.replace(
    'this.weakenBullet(a, bh); this.weakenBullet(b, ah);',
    'this.weakenBullet(a, bh); this.weakenBullet(b, 0);')),
    /shipping Sniper interception owner changed/);
});

const battlefield = fs.readFileSync(path.resolve(__dirname,
  '../../nova-updates/battlefield-v1.6.0.js'),'utf8');
test('research Battlefield patch scopes exactly ten real projectile callbacks',()=>{
  const patched=patchBattlefieldCallbacks(battlefield);
  assert.equal((patched.match(/method\.call\(ledger,b,\(\)=>/g)||[]).length,10);
  assert.notEqual(patched,battlefield);
  new vm.Script(patched,{filename:'research-patched-battlefield.js'});
  assert.throws(()=>patchBattlefieldCallbacks(patched),/already installed/);
  assert.throws(()=>patchBattlefieldCallbacks(battlefield.replace(
    'g.damageTank(hit.e,b.dmg,b.ownerId,kx,ky);','/* changed */')),
    /expected ten Battlefield projectile damage callbacks/);
});

test('Battlefield observer refuses argument drift even when ten callback sites remain',()=>{
  const original='g.damageTank(victim,b.dmg,b.ownerId,0,0)';
  assert.equal(battlefield.split(original).length,2);
  for(const altered of [
    'g.damageTank(victim,b.dmg*2,b.ownerId,0,0)',
    'g.damageTank(victim,b.dmg,0,0,b.ownerId)',
    'g.damageTank(victim,b.dmg,b.ownerId,0,1)'
  ]){
    const changed=battlefield.replace(original,altered);
    assert.equal([...changed.matchAll(/\b(?:g|this)\.damage(?:Tank|Shape|Drone)\s*\(/g)].length,10);
    assert.throws(()=>patchBattlefieldCallbacks(changed),/callback signature drift/);
  }
});
test('ten Battlefield guards call real damage exactly once with or without ledger',()=>{
  const patched=patchBattlefieldCallbacks(battlefield);
  const pattern=/\b(?:g|this)\.damage(?:Tank|Shape|Drone)\s*\(/g;
  const originals=[...battlefield.matchAll(pattern)];
  assert.equal(originals.length,10);
  // The transform adds one guarded and one fallback call per original.
  const guarded=[...patched.matchAll(/typeof method==='function'/g)];
  assert.equal(guarded.length,10);
  for(const match of originals){
    let depth=0,end=-1;
    for(let i=match.index+match[0].length-1;i<battlefield.length;i++){
      if(battlefield[i]==='(')depth++;
      else if(battlefield[i]===')'&&--depth===0){end=i+1;break;}
    }
    assert.ok(end>match.index);
    const call=battlefield.slice(match.index,end);
    const receiver=call.startsWith('this.')?'this':'g';
    const wrapped=guardedShotCall(call,receiver,'battlefield');
    assert.ok(patched.includes(wrapped),'missing guard: '+call);
    for(const enabled of [false,true]){
      const seen={damage:0,scope:0};
      const game={
        damageTank(){seen.damage++;return 17;},
        damageShape(){seen.damage++;return 17;},
        damageDrone(){seen.damage++;return 17;}
      };
      if(enabled)game.__novaShotLedger={withProjectile(shot,fn,attribution,source){
        seen.scope++;assert.equal(shot.id,101);
        assert.equal(attribution,'direct');assert.equal(source,'battlefield');return fn();
      }};
      const vars={g:game,b:{id:101,dmg:20,ownerId:1,knock:2,vx:3,vy:4},
        e:{},best:{e:{}},hit:{e:{}},victim:{},kx:0,ky:0,ang:0,vx:3,vy:4};
      const result=new Function(...Object.keys(vars),'return '+wrapped+';')
        .apply(game,Object.values(vars));
      assert.equal(result,17);
      assert.equal(seen.damage,1);
      assert.equal(seen.scope,enabled?1:0);
      // A malformed truthy observer must not suppress damage or throw.
      game.__novaShotLedger={};
      const malformed=new Function(...Object.keys(vars),'return '+wrapped+';')
        .apply(game,Object.values({...vars,g:game}));
      assert.equal(malformed,17);
      assert.equal(seen.damage,2);
      // Callable observer failures cannot suppress, replay, or replace combat.
      for(const malformedMethod of [
        ()=>{throw Error('observer before');},
        (_shot,fn)=>{fn();throw Error('observer after');},
        ()=>99,
        (_shot,fn)=>{fn();fn();}
      ]){
        game.__novaShotLedger={withProjectile:malformedMethod};
        const before=seen.damage;
        const value=new Function(...Object.keys(vars),'return '+wrapped+';')
          .apply(game,Object.values({...vars,g:game}));
        assert.equal(value,17);
        assert.equal(seen.damage,before+1,'real damage must run once');
      }
      // A valid observer is sampled once and receives its original receiver.
      let ledgerReads=0,methodReads=0;
      const validLedger={get withProjectile(){methodReads++;return function(shot,fn){
        assert.equal(this,validLedger);assert.equal(shot.id,101);return fn();
      };}};
      const sampled=Object.assign({},game);
      Object.defineProperty(sampled,'__novaShotLedger',{get(){ledgerReads++;return validLedger;}});
      const varsSampled={...vars,g:sampled};
      assert.equal(new Function(...Object.keys(varsSampled),'return '+wrapped+';')
        .apply(sampled,Object.values(varsSampled)),17);
      assert.equal(ledgerReads,1);
      assert.equal(methodReads,1);
      // Combat exceptions must propagate once, never be caught and replayed.
      let throws=0;
      const exploding=Object.assign({},game,{
        damageTank(){throws++;throw Error('real damage failure');},
        damageShape(){throws++;throw Error('real damage failure');},
        damageDrone(){throws++;throw Error('real damage failure');}
      });
      const varsExploding={...vars,g:exploding};
      assert.throws(()=>new Function(...Object.keys(varsExploding),'return '+wrapped+';')
        .apply(exploding,Object.values(varsExploding)),/real damage failure/);
      assert.equal(throws,1);
      // Both a throwing ledger getter and a throwing method getter must
      // fall back exactly once, without changing the combat callback.
      for(const throwing of [
        Object.defineProperty({},'__novaShotLedger',{get(){throw Error('ledger getter');}}),
        {__novaShotLedger:Object.defineProperty({},'withProjectile',{get(){throw Error('method getter');}})}
      ]){
        const receiverGame=Object.assign(Object.create(Object.getPrototypeOf(game)),game);
        Object.defineProperty(receiverGame,'__novaShotLedger',Object.getOwnPropertyDescriptor(throwing,'__novaShotLedger'));
        const vars2={...vars,g:receiverGame};
        const before=seen.damage;
        const returned=new Function(...Object.keys(vars2),'return '+wrapped+';')
          .apply(receiverGame,Object.values(vars2));
        assert.equal(returned,17);
        assert.equal(seen.damage,before+1);
      }
    }
  }
});

test('cover research witness compiles and preserves the authoritative HP write',()=>{
  const patched=patchBattlefieldCover(battlefield);
  new vm.Script(patched,{filename:'research-cover-battlefield.js'});
  assert.equal(patched.split('var oldHp=s.hp;s.hp-=dmg*mult;').length,2);
  assert.equal((patched.match(/recordCoverDamage/g)||[]).length,1);
  assert.throws(()=>patchBattlefieldCover(patched),/already installed/);
  assert.throws(()=>patchBattlefieldCover('function nope(){}'),/expected one authoritative cover HP write/);
});
test('cover witness observes actual HP after mutation and never interrupts combat',()=>{
  const target='var oldHp=s.hp;s.hp-=dmg*mult;';
  const synthetic='function damageCover(g,s,dmg,mult,bullet){'+target+'return s.hp;}';
  const patched=patchBattlefieldCover(synthetic);
  const run=new Function('return ('+patched+')')();
  const original=new Function('return ('+synthetic+')')();
  for(const mode of ['valid','missing','throwing-ledger','throwing-method','throwing-callback']){
    const observed={hp:17,id:7},baseline={hp:17,id:7};
    const bullet={id:23},seen=[];
    const game={};
    if(mode==='valid')game.__novaShotLedger={recordCoverDamage(...args){seen.push(args);}};
    if(mode==='throwing-ledger')Object.defineProperty(game,'__novaShotLedger',{get(){throw Error('ledger');}});
    if(mode==='throwing-method')game.__novaShotLedger=Object.defineProperty({},'recordCoverDamage',{get(){throw Error('method');}});
    if(mode==='throwing-callback')game.__novaShotLedger={recordCoverDamage(){throw Error('observer');}};
    assert.equal(run(game,observed,5,1.25,bullet),original({},baseline,5,1.25,bullet));
    assert.equal(observed.hp,baseline.hp);
    assert.equal(seen.length,mode==='valid'?1:0);
    if(mode==='valid')assert.deepEqual(seen[0],[bullet,observed,17,10.75]);
    if(mode==='valid'){
      const withoutBullet={hp:17,id:7};
      assert.equal(run(game,withoutBullet,2,1,null),15);
      assert.equal(seen.length,1,'non-projectile cover damage must abstain');
      const splash={hp:17,id:7};
      assert.equal(run(game,splash,2,1,{shell:true,beam:false,vx:0,vy:0}),15);
      assert.equal(seen.length,1,'synthetic splash proxy without shot ID must abstain');
      let shotReads=0;
      const statefulShot=Object.defineProperty({},'id',{get(){shotReads++;return 77;}});
      const statefulCover={hp:17,id:7};
      assert.equal(run(game,statefulCover,2,1,statefulShot),15);
      assert.equal(shotReads,0,'source guard must not read projectile ID before the ledger');
      assert.equal(seen.length,2);
    }
  }
});

test('cover witness cannot suppress damage when a real shot ID getter throws',()=>{
  const {createProjectileCallbackLedger}=require('../research/projectile-callback-ledger.cjs');
  const source='function damageCover(g,s,dmg,mult,bullet){var oldHp=s.hp;s.hp-=dmg*mult;return s.hp;}';
  const run=new Function('return ('+patchBattlefieldCover(source)+')')();
  const game={damageTank(){},damageShape(){},damageDrone(){}};
  const ledger=createProjectileCallbackLedger(game);
  game.__novaShotLedger=ledger;
  const shot=Object.defineProperty({},'id',{get(){throw Error('shot identity');}});
  const cover={id:-1000,hp:20};
  assert.equal(run(game,cover,7,1,shot),13);
  assert.equal(cover.hp,13);
  assert.equal(ledger.snapshot().events.length,0);
  assert.equal(ledger.snapshot().observerErrors,1);
  assert.equal(ledger.snapshot().bounded,false);
});

test('Battlefield mutual-TTL research witness patches only the certified real owner',()=>{
  const patched=patchBattlefieldMutualInterception(battlefield);
  assert.notEqual(patched,battlefield);
  assert.equal((patched.match(/'battlefield-ttl'/g)||[]).length,1);
  new vm.Script(patched,{filename:'research-mutual-ttl-battlefield.js'});
  assert.throws(()=>patchBattlefieldMutualInterception(patched),/already installed/);
  assert.throws(()=>patchBattlefieldMutualInterception('not a battlefield'),/boundaries changed/);
  assert.throws(()=>patchBattlefieldMutualInterception(battlefield.replace(
    'g.weakenBullet(a,bh);g.weakenBullet(b,ah);',
    'g.weakenBullet(a,bh);g.weakenBullet(b,0);')),/weakening owner changed/);
  const begin=battlefield.indexOf(' function certifiedMutualTTLInterception(g,dt){');
  const end=battlefield.indexOf(' var oldUpdateBullets=Game.prototype.updateBullets;',begin);
  assert.ok(begin>=0&&end>begin);
  assert.equal(patched.slice(0,begin),battlefield.slice(0,begin));
  assert.equal(patched.slice(patched.indexOf(' var oldUpdateBullets=Game.prototype.updateBullets;',begin)),
    battlefield.slice(end));
});

test('mutual-TTL witness preserves two-shot weakening with valid or broken observers',()=>{
  const marker='  g.weakenBullet(a,bh);g.weakenBullet(b,ah);';
  const synthetic='function mutual(g,a,b){var ah=a.hp,bh=b.hp,t=.008;'+marker+'return [a.hp,b.hp];}';
  // The synthetic owner uses the same authoritative mutation and lexical
  // variables; actual Battlefield source identity is checked separately.
  const original=new Function('return ('+synthetic+')')();
  const transformed=patchBattlefieldMutualInterception(battlefield);
  const at=transformed.indexOf(marker);
  assert.ok(at>=0);
  const next=transformed.indexOf('  var mx=(reach[0].ex+',at);
  assert.ok(next>at);
  const actualWitness=transformed.slice(at+marker.length,next);
  assert.match(actualWitness,/recordProjectileInterception/);
  const observedSource=synthetic.replace(marker,marker+actualWitness);
  const observed=new Function('return ('+observedSource+')')();
  for(const mode of ['valid','missing','throwing-ledger','throwing-method','throwing-callback']){
    const make=()=>({weakenBullet(shot,dmg){shot.hp-=dmg;if(shot.hp<=0)shot.dead=true;}});
    const baseline=make(),g=make(),a={id:71,hp:12,dead:false},b={id:72,hp:9,dead:false};
    const aa={...a},bb={...b},events=[];
    if(mode==='valid')g.__novaShotLedger={recordProjectileInterception(...args){events.push(args);}};
    if(mode==='throwing-ledger')Object.defineProperty(g,'__novaShotLedger',{get(){throw Error('ledger');}});
    if(mode==='throwing-method')g.__novaShotLedger=Object.defineProperty({},'recordProjectileInterception',{get(){throw Error('method');}});
    if(mode==='throwing-callback')g.__novaShotLedger={recordProjectileInterception(){throw Error('observer');}};
    assert.deepEqual(observed(g,a,b),original(baseline,aa,bb));
    assert.deepEqual([a,b],[aa,bb]);
    assert.equal(events.length,mode==='valid'?1:0);
    if(mode==='valid')assert.deepEqual(events[0],[a,b,12,9,'battlefield-ttl',null,.008]);
  }
});

test('research browser smoke compiles before expensive Chromium setup',()=>{
  const script=fs.readFileSync(path.resolve(__dirname,
    '../browser/projectile-callback-ledger-natural-smoke.cjs'),'utf8');
  new vm.Script(script,{filename:'projectile-callback-ledger-natural-smoke.cjs'});
});

test('shipping Sniper contact fraction is segment-relative and geometry-invariant',()=>{
  const marker='function firstProjectileContactTime(a, b, rr) {';
  const start=sniper.indexOf(marker),end=sniper.indexOf('  function burstShellAtContact(',start);
  assert.ok(start>=0&&end>start,'authoritative Sniper sweep owner');
  const fn=new Function('clamp','return ('+sniper.slice(start,end).trim()+')')(
    (v,lo,hi)=>Math.max(lo,Math.min(hi,v)));
  const a={px:-10,py:0,x:10,y:0},b={px:10,py:0,x:-10,y:0};
  const t=fn(a,b,4);
  assert.ok(Math.abs(t-.4)<1e-12,'fraction is of the swept segment, not seconds');
  const angle=1.1,c=Math.cos(angle),s=Math.sin(angle);
  const transform=p=>{
    const out={};
    for(const [x,y] of [['px','py'],['x','y']]){
      out[x]=p[x]*c-p[y]*s+37;
      out[y]=p[x]*s+p[y]*c-12;
    }
    return out;
  };
  assert.ok(Math.abs(fn(transform(a),transform(b),4)-t)<1e-12,
    'translation and rotation cannot change contact fraction');
  assert.ok(patchSniperInterception(sniper).includes(
    "method.call(ledger,a,b,ah,bh,'sniper',firstTime)"));
});

test('Sniper swept timing witness preserves weakening with valid or broken observers',()=>{
  const patched=patchSniperInterception(sniper);
  const anchor='          var firstTime = firstProjectileContactTime(a, b, rr);';
  const at=patched.indexOf(anchor),end=patched.indexOf('          if ((a.dead && a.shell',at);
  assert.ok(at>=0&&end>at);
  const witness=patched.slice(at+anchor.length,end);
  assert.match(witness,/recordProjectileInterception/);
  const source='return function(g,a,b){var ah=a.hp,bh=b.hp,rr=4;'+
    'g.weakenBullet(a,bh);g.weakenBullet(b,ah);var firstTime=.375;';
  const baseline=new Function(source+'return [a.hp,b.hp];}')();
  const observed=new Function(source+witness+'return [a.hp,b.hp];}')();
  for(const mode of ['valid','missing','throwing-ledger','throwing-method','throwing-observer']){
    const make=()=>({weakenBullet(shot,dmg){shot.hp-=dmg;if(shot.hp<=0)shot.dead=true;}});
    const g=make(),base=make(),a={id:71,hp:12,dead:false},b={id:72,hp:9,dead:false};
    const aa={...a},bb={...b},events=[];
    if(mode==='valid')g.__novaShotLedger={recordProjectileInterception(...args){events.push(args);}};
    if(mode==='throwing-ledger')Object.defineProperty(g,'__novaShotLedger',{get(){throw Error('ledger');}});
    if(mode==='throwing-method')g.__novaShotLedger=Object.defineProperty({},'recordProjectileInterception',{get(){throw Error('method');}});
    if(mode==='throwing-observer')g.__novaShotLedger={recordProjectileInterception(){throw Error('observer');}};
    assert.deepEqual(observed.call(g,g,a,b),baseline.call(base,base,aa,bb));
    assert.deepEqual([a,b],[aa,bb]);
    assert.equal(events.length,mode==='valid'?1:0);
    if(mode==='valid')assert.deepEqual(events[0],[a,b,12,9,'sniper',.375]);
  }
});
