'use strict';
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
