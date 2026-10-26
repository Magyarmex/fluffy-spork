'use strict';
// Regression: the visible camera zoom, not the resize target zoom,
// must determine desktop mouse bearing during camera easing.
// The player gun and Controller command must use the same rendered zoom.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const controller=fs.readFileSync(path.join(root,'nova-updates/controller-v1.3.0.js'),'utf8');
const start=html.indexOf('            const mv = this.input.moveVec();');
const end=html.indexOf('            const firing = this.input.firing',start);
assert.ok(start>=0&&end>start,'canonical embedded player aim path exists');
const playerAim=new Function('sdt','types_1',html.slice(start,end));
function boot(){
  class Game{
    constructor(){
      this.status='playing';
      this.player={id:1,cls:'carrier',alive:true,x:0,y:0,vx:0,vy:0,angle:0};
      this.w=800;this.h=600;this.zoom=.5;this.cam={x:70,y:0,zoom:1};
      this.canvas={getBoundingClientRect(){return{left:0,top:0}}};
      this.input={mouseActive:true,mouseX:400,mouseY:350,firing:true,
        aim:{active:false},move:{active:false},keyboard:{},
        moveVec(){return{x:0,y:0}},aimVec(){return null}};
    }
    tankSpeed(){return 0}
    moveTank(){}
    nearestTank(){return null}
    lerpAngle(a,b){return b}
    update(dt){playerAim.call(this,dt,{angleDiff:(a,b)=>Math.abs(a-b)});}
  }
  const modules={'game/engine':m=>{m.exports.Game=Game}};
  const window={__novaModules:modules};
  vm.runInNewContext(controller,{window,document:{addEventListener(){}},
    console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Map,Set,WeakMap,Date,
    performance:{now:()=>0},navigator:{}},{filename:'controller-v1.3.0.js'});
  const m={exports:{}};
  modules['game/engine'](m,m.exports,id=>id==='./classes'?
    {CLASSES:{carrier:{droneLeash:650}},ABILITIES:{}}:{});
  return new m.exports.Game();
}
for(const hz of [30,60,120,240]){
  test('desktop mouse aim uses visible zoom during easing at '+hz+' FPS',()=>{
    const g=boot();
    g.update(1/hz);
    const expected=Math.atan2(50,70); // visible cam.zoom=1
    const targetZoomBearing=Math.atan2(100,70); // erroneous g.zoom=.5
    assert.ok(Math.abs(expected-targetZoomBearing)>.2,'test setup exposes a material angle gap');
    assert.ok(Math.abs(g.player.angle-expected)<1e-8,
      'mouse bearing should follow the rendered camera, not its future zoom target');
  });
}
test('control: equal target/render zoom preserves correct mouse bearing',()=>{
  const g=boot();g.cam.zoom=g.zoom;g.update(1/60);
  assert.ok(Math.abs(g.player.angle-Math.atan2(100,70))<1e-8);
});
test('control: centered camera makes zoom error bearing-neutral',()=>{
  const g=boot();g.cam.x=0;g.update(1/60);
  assert.ok(Math.abs(g.player.angle-Math.PI/2)<1e-8);
});
test('shipping chain still contains the authoritative Controller and Fair Engagement layers',()=>{
  const a=html.indexOf('nova-updates/controller-v1.3.0.js');
  const b=html.indexOf('nova-updates/second-body-live-vector-v1.10.7.js');
  const c=html.indexOf('nova-updates/fair-engagement-v1.11.2.js');
  assert.ok(a>=0&&b>a&&c>b);
});
