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
      if(Number.isFinite(d.teleportX))d.x=d.teleportX;
      else d.x+=(d.moveVX||0)*dt;
      d.y+=(d.moveVY||0)*dt;
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
function scenario({bulletX=200,bulletY=0,bulletVX=200,bulletVY=0,moveVX=0,moveVY=0,dt=.05,ttl,shell=false,teleportX,novaVX}={}){
  const {Game}=boot(),g=new Game();
  const owner={id:1,team:'blue',cls:'marksman',alive:true,x:0,y:0};
  const enemy={id:2,team:'red',cls:'marksman',alive:true,x:1000,y:0};
  const drone={id:7,kind:'drone',ownerId:1,x:80,y:0,hp:100,maxHp:100,r:8,
    attackCd:0,moveVX,moveVY,teleportX,__novaVX:novaVX}; // no __novaVX: core legacy movement
  g.tanks=[owner,enemy];g.tankById.set(1,owner);g.tankById.set(2,enemy);
  g.drones=[drone];g.damageDrone(drone,20);
  g.bullets=[{ownerId:2,x:bulletX,y:bulletY,vx:bulletVX,vy:bulletVY,r:3,ttl,shell}];
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

test('a projectile expiring before reaching a stationary drone cannot delay repair',()=>{
  const safe=scenario({bulletX:125,bulletVX:-200,ttl:.04});
  assert.ok(safe.drone.hp>80,'shot expires before its predicted approach');
  const threat=scenario({bulletX:125,bulletVX:-200,ttl:.30});
  assert.equal(threat.drone.hp,80,'shot lives long enough to approach');
});
test('remaining lifetime also bounds relative motion when a drone overtakes a shot',()=>{
  const safe=scenario({bulletX:200,bulletVX:200,moveVX:600,ttl:.04});
  assert.ok(safe.drone.hp>80,'short-lived shot cannot intercept moving drone');
  const threat=scenario({bulletX:200,bulletVX:200,moveVX:600,ttl:.30});
  assert.equal(threat.drone.hp,80,'long-lived shot still threatens overtaking drone');
});
test('an already expired projectile is not treated as active incoming fire',()=>{
  for(const ttl of [0,-.001]){
    const {drone}=scenario({bulletX:85,bulletVX:-200,ttl});
    assert.ok(drone.hp>80,'expired shot should not block repair: '+ttl);
  }
});
test('a short-lived projectile that is already within danger clearance still blocks repair',()=>{
  const {drone}=scenario({bulletX:100,bulletVX:-200,ttl:.005});
  assert.equal(drone.hp,80,'a nearby live shot is still a threat');
});
test('remaining-lifetime repair decision remains stable from 30 to 240 Hz',()=>{
  for(const fps of [30,60,120,240]){
    const safe=scenario({bulletX:125,bulletVX:-200,ttl:.04,dt:1/fps});
    const threat=scenario({bulletX:125,bulletVX:-200,ttl:.30,dt:1/fps});
    assert.ok(safe.drone.hp>80,'expired-before-contact at '+fps+' Hz');
    assert.equal(threat.drone.hp,80,'live intercept at '+fps+' Hz');
  }
});
test('5000 seeded lifetime-limited trajectories agree with independent relative-motion geometry',()=>{
  const {hooks}=boot();
  let seed=3071023;
  const rnd=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const owner={id:1,team:'blue',alive:true},enemy={id:2,team:'red',alive:true};
  const g={tanks:[owner,enemy],tankById:new Map([[1,owner],[2,enemy]]),
    hasLineOfSight(){return true;},bullets:[]};
  const d={id:7,ownerId:1,x:80,y:0,r:8,hp:80,maxHp:100,
    __novaFieldService:{motionVX:0,motionVY:0}};
  for(let i=0;i<5000;i++){
    const ttl=(rnd()-.10)*.65;
    const b={ownerId:2,x:80+(rnd()-.5)*500,y:(rnd()-.5)*500,
      vx:(rnd()-.5)*1800,vy:(rnd()-.5)*1800,r:1+rnd()*7,ttl};
    d.__novaFieldService.motionVX=(rnd()-.5)*1000;
    d.__novaFieldService.motionVY=(rnd()-.5)*1000;
    g.bullets=[b];
    const dx=b.x-d.x,dy=b.y-d.y,
      vx=b.vx-d.__novaFieldService.motionVX,vy=b.vy-d.__novaFieldService.motionVY,
      speed2=vx*vx+vy*vy,dot=dx*vx+dy*vy,
      clearance=34,overlap=8+b.r+1,dist2=dx*dx+dy*dy;
    let expected=false;
    if(ttl>0){
      if(dist2<=(dot<0||speed2<1?clearance*clearance:overlap*overlap))expected=true;
      else if(speed2>=1&&-dot/speed2>0){
        const t=Math.min(-dot/speed2,.38,ttl);
        expected=(dx+vx*t)**2+(dy+vy*t)**2<=clearance*clearance;
      }
    }
    assert.equal(hooks.projectileThreat(g,d,owner),expected,'trajectory '+i);
  }
});

test('expiring cluster shells still block repair because their burst spawns live shrapnel',()=>{
  for(const ttl of [.04,0,-.001]){
    const {drone}=scenario({bulletX:125,bulletVX:-200,ttl,shell:true});
    assert.equal(drone.hp,80,'expiry-triggered cluster shell remains hazardous: '+ttl);
  }
});
test('ordinary short-lived shots remain safely excluded next to hazardous shells',()=>{
  const safe=scenario({bulletX:125,bulletVX:-200,ttl:.04,shell:false});
  const shell=scenario({bulletX:125,bulletVX:-200,ttl:.04,shell:true});
  assert.ok(safe.drone.hp>80);
  assert.equal(shell.drone.hp,80);
});

// RED first: a discontinuous relocation is not a 3,000u/s sustained drone velocity.
// The projectile's future approach must be tested from the actual new position.
for(const fps of [30,60,120,240]){
  test('discontinuous drone relocation cannot disguise approaching hostile fire at '+fps+'Hz',()=>{
    const {drone}=scenario({teleportX:-70,bulletX:-30,bulletVX:-200,dt:1/fps});
    assert.equal(drone.hp,80,'projectile is approaching the relocated drone within the danger horizon');
  });
  test('discontinuous relocation does not suppress repair for a departing projectile at '+fps+'Hz',()=>{
    const {drone}=scenario({teleportX:-70,bulletX:-30,bulletVX:200,dt:1/fps});
    assert.ok(drone.hp>80,'departure is safe from the new position');
  });
}

// A discontinuity does not invalidate a separately reported bounded velocity.
// Test both stationary and explicitly reported motion instead of blindly
// trusting the relocation delta or silently ignoring the motion signal.
for(const fps of [30,60,120,240]){
  test('relocated drone cannot heal while declared motion catches departing fire at '+fps+'Hz',()=>{
    const {drone}=scenario({teleportX:-70,novaVX:600,bulletX:-30,bulletVX:200,dt:1/fps});
    assert.equal(drone.hp,80,'declared chase velocity predicts an intercept');
  });
  test('relocated drone still repairs when both stationary and declared retreat are safe at '+fps+'Hz',()=>{
    const {drone}=scenario({teleportX:-70,novaVX:-600,bulletX:-30,bulletVX:200,dt:1/fps});
    assert.ok(drone.hp>80,'neither conservative motion hypothesis intersects');
  });
}

// A teleport also invalidates cached danger scans from the previous location.
test('discontinuous relocation immediately refreshes previously safe projectile cache',()=>{
  const {Game}=boot(),g=new Game();
  const owner={id:1,team:'blue',cls:'marksman',alive:true,x:0,y:0};
  const enemy={id:2,team:'red',cls:'marksman',alive:true,x:1000,y:0};
  const d={id:7,kind:'drone',ownerId:1,x:80,y:0,hp:100,maxHp:100,r:8,attackCd:0};
  g.tanks=[owner,enemy];g.tankById=new Map([[1,owner],[2,enemy]]);g.drones=[d];
  g.damageDrone(d,20);g.time=7;g.updateDrones(.05);
  const healed=d.hp;assert.ok(healed>80);
  assert.ok(d.__novaFieldService.nextProjectileAt>7.02);
  d.teleportX=-70;g.bullets=[{ownerId:2,x:-30,y:0,vx:-200,vy:0,r:3}];
  g.time=7.02;g.updateDrones(1/60);
  assert.equal(d.hp,healed,'new position must be rescanned before another repair tick');
});

test('discontinuous relocation immediately refreshes previously safe hostile-unit cache',()=>{
  const {Game}=boot(),g=new Game();
  const owner={id:1,team:'blue',cls:'marksman',alive:true,x:0,y:0};
  const enemy={id:2,team:'red',cls:'marksman',alive:true,x:-60,y:0};
  const d={id:7,kind:'drone',ownerId:1,x:500,y:0,hp:100,maxHp:100,r:8,attackCd:0};
  g.tanks=[owner,enemy];g.tankById=new Map([[1,owner],[2,enemy]]);g.drones=[d];
  g.damageDrone(d,20);g.time=7;g.updateDrones(.05);
  const healed=d.hp;assert.ok(healed>80);
  assert.ok(d.__novaFieldService.nextThreatAt>7.02);
  d.teleportX=-70;g.time=7.02;g.updateDrones(1/60);
  assert.equal(d.hp,healed,'nearby hostile at new location must interrupt repair');
});

test('materialized playable runtime wires Field Service before Live Vector postprocessing',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
  const battlefield=html.indexOf('nova-updates/battlefield-v1.6.0.js');
  const terrain=html.indexOf('nova-updates/terrain-intelligence-v1.10.2.js');
  const field=html.indexOf('nova-updates/drone-field-service-v1.10.3.js');
  const live=html.indexOf('nova-updates/second-body-live-vector-v1.10.7.js');
  assert.ok(battlefield>=0&&terrain>battlefield&&field>terrain&&live>field,
    'the tested Field Service wrapper must execute in the actual shipping chain');
});
