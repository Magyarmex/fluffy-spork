'use strict';
// Physical-threat parity witness: do not teach Battle Sense to ignore a round
// unless the shipping collision owner also makes that round harmless.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function coreBullets(){
 const marker='    updateBullets(dt) {',start=html.indexOf(marker);
 assert.ok(start>=0,'materialized core bullet updater missing');
 let end=start+marker.length,depth=1;
 while(depth&&end<html.length){
  if(html[end]==='{')depth++;
  else if(html[end]==='}')depth--;
  end++;
 }
 assert.equal(depth,0,'materialized bullet updater braces changed');
 return new Function('types_1','classes_1','M',
  'return function(dt){'+html.slice(start+marker.length,end-1)+'}')(
  {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
  {CLASSES:{guard:{size:15}}},2250);
}
function boot(){
 class Game{
  constructor(){
   this.time=1;this.bullets=[];this.tmp=[];this.__novaTerrain=[];
   this.tanks=[];this.shapes=[];this.drones=[];
   this.cam={shake:0,zoom:1};this.w=800;this.h=600;this.sfx={};
   this.player={id:999,x:1000,y:1000,alive:true};
   this.hash={query:(_x,_y,_r,out)=>{
    out.length=0;out.push(...this.tanks);
   }};
  }
 }
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
  'updateDrones','update','moveTank','addParticles','splashAt',
  'initBulletIntegrity','addRing','addFlash','addImpactDebris',
  'damageShape','damageDrone','weakenBullet','clusterBurst','updatePowerups'])
  Game.prototype[name]=function(){};
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 Game.prototype.resolveBulletCollisions=function(){};
 Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
 Game.prototype.damageTank=function(t,dmg){t.hp-=dmg;};
 Game.prototype.updateBullets=coreBullets();
 class Sfx{resume(){}}
 const modules={
  'game/engine':m=>{m.exports={Game};},
  'game/audio':m=>{m.exports={Sfx};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/render':m=>{m.exports={render(){}};}
 };
 const window={__novaModules:modules};
 const context={window,console:{info(){},warn(){},error(){}},
  Math,Map,Set,Date,WeakMap,performance:{now:()=>0}};
 for(const file of ['battlefield-v1.6.0.js','battle-sense-v1.8.1.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
   context,{filename:file});
 const module={exports:{}};
 modules['game/engine'](module,module.exports,spec=>spec==='./classes'
  ?{CLASSES:{guard:{size:15}},lineageForClass:()=>null}
  :{ARENA_HALF:2250});
 return {Game:module.exports.Game,helper:window.__NOVA_BATTLE_SENSE_TEST__};
}
const {Game,helper}=boot();
function witness(allied){
 const g=new Game();
 const shooter={kind:'tank',id:1,cls:'guard',teamId:7,x:0,y:0,
  hp:100,alive:true,ai:{}};
 const victim={kind:'tank',id:2,cls:'guard',teamId:allied?7:9,
  x:110,y:115,hp:100,maxHp:100,alive:true,ai:{}};
 g.tanks=[shooter,victim];
 g.areAllies=(a,b)=>a.teamId===b.teamId;
 g.hasLineOfSight=()=>true;
 g.bullets=[{kind:'bullet',id:3,ownerId:1,x:110,y:115,
  vx:0,vy:0,r:4,dmg:20,ttl:1,pen:0,hits:0,
  dead:false,shell:false,beam:false,splash:0}];
 const risk=helper.laneRisk(g,110,115,victim.id,victim);
 g.updateBullets(1/60);
 return {allied:g.areAllies(shooter,victim),risk,
  damage:100-victim.hp,remaining:g.bullets.length};
}
test('Battle Sense threat agrees with materialized Battlefield/core direct damage for allied and hostile ordinary rounds',()=>{
 const ally=witness(true),enemy=witness(false);
 assert.equal(ally.allied,true);
 assert.equal(enemy.allied,false);
 for(const arm of [ally,enemy]){
  assert.equal(arm.risk>0,arm.damage>0,
   'AI threat and physical damage must agree for the same ordinary round');
 }
 assert.ok(enemy.damage>0,'hostile control must reach a living tank');
 assert.equal(enemy.remaining,0,'hostile penetration-zero round is consumed');
});
