'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {patchAIStrafeTimebase,before,after,abilityBefore,abilityAfter}=
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
 assert.equal(raw.split(abilityBefore).length-1,1,'legacy ability draw must be unique');
 assert.equal(patched.split(abilityAfter).length-1,1,'Predator ownership gate is materialized');
 assert.equal(patchAIStrafeTimebase(shipping).split(abilityAfter).length-1,1);
});
test('AI strafe source drift fails closed instead of silently skipping fix',()=>{
 const raw=decodedBase();
 assert.throws(()=>patchAIStrafeTimebase(raw.replace(before,
  before.replace('0.004','0.005'))),/changed unexpectedly/);
 const patched=patchAIStrafeTimebase(raw);
 assert.throws(()=>patchAIStrafeTimebase(patched.replace(after,
  after.replace('0.996','0.995'))),/changed unexpectedly/);
 assert.throws(()=>patchAIStrafeTimebase(raw.replace(abilityBefore,
  abilityBefore.replace('0.02','0.03'))),/ability owner changed unexpectedly/);
 assert.throws(()=>patchAIStrafeTimebase(patched.replace(abilityAfter,
  abilityAfter.replace('0.98','0.97'))),/ability owner changed unexpectedly/);
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
test('Predator-owned legacy ability consumes no random draws; fallback remains time-based',()=>{
 const fn=new Function('ai','dt','Math','g','t',abilityAfter);
 const rate=1-Math.pow(.98,60);
 for(const hz of [30,60,120,240]){
  const dt=1/hz,p=1-Math.pow(.98,60*dt);
  assert.ok(Math.abs((1-Math.pow(1-p,hz))-rate)<1e-12);
  for(const draw of [0,p-1e-8,p+1e-8]){
   let calls=0,abilities=0;
   const math={random(){calls++;return draw;},pow:Math.pow,max:Math.max};
   const g={useAbility(){abilities++;}};
   fn({__novaPredatorAbilityOwned:true},dt,math,g,{});
   assert.equal(calls,0,'Predator must not consume dormant ability RNG at '+hz+'Hz');
   assert.equal(abilities,0,'Predator owns tactical ability execution');
   fn({},dt,math,g,{});
   assert.equal(calls,1,'standalone AI keeps one random draw');
   assert.equal(abilities,draw<p?1:0,'standalone ability probability at '+hz+'Hz');
  }
 }
 let calls=0;
 fn({},0,{random(){calls++;return 0;},pow:Math.pow,max:Math.max},
  {useAbility(){throw Error('zero dt ability');}},{});
 assert.equal(calls,0,'paused time cannot perturb gameplay RNG');
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
