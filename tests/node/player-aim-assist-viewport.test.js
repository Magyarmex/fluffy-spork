'use strict';
/* Regression: shipping player aim assist must never silently snap to a
 * fully off-camera hull just because it is closer than a visible target. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'nova-updates/fair-engagement-v1.11.2.js'),'utf8');
const start=html.indexOf('            const mv = this.input.moveVec();');
const end=html.indexOf('            const firing = this.input.firing',start);
assert.ok(start>0&&end>start,'test runs actual shipping player aim block');
const playerAim=new Function('sdt','types_1',html.slice(start,end));
function tank(id,x,y){return{id,x,y,r:14,hp:100,alive:true,vx:0,vy:0,angle:0,cls:'scout'};}
function boot(){
 class Game{
  constructor(){
   this.player=tank(1,0,0);this.player.isPlayer=true;
   this.tanks=[this.player];this.w=320;this.h=568;this.cam={x:0,y:0,zoom:1};this.zoom=1;
   this.input={mouseActive:false,moveVec(){return{x:0,y:0}},aimVec(){return{x:155,y:210}}};
  }
  tankSpeed(){return 124} moveTank(){} lerpAngle(a,b){return b}
  hasLineOfSight(){return true}
  nearestTank(x,y,max,exclude){let best=null,bd=max*max;for(const t of this.tanks){if(!t.alive||t.id===exclude)continue;const d=(t.x-x)**2+(t.y-y)**2;if(d<bd){bd=d;best=t}}return best}
  update(){playerAim.call(this,1/60,{angleDiff:(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)))});}
  updateDrones(){}
 }
 const mods={'game/engine':m=>{m.exports.Game=Game}};
 const window={__novaModules:mods};
 vm.runInNewContext(source,{window,Math,Number,Object,Array,Map,Set,console:{info(){},warn(){},error(){}}});
 const m={exports:{}};
 mods['game/engine'](m,m.exports,k=>k==='./classes'?{CLASSES:{},lineageForClass(){return'gunner'}}:{});
 return m.exports.Game;
}
test('touch aim prefers visible farther target over a nearer fully offscreen tank',()=>{
 const Game=boot(),g=new Game(),visible=tank(2,155,210),hidden=tank(3,185,165);
 g.tanks.push(visible,hidden);
 const expected=Math.atan2(visible.y,visible.x);
 assert.ok(Math.hypot(hidden.x,hidden.y)<Math.hypot(visible.x,visible.y));
 assert.ok(hidden.x>g.w/2+hidden.r,'nearest hull completely outside right viewport');
 g.update();assert.ok(Math.abs(g.player.angle-expected)<1e-10,'offscreen hull stole visible aim');
});
test('visible target still receives existing 0.22-radian aim assist',()=>{
 const Game=boot(),g=new Game(),visible=tank(2,155,210);
 g.tanks.push(visible);g.input.aimVec=()=>({x:155,y:180});
 g.update();assert.ok(Math.abs(g.player.angle-Math.atan2(visible.y,visible.x))<1e-10);
});
test('AI and Crasher nearestTank calls retain original owner',()=>{
 const Game=boot(),g=new Game(),hidden=tank(3,185,165);g.tanks.push(hidden);
 assert.equal(g.nearestTank(0,0,900,1),hidden);
 assert.equal(g.nearestTank(0,0,780,-1),g.player);
});
test('camera pan, zoom and orientation govern eligibility',()=>{
 const Game=boot(),g=new Game(),target=tank(2,185,185);g.tanks.push(target);
 assert.equal(g.nearestTank(0,0,480,1),null);
 g.cam.x=100;assert.equal(g.nearestTank(0,0,480,1),target);
 g.cam.x=0;g.w=568;g.h=320;assert.equal(g.nearestTank(0,0,480,1),null);
 g.cam.y=100;assert.equal(g.nearestTank(0,0,480,1),target);
 g.cam.y=0;g.w=600;g.h=568;g.cam.zoom=2;
 assert.equal(g.nearestTank(0,0,480,1),null);
});
test('terrain occlusion still blocks the visible player aim candidate',()=>{
 const Game=boot(),g=new Game(),target=tank(2,150,150);
 g.tanks.push(target);g.hasLineOfSight=()=>false;
 assert.equal(g.nearestTank(0,0,480,1),null);
});

test('visible-target nearest selection matches legacy owner across 400 seeded scenes',()=>{
 let state=0x6c6f7665;
 const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296};
 for(const [w,h,z] of [[320,568,1],[360,740,.8],[568,320,1],[800,600,1.2]]){
  for(let scene=0;scene<100;scene++){
   const Game=boot(),g=new Game();g.w=w;g.h=h;g.cam.zoom=z;
   const halfW=w/(2*z),halfH=h/(2*z);
   for(let i=0;i<10;i++){
    const t=tank(i+2,(rand()*2-1)*Math.min(halfW-20,420),(rand()*2-1)*Math.min(halfH-20,420));
    g.tanks.push(t);
   }
   let best=null,bd=480*480;
   for(const t of g.tanks){if(t.id===1)continue;
    const d=t.x*t.x+t.y*t.y;if(d<bd){bd=d;best=t;}}
   assert.equal(g.nearestTank(0,0,480,1),best);
  }
 }
});
test('invalid camera metadata falls back to legacy nearest query without throwing',()=>{
 const Game=boot(),g=new Game(),target=tank(2,185,165);g.tanks.push(target);
 g.cam.zoom=NaN;assert.equal(g.nearestTank(0,0,480,1),target);
 g.cam.zoom=1;g.cam.x=NaN;assert.equal(g.nearestTank(0,0,480,1),target);
});

test('touch assist skips spawn-protected hulls and selects an exposed visible opponent',()=>{
 const Game=boot(),g=new Game();
 const protectedTank=tank(2,100,15),exposed=tank(3,180,-10);
 protectedTank.spawnShieldT=2.0;exposed.spawnShieldT=0;
 g.w=568;g.h=320;g.tanks.push(protectedTank,exposed);
 assert.equal(g.nearestTank(0,0,480,1),exposed,
   'a closer spawn-protected tank must not consume the only aim-assist candidate');
 g.input.aimVec=()=>({x:180,y:-11});
 g.update();
 assert.ok(Math.abs(g.player.angle-Math.atan2(-10,180))<1e-10,
   'assist must follow the exposed target, not the protected hull');
 protectedTank.spawnShieldT=0;
 assert.equal(g.nearestTank(0,0,480,1),protectedTank,
   'ordinary unshielded nearest-target behavior must remain unchanged');
});

test('touch assist respects explicit team relations without changing legacy AI nearest queries',()=>{
 const Game=boot(),g=new Game(),ally=tank(2,90,0),enemy=tank(3,180,0);
 g.w=568;g.h=320;g.tanks.push(ally,enemy);
 g.areAllies=(a,b)=>b.id===ally.id;
 assert.equal(g.nearestTank(0,0,480,1),enemy,
   'friendly hull must not steal the human aim assist');
 assert.equal(g.nearestTank(0,0,900,1),ally,
   'legacy non-assist queries retain their original selection');
 g.areAllies=undefined;g.areHostile=(a,b)=>b.id!==ally.id;
 assert.equal(g.nearestTank(0,0,480,1),enemy,
   'explicit non-hostile relations must also be respected');
});
