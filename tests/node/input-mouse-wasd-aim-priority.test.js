'use strict';
// The materialized core prefers aimVec() over mouse coordinates. When WASD
// moves the hull and the mouse is active, the original aimVec() returned the
// movement vector and silently stole the cannon from the cursor.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const controller=fs.readFileSync(path.join(root,'nova-updates/controller-v1.3.0.js'),'utf8');
function extractMethod(source,signature){
 const at=source.indexOf(signature);assert.ok(at>=0,'materialized method '+signature);
 const brace=source.indexOf('{',at);let depth=0;
 for(let i=brace;i<source.length;i++){
  if(source[i]==='{')depth++;else if(source[i]==='}'&&--depth===0)
   return source.slice(brace+1,i);
 }
 throw Error('unclosed method '+signature);
}
const nativeAim=new Function('move',extractMethod(html,'    aimVec(move) {'));
const start=html.indexOf('            const mv = this.input.moveVec();');
const end=html.indexOf('            const firing = this.input.firing',start);
assert.ok(start>=0&&end>start,'materialized player input path');
const playerAim=new Function('sdt','types_1',html.slice(start,end));
function boot(){
 class Input {
  constructor(){
   this.mouseActive=true;this.mouseX=400;this.mouseY=200;this.touchSeen=false;
   this.aim={active:false,dx:0,dy:0};this.move={active:false};
   this.keyboard={right:true,left:false,up:false,down:false};
  }
  attach(){}
  detach(){}
  aimVec(move){return nativeAim.call(this,move);}
  moveVec(){return {x:1,y:0};}
 }
 const modules={'game/input':m=>{m.exports.Input=Input}};
 const window={__novaModules:modules};
 vm.runInNewContext(controller,{window,document:{addEventListener(){}},
  console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Map,Set,WeakMap,Date,
  performance:{now:()=>0},navigator:{}},{filename:'controller-v1.3.0.js'});
 const m={exports:{}};modules['game/input'](m,m.exports,()=>({}));
 return m.exports.Input;
}
for(const hz of [30,60,120,240]){
 test('mouse bearing beats WASD movement bearing at '+hz+'Hz',()=>{
  const Input=boot(),input=new Input();
  assert.equal(input.aimVec({x:1,y:0}),null,
   'active mouse must route the shipping core into its pointer-aim branch');
  const g={input,player:{x:0,y:0,vx:0,vy:0,angle:0},w:800,h:600,zoom:1,
   cam:{x:0,y:0},canvas:{getBoundingClientRect(){return {left:0,top:0}}},
   tankSpeed(){return 100},moveTank(){},nearestTank(){return null},
   lerpAngle(a,b,t){return a+(b-a)*Math.min(1,t)}};
  playerAim.call(g,1/hz,{angleDiff:()=>0});
  assert.ok(g.player.angle<0,'mouse above hull must aim north, not east');
 });
}
test('keyboard movement remains fallback aim when mouse is not active',()=>{
 const Input=boot(),input=new Input();input.mouseActive=false;
 assert.deepEqual(input.aimVec({x:1,y:0}),{x:1,y:0});
});
test('active touch right stick still has priority over mouse and movement',()=>{
 const Input=boot(),input=new Input();input.aim={active:true,dx:0,dy:-32};
 const result=input.aimVec({x:1,y:0});
 assert.equal(result.x,0);assert.equal(result.y,-1);
});
test('touch-only left-stick movement retains native aim fallback',()=>{
 const Input=boot(),input=new Input();input.mouseActive=false;
 input.move.active=true;input.keyboard.right=false;
 assert.deepEqual(input.aimVec({x:0,y:1}),{x:0,y:1});
});
test('hybrid touch ownership cannot be overridden by stale mouseActive',()=>{
 const Input=boot(),input=new Input();input.touchSeen=true;
 assert.deepEqual(input.aimVec({x:1,y:0}),{x:1,y:0});
});
test('invalid mouse coordinates cannot suppress legitimate keyboard aim',()=>{
 const Input=boot(),input=new Input();input.mouseX=NaN;
 assert.deepEqual(input.aimVec({x:1,y:0}),{x:1,y:0});
});
test('mouse hover without WASD still uses normal pointer branch',()=>{
 const Input=boot(),input=new Input();input.keyboard.right=false;
 assert.equal(input.aimVec({x:0,y:0}),null);
});
test('shipping core explicitly prioritizes aimVec over the mouse fallback',()=>{
 assert.ok(html.indexOf('            if (aim) {',start)>start);
 assert.ok(html.indexOf('            else if (this.input.mouseActive) {',start)>start);
});

test('WASD plus mouse aligns the gun with the canonical Controller live command',()=>{
 const Input=boot(),input=new Input();
 const source=controller;
 const a=source.indexOf('    function updatePlayerCommand(');
 const b=source.indexOf('    function updateAICommand(',a);
 assert.ok(a>=0&&b>a);
 const updateCommand=new Function('clamp','maxCommandRange','clampNode',
  'return ('+source.slice(a,b).trim()+')')(
  (v,l,h)=>Math.min(h,Math.max(l,v)),()=>650,
  (o,x,y,r)=>({x,y}));
 const owner={id:1,cls:'carrier',x:0,y:0,angle:0,alive:true};
 const state={wasActive:false,angle:0,nodeX:0,nodeY:0,power:0,lastCommandCue:-99,lastRecallCue:-99};
 const g={input,player:owner,w:800,h:600,zoom:1,time:1,cam:{x:0,y:0},
  canvas:{getBoundingClientRect(){return {left:0,top:0}}},
  sfx:{novaSwarmCommand(){}},tankSpeed(){return 100},moveTank(){},
  nearestTank(){return null},lerpAngle(a,b,t){return a+(b-a)*Math.min(1,t)}};
 playerAim.call(g,1/60,{angleDiff:()=>0});
 updateCommand(g,owner,state,{droneLeash:650},1/60);
 assert.ok(Math.abs(state.angle+Math.PI/2)<1e-8,
  'live swarm uses raw northward mouse bearing');
 assert.ok(Math.abs(owner.angle-(-Math.PI/2)*(13/60))<1e-8,
  'cannon correctly smooths toward that same northward bearing');
 assert.ok(state.active,'eastward WASD cannot recall or redirect the northward mouse command');
});
