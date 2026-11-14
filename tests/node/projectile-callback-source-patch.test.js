'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {patchMaterializedCore, patchBattlefieldCallbacks, CALLS} = require('../research/projectile-callback-source-patch.cjs');
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
test('research patch changes exactly three authoritative core callbacks, not splash or overlays',()=>{
  const patched = patchMaterializedCore(html);
  assert.notEqual(patched, html);
  assert.equal((patched.match(/this\.__novaShotLedger\.withProjectile\(b, \(\) =>/g)||[]).length,3);
  const start=html.indexOf('    updateBullets(dt) {');
  const end=html.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {',start);
  assert.equal(patched.slice(0,start),html.slice(0,start));
  const patchedEnd=patched.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {',start);
  assert.equal(patched.slice(patchedEnd),html.slice(end));
  for(const call of CALLS)assert.ok(patched.includes(' : '+call.slice(0,-1)+');'));
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

const battlefield = fs.readFileSync(path.resolve(__dirname,
  '../../nova-updates/battlefield-v1.6.0.js'),'utf8');
test('research Battlefield patch scopes exactly ten real projectile callbacks',()=>{
  const patched=patchBattlefieldCallbacks(battlefield);
  assert.equal((patched.match(/__novaShotLedger\.withProjectile\(b,/g)||[]).length,10);
  assert.notEqual(patched,battlefield);
  new vm.Script(patched,{filename:'research-patched-battlefield.js'});
  assert.throws(()=>patchBattlefieldCallbacks(patched),/already installed/);
  assert.throws(()=>patchBattlefieldCallbacks(battlefield.replace(
    'g.damageTank(hit.e,b.dmg,b.ownerId,kx,ky);','/* changed */')),
    /expected ten Battlefield projectile damage callbacks/);
});

test('ten Battlefield guards call real damage exactly once with or without ledger',()=>{
  const patched=patchBattlefieldCallbacks(battlefield);
  const pattern=/\b(?:g|this)\.damage(?:Tank|Shape|Drone)\s*\(/g;
  const originals=[...battlefield.matchAll(pattern)];
  assert.equal(originals.length,10);
  // The transform adds one guarded and one fallback call per original.
  const guarded=[...patched.matchAll(/\b(?:g|this)\.__novaShotLedger\s*\?/g)];
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
    const wrapped='('+receiver+'.__novaShotLedger ? '+
      receiver+".__novaShotLedger.withProjectile(b,()=>"+call+",'direct','battlefield') : "+call+')';
    assert.ok(patched.includes(wrapped),'missing guard: '+call);
    for(const enabled of [false,true]){
      const seen={damage:0,scope:0};
      const game={
        damageTank(){seen.damage++;return 17;},
        damageShape(){seen.damage++;return 17;},
        damageDrone(){seen.damage++;return 17;}
      };
      if(enabled)game.__novaShotLedger={withProjectile(shot,fn){
        seen.scope++;assert.equal(shot.id,101);return fn();
      }};
      const vars={g:game,b:{id:101,dmg:20,ownerId:1,knock:2,vx:3,vy:4},
        e:{},best:{e:{}},hit:{e:{}},victim:{},kx:0,ky:0,ang:0,vx:3,vy:4};
      const result=new Function(...Object.keys(vars),'return '+wrapped+';')
        .apply(game,Object.values(vars));
      assert.equal(result,17);
      assert.equal(seen.damage,1);
      assert.equal(seen.scope,enabled?1:0);
    }
  }
});
