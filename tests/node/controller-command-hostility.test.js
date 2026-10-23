'use strict';
// Controller Command Weave must not stamp or autonomously pressure allied tanks
// or allied drones. Exercise the actual module wrapper with test-only hooks.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const raw=fs.readFileSync(path.join(__dirname,
  '../../nova-updates/controller-command-weave-v1.10.0.js'),'utf8');
const a='  function stampAim(g,owner){';
const b='  function planAIControllers(g){';
const c='  function steerToward(g,d,x,y,speed,dt){';
for(const marker of [a,b,c])assert.equal(raw.split(marker).length,2,'unique hook: '+marker);
const source=raw.replace(a,
  '  window.__testCommandHostile=commandHostile;window.__testAimStampTarget=aimStampTarget;\n'+a)
  .replace(b,'  window.__testBestObservedTank=bestObservedTank;\n'+b)
  .replace(c,'  window.__testHostileDroneNear=hostileDroneNear;\n'+c);

function boot(){
 class Game{
  constructor(){this.tanks=[];this.drones=[];this.time=7;this.tankById=new Map();}
  getTank(id){return this.tankById.get(id)||null;}
  updateDrones(){}
 }
 const mods={'game/engine':m=>{m.exports.Game=Game;}};
 const win={__novaModules:mods};
 const document={addEventListener(){}};
 vm.runInNewContext(source,{window:win,document,console:{info(){},warn(){},error(){}},
   Math,Map,Set,Date,Object,Array,WeakMap,Number},
   {filename:'controller-command-weave-v1.10.0.js'});
 const m={exports:{}};
 mods['game/engine'](m,m.exports,()=>({CLASSES:{carrier:{droneLeash:650}}}));
 const g=new m.exports.Game();
 const owner={id:1,kind:'tank',cls:'carrier',isPlayer:true,alive:true,
   team:'blue',x:0,y:0,angle:0,swarmT:0};
 const ally={id:2,kind:'tank',cls:'carrier',alive:true,team:'blue',
   x:40,y:0,spawnShieldT:0};
 const enemy={id:3,kind:'tank',cls:'carrier',alive:true,team:'red',
   x:80,y:0,spawnShieldT:0};
 g.player=owner;g.tanks=[owner,ally,enemy];
 g.tankById=new Map(g.tanks.map(t=>[t.id,t]));
 g.areAllies=(x,y)=>x.team===y.team;
 g.areHostile=(x,y)=>x.team!==y.team;
 g.hasLineOfSight=()=>true;
 g.input={aim:{active:false},mouseActive:false};
 return{g,owner,ally,enemy,h:win};
}
test('human CMD aim stamp skips closer allied tank and selects hostile',()=>{
 const {g,owner,enemy,h}=boot();
 assert.equal(h.__testAimStampTarget(g,owner),enemy);
});
test('human CMD aim stamp never designates an ally when no enemy is present',()=>{
 const {g,owner,ally,h}=boot();
 g.tanks=[owner,ally];
 assert.equal(h.__testAimStampTarget(g,owner),null);
});
test('AI command planner rejects a cached ally and selects observed enemy',()=>{
 const {g,owner,ally,enemy,h}=boot();
 assert.equal(h.__testBestObservedTank(g,owner,ally),enemy);
});
test('AI command planner does not select an ally as fallback',()=>{
 const {g,owner,ally,h}=boot();
 g.tanks=[owner,ally];
 assert.equal(h.__testBestObservedTank(g,owner,null),null);
});
test('AI defensive peel does not classify allied drones as hostile',()=>{
 const {g,owner,ally,enemy,h}=boot();
 const friendly={id:10,ownerId:ally.id,hp:20,x:20,y:0};
 const hostile={id:11,ownerId:enemy.id,hp:20,x:80,y:0};
 g.drones=[friendly,hostile];
 assert.equal(h.__testHostileDroneNear(g,owner,250),hostile);
 g.drones=[friendly];
 assert.equal(h.__testHostileDroneNear(g,owner,250),null);
});
test('stale manual CMD designation is released when target becomes allied',()=>{
 const {g,owner,enemy}=boot();
 owner.__novaCommandWeave={active:true,mode:'target',targetId:enemy.id,x:enemy.x,y:enemy.y};
 enemy.team='blue';
 g.updateDrones(.016);
 assert.equal(owner.__novaCommandWeave.mode,'point');
 assert.equal(owner.__novaCommandWeave.targetId,-1);
});
test('legitimate hostile manual CMD designation remains active',()=>{
 const {g,owner,enemy}=boot();
 owner.__novaCommandWeave={active:true,mode:'target',targetId:enemy.id,x:0,y:0};
 g.updateDrones(.016);
 assert.equal(owner.__novaCommandWeave.mode,'target');
 assert.equal(owner.__novaCommandWeave.targetId,enemy.id);
 assert.equal(owner.__novaCommandWeave.x,enemy.x);
});
test('teamId metadata fallback rejects allies without relation APIs',()=>{
 const {g,owner,ally,enemy,h}=boot();
 delete g.areAllies;delete g.areHostile;
 for(const t of [owner,ally,enemy]){t.teamId=t.team==='blue'?1:2;delete t.team;}
 assert.equal(h.__testAimStampTarget(g,owner),enemy);
 assert.equal(h.__testBestObservedTank(g,owner,ally),enemy);
});
test('FFA without team metadata preserves original targeting',()=>{
 const {g,owner,ally,enemy,h}=boot();
 delete g.areAllies;delete g.areHostile;
 for(const t of [owner,ally,enemy])delete t.team;
 assert.equal(h.__testAimStampTarget(g,owner),ally);
 assert.equal(h.__testBestObservedTank(g,owner,ally),ally);
});
test('explicit non-hostility vetoes all autonomous CMD targets',()=>{
 const {g,owner,h}=boot();
 g.areAllies=()=>false;g.areHostile=()=>false;
 assert.equal(h.__testAimStampTarget(g,owner),null);
 assert.equal(h.__testBestObservedTank(g,owner,null),null);
});
