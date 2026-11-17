'use strict';
// Research integration guard: Battle Sense selection and Terrain Intelligence
// movement must agree on critical-heal horizon. Neither owner is changed here.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function scene(){
 function Game(){}
 Game.prototype.tryFire=function(){};
 Game.prototype.updatePowerups=function(){};
 Game.prototype.novaBattlefieldWaypoint=function(x,y,gx,gy){return{x:gx,y:gy};};
 Game.prototype.moveTank=function(t,vx,vy,dt){
  return this.novaBattlefieldWaypoint(t.x,t.y,t.x+100,t.y,23,t.id);
 };
 const classes={CLASSES:{guard:{moveMult:.92,size:15}},
  lineageForClass:()=> 'guardian'};
 const mods={
  'game/engine':m=>{m.exports={Game};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/classes':m=>{m.exports=classes;}
 };
 const win={__novaModules:mods};
 const root=path.resolve(__dirname,'../..');
 for(const file of ['battle-sense-v1.8.1.js','terrain-intelligence-v1.10.2.js']){
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
   {window:win,Math,Number,Object,Array,console:{info(){},error(){}}},{filename:file});
 }
 const cache={};
 function req(key){
  if(cache[key])return cache[key].exports;
  const m={exports:{}};cache[key]=m;
  mods[key](m,m.exports,id=>id==='./classes'?req('game/classes'):null);
  return m.exports;
 }
 const g=new (req('game/engine').Game)();
 req('game/ai');
 g.time=1;g.hasLineOfSight=()=>true;g.isTerrainSafe=()=>true;
 g.getTank=()=>null;g.bullets=[];
 const tank={id:7,cls:'guard',x:0,y:0,hp:10,maxHp:100,
  alive:true,isPlayer:false,stats:{speed:0},
  ai:{targetId:-1,__v172LastSeenAt:null,__v172LastSeenId:-1,
   __v181Mode:'resource',__v181BiasW:1.05,__v181ResourceId:'heal'}};
 g.tanks=[tank];
 return{g,tank,classes,choose:win.__NOVA_BATTLE_SENSE_TEST__.chooseResource};
}

test('critical-heal selection and exact-goal movement agree at the 760-unit boundary',()=>{
 const {g,tank,classes,choose}=scene();
 const heal={id:'heal',type:'heal',x:760,y:0};
 g.powerups=[heal];
 assert.equal(choose(g,tank,classes)?.id,'heal');
 assert.equal(g.moveTank(tank,100,0,1/60).x,760);
 assert.equal(g.__v1102RouteContext,undefined);
 heal.x=761;
 assert.equal(choose(g,tank,classes),null,
  'Battle Sense must not select a heal outside its current horizon');
 assert.equal(g.moveTank(tank,100,0,1/60).x,100,
  'Terrain Intelligence must not claim a distant exact-goal hint');
 assert.equal(g.__v1102RouteContext,undefined);
});

test('critical heal beyond horizon remains an explicit future integration gate',()=>{
 const {g,tank,classes,choose}=scene();
 g.powerups=[{id:'heal',type:'heal',x:850,y:0}];
 assert.equal(choose(g,tank,classes),null);
 assert.equal(g.moveTank(tank,100,0,1/30).x,100);
 // If a future policy expands only the selection radius, this paired test
 // must be updated to demand an exact-goal route from the movement owner too.
});
