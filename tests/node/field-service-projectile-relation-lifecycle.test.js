'use strict';
/* Real Field Service module: posthumous projectile allegiance must survive
 * for a live shot, but not accumulate forever across tank respawns. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/drone-field-service-v1.10.3.js'),'utf8');
function boot(){
 function Game(){
  this.time=0;this.drones=[];this.tanks=[];this.bullets=[];
  this.tankById=new Map();
 }
 Game.prototype.getTank=function(id){return this.tankById.get(id)||null;};
 Game.prototype.updateDrones=function(){};
 Game.prototype.damageDrone=function(){};
 Game.prototype.redeploy=function(){this.bullets=[];};
 const modules={'game/engine':m=>{m.exports={Game};}};
 const window={__novaModules:modules,NOVATips:{registerMany(){}}};
 vm.runInNewContext(source,{window,console:{info(){},error(){}},
  Math,Number,Date,Map,Set,Object,Array},{filename:'drone-field-service-v1.10.3.js'});
 const m={exports:{}};modules['game/engine'](m,m.exports,()=>null);
 const g=new m.exports.Game(),owner={id:1,cls:'marksman',team:'blue',alive:true};
 g.tankById.set(1,owner);
 g.drones=[{id:7,ownerId:1,x:80,y:0,hp:50,maxHp:100,r:8,attackCd:0}];
 return{g,owner,api:window.__NOVA_FIELD_SERVICE_TEST__};
}
function witness(g,api,id,team='red'){
 const shooter={id,cls:'gunner',team,alive:true};
 g.tankById.set(id,shooter);
 g.bullets=[{ownerId:id,x:1000,y:0,vx:0,vy:0,ttl:1}];
 api.rememberDamagedOwnerProjectileRelations(g);
 g.tankById.delete(id);
}
test('long-run shooter churn retires expired allegiance instead of retaining every former tank',()=>{
 const {g,api,owner}=boot();
 for(let id=2;id<1002;id++){
  witness(g,api,id);
  g.time+=.1;
 }
 const m=g.__novaFieldServiceRelations;
 assert.ok(m instanceof Map);
 assert.ok(m.size<=256,'1,000 successive shooters must not produce 1,000 persistent relations');
 assert.equal(m.has('1|2'),false,'expired earliest shot has no reason to remain cached');
 assert.equal(api.rememberedProjectileHostile(g,owner,1001),true,
  'current posthumous shooter must remain hostile while its projectile survives');
});
test('posthumous allied and hostile shots retain exact relation through a pruning sweep',()=>{
 const {g,api,owner}=boot();
 witness(g,api,2,'red');
 const hostile=g.bullets[0];
 witness(g,api,3,'blue');
 const friendly=g.bullets[0];
 assert.equal(api.rememberedProjectileHostile(g,owner,2),true);
 assert.equal(api.rememberedProjectileHostile(g,owner,3),false);
 const m=g.__novaFieldServiceRelations;
 for(let id=1000;id<1400;id++)m.set('1|'+id,true);
 g.bullets=[hostile,friendly,{ownerId:1400,dead:true,shell:true}];
 g.time=10;
 api.rememberDamagedOwnerProjectileRelations(g);
 assert.equal(m.has('1|2'),true,'dead owner does not erase live hostile shot');
 assert.equal(m.has('1|3'),true,'dead owner does not erase live allied shot');
 assert.equal(api.rememberedProjectileHostile(g,owner,2),true);
 assert.equal(api.rememberedProjectileHostile(g,owner,3),false);
 assert.equal(m.has('1|1000'),false,'unrelated expired shooter is retired');
});
test('a shell pending removal is conservatively retained, then retired after array removal',()=>{
 const {g,api}=boot(),m=new Map();
 g.__novaFieldServiceRelations=m;
 for(let id=1000;id<1300;id++)m.set('1|'+id,true);
 g.bullets=[{ownerId:1200,dead:true,shell:true}];
 g.time=1;api.rememberDamagedOwnerProjectileRelations(g);
 assert.equal(m.has('1|1200'),true,'dead-flagged shell can still be in the fragmentation pipeline');
 g.bullets=[];g.time=6;
 /* This is a pressure-triggered sweep, not a per-frame map cleanup. */
 for(let id=2000;id<2300;id++)m.set('1|'+id,true);
 api.rememberDamagedOwnerProjectileRelations(g);
 assert.equal(m.has('1|1200'),false);
 assert.equal(m.size,0);
});
test('retired drone owners and redeploy clear old relations without poisoning a new life',()=>{
 const {g,api}=boot(),m=new Map();
 g.__novaFieldServiceRelations=m;
 for(let id=1000;id<1300;id++)m.set('1|'+id,true);
 g.bullets=[{ownerId:1200}];
 g.drones=[];g.time=1;
 api.rememberDamagedOwnerProjectileRelations(g);
 assert.equal(m.size,0,'no surviving repair-capable drone owner needs old shooter memory');
 g.__novaFieldServiceRelations.set('1|2',true);
 g.__novaFieldServicePruneAt=100;
 g.redeploy();
 assert.equal(m.size,0);
 assert.equal(g.__novaFieldServicePruneAt,0);
});
