'use strict';
// The canonical Game.redeploy resets bullets, tanks and time on the same Game
// instance. Posthumous projectile allegiance memory must survive within a
// life, but cannot accumulate or leak into a new life after bullets are gone.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/drone-field-service-v1.10.3.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
function boot(){
  class Game{
    constructor(){this.time=0;this.bullets=[];this.tanks=[];this.drones=[];this.tankById=new Map();}
    updateDrones(){} damageDrone(){}
    redeploy(){this.bullets=[];this.tanks=[];this.tankById.clear();this.time=0;this.redeploys=(this.redeploys||0)+1;}
  }
  const modules={'game/engine':m=>{m.exports.Game=Game;}};
  const window={__novaModules:modules,NOVATips:{registerMany(){}}};
  vm.runInNewContext(source,{window,console:{info(){},error(){}},Math,Number,Map,Set,Date,Object,Array});
  const m={exports:{}};modules['game/engine'](m,m.exports,()=>({}));
  return {Game:m.exports.Game,api:window.__NOVA_FIELD_SERVICE_TEST__};
}
function record(g,api,ownerId,shooterId,hostile=true){
  const owner={id:ownerId,cls:'marksman',team:'blue',alive:true};
  const shooter={id:shooterId,cls:'gunner',team:hostile?'red':'blue',alive:true};
  g.tankById.set(ownerId,owner);g.tankById.set(shooterId,shooter);
  g.bullets.push({ownerId:shooterId,x:10,y:0,vx:50,vy:0,ttl:1});
  api.rememberOwnerProjectileRelations(g,owner);
  return owner;
}
test('canonical redeploy discards the old match projectiles and tank registry',()=>{
  const start=html.indexOf('    redeploy() {');
  assert.ok(start>=0,'materialized Game.redeploy must be present');
  const body=html.slice(start,start+900);
  assert.match(body,/this\.bullets = \[\]/);
  assert.match(body,/this\.tankById\.clear\(\)/);
  assert.match(body,/this\.time = 0/);
});
test('posthumous hostile projectile memory survives during a life but resets on redeploy',()=>{
  const {Game,api}=boot(),g=new Game();
  const owner=record(g,api,1,2,true);
  assert.equal(api.rememberedProjectileHostile(g,owner,2),true);
  g.tankById.delete(2); // shooter died, projectile still exists
  assert.equal(api.rememberedProjectileHostile(g,owner,2),true);
  assert.equal(g.__novaFieldServiceRelations.size,1);
  g.redeploy();
  assert.equal(g.redeploys,1);
  assert.equal(g.bullets.length,0);
  assert.equal(g.__novaFieldServiceRelations.size,0);
  assert.equal(api.rememberedProjectileHostile(g,owner,2),false);
});
test('repeated redeploys cannot retain relations from prior lives',()=>{
  const {Game,api}=boot(),g=new Game();
  for(let life=0;life<120;life++){
    const owner=record(g,api,life*2+1,life*2+2);
    assert.equal(api.rememberedProjectileHostile(g,owner,life*2+2),true);
    g.redeploy();
    assert.equal(g.__novaFieldServiceRelations.size,0,'leak after life '+life);
  }
});
test('new-life relationships can be learned after reset without stale hostility',()=>{
  const {Game,api}=boot(),g=new Game();
  const old=record(g,api,1,2,true);
  assert.equal(api.rememberedProjectileHostile(g,old,2),true);
  g.redeploy();
  const fresh=record(g,api,1,2,false);
  assert.equal(api.rememberedProjectileHostile(g,fresh,2),false);
});
