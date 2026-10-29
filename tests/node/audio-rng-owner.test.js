'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {patchAudioRng,before,after}=require('../../scripts/patch-audio-rng.cjs');
const root=path.resolve(__dirname,'../..');
const shipping=fs.readFileSync(path.join(root,'index.html'),'utf8');
function decodedBase(){
 const dir=path.join(root,'nova-gz');
 const b64=fs.readdirSync(dir).filter(f=>f.endsWith('.b64')).sort()
  .map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('').replace(/\s+/g,'');
 return zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
}
test('core audio noise owner is unique, idempotent, fail-closed and materializable',()=>{
 const raw=decodedBase();
 assert.equal(raw.split(before).length-1,1);
 const patched=patchAudioRng(raw);
 assert.equal(patched.split(after).length-1,1);
 assert.equal(patched.split(before).length-1,0);
 assert.equal(patchAudioRng(patched),patched);
 assert.equal(patchAudioRng(shipping).split(after).length-1,1);
 assert.throws(()=>patchAudioRng(null),/UTF-8/);
 assert.throws(()=>patchAudioRng('unrelated'),/owner/);
 assert.throws(()=>patchAudioRng(raw.replace(before,before.replace('Math.random()','Math.random()+0.1'))),/drift/);
});
test('0.5s sound buffer remains bounded, deterministic and consumes no gameplay RNG',()=>{
 const old=Math.random;let calls=0;Math.random=()=>{calls++;return .5;};
 try{
  const draw=new Function('len','d','return (function(){'+after+'}).call({ctx:{sampleRate:44100}})');
  const a=new Float32Array(22050),b=new Float32Array(22050);
  draw(22050,a);draw(22050,b);
  assert.deepEqual(a,b);
  assert.equal(calls,0);
  assert.ok(a.every(x=>x>=-1&&x<1));
  const mean=a.reduce((s,x)=>s+x,0)/a.length;
  const rms=Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
  assert.ok(Math.abs(mean)<.03);
  assert.ok(rms>.53&&rms<.62);
 }finally{Math.random=old;}
});
test('production and Chromium materialize audio isolation after cosmetic owner',()=>{
 const deploy=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
 const browser=fs.readFileSync(path.join(root,'.github/workflows/browser-smoke.yml'),'utf8');
 const a=deploy.indexOf('node scripts/patch-cosmetic-rng.cjs index.html.new');
 const b=deploy.indexOf('node scripts/patch-audio-rng.cjs index.html.new');
 const compose=deploy.indexOf('from pathlib import Path',b);
 assert.ok(a>=0&&b>a&&compose>b);
 assert.match(deploy,/'scripts\/patch-audio-rng.cjs'/);
 assert.match(deploy,/- 'scripts\/patch-audio-rng.cjs'/);
 const ba=browser.indexOf('node scripts/patch-cosmetic-rng.cjs index.html');
 const bb=browser.indexOf('node scripts/patch-audio-rng.cjs index.html');
 const serve=browser.indexOf('python3 -m http.server',bb);
 assert.ok(ba>=0&&bb>ba&&serve>bb);
 assert.equal(browser.split("- 'scripts/patch-audio-rng.cjs'").length-1,2);
});
