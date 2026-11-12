'use strict';
// Research-only dense combat regression for the opt-in fixed60 pose presenter.
// This is an ownership/physics invariant, NOT a phone performance benchmark.
const test=require('node:test');
const assert=require('node:assert/strict');
const {FixedStepPosePresentation}=require('../research/fixed-step-presentation.cjs');

function denseGame(){
 const make=(n,prefix)=>Array.from({length:n},(_,i)=>({
  id:prefix+i,x:10+i*3,y:20+i*2,vx:0,vy:0
 }));
 const game={
  tanks:make(100,'t'),drones:make(160,'d'),
  shapes:make(120,'s'),bullets:make(240,'b'),
  cam:{x:12,y:24},status:'playing',paused:false,
  player:null,update(){
   for(const kind of ['tanks','drones','shapes','bullets'])
    for(const obj of this[kind]){obj.x+=4;obj.y+=2;}
   this.cam.x+=4;this.cam.y+=2;
  },destroy(){this.status='destroyed';}
 };
 game.player=game.tanks[0];
 return game;
}
function positions(game){
 return [...game.tanks,...game.drones,...game.shapes,...game.bullets,game.cam]
  .map(o=>[o,o.x,o.y]);
}
function unchanged(entries){
 for(const [obj,x,y] of entries){
  assert.equal(obj.x,x,'render must not mutate physics x');
  assert.equal(obj.y,y,'render must not mutate physics y');
 }
}
test('dense 620-body interpolation is visual-only across repeated ticks and cleanup',()=>{
 const g=denseGame(),originalUpdate=g.update,originalDestroy=g.destroy;
 const pose=new FixedStepPosePresentation(g,{enabled:true});
 assert.equal(pose.current.size,621);
 for(let tick=0;tick<20;tick++){
  g.update(1/60);
  const physical=positions(g);
  let drawn=0;
  pose.draw(game=>{
   for(const [obj,x,y] of physical){
    assert.equal(obj.x,x-2);
    assert.equal(obj.y,y-1);
    drawn++;
   }
  },g,320,700,.5);
  assert.equal(drawn,621);
  unchanged(physical);
  assert.equal(pose.current.size,621,'snapshot count must remain bounded');
 }
 assert.equal(pose.interpolated,621*20);
 assert.equal(pose.teleportSkips,0);
 g.destroy();
 assert.equal(pose.active,false);
 assert.equal(g.update,originalUpdate);
 assert.equal(g.destroy,originalDestroy);
 assert.equal(pose.current.size,0);
 assert.equal(pose.previous.size,0);
});

test('renderer exceptions restore every dense combat pose',()=>{
 const g=denseGame(),pose=new FixedStepPosePresentation(g,{enabled:true});
 g.update(1/60);
 const physical=positions(g);
 assert.throws(()=>pose.draw(()=>{throw Error('canvas failure')},g,320,700,.25),
  /canvas failure/);
 unchanged(physical);
 pose.stop();
});


test('reused projectile IDs do not borrow an expired projectile visual history',()=>{
 const g=denseGame(),pose=new FixedStepPosePresentation(g,{enabled:true});
 const expired=g.bullets[3],id=expired.id;
 g.update(1/60);
 g.bullets.splice(3,1);
 const replacement={id,x:900,y:900,vx:0,vy:0};
 g.bullets.push(replacement);
 g.update(1/60);
 const physical=positions(g);
 pose.draw(()=>{
  assert.equal(replacement.x,904);
  assert.equal(replacement.y,902);
  assert.notEqual(replacement,expired);
 },g,320,700,.5);
 unchanged(physical);
 pose.stop();
});


test('alternating snapshots reuse pose records without aliasing the prior tick',()=>{
 const g=denseGame(),p=new FixedStepPosePresentation(g,{enabled:true});
 try{
  g.update(1/60);
  const first=p.current,prior=p.previous;
  const priorPose=prior.get(g.tanks[0]);
  const firstPose=first.get(g.tanks[0]);
  assert.notEqual(priorPose,firstPose,'consecutive snapshots must not share records');
  assert.equal(priorPose.x,10);
  assert.equal(firstPose.x,14);
  g.update(1/60);
  assert.equal(p.current,prior,'third snapshot reuses inactive map');
  assert.equal(p.current.get(g.tanks[0]),priorPose,'reuse existing pose record');
  assert.equal(p.previous.get(g.tanks[0]),firstPose);
  assert.equal(firstPose.x,14,'prior pose must remain immutable');
  p.draw(game=>assert.equal(game.tanks[0].x,16),g,320,700,.5);
  assert.equal(g.tanks[0].x,18);
  for(let i=0;i<50;i++)g.update(1/60);
  assert.equal(p.initialBuffer.posePool.length,621);
  assert.equal(p.spare.posePool.length,621);
 }finally{p.stop()}
 assert.equal(p.initialBuffer.posePool.length,0);
 assert.equal(p.spare.posePool.length,0);
});

test('snapshot pools shrink after dense entities disappear and do not retain removed bodies',()=>{
 const g=denseGame(),p=new FixedStepPosePresentation(g,{enabled:true});
 try{
  g.update(1/60);
  const removed=g.bullets[0];
  g.tanks=g.tanks.slice(0,1);g.drones=[];g.shapes=[];g.bullets=[];
  for(let i=0;i<4;i++)g.update(1/60);
  assert.equal(p.current.size,2,'one tank and one camera');
  assert.equal(p.current.has(removed),false);
  assert.ok(p.initialBuffer.posePool.length<=128);
  assert.ok(p.spare.posePool.length<=128);
 }finally{p.stop()}
});
