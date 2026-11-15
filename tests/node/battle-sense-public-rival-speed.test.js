'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function boot(){
 const classes={CLASSES:{guard:{moveMult:1,size:15},scout:{moveMult:1.25,size:12}},lineageForClass:()=> 'guardian'};
 const Game=function(){};
 Game.prototype.tryFire=function(){};
 Game.prototype.updatePowerups=function(){};
 const mods={
  'game/engine':m=>{m.exports={Game};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/classes':m=>{m.exports=classes;}
 };
 const win={__novaModules:mods},ctx={window:win,console,Math};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates/battle-sense-v1.8.1.js'),'utf8'),ctx);
 const cache={};
 function req(k){if(cache[k])return cache[k].exports;const m={exports:{}};cache[k]=m;mods[k](m,m.exports,id=>id==='./classes'?req('game/classes'):null);return m.exports;}
 req('game/engine');req('game/ai');
 return {h:win.__NOVA_BATTLE_SENSE_TEST__,classes};
}
function tank(id,x,cls='guard',upgrade=0){
 return {id,x,y:0,cls,alive:true,hp:100,maxHp:100,stats:{speed:upgrade},vx:0,vy:0};
}
test('pickup contest cannot read unseen rival speed upgrades',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,220);
 const g={tanks:[self,rival],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 const p={id:5,type:'heal',x:300,y:0};
 const first=h.resourceContest(g,self,p,300,classes);
 rival.stats.speed=8;rival.perk='speed';rival.hasteT=30;
 assert.equal(h.resourceContest(g,self,p,300,classes),first);
 assert.ok(first>=0&&first<=.55);
});
test('public class mobility remains relevant without private rival stats',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,130);
 const g={tanks:[self,rival],hasLineOfSight:()=>true,tankSpeed:t=>{if(t===rival)throw Error('private read');return 124;}};
 const p={id:5,type:'heal',x:300,y:0};
 const guard=h.resourceContest(g,self,p,300,classes);
 rival.cls='scout';
 const scout=h.resourceContest(g,self,p,300,classes);
 assert.ok(scout>guard,'public faster class should be more competitive');
});
test('allies, invisible rivals and unknown class mobility remain bounded',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,220);
 const g={tanks:[self,rival],hasLineOfSight:()=>true,areAllies:()=>true,tankSpeed:()=>124};
 const p={id:5,type:'heal',x:300,y:0};
 assert.equal(h.resourceContest(g,self,p,300,classes),0);
 g.areAllies=()=>false;
 g.hasLineOfSight=()=>false;
 assert.equal(h.resourceContest(g,self,p,300,classes),0);
 g.hasLineOfSight=()=>true;
 rival.cls='unknown';
 const value=h.resourceContest(g,self,p,300,classes);
 assert.ok(Number.isFinite(value)&&value>=0&&value<=.55);
});

test('two public heal choices are invariant to unseen rival upgrades',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,120);
 self.hp=20;
 const near={id:'near',type:'heal',x:300,y:0},far={id:'far',type:'heal',x:-480,y:0};
 const g={tanks:[self,rival],powerups:[near,far],bullets:[],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 const initial=h.chooseResource(g,self,classes);
 assert.equal(initial?.id,'near');
 rival.stats.speed=8;rival.perk='speed';rival.hasteT=20;
 assert.equal(h.chooseResource(g,self,classes)?.id,'near',
  'unseen speed upgrades cannot flip the selected public healing pickup');
});

test('seeded pickup decisions ignore rival private upgrades across 1200 public scenes',()=>{
 const {h,classes}=boot();let seed=1517800;
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<1200;i++){
  const self=tank(1,0),rival=tank(2,(rnd()-.5)*900);
  rival.y=(rnd()-.5)*900;self.hp=10+rnd()*75;
  const g={tanks:[self,rival],powerups:[],bullets:[],hasLineOfSight:()=>true,
   tankSpeed:t=>{if(t===rival)throw Error('hidden rival speed read in scene '+i);return 100;}};
  for(let j=0;j<2;j++)g.powerups.push({
   id:j,type:rnd()<.5?'heal':'shield',x:(rnd()-.5)*1200,y:(rnd()-.5)*1200
  });
  const first=h.chooseResource(g,self,classes)?.id??null;
  rival.stats.speed=8;rival.perk='speed';rival.hasteT=10;
  const second=h.chooseResource(g,self,classes)?.id??null;
  assert.equal(second,first,'private rival speed altered public scene '+i);
 }
});

test('observer learns sustained visible running without private stats or teleport leaps',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,100);
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 self.ai={};const p={id:5,type:'heal',x:400,y:0};
 const baseline=h.resourceContest(g,self,p,400,classes);
 rival.stats.speed=8;g.time=.25;rival.x=145;
 h.resourceContest(g,self,p,400,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['2'].confirmed,1,'first visible sample cannot certify upgraded running');
 g.time=.5;rival.x=190;
 const learned=h.resourceContest(g,self,p,400,classes);
 const learnedWitness=self.ai.__v181RivalSpeedWitness;
 self.ai={};const classOnly=h.resourceContest(g,self,p,400,classes);
 self.ai={__v181RivalSpeedWitness:learnedWitness};
 assert.ok(learned>classOnly,'witnessed running should increase pressure at identical rival position');
 g.time=.75;rival.x=700;
 h.resourceContest(g,self,p,400,classes);
 g.time=1;rival.x=745;
 assert.ok(Number.isFinite(h.resourceContest(g,self,p,400,classes)),'teleport cannot poison speed estimate');
 g.time=3;rival.x=750;
 const stale=h.resourceContest(g,self,p,400,classes);
 assert.ok(Number.isFinite(stale),'stale witness resets safely');
});

test('witnesses are bounded, identity-scoped and reject unseen prior positions',()=>{
 const {h,classes}=boot(),self=tank(1,0);self.ai={};
 const g={time:0,tanks:[self],hasLineOfSight:()=>true,tankSpeed:()=>124};
 const p={id:'heal',type:'heal',x:500,y:0};
 for(let id=2;id<=18;id++){
  const rival=tank(id,100);g.tanks=[self,rival];g.time=id;
  h.resourceContest(g,self,p,500,classes);
 }
 assert.ok(Object.keys(self.ai.__v181RivalSpeedWitness).length<=12,'witness storage must remain bounded');
 const rival=tank(19,100);g.tanks=[self,rival];g.time=20;
 h.resourceContest(g,self,p,500,classes);
 g.time=20.25;rival.x=145;h.resourceContest(g,self,p,500,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['19'].confirmed,1);
 g.hasLineOfSight=(ax,ay,bx)=>bx!==100;
 g.time=20.5;rival.x=190;h.resourceContest(g,self,p,500,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['19'].confirmed,0,'old unseen sample must not count');
 const replacement=tank(19,190);g.tanks=[self,replacement];g.hasLineOfSight=()=>true;
 g.time=20.75;h.resourceContest(g,self,p,500,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['19'].target,replacement,'recycled id cannot reuse prior witness');
 assert.equal(self.ai.__v181RivalSpeedWitness['19'].confirmed,0);
});

test('witnessed movement inference is stable at 30 and 60 Hz observation schedules',()=>{
 const {h,classes}=boot(),scores=[];
 for(const fps of [30,60]){
  const self=tank(1,0),rival=tank(2,100);self.ai={};
  const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,tankSpeed:()=>124};
  const p={id:'heal',type:'heal',x:400,y:0};
  h.resourceContest(g,self,p,400,classes);
  for(let frame=1;frame<=fps;frame++){
   if(frame%(fps/5)!==0)continue;
   g.time=frame/fps;rival.x=100+180*g.time;
   h.resourceContest(g,self,p,400,classes);
  }
  const learned=h.resourceContest(g,self,p,400,classes);
  const witness=self.ai.__v181RivalSpeedWitness['2'];
  assert.ok(witness.confirmed>=2,'running should be witnessed at '+fps+' Hz');
  scores.push(learned);
 }
 assert.ok(Math.abs(scores[0]-scores[1])<1e-10,'same visible trajectory must give same contest pressure');
});
