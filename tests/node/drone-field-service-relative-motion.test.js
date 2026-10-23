'use strict';
// A drone's out-of-combat repair gate must predict bullet motion RELATIVE to
// the moving drone. Legacy non-Controller drones do not expose __novaVX.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/drone-field-service-v1.10.3.js'),'utf8');

function boot(){
  class Game {
    constructor(){this.time=0;this.drones=[];this.tanks=[];this.bullets=[];
      this.tankById=new Map();this.particles=0;}
    damageDrone(d,damage){d.hp=Math.max(0,d.hp-damage);}
    updateDrones(dt){for(const d of this.drones){
      d.x+=(d.moveVX||0)*dt;d.y+=(d.moveVY||0)*dt;
    }}
    hasLineOfSight(){return true;}
    addParticles(){this.particles++;}
  }
  const mods={'game/engine':m=>{m.exports.Game=Game;}};
  const win={__novaModules:mods,NOVATips:{registerMany(){}}};
  vm.runInNewContext(source,{window:win,console:{info(){},error(){}},Math,Number,Date,Map,Object,Array},
    {filename:'drone-field-service-v1.10.3.js'});
  const m={exports:{}};mods['game/engine'](m,m.exports,()=>({}));
  return{Game:m.exports.Game,hooks:win.__NOVA_FIELD_SERVICE_TEST__};
}
function scenario({bulletX=200,bulletY=0,bulletVX=200,bulletVY=0,moveVX=0,moveVY=0,dt=.05}={}){
  const {Game}=boot(),g=new Game();
  const owner={id:1,team:'blue',cls:'marksman',alive:true,x:0,y:0};
  const enemy={id:2,team:'red',cls:'marksman',alive:true,x:1000,y:0};
  const drone={id:7,kind:'drone',ownerId:1,x:80,y:0,hp:100,maxHp:100,r:8,
    attackCd:0,moveVX,moveVY}; // no __novaVX: core legacy movement
  g.tanks=[owner,enemy];g.tankById.set(1,owner);g.tankById.set(2,enemy);
  g.drones=[drone];g.damageDrone(drone,20);
  g.bullets=[{ownerId:2,x:bulletX,y:bulletY,vx:bulletVX,vy:bulletVY,r:3}];
  g.time=7;g.updateDrones(dt);
  return {g,drone};
}

test('drone moving faster than a departing hostile bullet cannot repair while overtaking it',()=>{
  const {drone}=scenario({bulletX:200,bulletVX:200,moveVX:600});
  assert.equal(drone.hp,80);
});
test('drone retreating faster than an approaching bullet can safely repair',()=>{
  const {drone}=scenario({bulletX:125,bulletVX:-200,moveVX:-400});
  assert.ok(drone.hp>80);
});
test('lateral movement into an otherwise safe bullet lane suppresses repair',()=>{
  const {drone}=scenario({bulletX:105,bulletY:120,bulletVX:0,bulletVY:-100,moveVY:300});
  assert.equal(drone.hp,80);
});
test('stationary drone still repairs beside a genuinely departing bullet',()=>{
  const {drone}=scenario({bulletX:200,bulletVX:200});
  assert.ok(drone.hp>80);
});
test('stationary drone still blocks repair for an approaching bullet',()=>{
  const {drone}=scenario({bulletX:125,bulletVX:-200});
  assert.equal(drone.hp,80);
});
test('relative-motion prediction preserves allegiance and solid-cover exclusions',()=>{
  const w=scenario({bulletX:200,bulletVX:200,moveVX:600});
  assert.equal(w.drone.hp,80);
  // Existing contract: friendly fire and physically blocked shots cannot
  // suppress repair even when relative motion predicts a geometric crossing.
  const a=boot(),g=new a.Game(),owner={id:1,team:'blue',cls:'marksman',alive:true,x:0,y:0},
    ally={id:2,team:'blue',alive:true,x:1000,y:0},
    d={id:7,kind:'drone',ownerId:1,x:80,y:0,hp:100,maxHp:100,r:8,attackCd:0,moveVX:600};
  g.tanks=[owner,ally];g.tankById=new Map([[1,owner],[2,ally]]);g.drones=[d];
  g.damageDrone(d,20);g.bullets=[{ownerId:2,x:200,y:0,vx:200,vy:0}];
  g.time=7;g.updateDrones(.05);assert.ok(d.hp>80,'friendly projectile must not suppress repair');
  g.hasLineOfSight=()=>false;ally.team='red';d.hp=80;d.__novaFieldService.nextProjectileAt=0;
  g.time=8;g.updateDrones(.05);assert.ok(d.hp>80,'terrain-blocked projectile must not suppress repair');
});

test('relative danger classification is stable from 30 through 240 FPS',()=>{
  for(const fps of [30,60,120,240]){
    const into=scenario({bulletX:200,bulletVX:200,moveVX:600,dt:1/fps});
    assert.equal(into.drone.hp,80,'overtaking at '+fps+' FPS');
    const away=scenario({bulletX:125,bulletVX:-200,moveVX:-400,dt:1/fps});
    assert.ok(away.drone.hp>80,'escaping at '+fps+' FPS');
  }
});
test('relative projectile geometry agrees with independent closest-approach calculations',()=>{
  const {hooks}=boot();
  let seed=20261023;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const owner={id:1,team:'blue',alive:true},enemy={id:2,team:'red',alive:true};
  const g={tanks:[owner,enemy],tankById:new Map([[1,owner],[2,enemy]]),
    hasLineOfSight(){return true;},bullets:[]};
  const d={id:7,ownerId:1,x:80,y:0,r:8,hp:80,maxHp:100,
    __novaFieldService:{motionVX:0,motionVY:0}};
  for(let i=0;i<6000;i++){
    const b={ownerId:2,x:80+(rnd()-.5)*500,y:(rnd()-.5)*500,
      vx:(rnd()-.5)*1800,vy:(rnd()-.5)*1800,r:1+rnd()*7};
    d.__novaFieldService.motionVX=(rnd()-.5)*1000;
    d.__novaFieldService.motionVY=(rnd()-.5)*1000;
    g.bullets=[b];
    const dx=b.x-d.x,dy=b.y-d.y,
      vx=b.vx-d.__novaFieldService.motionVX,vy=b.vy-d.__novaFieldService.motionVY,
      speed2=vx*vx+vy*vy,dot=dx*vx+dy*vy,
      clearance=34,overlap=8+b.r+1,dist2=dx*dx+dy*dy;
    let expected=false;
    if(dist2<=(dot<0||speed2<1?clearance*clearance:overlap*overlap))expected=true;
    else if(speed2>=1){
      const t=-dot/speed2;
      if(t>0){const tt=Math.min(t,.38);
        expected=(dx+vx*tt)**2+(dy+vy*tt)**2<=clearance*clearance;}
    }
    assert.equal(hooks.projectileThreat(g,d,owner),expected,'trajectory '+i);
  }
});
