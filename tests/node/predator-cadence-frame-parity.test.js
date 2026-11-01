'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

/* The live Predator module, not a copied scheduler: a static isolated AI
 * cohort exposes decision cadence without confounding movement or collisions. */
function boot(){
 const classes={CLASSES:{basic:{size:14,ability:null}},lineageForClass:()=> 'gunner'};
 function Game(){this.time=0;this.tanks=[];this.bullets=[];this.shapes=[];}
 Game.prototype.spawnAITank=function(){this.tanks.push({id:this.tanks.length+1,
  cls:'basic',x:0,y:0,hp:100,maxHp:100,alive:true,level:20,
  ai:{state:'wander',thinkT:0,targetId:-1,aggression:.6,isElite:false}});};
 const modules={
  'game/engine':function(m){m.exports={Game};},
  'game/ai':function(m){m.exports={updateAI:()=>{}};}
 };
 const window={__novaModules:modules};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,
  '../../nova-updates/predator-doctrine-v1.8.0.js'),'utf8'),
  {window,console:{info(){},error(){}},Math,Number,Object,Array,Map,Set});
 const engine={exports:{}};modules['game/engine'](engine);
 const ai={exports:{}};modules['game/ai'](ai,ai.exports,()=>classes);
 return{Game:engine.exports.Game,updateAI:ai.exports.updateAI,
  director:window.__NOVA_AI_DIRECTOR__,reaction:window.__NOVA_PREDATOR_TEST__.reactionFor};
}
function run(hz,seconds=8,profile={}){
 const b=boot(),g=new b.Game();for(let i=0;i<8;i++)g.spawnAITank();
 for(const t of g.tanks){Object.assign(t,profile.tank||{});Object.assign(t.ai,profile.ai||{});}
 const events=[];
 for(let step=1;step<=hz*seconds;step++){
  g.time=step/hz;
  for(const t of g.tanks){const prior=b.director.plans;
   b.updateAI(t,g,1/hz);
   if(b.director.plans!==prior)events.push({id:t.id,frame:step,time:g.time});
  }
 }
 return{events,counts:g.tanks.map(t=>events.filter(e=>e.id===t.id).length),
  tanks:g.tanks,react:b.reaction};
}
function legacyEvents(t,react,hz,seconds){
 const events=[];let remaining=.025+(t.id%6)*.013;
 for(let step=1;step<=hz*seconds;step++){
  remaining-=1/hz;
  if(remaining<=0){events.push(step);remaining=react(t,t.ai);}
 }
 return events;
}
test('AI planner preserves the previous 60 Hz reaction-frame schedule exactly',()=>{
 const result=run(60);
 for(const t of result.tanks){
  const actual=result.events.filter(e=>e.id===t.id).map(e=>e.frame);
  assert.deepEqual(actual,legacyEvents(t,result.react,60,8),`tank ${t.id}`);
 }
});
test('120 Hz AI does not think faster than the established 60 Hz schedule',()=>{
 const thirty=run(30),sixty=run(60),high=run(120);
 assert.deepEqual(high.counts,sixty.counts);
 assert.ok(thirty.counts.every((n,i)=>n<=sixty.counts[i]));
 assert.ok(sixty.events.length>300);
});
test('30 and 120 Hz planning stays within one low-FPS frame of 60 Hz',()=>{
 const a=run(30),b=run(60),c=run(120);
 for(const t of b.tanks)for(const alt of [a,c]){
  const ref=b.events.filter(e=>e.id===t.id),got=alt.events.filter(e=>e.id===t.id);
  assert.ok(got.length<=ref.length);
  if(alt===a)continue; /* 30 Hz cannot always meet the 60 Hz cadence without violating the reaction floor. */
  for(let i=0;i<ref.length;i++)assert.ok(Math.abs(ref[i].time-got[i].time)<=1/30+1e-8,
   `tank ${t.id} plan ${i}: ${ref[i].time} vs ${got[i].time}`);
 }
});
test('reaction floor holds for elite, novice and expert bots at every frame rate',()=>{
 for(const level of [1,20,50])for(const isElite of [false,true])
 for(const aggression of [0,.6,1.25]){
  const profile={tank:{level},ai:{isElite,aggression}};
  const a=run(30,4,profile),b=run(60,4,profile),c=run(120,4,profile);
  for(const t of b.tanks){
   const min=b.react(t,t.ai);
   for(const result of [a,b,c]){
    const events=result.events.filter(e=>e.id===t.id);
    for(let i=1;i<events.length;i++)assert.ok(
     events[i].time-events[i-1].time>=min-1e-8,
     `early AI replan: level=${level} elite=${isElite} aggression=${aggression} id=${t.id}`);
   }
  }
  assert.deepEqual(c.counts,b.counts,'high refresh must preserve 60 Hz planning counts');
  for(const t of a.tanks){
   assert.deepEqual(a.events.filter(e=>e.id===t.id).map(e=>e.frame),
    legacyEvents(t,a.react,30,4),'30 Hz planning must preserve existing minimum reaction delay');
  }
 }
});
test('90/144/240 Hz displays cannot exceed the 60 Hz AI planning budget',()=>{
 const reference=run(60,8);
 for(const hz of [90,144,240]){
  const result=run(hz,8);
  for(let i=0;i<result.counts.length;i++)assert.ok(
   result.counts[i]<=reference.counts[i],
   `high refresh ${hz} Hz gained extra plans for bot ${i+1}`);
 }
});
