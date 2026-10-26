'use strict';
// A spatial hash can retain a dead bullet for the remainder of an update.
// A Triangle must not treat that stale reference as nearby live gunfire.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function scenario(hashBullets,activeBullets=[],dt=1/60,blocked=false){
  const window={__novaModules:{}};
  const context={window,Math,Map,Set,Number,Object,Array,Date,JSON,
    performance:{now:()=>0},console:{info(){},error(){},warn(){}}};
  for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js']){
    vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),
      context,{filename:name});
  }
  const LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
  const triangle={id:3,kind:'shape',type:'triangle',x:0,y:0,r:16,
    hp:30,maxHp:30,vx:0,vy:0};
  const g={time:10,shapes:[triangle],bullets:activeBullets,tanks:[],
    hasLineOfSight:()=>!blocked,
    hash:{query(x,y,r,out){for(const bullet of hashBullets)out.push(bullet);}}};
  const defs={triangle:{speed:90}};
  const st=LF.ensure(g,defs);
  LF.behaviorTick(g,st,defs,dt);
  return {triangle,st};
}
const dead={id:9,kind:'bullet',x:-35,y:0,vx:500,vy:0,
  r:4,ttl:.5,dead:true};
for(const hz of [30,60,120,240]){
  test('Triangle ignores a dead bullet retained by a stale spatial hash at '+hz+' FPS',()=>{
    const {triangle,st}=scenario([dead],[],1/hz);
    assert.equal(st.stats.nearFireHerds,0,
      'a removed projectile must not create new near-fire herding');
    assert.equal(triangle.vx,0,'stale projectile must not move a Triangle');
    assert.equal(st.stats.triangleEvasions,0);
  });
}
test('dead nearby projectile cannot mask a farther live projectile',()=>{
  const live={id:10,kind:'bullet',x:65,y:0,vx:500,vy:0,
    r:4,ttl:.4,dead:false};
  const {triangle,st}=scenario([dead,live],[live]);
  assert.equal(st.stats.nearFireHerds,1,'live nearby fire still herds');
  assert.ok(triangle.vx<0,'Triangle responds away from live shot on its right');
  assert.equal(st.stats.triangleEvasions,0,'departing shot does not force a dodge');
});
test('visible live fire still produces a normal near-fire response',()=>{
  const live={id:10,kind:'bullet',x:-35,y:0,vx:-500,vy:0,
    r:4,ttl:.5,dead:false};
  const {triangle,st}=scenario([live],[live]);
  assert.equal(st.stats.nearFireHerds,1);
  assert.ok(triangle.vx>0);
});
test('terrain-occluded fire does not herd a Triangle',()=>{
  const live={id:10,kind:'bullet',x:-35,y:0,vx:-500,vy:0,
    r:4,ttl:.5,dead:false};
  const {triangle,st}=scenario([live],[live],1/60,true);
  assert.equal(st.stats.nearFireHerds,0);
  assert.equal(triangle.vx,0);
});
test('production HTML loads the same Living Front instinct source',()=>{
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
