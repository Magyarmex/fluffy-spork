'use strict';
// Triangle perception must preserve dodge and disturbance behavior while
// avoiding expensive terrain rays for irrelevant nearby projectiles.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const window={__novaModules:{}};
const context={window,Math,Map,Set,Number,Object,Array,Date,JSON,
  performance:{now:()=>0},console:{info(){},error(){},warn(){}}};
for(const file of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js']){
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),context,{filename:file});
}
const LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
function world(bullets,{dt=1/60,visible=()=>true,ready=true}={}){
  const s={id:3,kind:'shape',type:'triangle',x:0,y:0,r:16,hp:30,vx:0,vy:0};
  if(!ready)s.__lfEvadeReady=20;
  let rays=0;
  const g={time:10,shapes:[s],bullets:bullets.map(b=>({...b})),tanks:[],
    hasLineOfSight:(ax,ay,bx,by)=>{rays++;return visible(bx,by);}};
  const defs={triangle:{speed:90}};
  const st=LF.ensure(g,defs);
  LF.behaviorTick(g,st,defs,dt);
  return{s,st,rays};
}
function shot(id,x,y,vx=0,vy=0,ttl=.4){
  return{id,kind:'bullet',x,y,vx,vy,ttl,r:4,dead:false};
}
test('production materializer loads the optimized canonical Living Front source',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
});
test('far lateral fire cannot trigger needless terrain visibility checks',()=>{
  const shots=Array.from({length:30},(_,i)=>shot(i+5,160,70+i*.2,0,500));
  const w=world(shots);
  assert.equal(w.rays,0,'non-threatening distant shots cannot affect dodge or herding');
  assert.equal(w.st.stats.triangleEvasions,0);
  assert.equal(w.st.stats.nearFireHerds,0);
});
test('nearest visible fire still disturbs a triangle',()=>{
  const w=world([shot(8,35,0),shot(9,110,0)]);
  assert.equal(w.rays,1,'farther non-threatening shot needs no second terrain ray');
  assert.equal(w.st.stats.nearFireHerds,1);
  assert.ok(w.s.vx<0,'triangle moves away from nearby fire');
});
test('occluded close fire cannot mask a farther visible projectile',()=>{
  const w=world([shot(8,30,0),shot(9,70,20)],{
    visible:(x,y)=>x>50
  });
  assert.equal(w.st.stats.nearFireHerds,1);
  assert.ok(w.rays>=2);
});
test('legitimate incoming shot still produces a committed dodge',()=>{
  const w=world([shot(9,-100,0,500,0,.3)]);
  assert.equal(w.st.stats.triangleEvasions,1);
  assert.ok(w.s.__lfEvadeUntil>10);
  assert.equal(w.rays,1);
});
test('terrain-blocked incoming shot cannot trigger a dodge',()=>{
  const w=world([shot(9,-100,0,500,0,.3)],{visible:()=>false});
  assert.equal(w.st.stats.triangleEvasions,0);
  assert.equal(w.rays,1);
});
test('expiry, ready-state and 30–240Hz decisions remain unchanged',()=>{
  for(const hz of [30,60,120,240]){
    assert.equal(world([shot(9,-100,0,500,0,.02)],{dt:1/hz}).st.stats.triangleEvasions,0);
    assert.equal(world([shot(9,-100,0,500,0,.3)],{dt:1/hz}).st.stats.triangleEvasions,1);
    assert.equal(world([shot(9,-100,0,500,0,.3)],{dt:1/hz,ready:false}).st.stats.triangleEvasions,0);
  }
});
test('seeded oracle preserves closest visible fire and strongest credible dodge',()=>{
  let seed=0x5eeda11;
  function rand(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;}
  let rays=0,naiveRays=0,evadeWorlds=0;
  for(let k=0;k<3000;k++){
    const bullets=Array.from({length:Math.floor(rand()*75)},(_,i)=>shot(
      i+5,(rand()-.5)*430,(rand()-.5)*430,(rand()-.5)*1400,(rand()-.5)*1400,rand()*.5));
    const visible=(x,y)=>Math.floor(Math.abs(x)*.117+Math.abs(y)*.113)%7!==0;
    const ready=k%5!==0,dt=[1/30,1/60,1/120,1/240][k%4];
    const result=world(bullets,{dt,visible,ready});
    const s={id:3,x:0,y:0,r:16};
    let best=null,bt=0,near=null,nearD=135*135;
    for(const b of bullets){
      if(b.x*b.x+b.y*b.y>210*210||!visible(b.x,b.y))continue;
      const dd=b.x*b.x+b.y*b.y;
      if(dd<nearD){nearD=dd;near=b;}
      const q=ready?LF.bulletThreat(s,b,.34,20):0;
      if(q>bt){bt=q;best=b;}
    }
    const dodge=!!(best&&bt>.13);
    const disturbance=!dodge&&!!near&&Math.min(.42,Math.max(0,(135-Math.sqrt(nearD))/135))>.04;
    assert.equal(result.st.stats.triangleEvasions,dodge?1:0,'dodge mismatch in world '+k);
    assert.equal(result.st.stats.nearFireHerds,disturbance?1:0,'disturbance mismatch in world '+k);
    if(dodge){
      evadeWorlds++;
      const m=Math.hypot(best.vx,best.vy)||1,side=((3^best.id)&1)?1:-1;
      assert.ok(Math.abs(result.s.__lfEvadeDirX-(-best.vy/m*side))<1e-10);
      assert.ok(Math.abs(result.s.__lfEvadeDirY-(best.vx/m*side))<1e-10);
    }
    rays+=result.rays;
    naiveRays+=bullets.filter(b=>b.x*b.x+b.y*b.y<=210*210).length;
  }
  assert.ok(evadeWorlds>200,'exercise real dodge choices, not only idle cases');
  assert.ok(rays<naiveRays*.45,'terrain rays should focus on relevant threats');
});
