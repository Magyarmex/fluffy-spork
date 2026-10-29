'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {patchAIStrafeTimebase,before,after}=
  require('../../scripts/patch-ai-strafe-timebase.cjs');
const root=path.resolve(__dirname,'../..');
const shipping=fs.readFileSync(path.join(root,'index.html'),'utf8');
function decodedBase(){
 const dir=path.join(root,'nova-gz');
 const b64=fs.readdirSync(dir).filter(f=>f.endsWith('.b64')).sort()
  .map(f=>fs.readFileSync(path.join(dir,f),'utf8')).join('').replace(/\s+/g,'');
 return zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
}
test('canonical base AI strafe patch is unique, idempotent and composes with shipping',()=>{
 const raw=decodedBase();
 assert.equal(raw.split(before).length-1,1,'exact original AI owner is unique');
 const patched=patchAIStrafeTimebase(raw);
 assert.equal(patched.split(after).length-1,1);
 assert.equal(patched.split(before).length-1,0);
 assert.equal(patchAIStrafeTimebase(patched),patched);
 assert.equal(patchAIStrafeTimebase(shipping).split(after).length-1,1,
  'materialized production source must accept same surgical patch');
});
test('AI strafe source drift fails closed instead of silently skipping fix',()=>{
 const raw=decodedBase();
 assert.throws(()=>patchAIStrafeTimebase(raw.replace(before,
  before.replace('0.004','0.005'))),/changed unexpectedly/);
 const patched=patchAIStrafeTimebase(raw);
 assert.throws(()=>patchAIStrafeTimebase(patched.replace(after,
  after.replace('0.996','0.995'))),/changed unexpectedly/);
 assert.throws(()=>patchAIStrafeTimebase('unrelated'),/owner missing/);
 assert.throws(()=>patchAIStrafeTimebase(null),/UTF-8/);
});
test('60Hz strafe rate is conserved at 30/60/120/240Hz and dt zero',()=>{
 const expression=after.match(/if \(Math.random\(\) < (.+)\)/)?.[1];
 assert.ok(expression,'must inspect exact shipping probability expression');
 const chance=new Function('dt','return '+expression);
 const annual=1-Math.pow(.996,60);
 for(const hz of [30,60,120,240]){
  const p=chance(1/hz);
  assert.ok(p>0&&p<1);
  const oneSecond=1-Math.pow(1-p,hz);
  assert.ok(Math.abs(oneSecond-annual)<1e-12,
   'per-second reversal probability differs at '+hz+'Hz');
 }
 assert.ok(Math.abs(chance(1/60)-.004)<1e-12);
 assert.equal(chance(0),0);
 assert.equal(chance(-1),0);
});
test('materializer patches before composition and includes script in fingerprint',()=>{
 const deploy=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
 const beforeCompose=deploy.indexOf('node scripts/patch-ai-strafe-timebase.cjs index.html.new');
 const compose=deploy.indexOf('from pathlib import Path',beforeCompose);
 assert.ok(beforeCompose>=0&&compose>beforeCompose);
 assert.match(deploy,/'scripts\/patch-ai-strafe-timebase.cjs',/);
 assert.match(deploy,/- 'scripts\/patch-ai-strafe-timebase.cjs'/);
});

test('real Chromium smoke patches the exact AI owner before serving the game',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/browser-smoke.yml'),'utf8');
 const saved=workflow.indexOf('node scripts/patch-saved-records.cjs index.html');
 const ai=workflow.indexOf('node scripts/patch-ai-strafe-timebase.cjs index.html');
 const serve=workflow.indexOf('python3 -m http.server',ai);
 assert.ok(saved>=0&&ai>saved&&serve>ai,
  'Chromium must exercise the same patched canonical AI base as Pages');
 assert.equal(workflow.split("- 'scripts/patch-ai-strafe-timebase.cjs'").length-1,2,
  'both push and PR browser gates must trigger on the patch owner');
});
