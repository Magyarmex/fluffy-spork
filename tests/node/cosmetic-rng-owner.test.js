'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {patchCosmeticRng,methods}=require('../../scripts/patch-cosmetic-rng.cjs');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function decodedBase(){
 const dir=path.join(root,'nova-gz');
 const b64=fs.readdirSync(dir).filter(f=>f.endsWith('.b64')).sort()
  .map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('').replace(/\s+/g,'');
 return zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
}
test('cosmetic RNG patch is unique, idempotent and applies to canonical source and materialized game',()=>{
 const raw=decodedBase();
 const patched=patchCosmeticRng(raw);
 assert.notEqual(patched,raw,'patch must change canonical compressed base');
 assert.equal(patchCosmeticRng(patched),patched);
 assert.equal(patchCosmeticRng(html),patchCosmeticRng(patchCosmeticRng(html)));
 assert.equal(patched.split('    cosmeticRandom() {').length-1,1);
 assert.equal(patched.split('    cosmeticRnd(a = 1, b) {').length-1,1);
 assert.match(patched,/if \(b\.beam && this\.cosmeticRandom\(\) < 0\.85\)/);
 assert.match(patched,/else if \(this\.cosmeticRandom\(\) < 0\.22\)/);
 assert.match(patched,/g\.cosmeticRandom\(\) - 0\.5/);
 assert.match(patched,/Math\.random\(\) < 0\.004/,'gameplay AI strafe RNG must remain intact');
 assert.match(patched,/const spread = .*types_1\.rnd/,'weapon spread remains gameplay RNG');
});
test('visual stream never consumes gameplay RNG and is reproducible from game state',()=>{
 const Demo=new Function('return class Demo {\n'+methods+'\n}')();
 const old=Math.random;let calls=0;
 Math.random=()=>{calls++;return 0.5;};
 try{
  const a=new Demo(),b=new Demo();
  a.nextId=b.nextId=123;a.time=b.time=1.5;
  const first=[],second=[];
  for(let i=0;i<1000;i++){first.push(a.cosmeticRandom());second.push(b.cosmeticRandom());}
  assert.deepEqual(first,second);
  assert.ok(first.every(x=>x>=0&&x<1));
  assert.ok(new Set(first).size>990);
  assert.equal(calls,0,'no shared random draw can be consumed');
  assert.ok(a.cosmeticRnd(-5,5)>=-5&&a.cosmeticRnd(-5,5)<5);
 }finally{Math.random=old;}
});
test('source drift fails closed rather than silently losing cosmetic isolation',()=>{
 const raw=decodedBase();
 assert.throws(()=>patchCosmeticRng('unrelated'),/owner/);
 assert.throws(()=>patchCosmeticRng(null),/UTF-8/);
 assert.throws(()=>patchCosmeticRng(raw.replace(
  'if (b.beam && Math.random() < 0.85)',
  'if (b.beam && Math.random() < 0.86)'),/drift/);
});
test('production and Chromium both apply patch before composing/serving game',()=>{
 const deploy=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
 const browser=fs.readFileSync(path.join(root,'.github/workflows/browser-smoke.yml'),'utf8');
 const ai=deploy.indexOf('node scripts/patch-ai-strafe-timebase.cjs index.html.new');
 const cosmetic=deploy.indexOf('node scripts/patch-cosmetic-rng.cjs index.html.new');
 const compose=deploy.indexOf('from pathlib import Path',cosmetic);
 assert.ok(ai>=0&&cosmetic>ai&&compose>cosmetic);
 assert.match(deploy,/'scripts\/patch-cosmetic-rng.cjs'/);
 assert.match(deploy,/- 'scripts\/patch-cosmetic-rng.cjs'/);
 const bAi=browser.indexOf('node scripts/patch-ai-strafe-timebase.cjs index.html');
 const bCos=browser.indexOf('node scripts/patch-cosmetic-rng.cjs index.html');
 const serve=browser.indexOf('python3 -m http.server',bCos);
 assert.ok(bAi>=0&&bCos>bAi&&serve>bCos);
 assert.equal(browser.split("- 'scripts/patch-cosmetic-rng.cjs'").length-1,2);
});
