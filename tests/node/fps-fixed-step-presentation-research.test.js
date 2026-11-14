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
test('opt-in presentation is simulation- and RNG-pure across 30/60/90/120/240Hz',()=>{
 for(const seed of [1517800,1517802,1517810]){
  const baseline=run(seed,60,false);
  for(const hz of [30,60,90,120,240]){
   const result=run(seed,hz,hz>=90);
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
test('90Hz interpolated camera and hull poses reduce repeated frames without altering the Game',()=>{
 const fast=run(1517800,90,true),base=run(1517800,90,false),normal=run(1517800,60,false);
 assert.equal(fast.ticks,120,'90Hz presentation must execute exactly 120 fixed ticks');
 assert.equal(fast.hash,normal.hash,'visual interpolation cannot alter physical state');
 assert.equal(fast.draws,normal.draws,'visual interpolation cannot alter RNG');
 assert.ok(fast.interpolated>0,'90Hz should interpolate real moving poses');
 const repeats=rows=>rows.slice(1).filter((r,i)=>Math.abs(r.camX-rows[i].camX)<1e-9).length;
 assert.ok(repeats(fast.rendered)<repeats(base.rendered),
  '90Hz camera interpolation must reduce repeated poses, not just preserve hashes');
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

test('projectile visual interpolation preserves physical poses and handles birth/death',()=>{
 const first={x:0,y:0},newborn={x:5,y:0};
 const g={tanks:[],drones:[],shapes:[],bullets:[first],update(){
  if(this.bullets.length===1){first.x=10;this.bullets.push(newborn)}
  else{this.bullets=[newborn];newborn.x=15}
 },destroy(){}};
 const p=new FixedStepPosePresentation(g,{enabled:true});
 try{
  g.update();
  p.draw(game=>{
   assert.equal(game.bullets[0].x,5,'existing projectile must interpolate');
   assert.equal(game.bullets[1].x,5,'newborn projectile must not interpolate from nothing');
  },g,800,600,.5);
  assert.equal(first.x,10,'renderer must not move live projectile');
  assert.equal(newborn.x,5);
  g.update();
  p.draw(game=>{
   assert.equal(game.bullets.length,1,'removed projectile must not be drawn');
   assert.equal(game.bullets[0].x,10,'surviving projectile interpolates from prior tick');
  },g,800,600,.5);
  assert.equal(newborn.x,15);
 }finally{p.stop()}
});
test('projectile teleports and rendering exceptions never corrupt physical state',()=>{
 const bullet={x:0,y:0};
 const g={tanks:[],drones:[],shapes:[],bullets:[bullet],
  update(){bullet.x=1000},destroy(){}};
 const p=new FixedStepPosePresentation(g,{enabled:true});
 try{
  g.update();
  p.draw(game=>assert.equal(game.bullets[0].x,1000),g,800,600,.5);
  assert.equal(p.teleportSkips,1);
  assert.throws(()=>p.draw(()=>{throw Error('render failed')},g,800,600,.5),
   /render failed/);
  assert.equal(bullet.x,1000);
 }finally{p.stop()}
});

test('74Hz composed-Game projectile presentation reduces repeated visual poses without changing physics',()=>{
 function run(enabled){return withSeed(1517800,draws=>{
  const g=bootGame(),p=g.player;g.sfx.muted=true;g.sfx.startMusic=()=>{};
  g.setClass(p,'minigun');
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);
  g.shapes=[];g.drones=[];g.powerups=[];g.bullets=[];
  if(g.shapeById)g.shapeById.clear();
  if(g.hash&&g.hash.clear)g.hash.clear();
  g.shapeTimer=Infinity;g.powerupTimer=Infinity;g.eliteTimer=Infinity;
  g.crasherTimer=Infinity;g.aiRespawns=[];
  g.spawnShape=()=>null;g.spawnPowerup=()=>null;g.spawnAITank=()=>null;
  p.droneRespawnT=Infinity;g.spawnDrone=()=>null;
  g.status='playing';g.paused=false;
  const presentation=new FixedStepPosePresentation(g,{enabled});
  const actualRender=g.__testWindow.__novaMakeRequire('')('game/render').render;
  const timeline=new ChronologicalInput(g.input);
  const bridge={timeline,startMs:1000};
  let now=1000,callback=null,rows=[],physicalViolations=0;
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>now,request:fn=>(callback=fn,1),cancel:()=>{callback=null},
   render:(game,w,h,alpha)=>{
    const b=game.bullets[0],before=b&&[b.x,b.y];
    presentation.draw(game=>{
     const bullet=game.bullets[0];
     if(bullet)rows.push({bullet,x:bullet.x,y:bullet.y});
     actualRender(game,w,h);
    },game,w,h,alpha);
    if(b&&(b.x!==before[0]||b.y!==before[1]))physicalViolations++;
   }
  });
  try{
   owner.start();
   g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
   g.input.firing=true;g.input.autofire=false;
   for(let frame=1;frame<=148;frame++){
    now=1000+frame*1000/74;
    const fn=callback;callback=null;fn(now);
   }
   const repeats=rows.slice(1).filter((r,i)=>{
    const prior=rows[i];
    return r.bullet===prior.bullet&&
     Math.hypot(r.x-prior.x,r.y-prior.y)<1e-7;
   }).length;
   return {repeats,frames:rows.length,ticks:owner.ticks,
    hash:digest(physical(g)),draws:draws(),physicalViolations};
  }finally{owner.stop();presentation.stop();g.destroy()}
 });}
 const baseline=run(false),smooth=run(true);
 assert.equal(baseline.ticks,120);assert.equal(smooth.ticks,120);
 assert.equal(baseline.physicalViolations,0);assert.equal(smooth.physicalViolations,0);
 assert.equal(baseline.hash,smooth.hash,'visual interpolation must not change physical world');
 assert.equal(baseline.draws,smooth.draws,'visual interpolation must not draw RNG');
 assert.ok(baseline.frames>30,'real Game must produce enough projectile observations');
 assert.ok(baseline.repeats>0,'74Hz must expose repeated 60Hz projectile poses');
 assert.ok(smooth.repeats<baseline.repeats,
  `interpolation failed to smooth projectile motion: ${JSON.stringify({baseline,smooth})}`);
});

test('fast legal projectile motion interpolates but a larger teleport does not',()=>{
 const bullet={x:0,y:0,vx:7200,vy:0};
 const g={tanks:[],drones:[],shapes:[],bullets:[bullet],
  update(){bullet.x+=120},destroy(){}};
 const p=new FixedStepPosePresentation(g,{enabled:true});
 try{
  g.update();
  p.draw(game=>assert.equal(game.bullets[0].x,60),g,800,600,.5);
  assert.equal(bullet.x,120);
  bullet.x=500;g.update(); // 380-unit discontinuity despite fast velocity
  p.draw(game=>assert.equal(game.bullets[0].x,620),g,800,600,.5);
  assert.equal(bullet.x,620);
  assert.equal(p.teleportSkips,1);
 }finally{p.stop()}
});

test('bounded projectile pose threshold covers canonical max-stat class velocities',()=>{
 const g=bootGame();
 try{
  const classes=Object.keys(g.__testWindow.__novaMakeRequire('')('game/classes').CLASSES);
  assert.equal(classes.length,36);
  let fastest=0;
  for(const cls of classes){
   g.setClass(g.player,cls);
   g.player.stats.bulletspeed=8;
   g.player.gene='sniper'; // conservative multiplier even for other lineages
   fastest=Math.max(fastest,g.bulletSpeed(g.player));
  }
  assert.ok(fastest/60>96,
   'fixture must exercise the old 96-world-unit fixed displacement limit');
  assert.ok(fastest*1.5/60<=240,
   'research bullet interpolation cap must be reconsidered for new class speeds');
 }finally{g.destroy()}
});
