'use strict';
// Verify physical first-contact chronology through the composed 49-overlay game.
// A core endpoint overlap must not outrank a stationary neutral crossed earlier.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
function scenario(hz,opt={}){
 return withSeed(1517802,()=>{
  const g=bootGame();if(!g.player)g.redeploy();g.sfx.muted=true;
  const p=g.player;p.x=1000;p.y=1000;p.hp=1000;p.alive=true;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);g.drones=[];
  g.__novaTerrain=opt.cover?[{id:7001,kind:'terrain',shape:'rect',
   x:12,y:0,w:5,h:80,type:'wall',solid:true,destructible:false}]:[];
  const ss=g.shapes.filter(s=>s.type==='circle').slice(0,opt.thirdX==null?2:3);
  assert.equal(ss.length,opt.thirdX==null?2:3);
  ss.forEach((s,i)=>{s.x=i===2?opt.thirdX:i?(opt.secondX??42):(opt.firstX??16.1);
   s.y=i?0:(opt.firstY??0);s.r=12;s.hp=i?100:(opt.firstHp??100);
   s.born=0;s.vx=0;s.vy=0;});
  const refs=ss.slice();g.shapes=opt.reverseShapes?ss.slice().reverse():ss;g.time=0;
  g.input.firing=false;g.input.autofire=false;
  g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>null;
  const hits=[],old=g.damageShape;
  g.damageShape=function(s,...args){if(refs.includes(s))hits.push(refs.indexOf(s));
   return old.call(this,s,...args);};
  g.bullets=[{kind:'bullet',id:100,ownerId:p.id,x:0,y:0,
   vx:opt.bulletVx??1000,vy:0,r:3,dmg:20,ttl:1,pen:0,hits:0,
   dead:false,shell:false,beam:false,color:'#fff'}];
  if(opt.extraBullet)g.bullets.push({kind:'bullet',id:101,ownerId:p.id,
   x:opt.extraBullet.x,y:opt.extraBullet.y,vx:0,vy:0,
   r:3,dmg:1,ttl:1,pen:0,hits:0,dead:false,
   shell:false,beam:false,color:'#fff'});
  g.update(1/hz);
  return {hits,hp:Array.from(refs,s=>s.hp)};
 });
}
for(const hz of [30,60,120,240]){
 test('first stationary neutral surface wins at '+hz+'Hz',()=>{
  const r=scenario(hz);
  assert.deepEqual(r.hits,[0]);assert.deepEqual(r.hp,[80,100]);
 });
}
test('near-tangent earlier Circle cannot steal a later endpoint hit',()=>{
 const r=scenario(30,{firstY:15.5});
 assert.deepEqual(r.hits,[1]);assert.deepEqual(r.hp,[100,80]);
});
test('lethal earlier contact is attributed to the physically first Circle',()=>{
 const r=scenario(30,{firstHp:10});
 assert.deepEqual(r.hits,[0]);assert.ok(r.hp[0]<=0);assert.equal(r.hp[1],100);
});
test('earlier permanent cover vetoes both neutral hits',()=>{
 const r=scenario(30,{cover:true});
 assert.deepEqual(r.hits,[]);assert.deepEqual(r.hp,[100,100]);
});
test('single witnessed initial overlap beats later endpoint at 30Hz',()=>{
 for(const x of [-4,0,4])for(const reverseShapes of [false,true]){
  const r=scenario(30,{firstX:x,reverseShapes});
  assert.deepEqual(r.hits,[0],'initial physical contact at x='+x);
  assert.deepEqual(r.hp,[80,100]);
 }
});
test('a single starting overlap has first-contact priority across presentation rates',()=>{
 for(const hz of [30,60,120,240]){
  const r=scenario(hz,{firstX:0});
  assert.deepEqual(r.hits,[0],'initial contact must not depend on '+hz+'Hz');
 }
});
test('initially overlapping Circle may die without damaging a later endpoint target',()=>{
 const r=scenario(30,{firstX:0,firstHp:10});
 assert.deepEqual(r.hits,[0]);assert.ok(r.hp[0]<=0);assert.equal(r.hp[1],100);
});
test('two simultaneous starting overlaps remain ambiguous and retain core authority',()=>{
 for(const reverseShapes of [false,true]){
  const r=scenario(30,{firstX:0,secondX:8,thirdX:42,reverseShapes});
  assert.deepEqual(r.hits,[2],'simultaneous t=0 contacts are ambiguous');
 }
});
test('exact starting tangency is not promoted to a guaranteed entry',()=>{
 const r=scenario(30,{firstX:15});
 assert.deepEqual(r.hits,[1]);
});
test('80 constructed starting-inside corridors retain earliest neutral hit',()=>{
 for(let i=0;i<80;i++){
  const firstX=-8+(i%17),firstY=-6+Math.floor(i/17)*3;
  const r=scenario(30,{firstX,firstY,reverseShapes:i%2===1});
  assert.deepEqual(r.hits,[0],'initial contact lost in corridor '+i);
  assert.deepEqual(r.hp,[80,100]);
 }
});
test('single initial overlap cannot bypass earlier permanent cover',()=>{
 const r=scenario(30,{firstX:0,cover:true});
 assert.deepEqual(r.hits,[]);
});
test('initial overlap remains conservative with a nearby competing shot',()=>{
 const r=scenario(30,{firstX:0,extraBullet:{x:24,y:0}});
 assert.ok(r.hits.length>0);
 /* The competing shot owns its own collision; do not assert an invented
  * global first-event order between independent projectiles. */
});
test('60 varied separated first surfaces outrank later endpoint overlap',()=>{
 for(let i=0;i<60;i++){
  const x=15.25+(i%15)*.18,y=((i%5)-2)*1.25;
  const r=scenario(30,{firstX:x,firstY:y});
  assert.deepEqual(r.hits,[0],'wrong first contact at sample '+i);
  assert.deepEqual(r.hp,[80,100]);
 }
});

test('a distant independent shot does not suppress local first contact',()=>{
 const r=scenario(30,{extraBullet:{x:1400,y:1400}});
 assert.deepEqual(r.hits,[0]);assert.deepEqual(r.hp,[80,100]);
});
test('a nearby competing shot preserves the original contact behavior',()=>{
 const r=scenario(30,{extraBullet:{x:24,y:0}});
 assert.deepEqual(r.hits,[0,0]);assert.deepEqual(r.hp,[79,100]);
});

// Reachable default-class case: ordinary player weapons start with pen=1.
// A lethal first contact consumes one penetration, leaving pen=0/hits=1;
// the following frame must not choose a later endpoint-overlapping neutral.
test('ordinary pen=1 shot retains first-contact order after a lethal prior hit',()=>{
 const r=withSeed(1517802,()=>{
  const g=bootGame();if(!g.player)g.redeploy();g.sfx.muted=true;
  const p=g.player;p.x=1000;p.y=1000;p.hp=1000;p.alive=true;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);g.drones=[];g.__novaTerrain=[];
  const ss=g.shapes.filter(s=>s.type==='circle').slice(0,3);
  ss.forEach((s,i)=>{s.x=[20,50,80][i];s.y=0;s.type='square';
   s.r=12;s.hp=i?100:10;s.born=0;s.vx=0;s.vy=0;s.wanderT=999;});
  const refs=ss.slice();g.shapes=ss;g.time=0;
  g.input.firing=false;g.input.autofire=false;
  g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>null;
  const hits=[],old=g.damageShape;
  g.damageShape=function(shape,...args){
   if(refs.includes(shape))hits.push(refs.indexOf(shape));
   return old.call(this,shape,...args);
  };
  g.bullets=[{kind:'bullet',id:100,ownerId:p.id,x:0,y:0,
   vx:1000,vy:0,r:3,dmg:20,ttl:1,pen:1,hits:0,
   dead:false,shell:false,beam:false,color:'#fff'}];
  g.update(1/30);g.update(1/30);
  return {hits,hp:refs.map(s=>s.hp)};
 });
 assert.deepEqual(r.hits,[0,1]);
 assert.ok(r.hp[0]<=0);
 assert.equal(r.hp[1],80);
 assert.equal(r.hp[2],100);
});

test('ordinary pen=1 projectile honors unique starting overlap after its first lethal contact',()=>{
 for(const hz of [30,60]){
  const r=withSeed(1517802,()=>{
   const g=bootGame();if(!g.player)g.redeploy();g.sfx.muted=true;
   const p=g.player;p.x=1000;p.y=1000;p.hp=1000;p.alive=true;
   g.tanks=[p];g.tankById=new Map([[p.id,p]]);g.drones=[];g.__novaTerrain=[];
   const ss=g.shapes.filter(s=>s.type==='circle').slice(0,3);
   ss.forEach((s,i)=>{s.x=[20,36,70][i];s.y=0;s.type='square';
    s.r=12;s.hp=i?100:10;s.born=0;s.vx=0;s.vy=0;s.wanderT=999;});
   const refs=ss.slice();g.shapes=ss;g.time=0;
   g.input.firing=false;g.input.autofire=false;
   g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>null;
   const hits=[],old=g.damageShape;
   g.damageShape=function(s,...args){if(refs.includes(s))hits.push(refs.indexOf(s));
    return old.call(this,s,...args);};
   g.bullets=[{kind:'bullet',id:100,ownerId:p.id,x:0,y:0,
    vx:1000,vy:0,r:3,dmg:20,ttl:1,pen:1,hits:0,
    dead:false,shell:false,beam:false,color:'#fff'}];
   for(let i=0;i<(hz===30?2:4);i++)g.update(1/hz);
   return {hits,hp:refs.map(s=>s.hp)};
  });
  assert.deepEqual(r.hits.slice(0,2),[0,1],'prior kill then starting overlap at '+hz+'Hz');
  assert.ok(r.hp[0]<=0);assert.equal(r.hp[1],80);assert.equal(r.hp[2],100);
 }
});

test('an initial overlap outside endpoint hash cells still vetoes unique-first proof',()=>{
 for(const reverseShapes of [false,true]){
  const r=scenario(30,{firstX:12,secondX:-10,thirdX:65,
   bulletVx:1800,reverseShapes});
  assert.deepEqual(r.hits,[2],
   'two t=0 victims cannot be certified from endpoint candidates alone');
 }
});
