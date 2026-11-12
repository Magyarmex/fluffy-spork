'use strict';
// The shared composed-Game fixture has its own audio-RNG test registration.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const {FixedStepPosePresentation}=require('../research/fixed-step-presentation.cjs');
const {WeakEpochPosePresentation}=require('../research/fixed-step-weak-epoch-presentation.cjs');
function world(){
 const make=(n)=>Array.from({length:n},(_,i)=>({x:i*3,y:i*2,vx:0,vy:0}));
 const g={tanks:make(100),drones:make(160),shapes:make(120),bullets:make(240),
  cam:{x:1,y:2},status:'playing',paused:false,player:null,
  update(){for(const k of ['tanks','drones','shapes','bullets'])
    for(const o of this[k]){o.x+=4;o.y+=2;}
   this.cam.x+=4;this.cam.y+=2;},
  destroy(){this.status='destroyed';}};
 g.player=g.tanks[0];return g;
}
function run(Class){
 const g=world(),p=new Class(g,{enabled:true}),rows=[];
 const render=(game)=>{
  const entries=[...game.tanks,...game.drones,...game.shapes,...game.bullets,game.cam];
  rows.push(entries.map(o=>[o.x,o.y]));
 };
 try{
  for(let tick=0;tick<15;tick++){
   g.update(1/60);
   const physics=[...g.tanks,...g.drones,...g.shapes,...g.bullets,g.cam].map(o=>[o,o.x,o.y]);
   for(const alpha of [0,.25,.5,.75,1])p.draw(render,g,320,700,alpha);
   for(const [o,x,y] of physics){assert.equal(o.x,x);assert.equal(o.y,y);}
  }
  return {rows,interpolated:p.interpolated,teleportSkips:p.teleportSkips};
 }finally{p.stop();g.destroy();}
}
test('620-entity weak epoch presenter matches original every rendered pose',()=>{
 const old=run(FixedStepPosePresentation),weak=run(WeakEpochPosePresentation);
 assert.deepEqual(weak,old);
});
test('weak records reject removed/reintroduced projectile visual history',()=>{
 const bullet={x:0,y:0,vx:600,vy:0};
 const g={tanks:[],drones:[],shapes:[],bullets:[bullet],
  update(){},destroy(){}};
 const p=new WeakEpochPosePresentation(g,{enabled:true});
 try{
  bullet.x=10;g.update();
  p.draw(game=>assert.equal(game.bullets[0].x,5),g,1,1,.5);
  g.bullets=[];g.update();
  bullet.x=20;g.bullets=[bullet];g.update();
  p.draw(game=>assert.equal(game.bullets[0].x,20),g,1,1,.5);
  assert.equal(bullet.x,20);
 }finally{p.stop();}
});
test('weak presenter preserves teleport, respawn and render-throw guards',()=>{
 const old={x:0,y:0},next={x:5,y:5};
 const g={tanks:[old],drones:[],shapes:[],bullets:[],cam:{x:0,y:0},
  player:old,status:'playing',update(){},destroy(){}};
 const p=new WeakEpochPosePresentation(g,{enabled:true});
 try{
  old.x=200;g.update();
  p.draw(game=>assert.equal(game.tanks[0].x,200),g,1,1,.5);
  assert.equal(p.teleportSkips,1);
  g.player=next;g.tanks=[next];g.cam.x=20;g.status='dead';g.update();
  p.draw(game=>{assert.equal(game.cam.x,20);assert.equal(game.player.x,5);},g,1,1,.5);
  g.status='playing';g.update();next.x=15;g.update();
  assert.throws(()=>p.draw(game=>{
   assert.equal(game.player.x,10);throw Error('renderer failure');
  },g,1,1,.5),/renderer failure/);
  assert.equal(next.x,15);
 }finally{p.stop();}
});
test('weak records discard stale ownership after dense population shrinks',()=>{
 const g=world(),p=new WeakEpochPosePresentation(g,{enabled:true});
 try{
  g.update();
  const expired=g.bullets[0];g.bullets=[];g.drones=[];g.shapes=[];
  g.update();
  assert.equal(p.active.length,101);
  assert.ok(!p.active.includes(expired));
  g.destroy();assert.equal(p.active.length,0);
  assert.equal(p.activePresenter,false);
 }finally{p.stop();}
});

test('actual composed Game physical and RNG state match original presenter',()=>{
 const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
 function arm(Class){return withSeed(1517800,draws=>{
  const g=bootGame(),p=new Class(g,{enabled:true});
  g.sfx.muted=true;g.sfx.startMusic=()=>{};
  const render=g.__testWindow.__novaMakeRequire('')('game/render').render;
  g.input.keyboard.right=true;
  let changed=0;
  try{
   for(let i=0;i<90;i++){
    g.update(1/60);
    const x=g.player.x,y=g.player.y;
    p.draw(game=>{
     if(game.player.x!==x||game.player.y!==y)changed++;
     render(game,game.w,game.h);
    },g,g.w,g.h,.5);
    assert.equal(g.player.x,x);assert.equal(g.player.y,y);
   }
   return {hash:digest(physical(g)),draws:draws(),changed};
  }finally{p.stop();g.destroy();}
 });}
 const baseline=arm(FixedStepPosePresentation),candidate=arm(WeakEpochPosePresentation);
 assert.deepEqual(candidate,baseline);
 assert.ok(candidate.changed>0,'actual player must interpolate');
});

test('weak epoch respects legal fast bullets, skips impossible teleport, and pauses cleanly',()=>{
 const bullet={x:0,y:0,vx:7200,vy:0};
 const g={tanks:[],drones:[],shapes:[],bullets:[bullet],paused:false,
  update(){},destroy(){}};
 const p=new WeakEpochPosePresentation(g,{enabled:true});
 try{
  bullet.x=120;g.update();
  p.draw(game=>assert.equal(game.bullets[0].x,60),g,1,1,.5);
  assert.equal(bullet.x,120);
  bullet.x=620;g.update();
  p.draw(game=>assert.equal(game.bullets[0].x,620),g,1,1,.5);
  assert.equal(p.teleportSkips,1);
  g.paused=true;
  p.draw(game=>assert.equal(game.bullets[0].x,620),g,1,1,.5);
  g.paused=false;p.enabled=false;
  p.draw(game=>assert.equal(game.bullets[0].x,620),g,1,1,.5);
 }finally{p.stop();}
});

test('weak epoch matches Map presenter when one entity appears in two collections',()=>{
 const sample=(Class)=>{
  const shared={x:0,y:0,vx:60,vy:0};
  const g={tanks:[shared],drones:[shared],shapes:[],bullets:[],
   cam:{x:0,y:0},status:'playing',paused:false,player:shared,
   update(){shared.x+=10;this.cam.x+=10;},destroy(){}};
  const p=new Class(g,{enabled:true}),poses=[];
  try{
   for(let tick=0;tick<3;tick++){
    g.update(1/60);
    const original=shared.x;
    p.draw(game=>poses.push([game.tanks[0].x,game.drones[0].x,game.cam.x]),g,1,1,.5);
    assert.equal(shared.x,original,'render must restore physical pose');
   }
   return {poses,interpolated:p.interpolated,teleportSkips:p.teleportSkips};
  }finally{p.stop();}
 };
 const expected=sample(FixedStepPosePresentation);
 const actual=sample(WeakEpochPosePresentation);
 assert.deepEqual(actual,expected);
 assert.deepEqual(actual.poses.map(row=>row[0]),[5,15,25]);
});
