'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const pilot=require('../browser/cover-pressure-pilot.js');
const F={viewportHalfExtents:()=>({x:450,y:350})};
const p={x:0,y:0,id:1};
function rect(id,x,y,hp=290){return{id,x,y,w:100,h:60,shape:'rect',destructible:true,solid:true,hp,maxHp:290};}
function game(terrain){return{__novaTerrain:terrain,cam:{x:0,y:0},hasLineOfSight:()=>true,
 firstTerrainHit:(_ax,_ay,tx,ty)=>({solid:terrain.find(t=>t.x===tx&&t.y===ty)})};}
test('visible destructible cover is targeted through ordinary aim and standoff movement',()=>{
 const g=game([rect(-1001,300,0)]),s=pilot.select(g,p,F);
 assert.equal(s.cover.id,-1001);
 assert.equal(s.face.x,242);
 assert.ok(pilot.aim(g,p,F).x>.99);
 assert.ok(pilot.move(g,p,F).x>.99);
 const near={...p,x:90};
 assert.deepEqual(pilot.move(g,near,F),{x:0,y:0});
});
test('permanent, destroyed and off-camera cover never becomes a target',()=>{
 const wall={...rect(-1,100,0),destructible:false};
 const broken={...rect(-2,120,0),hp:0};
 const hidden=rect(-3,900,0);
 assert.equal(pilot.select(game([wall,broken,hidden]),p,F),null);
 const g=game([rect(-4,200,0)]);g.cam.x=1000;
 assert.equal(pilot.select(g,p,F),null);
});
test('occluded cover cannot be aimed at or pursued',()=>{
 const g=game([rect(-1,200,0)]);g.hasLineOfSight=()=>false;
 assert.equal(pilot.select(g,p,F),null);
 assert.equal(pilot.aim(g,p,F),null);
 assert.equal(pilot.move(g,p,F),null);
});
test('selection is deterministic under terrain enumeration order and invisible changes',()=>{
 const a=rect(-10,250,100),b=rect(-20,250,-100);
 const g=game([a,b]),before=pilot.select(g,p,F).cover.id;
 g.__novaTerrain.reverse();assert.equal(pilot.select(g,p,F).cover.id,before);
 g.__novaTerrain.push(rect(-99,2000,2000));
 assert.equal(pilot.select(g,p,F).cover.id,before);
});
test('rectangle and circle faces are outside collision geometry',()=>{
 const r=rect(-1,200,0),f=pilot.face(p,r);
 assert.ok(f.x<r.x-r.w/2);
 const c={id:-2,x:200,y:0,r:40,shape:'circle',destructible:true,hp:100};
 const cf=pilot.face(p,c);assert.ok(Math.hypot(cf.x-c.x,cf.y-c.y)>c.r+2);
});
test('invalid, embedded, missing or malformed geometry fails closed',()=>{
 assert.equal(pilot.face({x:200,y:0},rect(-1,200,0)),null);
 assert.equal(pilot.face(p,{x:200,y:0,w:0,h:30,shape:'rect'}),null);
 assert.equal(pilot.face(p,{x:200,y:0,r:NaN,shape:'circle'}),null);
 assert.equal(pilot.select(game([{...rect(-1,200,0),id:NaN}]),p,F),null);
 assert.equal(pilot.select(game([rect(-1,200,0)]),{x:NaN,y:0},F),null);
 assert.equal(pilot.select({__novaTerrain:[]},p,F),null);
});
test('selection never reads private neutral ecology or enemy data',()=>{
 const g=game([rect(-1,200,0)]);
 Object.defineProperty(g,'__lfState',{get(){throw Error('private ecology access');}});
 Object.defineProperty(g,'tanks',{get(){throw Error('private AI access');}});
 assert.equal(pilot.select(g,p,F).cover.id,-1);
});
test('stale, dead and invalid-camera pilots cannot acquire cover',()=>{
 const g=game([rect(-1,200,0)]),live={...p,hp:100,alive:true};
 g.player=live;
 assert.equal(pilot.select(g,p,F),null,'stale pre-redeploy tank cannot steer');
 live.alive=false;assert.equal(pilot.select(g,live,F),null);
 live.alive=true;live.hp=0;assert.equal(pilot.select(g,live,F),null);
 live.hp=100;g.cam.x=NaN;assert.equal(pilot.select(g,live,F),null);
});
test('an exposed face is rejected when the shot first hits another wall',()=>{
 const c=rect(-1,250,0),wall={...rect(-2,120,0),destructible:false};
 const g=game([c,wall]);
 g.firstTerrainHit=()=>({solid:wall});
 assert.equal(pilot.select(g,p,F),null,'face LOS alone cannot authorize firing through wall');
 g.firstTerrainHit=()=>({solid:c});
 assert.equal(pilot.select(g,p,F).cover.id,-1);
});
