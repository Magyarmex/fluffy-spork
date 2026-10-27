'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {dodgeVisibleProjectile,aimAtVisibleHostile}=require('../browser/frontlines-visible-defense.js');
const F={viewportHalfExtents:()=>({x:100,y:100})};
const p={id:1,x:0,y:0,vx:0,vy:0,cls:'scout'};
function shot(extra={}){return{id:2,ownerId:3,x:70,y:0,vx:-200,vy:0,r:3,ttl:1,dead:false,...extra};}
function game(bullets=[shot()]){return{cam:{x:0,y:0},bullets,hasLineOfSight:()=>true};}
test('visible incoming projectile yields a deterministic perpendicular dodge',()=>{
 const g=game();
 assert.deepEqual(dodgeVisibleProjectile(g,p,F,{x:0,y:1}),{x:0,y:1});
 assert.deepEqual(dodgeVisibleProjectile(g,p,F,{x:0,y:-1}),{x:0,y:-1});
});
test('never reacts to own, dead, expired, retreating, or too-late projectiles',()=>{
 for(const b of [shot({ownerId:1}),shot({dead:true}),shot({ttl:0}),
   shot({ttl:.1}),shot({vx:200}),shot({vx:0,vy:0})])
  assert.equal(dodgeVisibleProjectile(game([b]),p,F,{x:0,y:1}),null);
});
test('hidden or camera-occluded projectile cannot influence the pilot',()=>{
 const g=game([shot({x:130})]);
 assert.equal(dodgeVisibleProjectile(g,p,F,{x:0,y:1}),null);
 g.bullets=[shot()];g.cam.x=250;
 assert.equal(dodgeVisibleProjectile(g,p,F,{x:0,y:1}),null);
 g.cam.x=0;g.hasLineOfSight=()=>false;
 assert.equal(dodgeVisibleProjectile(g,p,F,{x:0,y:1}),null);
});
test('terrain vetoes an unsafe dodge; fallback uses opposite direction only if clear',()=>{
 const g=game();
 g.hasLineOfSight=(_x,_y,tx,ty)=>tx<80&&(Math.abs(ty)<1||ty<0);
 assert.deepEqual(dodgeVisibleProjectile(g,p,F,{x:0,y:1}),{x:0,y:-1});
 g.hasLineOfSight=(_x,_y,tx,ty)=>Math.abs(ty)<1;
 assert.equal(dodgeVisibleProjectile(g,p,F,{x:0,y:1}),null);
});
test('near misses and nonfinite coordinates do not trigger a dodge',()=>{
 for(const b of [shot({y:55}),shot({vx:NaN}),shot({x:NaN})])
  assert.equal(dodgeVisibleProjectile(game([b]),p,F,{x:0,y:1}),null);
});
test('hidden projectiles do not change visible-threat decisions',()=>{
 const g=game();
 const before=dodgeVisibleProjectile(g,p,F,{x:0,y:1});
 g.bullets.push(shot({id:999,x:500,vx:-99999,r:999,ttl:100}));
 assert.deepEqual(dodgeVisibleProjectile(g,p,F,{x:0,y:1}),before);
});
test('the pilot does not require private AI, target or ecology state',()=>{
 const g=game();
 assert.deepEqual(dodgeVisibleProjectile(g,p,F,{x:1,y:0}),{x:0,y:-1});
 assert.equal(dodgeVisibleProjectile(g,p,null,{x:1,y:0}),null);
});

test('visible hostile aim uses only actual rendered, viewport-legal line of sight',()=>{
 const hostile={id:3,x:80,y:0,hp:100,alive:true,spawnShieldT:0};
 const g=game([]);g.tanks=[p,hostile];
 const F2={...F,inGameplayViewport:()=>true};
 assert.deepEqual(aimAtVisibleHostile(g,p,F2),{x:1,y:0});
 g.cam.x=300;assert.equal(aimAtVisibleHostile(g,p,F2),null);
 g.cam.x=0;g.hasLineOfSight=()=>false;
 assert.equal(aimAtVisibleHostile(g,p,F2),null);
 g.hasLineOfSight=()=>true;
 assert.equal(aimAtVisibleHostile(g,p,{...F2,inGameplayViewport:()=>false}),null);
});
test('defensive aim never locks allies, shielded, dead, or unseen tanks',()=>{
 const enemy={id:3,x:80,y:0,hp:100,alive:true,spawnShieldT:0,team:'blue'};
 const g=game([]);g.tanks=[p,enemy];g.areAllies=()=>true;
 const F2={...F,inGameplayViewport:()=>true};
 assert.equal(aimAtVisibleHostile(g,p,F2),null);
 g.areAllies=()=>false;g.areHostile=()=>false;
 assert.equal(aimAtVisibleHostile(g,p,F2),null);
 g.areHostile=()=>true;enemy.spawnShieldT=1;
 assert.equal(aimAtVisibleHostile(g,p,F2),null);
 enemy.spawnShieldT=0;enemy.hp=0;
 assert.equal(aimAtVisibleHostile(g,p,F2),null);
 enemy.hp=100;enemy.x=500;
 assert.equal(aimAtVisibleHostile(g,p,F2),null);
});
test('unseen tank changes cannot alter a visible hostile aim',()=>{
 const near={id:3,x:80,y:0,hp:100,alive:true};
 const hidden={id:4,x:500,y:0,hp:100,alive:true};
 const g=game([]);g.tanks=[p,near,hidden];
 const F2={...F,inGameplayViewport:()=>true};
 const before=aimAtVisibleHostile(g,p,F2);
 hidden.hp=10000;hidden.x=900;hidden.id=999;
 assert.deepEqual(aimAtVisibleHostile(g,p,F2),before);
});
