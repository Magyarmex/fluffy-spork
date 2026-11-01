'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchRafStepCap,before,after}=require('../../scripts/patch-raf-step-cap.cjs');
const root=path.resolve(__dirname,'../..');
const shipping=fs.readFileSync(path.join(root,'index.html'),'utf8');
function base(){const b=fs.readdirSync(path.join(root,'nova-gz')).filter(x=>x.endsWith('.b64')).sort()
 .map(x=>fs.readFileSync(path.join(root,'nova-gz',x),'utf8')).join('').replace(/\s+/g,'');
 return zlib.gunzipSync(Buffer.from(b,'base64')).toString('utf8');}
function extractStart(html){
 const start=html.indexOf('    start() {'),end=html.indexOf('    destroy() {',start);
 assert.ok(start>=0&&end>start,'exact canonical game.start owner');
 const code=html.slice(start,end);
 const open=code.indexOf('{'),close=code.indexOf('\n    }',open);
 assert.ok(close>open,'method body closes before destroy');
 return new Function('performance','requestAnimationFrame','render_1',
  'return ({start(){'+code.slice(open+1,close)+'\n}}).start');
}
function run(html,hz,frames=hz){
 let now=0,raf=null,sim=0,draws=0,mini=0;
 const make=extractStart(html);
 const start=make({now:()=>now},fn=>{raf=fn;return 1;},{render:()=>draws++});
 const g={last:0,sfx:{startMusic(){}},w:800,h:600,mmTimer:0,paused:false,
  update(dt){assert.ok(dt>=0&&dt<=1/30+1e-12);sim+=dt;},
  drawMinimap(){mini++;}};
 start.call(g);
 for(let i=1;i<=frames;i++){now=i*1000/hz;const next=raf;next(now);}
 return {sim,draws,mini,raf:!!raf};
}
test('canonical 30Hz RAF cap is unique, idempotent and fails closed on drift',()=>{
 const raw=base();assert.equal(raw.split(before).length-1,1);
 assert.equal(patchRafStepCap(raw).split(after).length-1,1);
 assert.equal(patchRafStepCap(patchRafStepCap(raw)),patchRafStepCap(raw));
 assert.equal(patchRafStepCap(shipping).split(after).length-1,1);
 assert.throws(()=>patchRafStepCap(raw.replace(before,before.replace('0.033','0.034'))),/drift/);
 assert.throws(()=>patchRafStepCap('unrelated'),/owner missing/);
});
test('real RAF loop advances one simulated second at 30, 60 and 120 Hz',()=>{
 const raw=base(),patched=patchRafStepCap(raw);
 assert.ok(Math.abs(run(raw,30).sim-.99)<1e-10,'reproduce original 30Hz slow motion');
 for(const hz of [30,60,120,240]){
  const result=run(patched,hz);
  assert.ok(Math.abs(result.sim-1)<1e-10,`timebase lost at ${hz}Hz: ${result.sim}`);
  assert.equal(result.draws,hz,'preserve rendering cadence');
  assert.ok(result.mini>0&&result.raf);
 }
 for(const hz of [60,120,240])assert.ok(Math.abs(run(raw,hz).sim-run(patched,hz).sim)<1e-10,
  'non-30Hz behavior must remain unchanged');
});
test('long browser stalls retain the existing maximum-step safety contract',()=>{
 const result=run(patchRafStepCap(base()),5,5);
 assert.ok(Math.abs(result.sim-5/30)<1e-10);
});
test('materializer and Chromium gate apply exactly the same patch and fingerprint',()=>{
 const deploy=fs.readFileSync(path.join(root,'.github/workflows/deploy.yml'),'utf8');
 const browser=fs.readFileSync(path.join(root,'.github/workflows/browser-smoke.yml'),'utf8');
 assert.ok(deploy.includes('node scripts/patch-raf-step-cap.cjs index.html.new'));
 assert.ok(deploy.includes("'scripts/patch-raf-step-cap.cjs'"));
 assert.ok(browser.includes('node scripts/patch-raf-step-cap.cjs index.html'));
 assert.ok(browser.includes("- 'scripts/patch-raf-step-cap.cjs'"));
});
