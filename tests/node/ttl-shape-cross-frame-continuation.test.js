'use strict';
// Actual 49-overlay Game.update, including live spatial-hash rebuild.
const test=require('node:test');
const assert=require('node:assert/strict');
const previousAudioFlag=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previousAudioFlag===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previousAudioFlag;
function trial({hz=60,secondX=40.3,third=false,wall=false,lethal=false,
                invalidLedger=false,teleport=false,competitor=false}={}){
 return withSeed(1517802,()=>{
  const g=bootGame();if(!g.player)g.redeploy();g.sfx.muted=true;
  const p=g.player;p.x=1000;p.y=1000;p.hp=1000;p.alive=true;
  g.tanks=[p];g.tankById=new Map([[p.id,p]]);g.drones=[];g.__novaTerrain=[];
  const circles=g.shapes.filter(s=>s.type==='circle').slice(0,third?3:2);
  assert.equal(circles.length,third?3:2);
  circles.forEach((s,i)=>{s.x=i===0?16.1:i===1?secondX:29.5;
   s.y=0;s.r=12;s.hp=i===1&&lethal?10:100;s.born=0;s.vx=0;s.vy=0;});
  g.shapes=circles;g.time=0;g.input.firing=false;g.input.autofire=false;
  g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>null;
  const hits=[],old=g.damageShape;
  g.damageShape=function(s){if(circles.includes(s))hits.push(s.id);return old.apply(this,arguments);};
  g.bullets=[{kind:'bullet',id:100,ownerId:p.id,x:0,y:0,vx:1000,vy:0,
   r:4,dmg:20,ttl:.0332,pen:1,hits:0,dead:false,shell:false,beam:false,
   color:'#fff'}];
  let frames=0;
  while(g.bullets.some(b=>b.id===100)&&frames<10){
   frames++;
   if(frames===2){
    const b=g.bullets.find(b=>b.id===100);
    if(invalidLedger)b.__novaDirectVictims=new Set();
    if(wall)g.__novaTerrain=[{id:-51,shape:'rect',x:25,y:0,w:2,h:80,
      solid:true,destructible:false,hp:0}];
    if(teleport)circles[1].x=secondX+100;
    if(competitor)g.bullets.push({kind:'bullet',id:101,ownerId:999,x:24,y:0,
     vx:0,vy:0,r:3,dmg:1,ttl:.2,pen:0,hits:0,dead:false,
     shell:false,beam:false,color:'#fff'});
   }
   g.update(1/hz);
  }
  return {hits,hp:Array.from(circles,s=>s.hp).slice(0,third?3:2),frames,remaining:g.bullets.some(b=>b.id===100)};
 });
}
for(const hz of [30,60,120,240])test(`full-game piercing neutral contact parity at ${hz}Hz`,()=>{
 const r=trial({hz});assert.deepEqual(r.hp.slice(0,2),[80,80]);
 assert.equal(r.hits.length,2);assert.equal(r.remaining,false);
});
test('60Hz cannot reach a second Circle just beyond physical TTL',()=>{
 const r=trial({secondX:49.25});assert.deepEqual(r.hp,[80,100]);
});
test('60Hz cannot reach a second Circle beyond physical TTL',()=>{
 const r=trial({secondX:60});assert.deepEqual(r.hp,[80,100]);
});
test('60Hz never re-damages an already-hit victim',()=>{
 const r=trial();assert.equal(r.hits.length,2);assert.equal(new Set(r.hits).size,2);
});
test('60Hz invalid first-victim ledger fails closed',()=>{
 const r=trial({invalidLedger:true});assert.deepEqual(r.hp,[80,100]);
});
test('60Hz permanent cover vetoes speculative second contact',()=>{
 const r=trial({wall:true});assert.deepEqual(r.hp,[80,100]);
});
test('60Hz lethal second neutral remains on legacy path',()=>{
 const r=trial({lethal:true});assert.deepEqual(r.hp,[80,10]);
});
test('60Hz ambiguous third neutral vetoes speculative contact',()=>{
 const r=trial({third:true});assert.deepEqual(r.hp,[80,100,100]);
});
test('60Hz discontinuous second neutral motion cannot produce phantom hit',()=>{
 const r=trial({teleport:true});assert.deepEqual(r.hp,[80,100]);
});
test('60Hz local competing projectile vetoes speculative continuation',()=>{
 const r=trial({competitor:true});
 assert.deepEqual(r.hp,[79,100],
  'do not precommit a second neutral hit while a local projectile competes');
});
