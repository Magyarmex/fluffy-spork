'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function scene(){
 function Game(){this.bullets=[];this.tanks=[];this.time=2;this.w=320;this.h=480;this.cam={zoom:1};}
 Game.prototype.tryFire=function(t){this.bullets.push({id:100+this.bullets.length,ownerId:t.id,x:110,y:115,vx:0,vy:0,ttl:1});};
 Game.prototype.updatePowerups=function(){};
 const modules={'game/engine':m=>{m.exports={Game};},'game/ai':m=>{m.exports={updateAI(){}};}};
 const window={__novaModules:modules};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates/battle-sense-v1.8.1.js'),'utf8'),
  {window,Math,Number,Object,Array,Map,WeakMap,console:{info(){},error(){}}});
 const engine={exports:{}};
 modules['game/engine'](engine,engine.exports,()=>{throw Error('unexpected engine import');});
 const observer={id:1,teamId:7,x:0,y:0,alive:true,ai:{}};
 const ally={id:2,teamId:7,x:110,y:0,alive:true,ai:{}};
 const enemy={id:3,teamId:9,x:110,y:0,alive:true,ai:{}};
 const g=new Game();g.tanks=[observer,ally,enemy];
 g.getTank=id=>g.tanks.find(t=>t.id===id)||null;
 g.areAllies=(a,b)=>a.teamId!=null&&b.teamId!=null&&a.teamId===b.teamId;
 g.hasLineOfSight=()=>true;
 return {g,observer,ally,enemy,helper:window.__NOVA_BATTLE_SENSE_TEST__};
}
test('birth-witnessed ordinary allied projectile does not cause flank dodge',()=>{
 const {g,observer,ally,enemy,helper}=scene();
 assert.equal(helper.saferSide(g,observer,1,0),0);
 g.tryFire(ally);
 assert.equal(helper.saferSide(g,observer,1,0),0,'allied ordinary fire is not a threat');
 g.bullets=[];
 g.tryFire(enemy);
 assert.equal(helper.saferSide(g,observer,1,0),-1,'hostile fire remains a threat');
});
test('unknown, dead and recycled shooter identities remain conservative',()=>{
 const {g,observer,ally,helper}=scene();
 g.bullets=[{id:200,ownerId:2,x:110,y:115,vx:0,vy:0,ttl:1}];
 assert.equal(helper.saferSide(g,observer,1,0),-1,'unwitnessed owner must not be trusted');
 g.bullets=[];g.tryFire(ally);ally.alive=false;
 assert.equal(helper.saferSide(g,observer,1,0),-1,'dead shooter must not grant immunity');
 ally.alive=true;g.tanks=[observer,{...ally}];
 assert.equal(helper.saferSide(g,observer,1,0),-1,'recycled owner ID must not grant immunity');
});
test('special projectile hazards remain conservative even from allies',()=>{
 const {g,observer,ally,helper}=scene();
 for(const key of ['shell','splash','beam','kind']){
  g.bullets=[];g.tryFire(ally);g.bullets[0][key]=key==='splash'?60:key==='kind'?'mine':true;
  assert.equal(helper.saferSide(g,observer,1,0),-1,key+' may have nonlocal effects');
 }
});
test('birth-witnessed projectile remains threatening when owner relation is unknown',()=>{
 const {g,observer,ally,helper}=scene();
 delete observer.teamId;delete ally.teamId;
 g.bullets=[];g.tryFire(ally);
 assert.equal(helper.saferSide(g,observer,1,0),-1);
});

test('neutral or non-hostile is not affirmative proof of alliance',()=>{
 const {g,observer,ally,helper}=scene();
 delete observer.teamId;delete ally.teamId;
 delete g.areAllies;g.areHostile=()=>false;
 g.tryFire(ally);
 assert.equal(helper.saferSide(g,observer,1,0),-1,
  'neutral classification must not suppress potentially harmful fire');
});

test('birth-witnessed allied fire does not divert a critical healing pickup',()=>{
 const {g,observer,ally,enemy,helper}=scene();
 observer.hp=20;observer.maxHp=100;observer.cls='guard';
 g.w=1600;g.h=900;g.powerups=[{id:'near',type:'heal',x:600,y:0},{id:'far',type:'heal',x:620,y:0}];
 const classes={CLASSES:{guard:{size:15}}};
 assert.equal(helper.chooseResource(g,observer,classes).id,'near');
 g.tryFire(ally);Object.assign(g.bullets[0],{x:600,y:0,vx:0,vy:0});
 assert.equal(helper.chooseResource(g,observer,classes).id,'near','known harmless allied lane should not divert heal');
 g.bullets=[];g.tryFire(enemy);Object.assign(g.bullets[0],{x:600,y:0,vx:0,vy:0});
 assert.equal(helper.chooseResource(g,observer,classes).id,'far','hostile visible lane should still change heal choice');
});

test('irrelevant projectile fields do not trigger owner lookups',()=>{
 const {g,observer,helper}=scene();
 g.bullets=Array.from({length:240},(_,i)=>({id:500+i,ownerId:2,x:2000+i*2,y:1500,vx:0,vy:0,ttl:1}));
 let lookups=0;g.getTank=()=>{lookups++;return null;};
 assert.equal(helper.laneRisk(g,110,115,observer.id,observer),0);
 assert.equal(lookups,0,'only a geometrically plausible projectile may incur an owner lookup');
});

test('hostile plausible shots do not pay the recycled-owner lookup cost',()=>{
 const {g,observer,ally,enemy,helper}=scene();
 let lookups=0;
 const lookup=g.getTank;
 g.getTank=id=>{lookups++;return lookup(id);};
 g.tryFire(enemy);
 assert.ok(helper.laneRisk(g,110,115,observer.id,observer)>0,
  'hostile ordinary fire remains dangerous');
 assert.equal(lookups,0,'hostile fire needs no live owner identity verification');
 g.bullets=[];
 g.tryFire(ally);
 assert.equal(helper.laneRisk(g,110,115,observer.id,observer),0,
  'known allied fire is ignored only after live identity verification');
 assert.equal(lookups,1,'one plausible allied shot requires exactly one identity lookup');
});

test('13-bot-style dense volley resolves only plausible allied birth owners',()=>{
 const {g,observer,ally,enemy,helper}=scene();
 for(let i=0;i<200;i++)g.tryFire(i%2?ally:enemy);
 let lookups=0;
 const lookup=g.getTank;
 g.getTank=id=>{lookups++;return lookup(id);};
 const risk=helper.laneRisk(g,110,115,observer.id,observer);
 assert.ok(Math.abs(risk-120)<1e-8,
  '100 hostile stationary rounds must retain their full threat score');
 assert.equal(lookups,100,
  '100 allied rounds need identity checks; 100 hostile rounds must not');
});
