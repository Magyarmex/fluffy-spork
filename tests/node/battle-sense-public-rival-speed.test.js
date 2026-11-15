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
