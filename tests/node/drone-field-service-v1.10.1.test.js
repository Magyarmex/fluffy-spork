const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/drone-field-service-v1.10.1.js'),'utf8');

function boot(){
  function Game(){this.time=0;this.drones=[];this.tanks=[];this.tankById=new Map();this.rings=0;this.particles=0;this.waypointCalls=0;}
  Game.prototype.getTank=function(id){return this.tankById.get(id)||null;};
  Game.prototype.damageDrone=function(d,dmg){d.hp=Math.max(0,d.hp-dmg);};
  Game.prototype.updateDrones=function(){};
  Game.prototype.hasLineOfSight=function(){return true;};
  Game.prototype.addRing=function(){this.rings++;};
  Game.prototype.addParticles=function(){this.particles++;};
  Game.prototype.novaBattlefieldWaypoint=function(){this.waypointCalls++;return{x:0,y:120};};
  const mods={'game/engine':m=>m.exports={Game}};
  const tips=[];
  const context={window:{__novaModules:mods,NOVATips:{registerMany(v){tips.push(...v);}}},console:{info(){},error(){}},Math,Number,Date,Map,Object,Array};
  vm.runInNewContext(source,context,{filename:'drone-field-service-v1.10.1.js'});
  const m={exports:{}};mods['game/engine'](m,m.exports,()=>null);
  return{Game:m.exports.Game,window:context.window,tips};
}
function tank(id,cls='marksman'){return{id,cls,x:0,y:0,hp:100,maxHp:100,alive:true};}
function drone(ownerId,extra={}){return Object.assign({id:7,kind:'drone',ownerId,x:80,y:0,hp:100,r:8,speed:180,attackCd:0},extra);}
function setup(cls='marksman'){
  const B=boot(),g=new B.Game(),owner=tank(1,cls),d=drone(owner.id);g.tanks=[owner];g.tankById.set(owner.id,owner);g.drones=[d];return{...B,g,owner,d};
}

test('publishes bounded Field Service contract and mechanic-aware tips',()=>{
  const {window,tips}=boot();
  assert.equal(window.__NOVA_FIELD_SERVICE__.version,'1.10.1');
  assert.equal(window.__NOVA_FIELD_SERVICE__.controllerUsesCommandWeave,true);
  assert.equal(window.__NOVA_FIELD_SERVICE__.repairRate,.045);
  assert.equal(tips.length,2);
  assert.match(tips[0].text,/Fresh damage|repair window/);
});

test('ordinary drone repairs only after the real out-of-combat delay',()=>{
  const {g,d}=setup();
  g.damageDrone(d,20);assert.equal(d.hp,80);
  g.time=4.4;g.updateDrones(.1);assert.equal(d.hp,80);
  g.time=4.7;g.updateDrones(.2);assert.ok(d.hp>80&&d.hp<82,'repair should be slow and bounded');
  assert.ok(g.particles>0);assert.ok(g.rings>0);
});

test('visible nearby hostile keeps a damaged drone in combat',()=>{
  const {g,d}=setup();const enemy=tank(2,'gunner');enemy.x=180;g.tanks.push(enemy);g.tankById.set(2,enemy);
  g.damageDrone(d,30);g.time=7;g.updateDrones(.5);assert.equal(d.hp,70);
});

test('committed attack phases never repair or accept recovery steering',()=>{
  const {g,d}=setup();d.__novaPhase='dash';d.__novaCommitted=true;d.targetRef={kind:'tank',alive:true,x:500,y:0};
  g.damageDrone(d,25);g.time=10;for(let i=0;i<15;i++)g.updateDrones(.1);
  assert.equal(d.hp,75);assert.equal(d.x,80);assert.equal(d.y,0);assert.equal(g.waypointCalls,0);
});

test('Controller drones are excluded from generic repair so Command Weave stays authoritative and faster',()=>{
  const {g,d}=setup('carrier');g.damageDrone(d,20);g.time=10;g.updateDrones(1);
  assert.equal(d.hp,80);
});

test('stalled ordinary drone asks the existing Battlefield waypoint helper after hysteresis',()=>{
  const {g,d}=setup();d.targetRef={kind:'shape',hp:100,x:500,y:0};
  for(let i=0;i<8;i++){g.time+=.1;g.updateDrones(.1);}assert.equal(g.waypointCalls,0);
  for(let i=0;i<4;i++){g.time+=.1;g.updateDrones(.1);}
  assert.ok(g.waypointCalls>0);assert.ok(d.y>0,'recovery should move toward the safe local waypoint');
});

test('source keeps healthy repair checks cheap and does not invent a second pathfinder',()=>{
  assert.match(source,/if\(max<=0\|\|d\.hp>=max-\.01\)return false/);
  assert.match(source,/novaBattlefieldWaypoint/);
  assert.match(source,/WAYPOINT_HOLD=\.58/);
  assert.doesNotMatch(source,/A\*|AStar|Dijkstra|navmesh/i);
});
