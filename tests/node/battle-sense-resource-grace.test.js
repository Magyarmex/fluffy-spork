'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/battle-sense-v1.8.1.js'),'utf8');
function scene(){
 function Game(){}
 const ai={updateAI(){}};
 const mods={'game/engine':m=>{m.exports={Game};},'game/ai':m=>{m.exports=ai;}};
 const w={__novaModules:mods};
 vm.runInNewContext(source,{window:w,console:{info(){},error(){}}});
 const m={exports:{}};
 mods['game/ai'](m,m.exports,()=>({CLASSES:{guard:{size:15}},lineageForClass:()=> 'guardian'}));
 const t={id:3,cls:'guard',x:0,y:0,hp:10,maxHp:100,alive:true,ai:{}};
 const g={time:10,tanks:[t],powerups:[{id:'heal',type:'heal',x:300,y:0}],bullets:[],
  hasLineOfSight:()=>true,novaBattlefieldWaypoint:()=>null,tankSpeed:()=>114.08,moveTank(){}};
 return{g,t,ai:m.exports};
}
test('quiet healing continuity is bounded and cannot refresh itself',()=>{
 const {g,t,ai}=scene();
 ai.updateAI(t,g,1/60);
 assert.equal(t.ai.__v181Mode,'resource');
 assert.equal(t.ai.__v181ResourceAt,10);
 g.hasLineOfSight=()=>false;
 g.time=10.4;t.ai.__v181Think=0;ai.updateAI(t,g,1/60);
 assert.equal(t.ai.__v181Mode,'resource','short pricing gap should retain prior heal');
 assert.equal(t.ai.__v181ResourceAt,10,'fallback must not renew the deadline');
 g.time=10.8;t.ai.__v181Think=0;ai.updateAI(t,g,1/60);
 assert.equal(t.ai.__v181Mode,'none','expired grace must abandon uncertified route');
});
test('healing continuity cancels on projectile presence or removed heal',()=>{
 for(const kind of ['bullet','removed','shield','healthy']){
  const {g,t,ai}=scene();ai.updateAI(t,g,1/60);
  g.hasLineOfSight=()=>false;g.time=10.3;t.ai.__v181Think=0;
  if(kind==='bullet')g.bullets=[{id:1,x:100,y:0}];
  if(kind==='removed')g.powerups=[];
  if(kind==='shield')g.powerups[0].type='shield';
  if(kind==='healthy')t.hp=90;
  ai.updateAI(t,g,1/60);
  assert.equal(t.ai.__v181Mode,'none',kind);
 }
});
