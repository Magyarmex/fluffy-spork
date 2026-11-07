'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {injectBattlefieldSeed}=require('../research/battlefield-layout-fixture.cjs');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/battlefield-v1.6.0.js'),'utf8');
test('research fixture pins only the real shipping Battlefield entropy expression',()=>{
 const seeded=injectBattlefieldSeed(source,0x12345678);
 assert.match(seeded,/var raw=\(305419896>>>0\),idx=raw%TEMPLATES\.length/);
 assert.equal(seeded.replace('(305419896>>>0)','((Date.now()>>>8)^(Math.random()*0x7fffffff))>>>0'),source);
 assert.doesNotThrow(()=>new vm.Script(seeded),'injected shipping overlay must remain valid JavaScript');
 assert.equal((seeded.match(/function ensureTerrain\(g\)/g)||[]).length,1);
});
test('fixture refuses stale overlays, duplicate matches and invalid seeds',()=>{
 const expression='((Date.now()>>>8)^(Math.random()*0x7fffffff))>>>0';
 assert.throws(()=>injectBattlefieldSeed('stale',42),/exactly once/);
 assert.throws(()=>injectBattlefieldSeed(expression+expression,42),/exactly once/);
 for(const seed of [-1,2**32,1.2,NaN,'123',null])
  assert.throws(()=>injectBattlefieldSeed(source,seed),/uint32/);
 assert.doesNotThrow(()=>injectBattlefieldSeed(source,0));
 assert.doesNotThrow(()=>injectBattlefieldSeed(source,0xffffffff));
});
