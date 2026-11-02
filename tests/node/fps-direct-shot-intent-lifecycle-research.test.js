'use strict';
// Research only: opt-in Game shot-intent patch + actual 49-overlay Input owner.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
process.env.NOVA_EXPLICIT_SHOT_INTENT_RESEARCH='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {DirectShotIntent}=require('../research/direct-shot-intent.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {ExplicitShotIntent}=require('../research/explicit-shot-intent.cjs');
function event(type,kind,x=640,id=22){return {type,pointerType:kind,pointerId:id,
 button:0,buttons:type==='pointerup'||type==='pointercancel'?0:1,
 clientX:x,clientY:200,target:{closest:()=>null}};}
function arm(cls='scout',kind='touch',mode='direct',scenario='tap',seed=1517800){
 return withSeed(seed,draws=>{
  const g=bootGame();g.sfx.muted=true;g.setClass(g.player,cls);g.input.autofire=false;
  const i=g.input,win=g.__testWindow,doc=win.document;
  const old={pd:i.pd,pu:i.pu,update:g.update,setPaused:g.setPaused,destroy:g.destroy,
   blurReset:i.__novaBlurReset};
  const timeline=mode==='timeline'?new ChronologicalInput(i):null;
  const owner=mode==='direct'?new DirectShotIntent(g,{window:win,document:doc}):
   mode==='timeline'?new ExplicitShotIntent(g,timeline):null;
  let shots=0;const fire=g.tryFire;
  g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
   if(t===g.player&&this.bullets.length>n)shots++;return r;};
  const down=event('pointerdown',kind,600),move=event('pointermove',kind,640),
   up=event('pointerup',kind,640),cancel=event('pointercancel',kind,640);
  function apply(e){if(timeline){timeline.push((e.type==='pointerdown'?.001:e.type==='pointermove'?.002:.008),e.type,e);
   return;}if(e.type==='pointerdown')i.pd(e);else if(e.type==='pointermove')i.pm(e);else i.pu(e);}
  apply(down);if(kind!=='mouse')apply(move);
  if(scenario==='long'){if(timeline)timeline.consumeThrough(1/60);g.update(1/60);}
  apply(scenario==='cancel'?cancel:up);
  if(timeline)timeline.consumeThrough(.01);
  if(scenario==='blur')i.__novaBlurReset();
  if(scenario==='pause'){g.setPaused(true);g.setPaused(false);}
  if(scenario==='hidden'){doc.hidden=true;if(owner&&owner.hidden)owner.hidden();doc.hidden=false;}
  if(scenario==='newpress')apply(event('pointerdown',kind,600,kind==='mouse'?1:23));
  for(let n=0;n<2;n++)g.update(1/60);
  const result={shots,intents:owner?.intents||0,physical:digest(physical(g)),rng:draws(),
   firing:i.firing,aim:i.aim.active,shotIntent:i.__novaShotIntent,
   drone:g.drones.filter(d=>d.ownerId===g.player.id).map(d=>[d.id,d.x,d.y,d.hp,d.__novaPhase])};
  if(owner)owner.detach();
  if(mode==='direct'){
   assert.equal(i.pd,old.pd);assert.equal(i.pu,old.pu);assert.equal(g.update,old.update);
   assert.equal(g.setPaused,old.setPaused);assert.equal(g.destroy,old.destroy);
   assert.equal(i.__novaBlurReset,old.blurReset);
  }
  g.destroy();return result;
 });
}
test('real Input short touch/mouse events get one shot opportunity, no held control',()=>{
 for(const kind of ['touch','mouse'])for(const seed of [1517800,1517802,1517810]){
  const base=arm('scout',kind,'baseline','tap',seed),a=arm('scout',kind,'direct','tap',seed);
  assert.equal(base.shots,0,kind+' baseline should miss sub-tick tap');
  assert.equal(a.shots,1,kind);assert.equal(a.intents,1);
  assert.equal(a.firing,false);assert.equal(a.aim,false);assert.equal(a.shotIntent,undefined);
 }
});
test('all 36 classes match established chronological shot intent, including Cannon fuse',()=>{
 const sample=bootGame(),classes=Object.keys(sample.__testWindow.__novaMakeRequire('')('game/classes').CLASSES);
 sample.destroy();assert.equal(classes.length,36);
 for(const cls of classes)for(const kind of ['touch','mouse']){
  const a=arm(cls,kind,'direct'),b=arm(cls,kind,'timeline');
  assert.equal(a.shots,b.shots,cls+'/'+kind);assert.equal(a.physical,b.physical,cls+'/'+kind);
  assert.equal(a.rng,b.rng,cls+'/'+kind);
 }
});
test('blur, pause, cancellation and hidden-tab reject stale shots',()=>{
 for(const kind of ['touch','mouse'])for(const scenario of ['cancel','blur','pause','hidden']){
  const a=arm('scout',kind,'direct',scenario);
  assert.equal(a.shots,0,kind+'/'+scenario);assert.equal(a.intents,0,kind+'/'+scenario);
  assert.equal(a.firing,false);assert.equal(a.aim,false);
 }
});
test('long holds never double-fire and a new touch owner cancels pending old intent',()=>{
 for(const kind of ['touch','mouse']){
  const a=arm('scout',kind,'direct','long'),b=arm('scout',kind,'baseline','long');
  assert.equal(a.shots,b.shots);assert.equal(a.physical,b.physical);
 }
 const a=arm('scout','touch','direct','newpress');
 assert.equal(a.intents,0,'new right-stick ownership must cancel stale tap');
});
test('one-tick intent never persists across 30/60/120/240Hz updates',()=>{
 for(const dt of [1/30,1/60,1/120,1/240])for(const kind of ['touch','mouse']){
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  const i=g.input;let shots=0,fire=g.tryFire;
  g.tryFire=function(t){const before=this.bullets.length,r=fire.apply(this,arguments);
   if(t===g.player&&this.bullets.length>before)shots++;return r;};
  i.pd(event('pointerdown',kind,600));
  if(kind!=='mouse')i.pm(event('pointermove',kind,640));
  i.pu(event('pointerup',kind,640));
  g.update(dt);assert.equal(o.intents,1,kind+'/'+dt);
  g.player.fireCd=0;g.update(dt);assert.equal(shots,1,'no repeated fire after first tick');
  assert.equal(i.__novaShotIntent,undefined);assert.equal(i.firing,false);
  g.destroy();assert.equal(o.old,null);
 }
});
test('native mouse chord and lifecycle cancellation remain single-owner',()=>{
 for(const cancel of [false,true]){
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  const i=g.input;i.mouseActive=true;i.firing=true;
  o.nativeDown({button:0});
  i.firing=false; // secondary button remains, native primary release already occurred
  o.nativeUp({button:0});
  assert.ok(o.pending,'native mouseup captures short primary edge without pointerup');
  if(cancel)i.__novaBlurReset();
  g.update(1/60);
  assert.equal(o.intents,cancel?0:1);
  assert.equal(o.pending,null);
  g.destroy();assert.equal(o.old,null);
 }
});
test('all Controller descendants keep the original drone recall when no shot is possible',()=>{
 const classes=['carrier','overlord','warden','hivemind','broodmother','citadel','valkyrie'];
 for(const cls of classes)for(const seed of [1517800,1517802,1517810]){
  function run(mode){return withSeed(seed,draws=>{
   const g=bootGame();g.sfx.muted=true;g.setClass(g.player,cls);g.input.autofire=false;
   const i=g.input,owner=mode==='direct'?new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document}):null;
   g.tryFire=()=>{};
   i.pd(event('pointerdown','touch',600));i.pm(event('pointermove','touch',640));
   i.pu(event('pointerup','touch',640));
   g.update(1/60);g.update(1/60);
   const state=physical(g),me=state.tanks.find(t=>t[0]===g.player.id);
   if(me)me[5]=null; // a deliberate one-tick shot intent may turn the player hull
   const out={physical:digest(state),rng:draws(),drones:g.drones.filter(d=>d.ownerId===g.player.id)
    .map(d=>[d.id,d.x,d.y,d.hp,d.__novaPhase]),recall:g.player.__novaSwarm?.recallUntil};
   if(owner)owner.detach();g.destroy();return out;
  });}
  assert.equal(JSON.stringify(run('direct')),JSON.stringify(run('baseline')),cls+'/'+seed);
 }
});


test('secondary mouse release cannot consume a pending primary shot (real Input)',()=>{
 const mouse=(type,button,buttons)=>({type,pointerType:'mouse',pointerId:1,button,buttons,
   clientX:420,clientY:220,target:{closest:()=>null}});
 for(const first of ['primary','secondary']){
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  const i=g.input;let shots=0;const fire=g.tryFire;
  g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
    if(t===g.player&&this.bullets.length>n)shots++;return r;};
  if(first==='primary')i.pd(mouse('pointerdown',0,1));
  else {i.pd(mouse('pointerdown',2,2));o.nativeDown({button:0});
    i.__novaPrimaryPressCaptured=true;i.mouseActive=true;i.firing=true;}
  assert.ok(o.down,'tracked primary press');
  i.pu(mouse('pointerup',2,1));
  assert.ok(o.down,'secondary/stale release must preserve primary ownership');
  assert.equal(o.pending,null,'no premature shot');
  i.pu(mouse('pointerup',0,2)); // primary released while secondary stays held
  assert.ok(o.pending,'real primary release should record one short shot');
  g.update(1/60);g.update(1/60);
  assert.equal(o.intents,1,first);assert.equal(shots,1);
  assert.equal(o.pending,null);assert.equal(i.__novaShotIntent,undefined);
  g.destroy();
 }
});

test('secondary release during a sampled primary hold never adds a ghost shot',()=>{
 const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
 const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
 const i=g.input;const mouse=(type,button,buttons)=>({type,pointerType:'mouse',pointerId:1,
   button,buttons,clientX:420,clientY:220,target:{closest:()=>null}});
 i.pd(mouse('pointerdown',0,3));g.update(1/60);
 assert.ok(o.down&&o.down.sampled);
 i.pu(mouse('pointerup',2,1));assert.ok(o.down&&o.down.sampled);
 i.pu(mouse('pointerup',0,0));assert.equal(o.pending,null);
 g.update(1/60);assert.equal(o.intents,0);
 g.destroy();
});

test('pointercancel still revokes a tracked primary mouse press',()=>{
 const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
 const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
 const i=g.input;
 i.pd({type:'pointerdown',pointerType:'mouse',pointerId:1,button:0,buttons:1,
   clientX:420,clientY:220,target:{closest:()=>null}});
 i.pu({type:'pointercancel',pointerType:'mouse',pointerId:1,button:-1,buttons:1});
 assert.equal(o.down,null);assert.equal(o.pending,null);
 g.update(1/60);assert.equal(o.intents,0);
 g.destroy();
});

test('touch/pen release coordinates recover a short aimed flick with no delivered pointermove',()=>{
 for(const kind of ['touch','pen'])for(const delta of [9,20,40,90]){
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  const i=g.input;let shots=0;const fire=g.tryFire;
  g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
    if(t===g.player&&this.bullets.length>n)shots++;return r;};
  i.pd(event('pointerdown',kind,600));
  // No pointermove event; release carries the final physical coordinate.
  i.pu(event('pointerup',kind,600+delta));
  assert.ok(o.pending,kind+'/'+delta+' release should retain an aimed flick');
  g.update(1/60);g.update(1/60);
  assert.equal(o.intents,1);assert.equal(shots,1);
  assert.equal(i.firing,false);assert.equal(i.aim.active,false);
  g.destroy();
 }
});

test('dead-zone release and canceled flick never create a shot intent',()=>{
 for(const kind of ['touch','pen'])for(const reason of ['dead-zone','cancel']){
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
  const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  const i=g.input;i.pd(event('pointerdown',kind,600));
  i.pu(event(reason==='cancel'?'pointercancel':'pointerup',kind,reason==='cancel'?650:605));
  assert.equal(o.pending,null);g.update(1/60);assert.equal(o.intents,0);
  g.destroy();
 }
});

test('release-only touch/pen flick matches full pointermove across all 36 classes',()=>{
 const sample=bootGame(),classes=Object.keys(sample.__testWindow.__novaMakeRequire('')('game/classes').CLASSES);
 sample.destroy();assert.equal(classes.length,36);
 for(const cls of classes)for(const kind of ['touch','pen']){
  function run(withMove){return withSeed(1517802,draws=>{
   const g=bootGame();g.sfx.muted=true;g.input.autofire=false;g.setClass(g.player,cls);
   const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
   const i=g.input;i.pd(event('pointerdown',kind,600));
   if(withMove)i.pm(event('pointermove',kind,640));
   i.pu(event('pointerup',kind,640));
   g.update(1/60);g.update(1/60);
   const out={state:digest(physical(g)),draws:draws(),intents:o.intents,
    held:i.aim.active||i.firing,leak:i.__novaShotIntent};
   g.destroy();return out;
  });}
  assert.deepEqual(run(false),run(true),cls+'/'+kind);
 }
});


test('release-only direction/depth matches shipping Input stick geometry over 4,000 vectors',()=>{
 const g=bootGame();g.sfx.muted=true;g.input.autofire=false;
 const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
 const i=g.input;let seed=0x4e4f5641;
 function rand(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;}
 const points=[[0,0],[8.999,0],[9,0],[9.001,0],[64,0],[64.001,0],[-64,0],[0,-64],[64,64],[-80,40]];
 for(let n=0;n<4000;n++)points.push([(rand()-.5)*500,(rand()-.5)*500]);
 for(let n=0;n<points.length;n++){
  const [dx,dy]=points[n],id=n+100;
  const down={type:'pointerdown',pointerType:'touch',pointerId:id,button:0,buttons:1,
    clientX:600,clientY:200,target:{closest:()=>null}};
  i.pd(down);
  const expected={ox:i.aim.ox,oy:i.aim.oy,dx:0,dy:0};
  i.updateStick(expected,expected.ox+dx,expected.oy+dy);
  const up={...down,type:'pointerup',buttons:0,clientX:600+dx,clientY:200+dy};
  i.pu(up);
  const length=Math.hypot(expected.dx,expected.dy);
  if(length<9){assert.equal(o.pending,null,'dead zone '+n);continue;}
  assert.ok(o.pending,'expected shot '+n);
  assert.ok(Math.abs(o.pending.aim.x-expected.dx/length)<1e-12,'x '+n);
  assert.ok(Math.abs(o.pending.aim.y-expected.dy/length)<1e-12,'y '+n);
  assert.ok(Math.abs(o.pending.depth-Math.max(.08,Math.min(1,(length-5)/55)))<1e-12,'depth '+n);
 }
 g.destroy();
});


test('an un-aimed touch/pen update does not consume a later release-only flick',()=>{
 for(const kind of ['touch','pen'])for(const cls of ['scout','carrier','hivemind']){
  const g=bootGame();g.sfx.muted=true;g.input.autofire=false;g.setClass(g.player,cls);
  const o=new DirectShotIntent(g,{window:g.__testWindow,document:g.__testWindow.document});
  const i=g.input;let shots=0;const fire=g.tryFire;
  g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
    if(t===g.player&&this.bullets.length>n)shots++;return r;};
  i.pd(event('pointerdown',kind,600));
  g.update(1/60); // stick is held, but no aim direction exists yet
  assert.ok(o.down&&!o.down.sampled,'zero-vector stick is not a firing opportunity');
  i.pu(event('pointerup',kind,640));
  assert.ok(o.pending,'release-only flick must survive un-aimed update');
  g.update(1/60);assert.equal(o.intents,1);assert.equal(shots,1);
  assert.equal(i.firing,false);assert.equal(i.aim.active,false);
  g.destroy();
 }
});
