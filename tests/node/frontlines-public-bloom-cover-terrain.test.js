'use strict';
// Real Battlefield geometry + shipping Frontlines renderer: no false clear route.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(layout){
 const draws=[];
 class Game{
  constructor(){
   this.player={id:1,cls:'scout',x:1800,y:1800,r:14,vx:0,vy:0,hp:100,alive:true,spawnShieldT:0};
   this.tanks=[this.player];this.shapes=[];this.powerups=[];this.bullets=[];this.drones=[];
   this.time=100;this.w=320;this.h=568;this.cam={x:0,y:0,zoom:1};this.dpr=1;this.status='playing';
   this.ctx={save(){},restore(){},setTransform(){},beginPath(){},roundRect(){},rect(){},fill(){},stroke(){},setLineDash(){},fillText(t){draws.push(t);}};
   this.hash={query(_x,_y,_r,out){out.length=0;return out;}};
  }
 }
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire','initBulletIntegrity','resolveBulletCollisions','addParticles','splashAt','updateDrones','update','moveTank','updateBullets','damageTank'])
  Game.prototype[name]=function(){};
 Game.prototype.randSpawnPos=()=>({x:1800,y:1800});Game.prototype.getTank=()=>null;
 const mods={'game/engine':m=>{m.exports={Game}},'game/render':m=>{m.exports={render(){return 'base';}}},
  'game/audio':m=>{m.exports={Sfx:class{}}},'game/ai':m=>{m.exports={updateAI(){}}}};
 const math=Object.create(Math);math.random=()=>(layout+.01)/0x7fffffff;
 const sandbox={window:{__novaModules:mods},Math:math,Date:{now:()=>0},Map,Set,Number,Object,Array,JSON,
  console:{info(){},warn(){},error(){}},performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 const load=name=>vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),sandbox,{filename:name});
 load('battlefield-v1.6.0.js');
 const m={exports:{}};mods['game/engine'](m,m.exports,dep=>dep==='./classes'?{CLASSES:{scout:{size:14}}}:{ARENA_HALF:2250});
 // Preserve real terrain methods; suppress unrelated terrain VFX for a focused render probe.
 mods['game/render']=m=>{m.exports={render(){return 'base';}}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])load(name);
 const rm={exports:{}};mods['game/render'](rm,rm.exports,()=>({}));
 const g=new m.exports.Game();g.spawnPlayer();
 assert.equal(g.__novaBattlefield.name,['CROSSFIRE','SPLIT HORIZON','FOUR GATES'][layout]);
 return{g,render:()=>{draws.length=0;rm.exports.render(g,g.w,g.h);return draws.slice();}};
}
const blocked=[
 {sector:4,x:-975,y:-562.5,vx:-350,edge:-1125},
 {sector:5,x:150,y:-562.5,vx:-350,edge:0},
 {sector:5,x:150,y:-712.5,vx:-350,edge:0}
];
for(let layout=0;layout<3;layout++)test(['Crossfire','Split Horizon','Four Gates'][layout]+' real solid cover makes BLOOM cue truthful',()=>{
 const s=boot(layout),{g}=s,p=g.player,f=blocked[layout];
 Object.assign(p,{x:f.x,y:f.y,vx:f.vx,vy:0});g.cam.x=p.x;g.cam.y=p.y;
 g.__lfState={directorEnabled:true,signal:{type:'BLOOM',sector:f.sector,started:99,until:104},
  bloomMemory:{sector:f.sector,announcedAt:99,until:123}};
 assert.equal(g.isTerrainSafe(p.x,p.y,28),true);
 assert.equal(g.hasLineOfSight(p.x,p.y,f.edge,p.y,24),false,'actual solid terrain blocks direct entry');
 assert.deepEqual(s.render(),['BLOOM · COVER']);
 g.__lfState.signal=null;g.time=110;
 assert.deepEqual(s.render(),['BLOOM? · COVER'],'stale public BLOOM remains uncertain');
 // Destroying destructible cover can restore a clear approach; never retain a false obstruction.
 g.__novaTerrain.forEach(t=>{if(t.destructible){t.hp=0;t.solid=false;}});
 if(g.hasLineOfSight(p.x,p.y,f.edge,p.y,24))
  assert.deepEqual(s.render(),['BLOOM? 150 AWAY']);
});


test('Four Gates destructible cover breach restores the real public distance immediately',()=>{
 const s=boot(2),{g}=s,p=g.player;
 Object.assign(p,{x:-1387.5,y:350,vx:0,vy:-350});g.cam.x=p.x;g.cam.y=p.y;
 g.__lfState={directorEnabled:true,signal:{type:'BLOOM',sector:4,started:99,until:104},
  bloomMemory:{sector:4,announcedAt:99,until:123}};
 const hit=g.firstTerrainHit(p.x,p.y,p.x,0,24);
 assert.equal(hit&&hit.solid&&hit.solid.destructible,true,'the obstacle is breachable physical cover');
 assert.equal(g.hasLineOfSight(p.x,p.y,p.x,0,24),false);
 assert.deepEqual(s.render(),['BLOOM · COVER']);
 hit.solid.hp=0;hit.solid.solid=false;
 assert.equal(g.hasLineOfSight(p.x,p.y,p.x,0,24),true,'the same direct lane opens after physical destruction');
 assert.deepEqual(s.render(),['BLOOM 350 AWAY'],'a breached route must not retain a stale obstruction');
});
