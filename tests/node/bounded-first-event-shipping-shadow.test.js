'use strict';
// Research: compare read-only first-event prediction with materialized core and
// Battlefield composition. No damage is injected by the comparator.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {earliestOrdinaryEvent}=require('../research/bounded-first-event-witness.cjs');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function coreMethod(){
 const marker='    updateBullets(dt) {',at=html.indexOf(marker);
 assert.ok(at>=0);let pos=at+marker.length,depth=1;
 while(depth&&pos<html.length){if(html[pos]==='{')depth++;else if(html[pos]==='}')depth--;pos++;}
 assert.equal(depth,0);
 return new Function('types_1','classes_1','M',
  'return function(dt){'+html.slice(at+marker.length,pos-1)+'}')(
  {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
  {CLASSES:{scout:{size:15}}},2250);
}
function boot(){
 class Game{constructor(){this.bullets=[];this.time=1;this.__novaTerrain=[];
  this.hash={query(_x,_y,_r,out){out.length=0;}};this.tmp=[];this.tanks=[];
  this.drones=[];this.shapes=[];this.cam={shake:0};this.tankById=new Map();}}
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire','updateDrones',
  'update','moveTank','damageTank','damageDrone','damageShape','setClass',
  'addParticles','addRing','addImpactDebris','splashAt','initBulletIntegrity',
  'useAbility','addFlash'])Game.prototype[name]=function(){};
 Game.prototype.resolveBulletCollisions=function(){};
 Game.prototype.getTank=function(id){return this.tankById.get(id)||null;};
 Game.prototype.updateBullets=coreMethod();
 Game.prototype.weakenBullet=function(b,d){b.hp-=d;if(b.hp<=0)b.dead=true;};
 Game.prototype.clusterBurst=function(){};
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 class Sfx{resume(){}}
 const modules={'game/engine':m=>{m.exports={Game};},'game/audio':m=>{m.exports={Sfx};},
  'game/render':m=>{m.exports={render(){}};},'game/ai':m=>{m.exports={updateAI(){}};}};
 const context={window:{__novaModules:modules},console:{info(){},warn(){},error(){}},
  Math,Map,Set,Date,Number,Object,performance:{now:()=>0},document:{},navigator:{}};
 for(const file of ['sniper-v1.2.0.js','polish-v1.3.1.js','battlefield-v1.6.0.js',
  'apex-disciplines-v1.7.1.js','performance-v1.7.5.js','performance-v1.7.8.js',
  'precision-contact-v1.8.3.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),context,{filename:file});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,spec=>spec.includes('classes')
  ?{CLASSES:{scout:{size:15}},lineageForClass:()=>null}:{ARENA_HALF:2250});
 return new m.exports.Game();
}
function shot(){return {id:101,kind:'bullet',ownerId:1,x:0,y:0,vx:6000,vy:0,
 r:3,radiusCertified:true,frameStartEpoch:1,dmg:20,pen:0,ttl:.005,hits:0,dead:false,shell:false,beam:false};}
for(const fps of [30,60,120,240])test('shipping contact agrees with read-only witness at '+fps+'Hz',()=>{
 const g=boot(),target={id:2,kind:'tank',cls:'scout',x:40,y:0,hp:100,alive:true};
 g.tanks=[target];g.hash.query=(_x,_y,_r,out)=>{out.length=0;out.push(target);};
 const callbacks=[];g.damageTank=(t,d)=>{callbacks.push({id:t.id,damage:d});t.hp-=d;};
 const b=shot(),world={complete:true,epoch:1,bounds:{minX:-2230,maxX:2230,minY:-2230,maxY:2230},
 bodies:[{id:2,x:40,y:0,r:18,collisionEligible:true,radiusCertified:true,certifiedStationary:true,epoch:1}],walls:[],projectiles:[]};
 const event=earliestOrdinaryEvent(b,1/fps,world);
 assert.equal(event.kind,'body');assert.ok(event.time<b.ttl);
 g.bullets=[b];g.updateBullets(1/fps);
 assert.equal(target.hp,80,'shipping engine must register physical first contact');
 assert.deepEqual(callbacks,[{id:2,damage:20}], 'exactly one canonical damage callback');
});

for(const fps of [30,60,120,240])test('shipping TTL expiry agrees with no premature body damage at '+fps+'Hz',()=>{
 const g=boot(),target={id:2,kind:'tank',cls:'scout',x:100,y:0,hp:100,alive:true};
 g.tanks=[target];g.hash.query=(_x,_y,_r,out)=>{out.length=0;out.push(target);};
 g.damageTank=(t,d)=>{t.hp-=d;};
 const b=shot(),world={complete:true,epoch:1,bounds:{minX:-2230,maxX:2230,minY:-2230,maxY:2230},
  bodies:[{id:2,x:100,y:0,r:18,collisionEligible:true,radiusCertified:true,certifiedStationary:true,epoch:1}],walls:[],projectiles:[]};
 const event=earliestOrdinaryEvent(b,1/fps,world);
 assert.equal(event.kind,1/fps>=b.ttl?'expiry':'none',
  'at 240Hz the projectile remains live past this frame, without a body event');
 g.bullets=[b];g.updateBullets(1/fps);
 assert.equal(target.hp,100,'a target beyond the frame/TTL corridor must not receive phantom damage');
 assert.deepEqual(callbacks,[], 'no damage callback may fire beyond the physical corridor');
});
