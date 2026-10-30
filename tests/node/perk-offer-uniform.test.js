'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const {patchPerkOffer, before, after} = require('../../scripts/patch-perk-offer.cjs');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root,name),'utf8');
function originalShell() {
  const b64=fs.readdirSync(path.join(root,'nova-gz')).filter(x=>x.endsWith('.b64')).sort()
    .map(x=>read('nova-gz/'+x)).join('').replace(/\s+/g,'');
  return zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
}
function occurrences(s,part) { return s.split(part).length-1; }
test('PerkOffer patch is exact, fail-closed, idempotent and applies to both shell sources',()=>{
  const original=originalShell(), shipping=read('index.html');
  assert.equal(occurrences(original,before),1,'canonical compressed source must contain exactly one biased offer');
  const fixed=patchPerkOffer(original);
  assert.equal(occurrences(fixed,before),0);
  assert.equal(occurrences(fixed,after),1);
  assert.equal(patchPerkOffer(fixed),fixed);
  assert.equal(occurrences(patchPerkOffer(shipping),after),1);
  assert.throws(()=>patchPerkOffer(null),/UTF-8/);
  assert.throws(()=>patchPerkOffer('unrelated'),/PerkOffer owner/);
  assert.throws(()=>patchPerkOffer(original.replace(before,before.replace('Math.random() - 0.5','Math.random() - 0.4'))),/drift/);
});
test('the exact shipping callback selects three distinct perks with unbiased 6-of-3 frequencies',()=>{
  // Execute the same useMemo callback injected into the real compiled React owner.
  const select=new Function('pool','react_1','Math',after+'\nreturn shuffled;');
  const pool=['dmg','speed','vitality','alacrity','thorns','wealth'];
  let seed=0x51a7c2d3;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const fakeMath={random,floor:Math.floor};
  const counts=Object.fromEntries(pool.map(p=>[p,0]));
  const triples=new Map();
  const trials=200000;
  for(let n=0;n<trials;n++){
    const offered=select(pool,{useMemo:fn=>fn()},fakeMath);
    assert.equal(offered.length,3);
    assert.equal(new Set(offered).size,3,'no duplicate mastery perk');
    assert.ok(offered.every(p=>pool.includes(p)));
    assert.equal(pool.join(','),'dmg,speed,vitality,alacrity,thorns,wealth','never mutate canonical perk pool');
    for(const p of offered)counts[p]++;
    const key=offered.slice().sort().join('/');
    triples.set(key,(triples.get(key)||0)+1);
  }
  assert.equal(triples.size,20,'every possible 3-perk combination must be reachable');
  for(const p of pool)assert.ok(Math.abs(counts[p]/trials-.5)<.008,p+' inclusion '+counts[p]/trials);
  for(const [key,n] of triples)assert.ok(Math.abs(n/trials-.05)<.004,key+' combination '+n/trials);
});
test('materializer and real Chromium shell apply the same patch and include its fingerprint',()=>{
  const deploy=read('.github/workflows/deploy.yml');
  const browser=read('.github/workflows/browser-smoke.yml');
  const a=deploy.indexOf('node scripts/patch-audio-rng.cjs index.html.new');
  const b=deploy.indexOf('node scripts/patch-perk-offer.cjs index.html.new');
  const build=deploy.indexOf('from pathlib import Path',b);
  assert.ok(a>=0&&b>a&&build>b,'perk patch precedes materializer injection');
  assert.match(deploy,/'scripts\/patch-perk-offer.cjs'/);
  assert.match(deploy,/- 'scripts\/patch-perk-offer.cjs'/);
  const ba=browser.indexOf('node scripts/patch-audio-rng.cjs index.html');
  const bb=browser.indexOf('node scripts/patch-perk-offer.cjs index.html');
  const serve=browser.indexOf('python3 -m http.server',bb);
  assert.ok(ba>=0&&bb>ba&&serve>bb,'browser must patch the same shell before serving');
  assert.equal(browser.split("- 'scripts/patch-perk-offer.cjs'").length-1,2,'both browser triggers include patch');
});
