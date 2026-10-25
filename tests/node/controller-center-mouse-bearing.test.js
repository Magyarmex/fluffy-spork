'use strict';
/* Regression: the shipping mouse fallback computes atan2(0,0)=0 when the
 * cursor is exactly on the Controller hull. This must not turn the cannon
 * east while the live swarm command preserves its previous bearing. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const shipping=fs.readFileSync(path.join(root,'index.html'),'utf8');
const controller=fs.readFileSync(path.join(root,'nova-updates/controller-v1.3.0.js'),'utf8');
const start=shipping.indexOf('            const mv = this.input.moveVec();');
const end=shipping.indexOf('            const firing = this.input.firing',start);
assert.ok(start>0&&end>start,'actual materialized player aim/movement path exists');
const playerAim=new Function('sdt','types_1',shipping.slice(start,end));
function boot(){
 class Game {
  constructor(){
   this.status='playing';this.player={id:1,cls:'carrier',alive:true,x:0,y:0,vx:0,vy:0,angle:1.25};
   this.ai={angle:1.1};this.w=800;this.h=600;this.zoom=1;this.cam={x:0,y:0};
   this.canvas={getBoundingClientRect(){return {left:0,top:0}}};
   this.input={mouseActive:true,mouseX:400,mouseY:300,firing:true,aim:{active:false},
     move:{active:false},keyboard:{},moveVec(){return {x:0,y:0}},aimVec(){return null}};
  }
  tankSpeed(){return 0}
  moveTank(){}
  nearestTank(){return null}
  lerpAngle(a,b,t){return a+(b-a)*Math.min(1,t)}
  update(dt){
   playerAim.call(this,dt,{angleDiff:(a,b)=>Math.abs(a-b)});
   this.ai.angle=this.lerpAngle(this.ai.angle,2,dt*5);
  }
 }
 const modules={'game/engine':m=>{m.exports.Game=Game}};
 const window={__novaModules:modules};
 vm.runInNewContext(controller,{window,document:{addEventListener(){}},
  console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Map,Set,WeakMap,Date,
  performance:{now:()=>0},navigator:{}},{filename:'controller-v1.3.0.js'});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,id=>id==='./classes'?
  {CLASSES:{carrier:{droneLeash:650}},ABILITIES:{}}:{});
 return m.exports.Game;
}
for(const hz of [30,60,120,240]){
 test('centered Controller mouse does not rotate gun east at '+hz+'Hz',()=>{
  const Game=boot(),g=new Game();g.update(1/hz);
  assert.equal(g.player.angle,1.25);
  assert.ok(g.ai.angle>1.1,'AI aim must still update');
 });
}
test('subpixel centered mouse preserves bearing, including camera offset and zoom',()=>{
 const Game=boot(),g=new Game();
 g.cam.x=100;g.cam.y=-50;g.player.x=100;g.player.y=-50;g.zoom=2;
 g.input.mouseX=400.7;g.input.mouseY=299.5;g.update(1/60);
 assert.equal(g.player.angle,1.25);
});
test('deliberate cursor aim outside deadzone still turns cannon',()=>{
 const Game=boot(),g=new Game();g.input.mouseX=425;g.update(1/60);
 assert.notEqual(g.player.angle,1.25);
});
test('non-Controller classes retain native centered-mouse behavior',()=>{
 const Game=boot(),g=new Game();g.player.cls='scout';g.update(1/60);
 assert.notEqual(g.player.angle,1.25);
});
test('keyboard movement aim remains authoritative over mouse fallback',()=>{
 const Game=boot(),g=new Game();
 g.input.keyboard.right=true;g.input.aimVec=()=>({x:0,y:1});
 g.update(1/60);assert.ok(g.player.angle>1.25);
});
test('active touch aim remains authoritative',()=>{
 const Game=boot(),g=new Game();g.input.aim.active=true;
 g.input.aimVec=()=>({x:0,y:1});
 g.update(1/60);assert.ok(g.player.angle>1.25);
});
test('centered mouse without firing still holds gun bearing',()=>{
 const Game=boot(),g=new Game();g.input.firing=false;
 g.update(1/60);assert.equal(g.player.angle,1.25);
});
test('temporary player-aim interception never leaks into later AI turns',()=>{
 const Game=boot(),g=new Game();g.update(1/60);
 const after=g.lerpAngle(1,2,.5);
 assert.equal(after,1.5);
 g.input.mouseX=450;g.update(1/60);
 assert.notEqual(g.player.angle,1.25);
});
test('shipping Controller and Live Vector remain in correct composition order',()=>{
 const a=shipping.indexOf('nova-updates/controller-v1.3.0.js');
 const b=shipping.indexOf('nova-updates/second-body-live-vector-v1.10.7.js');
 assert.ok(a>=0&&b>a);
 assert.match(shipping,/aimA = Math\.atan2\(wy - pl\.y, wx - pl\.x\)/);
});
