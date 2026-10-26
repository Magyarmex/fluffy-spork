'use strict';
// An axis-aligned wall produces a perfectly vertical tangent (escapeX=0).
// The shipping escape helper must not mistake that valid vector for "no escape".
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/terrain-intelligence-v1.10.2.js'),'utf8');
const shipping=fs.readFileSync(path.join(root,'index.html'),'utf8');
function boot(){
 class Game{
  moveTank(t,vx,vy){this.lastMove={vx,vy};}
  updateDrones(){}
 }
 const modules={'game/engine':m=>{m.exports.Game=Game;}};
 const window={__novaModules:modules};
 vm.runInNewContext(source,{window,console:{info(){},warn(){},error(){}},
   Math,Map,Set,Number,Object,Array,Date,String,Infinity});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,()=>({CLASSES:{gunner:{size:15},carrier:{size:15}},
   lineageForClass:()=> 'gunner'}));
 return {Game:m.exports.Game,T:window.__NOVA_TERRAIN_INTELLIGENCE_TEST__};
}
function near(a,b,msg){assert.ok(Math.abs(a-b)<1e-8,msg+': '+a+' vs '+b);}
for(const nx of [-1,1]){
 for(const flip of [false,true]){
  test('vertical wall tangent remains an active escape nx='+nx+' flip='+flip,()=>{
   const {T}=boot();
   const tangent=T.tangentEscape({hit:{nx,ny:0}},1,0,1,flip);
   near(tangent.x,0,'axis-aligned tangent x');
   near(Math.abs(tangent.y),1,'axis-aligned tangent y');
   const out=T.applyEscape({escapeX:tangent.x,escapeY:tangent.y},100,0);
   assert.ok(out.x<100,'horizontal push must yield to vertical detour');
   assert.ok(Math.abs(out.y)>50,'vertical escape must actually steer');
   near(Math.hypot(out.x,out.y),100,'preserve speed');
  });
 }
}
for(const hz of [30,60,120,240]){
 test('real Terrain Intelligence tank wrapper applies vertical escape at '+hz+'Hz',()=>{
  const {Game}=boot(),g=new Game();g.time=1;
  const t={id:3,cls:'gunner',x:0,y:0,isPlayer:false,
    ai:{__v1102Nav:{sampleAt:1,x:0,y:0,escapeUntil:2,escapeX:0,escapeY:1}}};
  g.moveTank(t,100,0,1/hz);
  assert.ok(g.lastMove.vy>50,'tank must take vertical escape');
  assert.ok(g.lastMove.vx<100);
  near(Math.hypot(g.lastMove.vx,g.lastMove.vy),100,'tank speed');
 });
 test('real Terrain Intelligence drone wrapper applies vertical escape at '+hz+'Hz',()=>{
  const {Game}=boot(),g=new Game();g.time=1;
  const owner={id:3,cls:'carrier',alive:true,__novaSwarm:{active:true}};
  const d={id:12,ownerId:3,hp:100,r:8,x:0,y:0,
    __novaPhase:'form',__novaVX:100,__novaVY:0,
    __v1102Nav:{sampleAt:1,x:0,y:0,escapeUntil:2,escapeX:0,escapeY:1}};
  g.drones=[d];g.getTank=id=>id===3?owner:null;
  g.updateDrones(1/hz);
  assert.ok(d.__novaVY>50,'drone must take vertical escape');
  assert.ok(d.__novaVX<100);
  near(Math.hypot(d.__novaVX,d.__novaVY),100,'drone speed');
 });
}
test('zero or invalid escape vectors never introduce NaN or arbitrary steering',()=>{
 const {T}=boot();
 for(const state of [null,{}, {escapeX:0,escapeY:0},
   {escapeX:NaN,escapeY:1},{escapeX:Infinity,escapeY:1}]){
  const out=T.applyEscape(state,100,0);
  assert.equal(out.x,100);assert.equal(out.y,0);
 }
});
test('ordinary player movement is not redirected by AI escape state',()=>{
 const {Game}=boot(),g=new Game();g.time=1;
 const t={id:1,cls:'gunner',x:0,y:0,isPlayer:true,
   ai:{__v1102Nav:{sampleAt:1,escapeUntil:2,escapeX:0,escapeY:1}}};
 g.moveTank(t,100,0,1/60);
 assert.equal(g.lastMove.vx,100);assert.equal(g.lastMove.vy,0);
});
test('shipping composition loads Terrain Intelligence in playable runtime',()=>{
 assert.ok(shipping.includes('nova-updates/terrain-intelligence-v1.10.2.js'));
});

/* End-to-end watchdog activation: no manually injected escape vector.
 * A wall prevents forward progress for two 0.31s samples, so the actual
 * Terrain Intelligence watchdog must choose the wall's vertical tangent. */
test('stalled AI tank generates and follows vertical wall tangent naturally',()=>{
 const {Game}=boot(),g=new Game();
 g.firstTerrainHit=()=>({hit:{nx:1,ny:0}});
 const t={id:31,cls:'gunner',x:0,y:0,isPlayer:false,ai:{}};
 for(const now of [0,.31,.62]){
  g.time=now;g.moveTank(t,100,0,1/60);
 }
 assert.ok(t.ai.__v1102Nav.escapeUntil>.62,'watchdog generated active escape');
 near(t.ai.__v1102Nav.escapeX,0,'vertical tangent X');
 assert.ok(Math.abs(t.ai.__v1102Nav.escapeY)>.9,'vertical tangent Y');
 assert.ok(Math.abs(g.lastMove.vy)>50,'actual tank movement follows tangent');
 near(Math.hypot(g.lastMove.vx,g.lastMove.vy),100,'speed budget');
});
test('stalled Controller drone generates and follows vertical wall tangent naturally',()=>{
 const {Game}=boot(),g=new Game(),owner={id:31,cls:'carrier',alive:true,__novaSwarm:{active:true}};
 const d={id:32,ownerId:31,hp:100,r:8,x:0,y:0,
  __novaPhase:'form',__novaVX:100,__novaVY:0};
 g.drones=[d];g.getTank=id=>id===31?owner:null;
 g.firstTerrainHit=()=>({hit:{nx:-1,ny:0}});
 for(const now of [0,.31,.62]){g.time=now;g.updateDrones(1/60);}
 assert.ok(d.__v1102Nav.escapeUntil>.62,'drone watchdog generated active escape');
 near(d.__v1102Nav.escapeX,0,'drone vertical tangent X');
 assert.ok(Math.abs(d.__novaVY)>50,'actual drone steering follows tangent');
 near(Math.hypot(d.__novaVX,d.__novaVY),100,'drone speed budget');
});
test('committed drone dash cannot be diverted by anti-stuck watchdog',()=>{
 const {Game}=boot(),g=new Game(),owner={id:31,cls:'carrier',alive:true,__novaSwarm:{active:true}};
 const d={id:33,ownerId:31,hp:100,r:8,x:0,y:0,
  __novaPhase:'dash',__novaVX:100,__novaVY:0,
  __v1102Nav:{sampleAt:0,escapeUntil:2,escapeX:0,escapeY:1}};
 g.drones=[d];g.getTank=id=>id===31?owner:null;g.time=1;
 g.updateDrones(1/60);
 assert.equal(d.__novaVX,100);assert.equal(d.__novaVY,0);
});
