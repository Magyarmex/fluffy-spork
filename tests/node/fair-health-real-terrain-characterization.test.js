// Research-only #1106: physical opaque wall + shipping Battlefield/Fair overlays.
// Characterization assertions document current defective target scoring, NOT policy.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const f of ['battlefield-v1.6.0.js','fair-engagement-v1.11.2.js'])
 assert.ok(html.includes('nova-updates/'+f),'must exercise shipping overlay');
const CLASSES={basic:{size:15}};
function boot(){
 class Game{
  constructor(){
   this.time=1;this.w=800;this.h=600;this.cam={zoom:1};this.zoom=1;
   this.tanks=[];this.shapes=[];this.drones=[];this.bullets=[];
   this.__novaTerrain=[{id:-1000,kind:'terrain',shape:'rect',x:70,y:0,w:25,h:240,
    type:'wall',destructible:false,hp:0,maxHp:0,solid:true}];
  }
  getTank(id){return this.tanks.find(t=>t.id===id)||null;}
 }
 for(const n of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
  'updateDrones','update','moveTank','addParticles','splashAt',
  'initBulletIntegrity','addRing','addFlash','addImpactDebris',
  'damageShape','damageDrone','weakenBullet','clusterBurst',
  'updatePowerups','randSpawnPos','nearestTank','updateBullets'])
  Game.prototype[n]=function(){};
 class Sfx{resume(){}}
 const modules={
  'game/engine':m=>{m.exports={Game};},
  'game/audio':m=>{m.exports={Sfx};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/render':m=>{m.exports={render(){}};}
 };
 const window={__novaModules:modules};
 const context={window,console:{info(){},warn(){},error(){}},
  Math,Number,Object,Array,Map,Set,Date,WeakMap,performance:{now:()=>0}};
 for(const f of ['battlefield-v1.6.0.js','fair-engagement-v1.11.2.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',f),'utf8'),
   context,{filename:f});
 const module={exports:{}};
 modules['game/engine'](module,module.exports,s=>s==='./classes'
  ?{CLASSES,lineageForClass:()=> 'gunner'}:{ARENA_HALF:2250});
 return {Game:module.exports.Game,F:window.__NOVA_FAIR_ENGAGEMENT_TEST__};
}
function tank(id,x,y,hp=100){return {id,x,y,hp,maxHp:100,alive:true,
 spawnShieldT:0,cls:'basic',tier:1,isPlayer:false,
 ai:{state:'hunt',targetId:-1}};}
const C={CLASSES,lineageForClass:()=> 'gunner'};
test('CHARACTERIZATION: a permanent opaque wall blocks fire sight but not hidden-HP scoring',()=>{
 const {Game,F}=boot(),g=new Game(),observer=tank(1,0,0),covered=tank(2,150,0);
 g.tanks=[observer,covered];
 assert.equal(F.inGameplayViewport(g,observer,covered),true);
 assert.equal(g.hasLineOfSight(observer.x,observer.y,covered.x,covered.y,4),false);
 const full=F.scoreTarget(g,C,observer,observer.ai,covered,g.time);
 covered.hp=20;
 const weak=F.scoreTarget(g,C,observer,observer.ai,covered,g.time);
 assert.ok(Math.abs((weak-full)-.384)<1e-8,
  'shipping scorer uses private covered HP; invert when fixing #1106');
});
test('CONTROL: open sight and opaque sight share contact legality but not health visibility',()=>{
 const {Game,F}=boot(),g=new Game(),observer=tank(1,0,0),
  covered=tank(2,150,0),clear=tank(3,-150,0);
 g.tanks=[observer,covered,clear];
 assert.equal(g.hasLineOfSight(0,0,covered.x,covered.y,4),false);
 assert.equal(g.hasLineOfSight(0,0,clear.x,clear.y,4),true);
 assert.equal(F.canPerceive(g,C,observer,covered),true);
 assert.equal(F.canPerceive(g,C,observer,clear),true);
});
