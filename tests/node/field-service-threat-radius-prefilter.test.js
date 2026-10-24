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

test('5,000 seeded mixed worlds preserve the independent repair-threat oracle',()=>{
  const s=setup();
  // Independently restate the original scan order and Fair Engagement's
  // documented viewport geometry; do not call the optimized batch helper.
  let seed=0x20261025;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const r2=310*310;
  function reference(){
    const g=s.g,d=s.d,owner=s.owner;
    const hostile=(other)=>other&&other.id!==owner.id&&other.alive!==false&&
      !g.areAllies(owner,other)&&g.areHostile(owner,other);
    const seen=t=>owner.isPlayer||!owner.ai||
      (Math.abs(t.x-owner.x)<=g.w/(2*g.cam.zoom)&&Math.abs(t.y-owner.y)<=g.h/(2*g.cam.zoom)&&
        t.alive!==false&&(t.hp==null||t.hp>0));
    for(const t of g.tanks){
      if(!hostile(t))continue;
      const dx=t.x-d.x,dy=t.y-d.y;
      if(dx*dx+dy*dy<=r2&&seen(t)&&g.hasLineOfSight(d.x,d.y,t.x,t.y,2))return true;
    }
    for(const t of g.drones){
      if(!t||t===d||t.hp<=0||t.ownerId===d.ownerId)continue;
      const other=g.tankById.get(t.ownerId);
      if(!hostile(other))continue;
      const dx=t.x-d.x,dy=t.y-d.y;
      if(dx*dx+dy*dy<=r2&&seen(t)&&g.hasLineOfSight(d.x,d.y,t.x,t.y,2))return true;
    }
    return false;
  }
  for(let i=0;i<5000;i++){
    s.owner.isPlayer=rnd()<.3;
    s.owner.ai=s.owner.isPlayer?null:{};
    s.g.cam.zoom=.5+rnd()*2;
    s.g.w=rnd()<.5?220:420;
    s.g.h=rnd()<.5?380:220;
    s.enemy.x=(rnd()-.5)*1400;
    s.enemy.y=(rnd()-.5)*900;
    s.enemy.alive=rnd()>.1;
    const rndBlocked=rnd()<.2;
    s.g.hasLineOfSight=()=>!rndBlocked;
    for(let j=0;j<s.far.length;j++){
      const t=s.far[j];
      t.x=rnd()<.005?NaN:(rnd()-.5)*1400;
      t.y=rnd()<.005?Infinity:(rnd()-.5)*900;
      t.hp=rnd()<.07?0:30;
    }
    assert.equal(s.threat(),reference(),'world '+i);
  }
});
