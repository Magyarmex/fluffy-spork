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
function driver(html,workMs=0){let now=0,workClock=0,raf=null,draws=0,mini=0;const dts=[];
 const start=method(html)({now:()=>now+workClock},fn=>{raf=fn;return 1;},{render:()=>draws++});
 const g={last:0,sfx:{startMusic(){}},w:320,h:568,mmTimer:0,paused:false,
  update(dt){assert.ok(Number.isFinite(dt)&&dt>=0&&dt<=1/30+1e-12,'safe dt');dts.push(dt);workClock+=typeof workMs==='function'?workMs(dt,dts.length):workMs;},
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
 const upgraded=patchRafStepCap(latest);
 assert.equal(upgraded.split('priorWork < 18 && earlierWork < 18 && performance.now() - workStart < Math.min(32, Math.max(18, elapsed * 500 - 2))').length-1,1,
  'already materialized production shell must acquire the current-frame budget exactly once');
 assert.equal(patchRafStepCap(patchRafStepCap(old)),patchRafStepCap(old));
 assert.equal(patchRafStepCap(old).split(after).length-1,1);
 const oldGate='priorWork < 18 && earlierWork < 18) {';
 const newGate='priorWork < 18 && earlierWork < 18 && performance.now() - workStart < Math.min(32, Math.max(18, elapsed * 500 - 2))) {';
 assert.throws(()=>patchRafStepCap(latest+oldGate),/CPU budget owner drift/);
 assert.throws(()=>patchRafStepCap(latest+newGate),/CPU budget owner drift/);
 assert.throws(()=>patchRafStepCap(latest.replace(oldGate,'priorWork <= 18 && earlierWork < 18) {')),
  /CPU budget owner drift/,'drifted materialized gate must fail closed');
 assert.throws(()=>patchRafStepCap(old.replace(before,'            const dt = 123;')),/drift/);
});
test('steady 30, 60, 120 and 240Hz retain one update per draw and exact time',()=>{
 const html=patchRafStepCap(raw());for(const hz of [30,60,120,240]){
  const d=driver(html);for(let i=0;i<hz*5;i++)d.frame(1000/hz);
  assert.equal(d.dts.length,hz*5);assert.equal(d.draws,hz*5);approx(total(d.dts),5);
  for(const dt of d.dts)approx(dt,1/hz,1e-9);
 }});
test('alternating 60Hz/20Hz frames with 30Hz mean recovers bounded wall time',()=>{
 const previous=raw().replace(before,intermediate);
 const old=driver(previous),fixed=driver(patchRafStepCap(raw()));
 for(let i=0;i<9000;i++){for(const ms of [1000/60,1000/20]){old.frame(ms);fixed.frame(ms);}}
 const oldTime=total(old.dts),fixedTime=total(fixed.dts);
 approx(oldTime,450,1e-5); // current production loses 150 seconds of a 600-second interval
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


test('sustained 20Hz presentation repays one bounded 30Hz step every other draw',()=>{
 const d=driver(patchRafStepCap(raw()));for(let i=0;i<40;i++)d.frame(50);
 approx(total(d.dts),2);assert.equal(d.dts.length,60);
 assert.equal(d.draws,40);
 assert.ok(d.dts.every(x=>x<=1/30+1e-12));
});
test('48/52ms presentation jitter recovers exact 30Hz simulation without unbounded steps',()=>{
 const d=driver(patchRafStepCap(raw()));for(let i=0;i<40;i++)d.frame(i%2?52:48);
 approx(total(d.dts),2);assert.equal(d.dts.length,60);
 assert.equal(d.draws,40);
});
test('slow-frame catchup stops immediately if first update pauses or opens an offer',()=>{
 const d=driver(patchRafStepCap(raw()));d.frame(50);
 const old=d.g.update;d.g.update=function(dt){old.call(this,dt);this.paused=true;};
 d.frame(50);assert.equal(d.dts.length,2,'no second step after pause');
 d.g.paused=false;d.g.update=old;d.frame(1000/60);
 approx(d.dts.at(-1),1/60);
});
test('long 120ms frame never triggers the additional catchup update',()=>{
 const d=driver(patchRafStepCap(raw()));d.frame(120);
 assert.equal(d.dts.length,1);approx(d.dts[0],1/30);
});

test('expensive frames decline optional recovery rather than multiplying CPU overload',()=>{
 const d=driver(patchRafStepCap(raw()),22);for(let i=0;i<40;i++)d.frame(50);
 assert.equal(d.draws,40);assert.equal(d.dts.length,40);
 approx(total(d.dts),40/30);
});

test('randomized mixed-load presentation never creates time or exceeds two updates per draw',()=>{
 for(const workMs of [0,8,22]){
  const d=driver(patchRafStepCap(raw()),workMs);let elapsed=0,state=0x6a09e667;
  for(let i=0;i<2400;i++){
   state^=state<<13;state^=state>>>17;state^=state<<5;
   const ms=[1000/120,1000/60,1000/30,48,52,80,120][(state>>>0)%7];
   const before=d.dts.length;d.frame(ms);elapsed+=ms/1000;
   assert.ok(d.dts.length-before<=2,'bounded work per presentation');
   assert.ok(total(d.dts)<=elapsed+1e-7,'cannot simulate unearned time');
  }
  assert.equal(d.draws,2400);
 }
});

// A costly *current* update must not receive a second update merely because
// the previous two rendered frames were cheap. This is a real-device CPU
// safety guard, not a request to change the normal 60Hz firing cadence.
test('current expensive first update suppresses optional RAF recovery',()=>{
 const html=patchRafStepCap(raw());
 const expensive=driver(html,(_dt,n)=>n===4?35:0);
 const moderate=driver(html,(_dt,n)=>n===4?22:0);
 const cheap=driver(html);
 for(let i=0;i<3;i++){
  expensive.frame(1000/60);moderate.frame(1000/60);cheap.frame(1000/60);
 }
 const beforeExpensive=expensive.dts.length,beforeModerate=moderate.dts.length,beforeCheap=cheap.dts.length;
 expensive.frame(80);moderate.frame(80);cheap.frame(80);
 assert.equal(expensive.dts.length-beforeExpensive,1,'do not double a 35ms current update');
 assert.equal(moderate.dts.length-beforeModerate,2,'22ms first update fits bounded 80ms interval');
 assert.equal(cheap.dts.length-beforeCheap,2,'cheap 80ms frame retains bounded catch-up');
 assert.equal(expensive.draws,4);assert.equal(moderate.draws,4);assert.equal(cheap.draws,4);
 assert.ok(expensive.dts.every(dt=>dt<=1/30+1e-12));
});

// At sustained 20Hz, a 50ms frame can have one 30Hz update of carried debt.
// Preserve moderate work that fits two updates plus a small render reserve,
// but decline a second update after a truly expensive first one.
test('interval-aware current CPU budget distinguishes 22ms from 30ms at 20Hz',()=>{
 const html=patchRafStepCap(raw());
 const moderate=driver(html,(_dt,n)=>n===5?22:0);
 const heavy=driver(html,(_dt,n)=>n===5?30:0);
 for(let i=0;i<3;i++){moderate.frame(50);heavy.frame(50);}
 assert.equal(moderate.dts.length,4,'20Hz prelude must build bounded carry');
 assert.equal(heavy.dts.length,4);
 moderate.frame(50);heavy.frame(50);
 assert.equal(moderate.dts.length,6,'22ms current update may repay at 20Hz');
 assert.equal(heavy.dts.length,5,'30ms current update must not double at 20Hz');
 assert.equal(moderate.draws,4);assert.equal(heavy.draws,4);
});


/* Known limitation, NOT a desired production contract. Reproduce how
 * a once-per-ten-frame expensive first update can change world time and
 * held-input sampling despite an identical 20Hz presentation schedule.
 * The candidate must not ship on CPU safety evidence alone. */
test('research falsifier: repeated current-frame spikes sacrifice active world time',()=>{
 const candidateHtml=patchRafStepCap(raw());
 const newGate='priorWork < 18 && earlierWork < 18 && performance.now() - workStart < Math.min(32, Math.max(18, elapsed * 500 - 2))) {';
 const oldGate='priorWork < 18 && earlierWork < 18) {';
 assert.equal(candidateHtml.split(newGate).length-1,1);
 const shippingHtml=candidateHtml.replace(newGate,oldGate);
 let frameIndex=0;
 const cost=()=>frameIndex%10===9?30:0;
 const shipping=driver(shippingHtml,cost),candidate=driver(candidateHtml,cost);
 const shippingSamples=[],candidateSamples=[];
 // The same physical held-fire window spans the first five seconds.
 for(let i=0;i<200;i++){
  frameIndex=i;
  const beforeShipping=shipping.dts.length,beforeCandidate=candidate.dts.length;
  shipping.frame(50);candidate.frame(50);
  if(i<100){
   shippingSamples.push(shipping.dts.length-beforeShipping);
   candidateSamples.push(candidate.dts.length-beforeCandidate);
  }
 }
 assert.equal(shipping.draws,200);assert.equal(candidate.draws,200);
 approx(total(shipping.dts),10);
 assert.ok(total(candidate.dts)<total(shipping.dts)-.5,
  'guard can discard over half a second of active simulation per 10s');
 assert.ok(candidate.dts.length<shipping.dts.length,
  'candidate samples identical physical input on fewer simulation updates');
 assert.ok(candidateSamples.reduce((a,b)=>a+b,0)<shippingSamples.reduce((a,b)=>a+b,0),
  'a five-second held input receives fewer candidate updates');
 console.log('RAF_CURRENT_CPU_GUARD_LIMITATION '+JSON.stringify({
  wallSeconds:10,shippingSeconds:total(shipping.dts),candidateSeconds:total(candidate.dts),
  shippingUpdates:shipping.dts.length,candidateUpdates:candidate.dts.length,
  shippingHeldUpdates:shippingSamples.reduce((a,b)=>a+b,0),
  candidateHeldUpdates:candidateSamples.reduce((a,b)=>a+b,0)
 }));
});


/* Research-only falsifiable alternative: carry at most two legal 30Hz steps
 * across active presentation gaps, but retain the existing 1-step cap after
 * a long stall. This is NOT a shipping recommendation: debt can delay input
 * sampling, and real-device touch/render measurements are still mandatory. */
test('research pilot: bounded active carry recovers isolated CPU-guard losses',()=>{
 const candidateHtml=patchRafStepCap(raw());
 const capLine='carry = Math.min(1 / 30, carry);';
 assert.equal(candidateHtml.split(capLine).length-1,1);
 const pilotHtml=candidateHtml.replace(capLine,
  'carry = Math.min(elapsed <= 1 / 12 ? 2 / 30 : 1 / 30, carry);');
 let frameIndex=0;
 const cost=()=>frameIndex%10===9?30:0;
 const candidate=driver(candidateHtml,cost),pilot=driver(pilotHtml,cost);
 for(let i=0;i<200;i++){
  frameIndex=i;
  const before=pilot.dts.length;
  candidate.frame(50);pilot.frame(50);
  assert.ok(pilot.dts.length-before<=2,'pilot must never spiral into >2 updates');
 }
 assert.ok(total(pilot.dts)>total(candidate.dts)+.5,
  'bounded active carry should recover most isolated 20Hz CPU-guard losses');
 assert.ok(total(pilot.dts)<=10+1e-8,'pilot must not simulate unearned time');
 assert.ok(10-total(pilot.dts)<.05,'isolated spikes leave at most one pending 30Hz step');
 // A >83ms stall must never activate a second update or retain 2-step debt.
 const stalled=driver(pilotHtml);
 stalled.frame(50);const before=stalled.dts.length;
 stalled.frame(1000);
 assert.equal(stalled.dts.length-before,1,'long stall must not catch up');
 const after=stalled.dts.length;
 stalled.frame(1000/60);
 assert.equal(stalled.dts.length-after,1,'resume must not replay stale input twice');
 console.log('RAF_ACTIVE_CARRY_PILOT '+JSON.stringify({
  candidateSeconds:total(candidate.dts),pilotSeconds:total(pilot.dts),
  candidateUpdates:candidate.dts.length,pilotUpdates:pilot.dts.length
 }));
});
