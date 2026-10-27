'use strict';
// Research gate: Fair Engagement's one-target legacy view currently masks
// Battle Sense's third-party tactical geometry. Keep hidden information hidden.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const battle='nova-updates/battle-sense-v1.8.1.js';
const fair='nova-updates/fair-engagement-v1.11.2.js';
assert.ok(html.indexOf(battle)>=0&&html.indexOf(fair)>html.indexOf(battle),
 'real shipping order must load Battle Sense before Fair Engagement');
function boot(){
 class Game {
  constructor(){this.time=10;this.w=1000;this.h=800;this.cam={zoom:1};
   this.tanks=[];this.bullets=[];this.powerups=[];this.status='playing';}
  getTank(id){return this.tanks.find(t=>t.id===id)||null;}
  hasLineOfSight(){return true;}
  moveTank(){}
  tankSpeed(){return 200;}
 }
 const classes={CLASSES:{twin:{size:15},guard:{size:15},cannon:{size:15}},
  lineageForClass:cls=>cls==='guard'?'guardian':cls==='cannon'?'cannon':'gunner'};
 const mods={
  'game/engine':m=>{m.exports.Game=Game;},
  'game/ai':m=>{m.exports.updateAI=(t,g)=>{g.__legacyVisibleIds=g.tanks.map(q=>q.id);};},
  'game/classes':m=>{m.exports=classes;}
 };
 const win={__novaModules:mods};
 const ctx={window:win,console:{info(){},warn(){},error(){}},
  Math,Number,Object,Map,Set,Date,Array};
 for(const file of [battle,fair])vm.runInNewContext(
  fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
 const cache={};
 function requireModule(id){if(cache[id])return cache[id].exports;
  const m={exports:{}};cache[id]=m;
  mods[id](m,m.exports,ref=>ref==='./classes'?requireModule('game/classes'):null);
  return m.exports;
 }
 return {Game:requireModule('game/engine').Game,
  ai:requireModule('game/ai'),win};
}
function tank(id,cls,x,y){
 return {id,cls,x,y,hp:100,maxHp:100,alive:true,isPlayer:false,
  spawnShieldT:0,ai:{state:'wander',targetId:-1,__v180TargetId:-1}};
}
function scene({width=1000,cover=false}={}){
 const {Game,ai}=boot(),g=new Game();g.w=width;
 const self=tank(1,'twin',-300,0),target=tank(2,'guard',0,0),
  duelist=tank(3,'cannon',200,0);
 target.ai.__v180TargetId=duelist.id;
 // Observer witnessed the target fire east toward the other visible duelist.
 self.ai.__v181ObservedShotId=target.id;
 self.ai.__v181ObservedShotAt=9.9;
 self.ai.__v181ObservedShotAngle=0;
 g.tanks=[self,target,duelist];
 if(cover)g.hasLineOfSight=(ax,ay,bx,by)=>!(
  ax===target.x&&ay===target.y&&bx===duelist.x&&by===duelist.y);
 return {g,ai,self,target,duelist};
}
test('composed AI recognizes a legitimately perceived third-party duel',()=>{
 const {g,ai,self}=scene();
 ai.updateAI(self,g,1/30);
 assert.equal(self.ai.__v1112TargetId,2,'fairly chosen primary target is unchanged');
 assert.equal(self.ai.__v181Mode,'crossfire',
  'Battle Sense should see other genuinely perceived duelists, not just the primary target');
 assert.equal(g.tanks.length,3,'legacy AI narrowing must be restored after thinking');
 assert.equal(Object.prototype.hasOwnProperty.call(g,'__novaFairVisibleTanks'),false,
  'temporary perceived-tank snapshot must not leak beyond this AI call');
 assert.deepEqual(Array.from(g.__legacyVisibleIds),[1,2],
  'legacy target gate must still see exactly one primary rival');
});
test('offscreen third party cannot influence the composed AI',()=>{
 const {g,ai,self}=scene({width:600});
 ai.updateAI(self,g,1/30);
 assert.notEqual(self.ai.__v181Mode,'crossfire');
 assert.equal(self.ai.__v1112TargetId,2);
});
test('occluded third party cannot influence crossfire',()=>{
 const {g,ai,self}=scene({cover:true});
 ai.updateAI(self,g,1/30);
 assert.notEqual(self.ai.__v181Mode,'crossfire');
 assert.equal(self.ai.__v1112TargetId,2);
});

for(const hz of [30,60,120,240]){
 test('composed AI decompresses under three actually visible local threats at '+hz+'Hz',()=>{
  const {g,ai,self}=scene();
  self.x=0;self.hp=45;g.w=1000;g.h=800;
  const target=g.tanks[1],duelist=g.tanks[2];
  target.x=110;target.y=0;target.ai.__v180TargetId=-1;
  duelist.x=0;duelist.y=130;
  const third=tank(4,'twin',-110,0);
  g.tanks.push(third);
  ai.updateAI(self,g,1/hz);
  assert.equal(self.ai.__v181Mode,'decompress',
   'local pressure must include other perceived opponents, not only primary target');
  assert.equal(g.tanks.length,4);
  assert.equal(Object.prototype.hasOwnProperty.call(g,'__novaFairVisibleTanks'),false);
 });
}
test('covered opponents do not inflate tactical decompression pressure',()=>{
 const {g,ai,self}=scene();
 self.x=0;self.hp=45;
 const target=g.tanks[1],duelist=g.tanks[2];
 target.x=110;target.y=0;target.ai.__v180TargetId=-1;
 duelist.x=0;duelist.y=130;
 const third=tank(4,'twin',-110,0);g.tanks.push(third);
 g.hasLineOfSight=(_ax,_ay,bx,by)=>bx===110&&by===0;
 ai.updateAI(self,g,1/60);
 assert.notEqual(self.ai.__v181Mode,'decompress',
  'occluded opponents are not visible pressure');
});

test('explicit fair no-target state cannot resurrect a hidden legacy target',()=>{
 const {g,ai,self}=scene({width:180});
 self.ai.__v180TargetId=2;self.ai.targetId=2;
 ai.updateAI(self,g,1/60);
 assert.equal(self.ai.__v1112TargetId,-1);
 assert.equal(self.ai.__v181Mode,'none');
 assert.deepEqual(Array.from(g.__legacyVisibleIds),[1]);
 assert.equal(Object.prototype.hasOwnProperty.call(g,'__novaFairVisibleTanks'),false);
});

test('perceived multi-threat snapshots obey the existing bounded tactical think cadence',()=>{
 const {g,ai,self}=scene();
 let current,builds=0;
 Object.defineProperty(g,'__novaFairVisibleTanks',{configurable:true,
  get(){return current;},
  set(v){if(Array.isArray(v))builds++;current=v;}});
 for(let frame=0;frame<60;frame++){
  g.time+=1/60;
  ai.updateAI(self,g,1/60);
 }
 assert.ok(builds>=4&&builds<=10,
  'one second should create about six tactical snapshots, not sixty: '+builds);
 assert.equal(current,undefined,'original temporary value is restored');
 assert.equal(g.tanks.length,3);
});

test('legacy AI exception restores both canonical tank list and tactical snapshot',()=>{
 const {g,ai,self}=scene();
 Object.defineProperty(g,'__legacyVisibleIds',{set(){throw new Error('injected AI failure');}});
 assert.throws(()=>ai.updateAI(self,g,1/60),/injected AI failure/);
 assert.equal(g.tanks.length,3);
 assert.equal(Object.prototype.hasOwnProperty.call(g,'__novaFairVisibleTanks'),false);
});

test('private rival target plans alone do not grant crossfire knowledge',()=>{
 const {g,ai,self}=scene();
 self.ai.__v181ObservedShotId=undefined;
 self.ai.__v181ObservedShotAt=undefined;
 self.ai.__v181ObservedShotAngle=undefined;
 ai.updateAI(self,g,1/60);
 assert.notEqual(self.ai.__v181Mode,'crossfire',
  'visible tanks are not proof of a duel without witnessed firing');
});
test('witnessed fire aimed away from the duelist does not imply a duel',()=>{
 const {g,ai,self}=scene();
 self.ai.__v181ObservedShotAngle=Math.PI;
 ai.updateAI(self,g,1/60);
 assert.notEqual(self.ai.__v181Mode,'crossfire');
});
