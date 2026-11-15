'use strict';
// Research-only falsifier: public pickup coordinates do not make unseen bullets public.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function scene(){
  function Game(){}
  Game.prototype.tryFire=function(){};
  Game.prototype.moveTank=function(){};
  Game.prototype.updatePowerups=function(){};
  const classes={CLASSES:{guard:{size:15}},lineageForClass:()=> 'guardian'};
  const modules={
    'game/engine':m=>{m.exports={Game};},
    'game/ai':m=>{m.exports={updateAI(){}};}
  };
  const window={__novaModules:modules};
  const context={window,Math,Number,Object,Array,Map,console:{info(){},error(){}}};
  for(const name of ['battle-sense-v1.8.1.js','fair-engagement-v1.11.2.js'])
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates',name),'utf8'),context,{filename:name});
  const tank={id:7,cls:'guard',x:0,y:0,hp:20,maxHp:100,alive:true,ai:{}};
  const g={w:320,h:480,cam:{zoom:1},tanks:[tank],bullets:[],powerups:[
    {id:'near',type:'heal',x:600,y:0},
    {id:'far',type:'heal',x:620,y:0}
  ],hasLineOfSight:()=>true};
  return {g,tank,classes,window};
}
test('research: unseen distant projectile currently changes AI public-pickup selection',()=>{
  const {g,tank,classes,window}=scene();
  const fair=window.__NOVA_FAIR_ENGAGEMENT__;
  const choose=window.__NOVA_BATTLE_SENSE_TEST__.chooseResource;
  const near=g.powerups[0],far=g.powerups[1];
  assert.equal(fair.inGameplayViewport(g,tank,near),false);
  assert.equal(fair.inGameplayViewport(g,tank,far),false);
  assert.equal(choose(g,tank,classes),near,'without projectile the closer heal wins');
  const bullet={id:91,ownerId:999,x:600,y:0,vx:0,vy:0,ttl:1};
  assert.equal(fair.inGameplayViewport(g,tank,bullet),false);
  g.bullets=[bullet];
  assert.equal(choose(g,tank,classes),far,
    'current Battle Sense observes an offscreen projectile near the closer pickup');
});
