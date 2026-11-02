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
  const ss=g.shapes.filter(s=>s.type==='circle').slice(0,2);
  assert.equal(ss.length,2);
  ss.forEach((s,i)=>{s.x=i?42:(opt.firstX??16.1);
   s.y=i?0:(opt.firstY??0);s.r=12;s.hp=i?100:(opt.firstHp??100);
   s.born=0;s.vx=0;s.vy=0;});
  const refs=ss.slice();g.shapes=ss;g.time=0;
  g.input.firing=false;g.input.autofire=false;
  g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>null;
  const hits=[],old=g.damageShape;
  g.damageShape=function(s,...args){if(refs.includes(s))hits.push(refs.indexOf(s));
   return old.call(this,s,...args);};
  g.bullets=[{kind:'bullet',id:100,ownerId:p.id,x:0,y:0,
   vx:1000,vy:0,r:3,dmg:20,ttl:1,pen:0,hits:0,
   dead:false,shell:false,beam:false,color:'#fff'}];
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
test('initial overlap is not misclassified as a later swept entry',()=>{
 assert.deepEqual(scenario(30,{firstX:0}).hits,[1]);
});
test('60 varied separated first surfaces outrank later endpoint overlap',()=>{
 for(let i=0;i<60;i++){
  const x=15.25+(i%15)*.18,y=((i%5)-2)*1.25;
  const r=scenario(30,{firstX:x,firstY:y});
  assert.deepEqual(r.hits,[0],'wrong first contact at sample '+i);
  assert.deepEqual(r.hp,[80,100]);
 }
});
