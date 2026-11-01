'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchRafStepCap,before,intermediate,after}=require('../../scripts/patch-raf-step-cap.cjs');
const root=path.resolve(__dirname,'../..');
function raw(){const b=fs.readdirSync(path.join(root,'nova-gz')).filter(x=>x.endsWith('.b64')).sort()
 .map(x=>fs.readFileSync(path.join(root,'nova-gz',x),'utf8')).join('').replace(/\s+/g,'');
 return zlib.gunzipSync(Buffer.from(b,'base64')).toString('utf8');}
function method(html){const s=html.indexOf('    start() {'),e=html.indexOf('    destroy() {',s);
 assert.ok(s>=0&&e>s,'canonical start/destroy owner');const body=html.slice(s,e),a=body.indexOf('{'),b=body.indexOf('\n    }',a);
 assert.ok(b>a);return new Function('performance','requestAnimationFrame','render_1',
  'return ({start(){'+body.slice(a+1,b)+'\n}}).start');}
function driver(html){let now=0,raf=null,draws=0,mini=0;const dts=[];
 const start=method(html)({now:()=>now},fn=>{raf=fn;return 1;},{render:()=>draws++});
 const g={last:0,sfx:{startMusic(){}},w:320,h:568,mmTimer:0,paused:false,
  update(dt){assert.ok(Number.isFinite(dt)&&dt>=0&&dt<=1/30+1e-12,'safe dt');dts.push(dt);},
  drawMinimap(){mini++;}};
 start.call(g);return {g,dts,frame(ms){now+=ms;const cb=raf;cb(now);},
  get draws(){return draws;},get mini(){return mini;}};
}
function total(d){return d.reduce((a,b)=>a+b,0);}
function approx(a,b,tol=1e-8){assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);}
test('patch accepts raw, previously shipped, and new shell; rejects drift',()=>{
 const old=raw(),mid=old.replace(before,intermediate),latest=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.equal(patchRafStepCap(old),patchRafStepCap(mid));
 assert.equal(patchRafStepCap(patchRafStepCap(latest)),patchRafStepCap(latest));
 assert.equal(patchRafStepCap(patchRafStepCap(old)),patchRafStepCap(old));
 assert.equal(patchRafStepCap(old).split(after).length-1,1);
 assert.throws(()=>patchRafStepCap(old.replace(before,'            const dt = 123;')),/drift/);
});
test('steady 30, 60, 120 and 240Hz retain one update per draw and exact time',()=>{
 const html=patchRafStepCap(raw());for(const hz of [30,60,120,240]){
  const d=driver(html);for(let i=0;i<hz*5;i++)d.frame(1000/hz);
  assert.equal(d.dts.length,hz*5);assert.equal(d.draws,hz*5);approx(total(d.dts),5);
  for(const dt of d.dts)approx(dt,1/hz,1e-9);
 }});
test('alternating 60Hz/20Hz frames with 30Hz mean recovers bounded wall time',()=>{
 const old=driver(raw()),fixed=driver(patchRafStepCap(raw()));
 for(let i=0;i<9000;i++){for(const ms of [1000/60,1000/20]){old.frame(ms);fixed.frame(ms);}}
 const oldTime=total(old.dts),fixedTime=total(fixed.dts);
 approx(oldTime,447,1e-5); // old loses 153 seconds of a 600-second interval
 approx(fixedTime,600-1/60,1e-5); // only the last frame's bounded carry remains
 assert.equal(fixed.dts.length,18000);assert.equal(fixed.draws,18000);
});
test('short 50ms stall repays in a later frame without unsafe oversized steps',()=>{
 const d=driver(patchRafStepCap(raw()));
 d.frame(1000/60);d.frame(50);d.frame(1000/60);d.frame(1000/60);
 approx(total(d.dts),.1);assert.equal(d.dts.length,4);
 approx(d.dts[1],1/30);approx(d.dts[2],1/30);approx(d.dts[3],1/60);
});
test('long stall discards excess time rather than spiral-catch-up',()=>{
 const d=driver(patchRafStepCap(raw()));d.frame(1000/60);d.frame(1000);d.frame(1000/60);d.frame(1000/60);
 assert.equal(d.dts.length,4);approx(d.dts[1],1/30);approx(d.dts[2],1/30);
 assert.ok(total(d.dts)<.2,'long stall must not fast-forward combat');
});
test('pause, evolution pause, and resume do not leak stale time debt',()=>{
 const d=driver(patchRafStepCap(raw()));d.frame(50);d.g.paused=true;
 d.frame(1000/60);d.frame(1000);d.g.paused=false;d.frame(1000/60);
 approx(d.dts.at(-1),1/60);assert.equal(d.dts.length,2);
 const e=driver(patchRafStepCap(raw()));const original=e.g.update;
 e.g.update=function(dt){original.call(this,dt);this.paused=true;};
 e.frame(50);e.g.paused=false;e.g.update=original;e.frame(1000/60);
 approx(e.dts.at(-1),1/60);
});
test('clock regression never produces a negative simulation step',()=>{
 const d=driver(patchRafStepCap(raw()));d.frame(1000/60);d.frame(-10);d.frame(10);
 assert.ok(d.dts.every(x=>x>=0));
});
