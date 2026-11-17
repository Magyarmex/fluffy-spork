'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source='nova-updates/battle-sense-v1.8.1.js';
const shipping=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(shipping.includes(source),'the tested Battle Sense overlay must be in the real shipping composition');
function harness(){
  class Game{
    constructor(){this.tanks=[];this.bullets=[];this.powerups=[];this.status='playing';}
    hasLineOfSight(){return true;}
    tankSpeed(t){return t.id===1?200:t.privateSpeed;}
  }
  const classes={CLASSES:{
    scout:{size:15,moveMult:1},
    quick:{size:15,moveMult:2}
  },lineageForClass:()=> 'gunner'};
  const modules={
    'game/engine':m=>{m.exports={Game};},
    'game/ai':m=>{m.exports={updateAI(){}};},
    'game/classes':m=>{m.exports=classes;}
  };
  const context={window:{__novaModules:modules},console,Math,Number};
  vm.runInNewContext(fs.readFileSync(path.join(root,source),'utf8'),context,{filename:source});
  const cache={};
  function load(id){
    if(cache[id])return cache[id].exports;
    const m={exports:{}};cache[id]=m;
    modules[id](m,m.exports,p=>p==='./classes'?load('game/classes'):null);
    return m.exports;
  }
  load('game/engine');load('game/ai');
  return {Game,h:context.window.__NOVA_BATTLE_SENSE_TEST__};
}
function scene(){
  const {Game,h}=harness(),g=new Game();
  const self={id:1,cls:'scout',x:0,y:0,alive:true,hp:100,maxHp:100,ai:{}};
  const rival={id:2,cls:'scout',x:200,y:0,alive:true,privateSpeed:100,ai:{}};
  g.tanks=[self,rival];
  return {g,h,self,rival,pickup:{id:7,type:'triple',x:300,y:0}};
}
for(const noTarget of [false,true]){
 test('pickup contest ignores unseen rival speed upgrades with '+(noTarget?'no':'an eligible')+' combat target',()=>{
  const {g,h,self,rival,pickup}=scene();
  if(noTarget){const contacts=[self,rival];contacts.__novaNoCombatTarget=true;g.__novaFairVisibleTanks=contacts;}
  const slow=h.resourceContest(g,self,pickup,300,{CLASSES:{scout:{size:15,moveMult:1},quick:{size:15,moveMult:2}}});
  rival.privateSpeed=1000;
  const boosted=h.resourceContest(g,self,pickup,300,{CLASSES:{scout:{size:15,moveMult:1},quick:{size:15,moveMult:2}}});
  assert.equal(boosted,slow,'private upgrades must not alter an identical public pickup race');
  assert.ok(slow>0,'a genuinely closer visible rival still contests the resource');
  rival.cls='quick';
  const publicFast=h.resourceContest(g,self,pickup,300,{CLASSES:{scout:{size:15,moveMult:1},quick:{size:15,moveMult:2}}});
  assert.ok(publicFast>slow,'a publicly faster class is legitimate tactical information');
 });
}
test('allies, covered rivals and unknown classes remain conservative',()=>{
 const {g,h,self,rival,pickup}=scene(),classes={CLASSES:{scout:{size:15,moveMult:1}}};
 g.areAllies=(a,b)=>a.team===b.team;
 self.team='blue';rival.team='blue';
 assert.equal(h.resourceContest(g,self,pickup,300,classes),0);
 rival.team='red';g.hasLineOfSight=(ax,ay,bx)=>bx!==rival.x;
 assert.equal(h.resourceContest(g,self,pickup,300,classes),0);
 g.hasLineOfSight=()=>true;rival.cls='unknown';
 const first=h.resourceContest(g,self,pickup,300,classes);
 rival.privateSpeed=900;
 assert.equal(h.resourceContest(g,self,pickup,300,classes),first);
});

test('hidden rival speed cannot flip the actual two-heal resource decision',()=>{
 const {g,h,self,rival}=scene();
 self.hp=40;
 const contested={id:11,type:'heal',x:300,y:0};
 const safer={id:12,type:'heal',x:0,y:600};
 g.powerups=[contested,safer];
 rival.privateSpeed=100;
 const slow=h.chooseResource(g,self,{CLASSES:{scout:{size:15,moveMult:1}}});
 rival.privateSpeed=1000;
 const fast=h.chooseResource(g,self,{CLASSES:{scout:{size:15,moveMult:1}}});
 assert.ok(slow&&fast,'both evaluations should find a worthwhile heal');
 assert.equal(fast.id,slow.id,'a hidden speed upgrade cannot change the selected pickup');
 assert.equal(slow.id,11,'public class baseline still permits the tactically valuable closer heal');
});
