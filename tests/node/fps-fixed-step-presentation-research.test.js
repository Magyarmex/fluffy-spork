'use strict';
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const {FixedStepPosePresentation}=require('../research/fixed-step-presentation.cjs');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {BrowserEventTimeline}=require('../research/fixed-step-browser-events.cjs');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function run(seed,hz,enabled){return withSeed(seed,draws=>{
 const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
 const presentation=new FixedStepPosePresentation(g,{enabled});
 const timeline=new ChronologicalInput(g.input);
 const bridge=new BrowserEventTimeline(timeline,{now:()=>1000,timeOrigin:1793560000000});
 let now=1000,cb=null,rendered=[],violations=0;
 const originalRender=g.__testWindow.__novaMakeRequire('')('game/render').render;
 const owner=new FixedStepRafOwner(g,timeline,bridge,{
  now:()=>now,request:fn=>{cb=fn;return 1},cancel:()=>{cb=null},
  render:(game,w,h,alpha)=>{
   const player=game.player,oldX=player.x,oldY=player.y;
   presentation.draw((game,w,h)=>{
    rendered.push({x:game.player.x,y:game.player.y,camX:game.cam.x,camY:game.cam.y,alpha});
    originalRender(game,w,h);
   },game,w,h,alpha);
   if(player.x!==oldX||player.y!==oldY)violations++;
  }
 });
 try{
  owner.start();g.input.keyboard.right=true;
  for(let f=1;f<=hz*2;f++){now=1000+f*1000/hz;const fn=cb;cb=null;fn(now);}
  return {hash:digest(physical(g)),draws:draws(),ticks:owner.ticks,
   rendered,violations,interpolated:presentation.interpolated};
 }finally{owner.stop();presentation.stop();g.destroy()}
});}
test('opt-in presentation is simulation- and RNG-pure across 30/60/120/240Hz',()=>{
 for(const seed of [1517800,1517802,1517810]){
  const baseline=run(seed,60,false);
  for(const hz of [30,60,120,240]){
   const result=run(seed,hz,hz>=120);
   assert.equal(result.ticks,120);assert.equal(result.violations,0);
   assert.equal(result.hash,baseline.hash,`${hz}Hz physical mismatch`);
   assert.equal(result.draws,baseline.draws,`${hz}Hz RNG mismatch`);
  }
 }
});
test('120Hz interpolates between consecutive 60Hz poses, while 60Hz is unmodified',()=>{
 const fast=run(1517800,120,true),base=run(1517800,120,false),normal=run(1517800,60,false);
 assert.ok(fast.interpolated>0,'moving tanks must interpolate');
 assert.ok(fast.rendered.some((r,i)=>i>1&&Math.abs(r.x-base.rendered[i].x)>1e-5),
  'presentation should differ between fixed ticks');
 assert.equal(normal.interpolated,0);
 assert.equal(fast.hash,normal.hash);
 const repeats=rows=>rows.slice(1).filter((r,i)=>Math.abs(r.camX-rows[i].camX)<1e-9).length;
 assert.ok(repeats(fast.rendered)<repeats(base.rendered),
  `camera interpolation did not reduce repeated positions: ${repeats(fast.rendered)} vs ${repeats(base.rendered)}`);
});
test('tick-boundary alpha zero draws previous pose, never moves backward mid-frame',()=>{
 const g={tanks:[{x:0,y:0}],drones:[],shapes:[],cam:{x:0,y:0},
  update(){this.tanks[0].x+=10;this.cam.x+=10},destroy(){}};
 const p=new FixedStepPosePresentation(g,{enabled:true});
 try{g.update();const poses=[];
  for(const alpha of [0,.5,1])p.draw(game=>poses.push(game.cam.x),g,800,600,alpha);
  assert.deepEqual(poses,[0,5,10],
   'interpolation must not jump to the current tick then travel backward');
  assert.equal(g.cam.x,10);
 }finally{p.stop()}
});
test('interpolation skips teleports, newly created entities and stale samples',()=>{
 const g={tanks:[{x:0,y:0}],drones:[],shapes:[],update(){this.tanks[0].x=200;this.tanks.push({x:10,y:10})},destroy(){}};
 const p=new FixedStepPosePresentation(g,{enabled:true});
 try{g.update();const before=g.tanks.map(t=>({...t}));let seen;
  p.draw(game=>{seen=game.tanks.map(t=>({...t}))},g,800,600,.5);
  assert.deepEqual(seen,before);assert.deepEqual(g.tanks,before);
  assert.equal(p.teleportSkips,1);
 }finally{p.stop()}
});
test('camera and hull interpolate together, and both are restored',()=>{
 const g={tanks:[{x:0,y:0}],drones:[],shapes:[],cam:{x:0,y:0},
  update(){this.tanks[0].x=20;this.cam.x=10},destroy(){}};
 const p=new FixedStepPosePresentation(g,{enabled:true});
 try{g.update();p.draw(game=>{
  assert.equal(game.tanks[0].x,10);assert.equal(game.cam.x,5);
 },g,800,600,.5);
 assert.equal(g.tanks[0].x,20);assert.equal(g.cam.x,10);
 }finally{p.stop()}
});
test('redeploy or game-state transition never interpolates stale camera coordinates',()=>{
 const old={x:0,y:0},replacement={x:5,y:0};
 const g={tanks:[old],drones:[],shapes:[],cam:{x:0,y:0},player:old,status:'playing',
  update(){this.player=replacement;this.tanks=[replacement];this.cam.x=10;this.status='dead'},destroy(){}};
 const p=new FixedStepPosePresentation(g,{enabled:true});
 try{g.update();p.draw(game=>{
  assert.equal(game.cam.x,10);assert.equal(game.player.x,5);
 },g,800,600,.5);
 }finally{p.stop()}
});
test('render exception always restores exact live positions',()=>{
 const g={tanks:[{x:0,y:0}],drones:[],shapes:[],update(){this.tanks[0].x=10},destroy(){}};
 const p=new FixedStepPosePresentation(g,{enabled:true});
 try{g.update();assert.throws(()=>p.draw(()=>{assert.equal(g.tanks[0].x,5);throw Error('renderer')},g,1,1,.5),/renderer/);
  assert.equal(g.tanks[0].x,10);
 }finally{p.stop()}
});
test('paused rendering and 60Hz opt-out preserve current pose',()=>{
 const g={tanks:[{x:0,y:0}],drones:[],shapes:[],update(){this.tanks[0].x=10},destroy(){}};
 const p=new FixedStepPosePresentation(g,{enabled:true});
 try{g.update();g.paused=true;p.draw(()=>assert.equal(g.tanks[0].x,10),g,1,1,.5);
  g.paused=false;p.enabled=false;p.draw(()=>assert.equal(g.tanks[0].x,10),g,1,1,.5);
 }finally{p.stop()}
});
test('destroy cleans wrappers; stop is idempotent',()=>{
 const g={tanks:[],drones:[],shapes:[],update(){},destroy(){this.done=true}};
 const update=g.update,destroy=g.destroy,p=new FixedStepPosePresentation(g,{enabled:true});
 g.destroy();assert.equal(g.done,true);assert.equal(g.update,update);assert.equal(g.destroy,destroy);
 p.stop();p.stop();assert.equal(p.active,false);
});
