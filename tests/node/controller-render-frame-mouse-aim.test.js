'use strict';
// Actual materialized player-aim and camera-step fragments + shipping Controller
// wrapper. A shot should follow the world point rendered after this frame's
// camera easing, not the previous frame's camera projection.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const controller=fs.readFileSync(path.join(root,'nova-updates/controller-v1.3.0.js'),'utf8');
const aimStart=html.indexOf('            const mv = this.input.moveVec();');
const aimEnd=html.indexOf('            const firing = this.input.firing',aimStart);
const camStart=html.indexOf('        // camera (smooth framerate-independent lag + look-ahead offset)');
const camEnd=html.indexOf('        // hud sync',camStart);
assert.ok(aimStart>=0&&aimEnd>aimStart&&camStart>aimEnd&&camEnd>camStart,
  'real shipping player aim and camera update are present');
const playerAim=new Function('sdt','types_1',html.slice(aimStart,aimEnd));
const cameraStep=new Function('dt','types_1',html.slice(camStart,camEnd));
function boot(withTactical=false){
 class Game{
  constructor(){
   this.status='playing';
   this.player={id:1,cls:'scout',alive:true,x:100,y:0,vx:0,vy:0,angle:0};
   this.w=800;this.h=600;this.zoom=.5;
   this.cam={x:0,y:0,zoom:1,shake:0};
   this.canvas={getBoundingClientRect(){return {left:0,top:0}}};
   this.input={mouseActive:true,mouseX:600,mouseY:400,firing:true,
     aim:{active:false},move:{active:false},keyboard:{},
     moveVec(){return {x:0,y:0}},aimVec(){return null}};
  }
  tankSpeed(){return 0}
  moveTank(){}
  nearestTank(){return null}
  lerpAngle(a,b,t){return a+(b-a)*Math.min(1,t)}
  update(dt){
   playerAim.call(this,dt,{angleDiff:(a,b)=>Math.abs(a-b)});
   if(this.afterAim)this.afterAim();
   cameraStep.call(this,dt,{lerp:(a,b,t)=>a+(b-a)*t});
  }
 }
 const modules={'game/engine':m=>{m.exports.Game=Game}};
 const window={__novaModules:modules};
 const context={window,document:{addEventListener(){}},
   console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Map,Set,WeakMap,Date,
   performance:{now:()=>0},navigator:{}};
 vm.runInNewContext(controller,context,{filename:'controller-v1.3.0.js'});
 if(withTactical)vm.runInNewContext(fs.readFileSync(path.join(root,
   'nova-updates/tactical-framing-v1.8.2.js'),'utf8'),context,
   {filename:'tactical-framing-v1.8.2.js'});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,id=>id==='./classes'?
   {CLASSES:{scout:{size:15},carrier:{droneLeash:650}},ABILITIES:{}}:{});
 return m.exports.Game;
}
function expectedAngle(g){
 const rect=g.canvas.getBoundingClientRect();
 const wx=g.cam.x+(g.input.mouseX-rect.left-g.w*.5)/g.cam.zoom;
 const wy=g.cam.y+(g.input.mouseY-rect.top-g.h*.5)/g.cam.zoom;
 return Math.atan2(wy-g.player.y,wx-g.player.x);
}
for(const hz of [30,60,120,240]){
 test('real mouse gun follows post-update rendered camera at '+hz+'Hz',()=>{
  const Game=boot(),g=new Game(),dt=1/hz;
  g.update(dt);
  const expected=expectedAngle(g)*Math.min(1,dt*13);
  assert.ok(Math.abs(g.player.angle-expected)<1e-10,
    'gun bearing must use rendered camera at '+hz+'Hz: got '+g.player.angle+', expected '+expected);
  assert.equal(g.__novaMouseAimFrameDt,undefined,'frame bookkeeping cleared');
 });
}
for(const hz of [30,60,120,240]){
 test('moving camera look-ahead is included in visible mouse aim at '+hz+'Hz',()=>{
  const Game=boot(),g=new Game(),dt=1/hz;
  g.zoom=1;g.cam.zoom=1;g.player.x=200;g.player.y=60;
  g.player.vx=120;g.player.vy=-50;
  g.update(dt);
  const expected=expectedAngle(g)*Math.min(1,dt*13);
  assert.ok(Math.abs(g.player.angle-expected)<1e-10,
    'moving camera projected aim disagrees at '+hz+'Hz');
 });
}
test('active tactical frame uses its restored camera, not native camera easing',()=>{
 const Game=boot(),g=new Game(),dt=1/30;
 g.__novaTacticalCamera={active:true,transition:true};
 g.zoom=.4;g.cam.zoom=.4;g.cam.x=50;g.cam.y=30;
 const stable={...g.cam};
 g.update(dt);
 Object.assign(g.cam,stable); // Long Glass restores the frame after core update.
 const expected=expectedAngle(g)*Math.min(1,dt*13);
 assert.ok(Math.abs(g.player.angle-expected)<1e-10);
});
test('centered mouse retains current gun bearing through camera easing',()=>{
 const Game=boot(),g=new Game();
 g.player.x=0;g.player.y=0;g.input.mouseX=400;g.input.mouseY=300;
 g.player.angle=1.25;g.cam.x=0;g.cam.y=0;
 g.update(1/60);
 assert.equal(g.player.angle,1.25);
});

/* The Controller Command Node must follow the same post-update camera as the
 * cannon. Exercise the actual command function from the shipping overlay. */
const helperStart=controller.indexOf('    function renderedMouseCamera(');
const commandStart=controller.indexOf('    function updatePlayerCommand(',helperStart);
const commandEnd=controller.indexOf('    function updateAICommand(',commandStart);
assert.ok(helperStart>=0&&commandStart>helperStart&&commandEnd>commandStart,
  'shared projection and real Controller command are present');
const helperEnd=controller.indexOf('    /* The shared materialized mouse fallback',helperStart);
assert.ok(helperEnd>helperStart&&helperEnd<commandStart,
  'projection helper ends before Game wrapper and command function');
const updateCommand=new Function('clamp','maxCommandRange','clampNode',
  controller.slice(helperStart,helperEnd)+'\n'+
  controller.slice(commandStart,commandEnd)+'\nreturn updatePlayerCommand;')(
  (v,a,b)=>Math.max(a,Math.min(b,v)),()=>1000,
  (_owner,x,y)=>({x,y}));
function commandState(){
 return {angle:0,wasActive:false,lastCommandCue:-99,lastRecallCue:-99,
   nodeX:0,nodeY:0,strikeAt:0};
}
for(const hz of [30,60,120,240]){
 test('Controller mouse Command Node matches rendered camera at '+hz+'Hz',()=>{
  const Game=boot(),g=new Game(),dt=1/hz;
  g.player.cls='carrier';g.time=1;g.sfx={};g.__novaMouseAimFrameDt=dt;
  const state=commandState();
  updateCommand(g,g.player,state,{droneLeash:1000},dt);
  cameraStep.call(g,dt,{lerp:(a,b,t)=>a+(b-a)*t});
  const rect=g.canvas.getBoundingClientRect();
  const wx=g.cam.x+(g.input.mouseX-rect.left-g.w*.5)/g.cam.zoom;
  const wy=g.cam.y+(g.input.mouseY-rect.top-g.h*.5)/g.cam.zoom;
  assert.equal(state.active,true);
  assert.ok(Math.abs(state.nodeX-wx)<1e-10,'command X follows visible cursor');
  assert.ok(Math.abs(state.nodeY-wy)<1e-10,'command Y follows visible cursor');
  assert.ok(Math.abs(state.angle-Math.atan2(wy-g.player.y,wx-g.player.x))<1e-10);
 });
}
test('Controller tactical command respects Long Glass restored projection',()=>{
 const Game=boot(),g=new Game(),dt=1/30;
 g.player.cls='carrier';g.time=1;g.sfx={};
 g.__novaMouseAimFrameDt=dt;
 g.__novaTacticalCamera={active:true,transition:true};
 g.cam={x:50,y:30,zoom:.4,shake:0};g.zoom=.4;
 const state=commandState(),stable={...g.cam};
 updateCommand(g,g.player,state,{droneLeash:1000},dt);
 cameraStep.call(g,dt,{lerp:(a,b,t)=>a+(b-a)*t});
 Object.assign(g.cam,stable);
 assert.ok(Math.abs(state.nodeX-(50+200/.4))<1e-10);
 assert.ok(Math.abs(state.nodeY-(30+100/.4))<1e-10);
});
test('Controller touch command is independent of camera prediction',()=>{
 const Game=boot(),g=new Game();
 g.player.cls='carrier';g.time=1;g.sfx={};
 g.__novaMouseAimFrameDt=1/30;
 g.input.aim={active:true,dx:0,dy:-40};
 const state=commandState();
 updateCommand(g,g.player,state,{droneLeash:1000},1/30);
 assert.equal(state.active,true);
 assert.ok(Math.abs(state.nodeX-g.player.x)<1e-10);
 assert.ok(state.nodeY<g.player.y);
});
test('unfired mouse does not create a Controller command',()=>{
 const Game=boot(),g=new Game();
 g.player.cls='carrier';g.time=1;g.sfx={};
 g.__novaMouseAimFrameDt=1/60;g.input.firing=false;
 const state=commandState();
 updateCommand(g,g.player,state,{droneLeash:1000},1/60);
 assert.equal(state.active,false);
});

/* Full module composition: Long Glass is the later wrapper that restores the
 * tactical camera after the core updates it. Test the actual shipping module,
 * not just a hand-set tactical-state flag. */
for(const hz of [30,60,120,240]){
 test('real Long Glass + Controller aim matches final tactical camera at '+hz+'Hz',()=>{
  const Game=boot(true),g=new Game(),dt=1/hz;
  g.player.cls='carrier';g.player.isPlayer=true;
  g.player.__novaSwarm={active:true,nodeX:1200,nodeY:0};
  g.update(dt);
  assert.equal(g.__novaTacticalCamera.active,true);
  const expected=expectedAngle(g)*Math.min(1,dt*13);
  assert.ok(Math.abs(g.player.angle-expected)<1e-10);
 });
}
