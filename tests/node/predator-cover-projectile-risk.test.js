const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadPredator(){
  const CLASSES={twin:{id:'twin',size:14,ability:null,bullet:{speed:470}}};
  const modules={
    'game/classes':function(module){module.exports={CLASSES,lineageForClass:()=> 'gunner'};},
    'game/engine':function(module){module.exports={Game:function(){}};},
    'game/ai':function(module){module.exports={updateAI(){}};},
  };
  const context={window:{__novaModules:modules},console,Math,performance:{now:()=>0}};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/predator-doctrine-v1.8.0.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'predator-doctrine-v1.8.0.js'});
  return {helper:context.window.__NOVA_PREDATOR_TEST__,CLASSES};
}

function game(blocked){
  return {
    bullets:[{ownerId:9,x:160,y:5,vx:-500,vy:0,dead:false}],
    hasLineOfSight(){return !blocked;},
  };
}

const tank={id:1,cls:'twin',x:0,y:0,hp:100,maxHp:100,alive:true};

test('Predator projectile risk ignores an otherwise-dangerous shot blocked by solid cover',()=>{
  const {helper,CLASSES}=loadPredator();
  const exposed=helper.threatVector(game(false),CLASSES,tank,{});
  const covered=helper.threatVector(game(true),CLASSES,tank,{});
  assert.ok(exposed.risk>.1,'the exposed incoming projectile must remain a real threat');
  assert.equal(covered.risk,0,'solid cover should remove projectile risk');
  assert.equal(covered.x,0);
  assert.equal(covered.y,0);
});

test('Predator keeps historical projectile risk when terrain LOS support is unavailable',()=>{
  const {helper,CLASSES}=loadPredator();
  const g=game(false);
  delete g.hasLineOfSight;
  const risk=helper.threatVector(g,CLASSES,tank,{});
  assert.ok(risk.risk>.1,'maps without terrain LOS support must preserve existing threat behavior');
});
