'use strict';
// Field Service must reject irrelevant units by physical range before any
// owner lookup or allegiance query, preserving AI/human visibility semantics.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source=n=>fs.readFileSync(path.join(root,'nova-updates',n),'utf8');
function boot(){
  class Game{
    constructor(){this.time=7;this.w=220;this.h=380;this.cam={zoom:1};
      this.tanks=[];this.drones=[];this.bullets=[];this.tankById=new Map();}
    updateDrones(){} damageDrone(d,n){d.hp-=n;}
    hasLineOfSight(){return true;}
  }
  const mods={'game/engine':m=>{m.exports.Game=Game;},
    'game/ai':m=>{m.exports.updateAI=()=>{};}};
  const win={__novaModules:mods,NOVATips:{registerMany(){}}};
  const ctx={window:win,console:{info(){},error(){}},Math,Number,Map,Set,Date,Object,Array};
  for(const name of ['drone-field-service-v1.10.3.js','fair-engagement-v1.11.2.js'])
    vm.runInNewContext(source(name),ctx,{filename:name});
  const m={exports:{}};mods['game/engine'](m,m.exports,()=>({CLASSES:{}}));
  return {Game:m.exports.Game,win};
}
function setup(){
  const {Game,win}=boot(),g=new Game();
  const owner={id:1,team:'blue',cls:'marksman',x:0,y:0,hp:100,alive:true,ai:{},isPlayer:false};
  const enemy={id:2,team:'red',cls:'gunner',x:1000,y:0,hp:100,alive:true};
  const d={id:10,ownerId:1,kind:'drone',x:0,y:0,hp:80,maxHp:100,r:8};
  const far=Array.from({length:100},(_,i)=>({id:100+i,ownerId:2,kind:'drone',x:1000+i,y:0,hp:30,r:8}));
  g.tanks=[owner,enemy];g.drones=[d,...far];
  g.tankById.set(1,owner);g.tankById.set(2,enemy);
  let lookups=0,relations=0;
  g.tankById.get=function(id){lookups++;return Map.prototype.get.call(this,id);};
  g.areAllies=(a,b)=>a.team===b.team;
  g.areHostile=(a,b)=>{relations++;return a.team!==b.team;};
  const threat=()=>win.__NOVA_FIELD_SERVICE_TEST__.visibleThreat(g,d,owner);
  return {g,d,owner,enemy,far,threat,lookups:()=>lookups,relations:()=>relations};
}
test('100 distant drones cost zero owner lookups or allegiance queries',()=>{
  const s=setup();assert.equal(s.threat(),false);
  assert.equal(s.lookups(),0);
  assert.equal(s.relations(),0);
});
test('a visible near threat after 100 distant drones is still detected',()=>{
  const s=setup();s.far.at(-1).x=90;
  assert.equal(s.threat(),true);
  assert.equal(s.lookups(),1);
  assert.equal(s.relations(),1);
});
test('a nearer hidden candidate does not hide a later visible threat',()=>{
  const s=setup();s.far[0].x=150;s.far[1].x=90;
  assert.equal(s.threat(),true);
  assert.equal(s.lookups(),2);
});
test('nonfinite coordinates are rejected before owner and allegiance queries',()=>{
  const s=setup();s.far[0].x=NaN;s.far[1].x=Infinity;
  assert.equal(s.threat(),false);
  assert.equal(s.lookups(),0);
  assert.equal(s.relations(),0);
});
test('human-owned drones still sense near offscreen hostiles',()=>{
  const s=setup();s.owner.ai=null;s.owner.isPlayer=true;s.far[0].x=200;
  assert.equal(s.threat(),true);
  assert.equal(s.lookups(),1);
});
test('nearby visible hostile behind solid cover does not suppress repair',()=>{
  const s=setup();s.far[0].x=90;s.g.hasLineOfSight=()=>false;
  assert.equal(s.threat(),false);
  assert.equal(s.lookups(),1);
});
