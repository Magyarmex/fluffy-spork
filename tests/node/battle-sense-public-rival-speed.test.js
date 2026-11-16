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
 return {h:win.__NOVA_BATTLE_SENSE_TEST__,classes,win,updateAI:req('game/ai').updateAI};
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
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,55);
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 self.ai={};const p={id:5,type:'heal',x:400,y:0};
 const baseline=h.resourceContest(g,self,p,400,classes);
 rival.stats.speed=8;g.time=.25;rival.x=100;
 h.resourceContest(g,self,p,400,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['2'].confirmed,1,'first visible sample cannot certify upgraded running');
 g.time=.5;rival.x=145;
 h.resourceContest(g,self,p,400,classes);
 g.time=.75;rival.x=190;
 const learned=h.resourceContest(g,self,p,400,classes);
 const learnedWitness=self.ai.__v181RivalSpeedWitness;
 self.ai={};const classOnly=h.resourceContest(g,self,p,400,classes);
 self.ai={__v181RivalSpeedWitness:learnedWitness};
 assert.ok(learned>classOnly,'witnessed running should increase pressure at identical rival position');
 g.time=1;rival.x=700;
 h.resourceContest(g,self,p,400,classes);
 g.time=1.25;rival.x=745;
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
 assert.ok(Object.keys(self.ai.__v181RivalSpeedWitness).length<=13,'witness storage must remain bounded to the 13 possible rivals');
 const rival=tank(19,100);g.tanks=[self,rival];g.time=20;
 h.resourceContest(g,self,p,500,classes);
 g.time=20.25;rival.x=145;h.resourceContest(g,self,p,500,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['19'].confirmed,1);
 g.hasLineOfSight=(ax,ay,bx)=>bx!==145;
 g.time=20.5;rival.x=190;h.resourceContest(g,self,p,500,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['19'].confirmed,0,'old unseen sample must not count');
 const replacement=tank(19,190);g.tanks=[self,replacement];g.hasLineOfSight=()=>true;
 g.time=20.75;h.resourceContest(g,self,p,500,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['19'].target,replacement,'recycled id cannot reuse prior witness');
 assert.equal(self.ai.__v181RivalSpeedWitness['19'].confirmed,0);
 assert.doesNotThrow(()=>JSON.stringify(self),'witness identity must not create a serialization cycle');
 assert.equal(Object.hasOwn(self.ai.__v181RivalSpeedWitness['19'],'target'),true);
 assert.equal(JSON.stringify(self).includes('__v181RivalSpeedWitness'),false,'ephemeral observations must not enter persisted AI state');
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
  assert.ok(witness.confirmed>=3,'sustained running should be witnessed at '+fps+' Hz');
  scores.push(learned);
 }
 assert.ok(Math.abs(scores[0]-scores[1])<1e-10,'same visible trajectory must give same contest pressure');
});

test('single impulse cannot certify sustained running; class evolution resets witness',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,100);self.ai={};
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,tankSpeed:()=>124};
 const p={id:'heal',type:'heal',x:400,y:0};
 h.resourceContest(g,self,p,400,classes);
 g.time=.2;rival.x=136;h.resourceContest(g,self,p,400,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['2'].confirmed,1);
 g.time=.4;rival.x=136;h.resourceContest(g,self,p,400,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['2'].confirmed,0,
  'one knockback-like displacement must not count as sustained speed');
 g.time=.6;rival.x=172;h.resourceContest(g,self,p,400,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['2'].confirmed,1);
 rival.cls='scout';g.time=.8;rival.x=208;h.resourceContest(g,self,p,400,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['2'].confirmed,0,
  'visible class evolution must reset the old mobility witness');
});

test('observer sampling does not starve at 20–120 Hz and legal AI think cadences',()=>{
 const {h,classes}=boot();
 for(const fps of [20,30,40,60,90,120])for(const think of [.16,.178,.196,.214,.232]){
  const self=tank(1,0),rival=tank(2,100);self.ai={};
  const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,tankSpeed:()=>124};
  const p={id:'heal',type:'heal',x:400,y:0};
  h.resourceContest(g,self,p,400,classes);
  let next=0;
  for(let frame=1;frame<=fps*4;frame++){
   const time=frame/fps;
   if(time+1e-9<next)continue;
   next=time+think;g.time=time;rival.x=100+180*time;
   h.resourceContest(g,self,p,400,classes);
  }
  const w=self.ai.__v181RivalSpeedWitness['2'];
  assert.ok(w?.confirmed>=3,
   'valid sustained movement must be witnessed at '+fps+' Hz and think '+think);
 }
});

test('previously off-viewport position cannot certify a speed witness after re-entry',()=>{
 const {h,classes,win}=boot(),self=tank(1,0),rival=tank(2,100);self.ai={};
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,tankSpeed:()=>124};
 const p={id:'heal',type:'heal',x:400,y:0};
 let minVisible=0;
 win.__NOVA_FAIR_ENGAGEMENT__={inGameplayViewport:()=>true,
  inGameplayWorldPoint:(_g,_observer,x)=>x>=minVisible};
 h.resourceContest(g,self,p,400,classes);
 g.time=.2;rival.x=136;h.resourceContest(g,self,p,400,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['2'].confirmed,1);
 minVisible=150;g.time=.4;rival.x=172;
 h.resourceContest(g,self,p,400,classes);
 assert.equal(self.ai.__v181RivalSpeedWitness['2'].confirmed,0,
  'prior offscreen endpoint must invalidate consecutive speed evidence');
});

test('relay-only offscreen rival cannot provide a movement-speed witness',()=>{
 const {h,classes,win}=boot(),self=tank(1,0),rival=tank(2,100);self.ai={};
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,tankSpeed:()=>124};
 const p={id:'heal',type:'heal',x:400,y:0};
 win.__NOVA_FAIR_ENGAGEMENT__={inGameplayViewport:()=>false};
 h.resourceContest(g,self,p,400,classes);
 for(let i=1;i<=3;i++){g.time=i*.2;rival.x=100+36*i;h.resourceContest(g,self,p,400,classes);}
 assert.equal(self.ai.__v181RivalSpeedWitness,undefined,
  'relay-only information cannot certify exact movement');
 win.__NOVA_FAIR_ENGAGEMENT__.inGameplayViewport=()=>true;
 h.resourceContest(g,self,p,400,classes);
 g.time=.8;rival.x=244;h.resourceContest(g,self,p,400,classes);
 g.time=1;rival.x=280;h.resourceContest(g,self,p,400,classes);
 g.time=1.2;rival.x=316;h.resourceContest(g,self,p,400,classes);
 assert.ok(self.ai.__v181RivalSpeedWitness['2'].confirmed>=3,
  'directly visible movement may be learned after relay-only observations');
});

test('one early speed spike cannot inflate a three-interval witnessed race',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,100);
 self.ai={};
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 const p={id:'heal',type:'heal',x:400,y:0};
 h.resourceContest(g,self,p,400,classes);
 const baseline=124;
 for(const [i,mult] of [1.64,1.05,1.05].entries()){
  g.time=(i+1)*.2;
  rival.x+=baseline*mult*.2;
  h.resourceContest(g,self,p,400,classes);
 }
 const witness=self.ai.__v181RivalSpeedWitness['2'];
 assert.equal(witness.confirmed,3,'all three intervals must count');
 assert.ok(witness.fast<=baseline*1.051,
  'certified speed must be bounded by the slowest sustained interval, not the impulse peak');
 assert.ok(witness.fast>=baseline*1.049);
});

test('rolling witness can relearn sustained acceleration after three slower intervals',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,100);
 self.ai={};
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 const p={id:'heal',type:'heal',x:400,y:0};
 h.resourceContest(g,self,p,400,classes);
 for(let i=1;i<=6;i++){
  g.time=i*.2;rival.x+=124*(i<=3?1.05:1.45)*.2;
  h.resourceContest(g,self,p,400,classes);
 }
 const w=self.ai.__v181RivalSpeedWitness['2'];
 assert.equal(w.confirmed,3,'witness retains exactly the last three qualifying intervals');
 assert.equal(w.samples.length,3,'speed history remains bounded');
 assert.ok(w.fast>124*1.44&&w.fast<124*1.46,
  'later sustained visible acceleration must replace the older slower samples');
});

test('one slow witness interval does not erase two sustained fast intervals',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,100);
 self.ai={};
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 const p={id:'heal',type:'heal',x:400,y:0};
 h.resourceContest(g,self,p,400,classes);
 for(const [i,mult] of [1.45,1.05,1.45].entries()){
  g.time=(i+1)*.2;rival.x+=124*mult*.2;
  h.resourceContest(g,self,p,400,classes);
 }
 const w=self.ai.__v181RivalSpeedWitness['2'];
 assert.equal(w.confirmed,3);
 assert.ok(w.fast>124*1.44&&w.fast<124*1.46,
  'median should preserve two matching fast windows despite one slower interval');
});

test('decorative War Room AI does not build combat speed witnesses',()=>{
 const {updateAI}=boot(),self=tank(1,0),rival=tank(2,100);
 self.ai={};
 const g={time:0,tanks:[self,rival],powerups:[],bullets:[],
  __novaDecorativeWorld:true,hasLineOfSight:()=>true,tankSpeed:()=>124};
 for(let i=0;i<=5;i++){
  g.time=i*.2;rival.x=100+180*g.time;updateAI(self,g,.2);
 }
 assert.equal(self.ai.__v181RivalSpeedWitness,undefined,
  'decorative lobby battles must not pay for persistent player-match speed inference');
});

test('planning observes visible rivals before any pickup exists',()=>{
 const {h,classes,updateAI}=boot(),self=tank(1,0),rival=tank(2,-100);
 self.ai={};const g={time:0,tanks:[self,rival],powerups:[],bullets:[],
  hasLineOfSight:()=>true,tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 for(let i=0;i<=4;i++){
  g.time=i*.2;rival.x=-100+180*g.time;
  updateAI(self,g,.2);
 }
 const w=self.ai.__v181RivalSpeedWitness?.['2'];
 assert.ok(w?.confirmed>=3,'visible rival motion must be learned without a pickup');
 assert.ok(w.fast>175&&w.fast<185,'witness must learn the public 180-unit/s displacement');
 const p={id:'heal',type:'heal',x:400,y:0};
 const witnessed=h.resourceContest(g,self,p,400,classes);
 const saved=self.ai;self.ai={};
 const classOnly=h.resourceContest(g,self,p,400,classes);
 self.ai=saved;
 assert.ok(witnessed>classOnly,
  'a newly spawned pickup should use motion already witnessed during ordinary combat');
});

test('one sub-baseline visible slowdown retains two fast windows without certifying a lone impulse',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,100);
 self.ai={};
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 const p={id:'heal',type:'heal',x:400,y:0};
 h.resourceContest(g,self,p,400,classes);
 for(const [i,mult] of [1.50,.95,1.48].entries()){
  g.time=(i+1)*.2;rival.x+=124*mult*.2;
  h.resourceContest(g,self,p,400,classes);
 }
 const w=self.ai.__v181RivalSpeedWitness['2'];
 assert.equal(w.confirmed,3,'a nonzero slower visible interval remains in the rolling window');
 assert.ok(w.fast>124*1.47&&w.fast<124*1.49,
  'two sustained fast observations survive one short slowdown');
 assert.equal(w.samples.length,3,'bounded witness history remains three intervals');
 self.ai={};rival.x=100;g.time=2;
 h.resourceContest(g,self,p,400,classes);
 for(const [i,mult] of [2.2,.95,.95].entries()){
  g.time=2+(i+1)*.2;rival.x+=124*mult*.2;
  h.resourceContest(g,self,p,400,classes);
 }
 const isolated=self.ai.__v181RivalSpeedWitness['2'];
 assert.equal(isolated.confirmed,3);
 assert.ok(isolated.fast<=124*1.001,
  'one high impulse and two slow intervals cannot certify upgraded speed');
});

test('near-stationary collision jitter breaks speed evidence instead of preserving two fast samples',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,100);
 self.ai={};
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 const p={id:'heal',type:'heal',x:400,y:0};
 h.resourceContest(g,self,p,400,classes);
 for(const [i,mult] of [1.5,.01,1.48].entries()){
  g.time=(i+1)*.2;rival.x+=124*mult*.2;
  h.resourceContest(g,self,p,400,classes);
 }
 const w=self.ai.__v181RivalSpeedWitness['2'];
 assert.equal(w.confirmed,1,'near-stop must clear old fast evidence');
 assert.equal(w.samples.length,1,'only the post-jitter sample may survive');
});

test('witnessed rival running can change an actual two-heal choice at identical visible positions',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,-8);
 self.hp=20;self.ai={};
 const a={id:'near',type:'heal',x:400,y:0};
 const b={id:'safe',type:'heal',x:-540,y:0};
 const g={time:0,tanks:[self,rival],powerups:[a,b],bullets:[],
  hasLineOfSight:()=>true,tankSpeed:t=>{
   if(t===rival)throw Error('private rival speed read');return 124;
  }};
 h.resourceContest(g,self,a,400,classes);
 for(let i=1;i<=3;i++){
  g.time=i*.2;rival.x=-8+180*g.time;
  h.resourceContest(g,self,a,400,classes);
 }
 assert.ok(self.ai.__v181RivalSpeedWitness['2'].confirmed>=3);
 const witnessed=h.chooseResource(g,self,classes)?.id;
 const saved=self.ai;self.ai={};
 const classOnly=h.chooseResource(g,self,classes)?.id;
 self.ai=saved;
 assert.equal(classOnly,'near','public class baseline favors the nearer heal');
 assert.equal(witnessed,'safe','witnessed fast rival can justify an alternate uncontested heal');
});

test('three witnessed legal haste-speed intervals can exceed the old 1.65x ceiling',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,100);
 self.ai={};
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 const p={id:'heal',type:'heal',x:500,y:0};
 h.resourceContest(g,self,p,500,classes);
 for(let i=1;i<=3;i++){
  g.time=i*.2;rival.x=100+124*2.2*g.time;
  h.resourceContest(g,self,p,500,classes);
 }
 const w=self.ai.__v181RivalSpeedWitness['2'];
 assert.equal(w.confirmed,3);
 assert.ok(w.fast>124*2.19&&w.fast<124*2.21,
  'sustained publicly witnessed speed must not be hidden by an overly low impulse ceiling');
});
test('one high-speed impulse still cannot certify a haste-speed rival',()=>{
 const {h,classes}=boot(),self=tank(1,0),rival=tank(2,100);
 self.ai={};
 const g={time:0,tanks:[self,rival],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t===rival)throw Error('private rival speed read');return 124;}};
 const p={id:'heal',type:'heal',x:500,y:0};
 h.resourceContest(g,self,p,500,classes);
 for(const [i,mult] of [2.2,1.05,1.05].entries()){
  g.time=(i+1)*.2;rival.x+=124*mult*.2;
  h.resourceContest(g,self,p,500,classes);
 }
 const w=self.ai.__v181RivalSpeedWitness['2'];
 assert.equal(w.confirmed,3);
 assert.ok(w.fast<124*1.06,
  'median must reject one high impulse despite the broader legal-speed ceiling');
});

test('full 14-tank arena retains speed witnesses for all 13 visible rivals',()=>{
 const {h,classes}=boot(),self=tank(1,0);self.ai={};
 const rivals=Array.from({length:13},(_,i)=>tank(i+2,90+i*8));
 const g={time:0,tanks:[self,...rivals],hasLineOfSight:()=>true,
  tankSpeed:t=>{if(t!==self)throw Error('private rival speed read');return 124;}};
 const p={id:'heal',type:'heal',x:600,y:0};
 h.resourceContest(g,self,p,600,classes);
 for(let i=1;i<=3;i++){
  g.time=i*.2;
  for(const rival of rivals)rival.x+=36;
  h.resourceContest(g,self,p,600,classes);
 }
 const witnesses=self.ai.__v181RivalSpeedWitness;
 assert.equal(Object.keys(witnesses).length,13,
  '14-tank cap permits 13 rivals; a 12-entry cache evicts every rival in a fixed iteration');
 for(const rival of rivals)
  assert.ok(witnesses[String(rival.id)]?.confirmed>=3,
   'each continuously observed rival must learn without round-robin eviction: '+rival.id);
});

test('planning-tick rival snapshot is ephemeral, identity-bound and reused across pickup contests',()=>{
 const {h,classes,updateAI}=boot(),self=tank(1,0),rival=tank(2,100);
 self.ai={};self.hp=20;
 const g={time:0,tanks:[self,rival],powerups:[],bullets:[],hasLineOfSight:()=>true,tankSpeed:()=>124};
 updateAI(self,g,.2);
 const snap=self.ai.__v181RivalSpeedSnapshot;
 assert.ok(snap&&snap.speeds[1]?.target===rival,'planning should sample the visible rival independently of pickups');
 assert.equal(Object.keys(self.ai).includes('__v181RivalSpeedSnapshot'),false,'snapshot must never be serialized');
 assert.doesNotThrow(()=>JSON.stringify(self));
 const p={id:'heal',type:'heal',x:400,y:0};
 const first=h.resourceContest(g,self,p,400,classes);
 const original=snap.speeds[1].speed;
 snap.speeds[1].speed=original*1.5;
 const cached=h.resourceContest(g,self,p,400,classes);
 assert.ok(cached>=first,'same-tick contest should reuse witnessed public speed');
 g.time=.2;
 const expired=h.resourceContest(g,self,p,400,classes);
 assert.equal(expired,first,'next-tick contest must not use stale snapshot');
 g.time=0;rival.cls='scout';
 assert.ok(Number.isFinite(h.resourceContest(g,self,p,400,classes)),'class change must invalidate speed certificate');
 g.areAllies=()=>true;
 assert.equal(h.resourceContest(g,self,p,400,classes),0,'same-tick allegiance change must remain fair');
 g.areAllies=()=>false;rival.cls='guard';
 g.cam={x:0,y:0,zoom:1};
 assert.equal(h.resourceContest(g,self,p,400,classes),first,'new camera must invalidate cached visibility');
 g.cam=undefined;self.x=1;
 assert.ok(Number.isFinite(h.resourceContest(g,self,p,400,classes)),'observer movement must invalidate cached visibility');
 self.x=0;g.tanks=[self,tank(2,100)];
 assert.equal(h.resourceContest(g,self,p,400,classes),first,'replacement roster must invalidate cached identity');
});

test('planning snapshot removes redundant rival visibility probes across pickup contests',()=>{
 const {h,classes,updateAI}=boot(),self=tank(1,0),rival=tank(2,120);
 self.ai={};self.hp=20;let probes=0;
 const g={time:0,tanks:[self,rival],powerups:[],bullets:[],
  hasLineOfSight:()=>{probes++;return true;},tankSpeed:()=>124};
 updateAI(self,g,.2);
 const p={id:'heal',type:'heal',x:400,y:0};
 probes=0;
 const cached=h.resourceContest(g,self,p,400,classes);
 const cachedProbes=probes;
 delete self.ai.__v181RivalSpeedSnapshot;
 probes=0;
 const uncached=h.resourceContest(g,self,p,400,classes);
 assert.equal(cached,uncached,'optimization cannot change a same-scene contest');
 assert.ok(cachedProbes<probes,'certified visible rival should not need a second LOS probe per pickup');
});

test('decorative War Room planning does not allocate rival speed snapshots',()=>{
 const {updateAI}=boot(),self=tank(1,0),rival=tank(2,100);
 self.ai={};
 const g={time:0,tanks:[self,rival],powerups:[],bullets:[],__novaDecorativeWorld:true,
  hasLineOfSight:()=>true,tankSpeed:()=>124};
 updateAI(self,g,.2);
 assert.equal(self.ai.__v181RivalSpeedSnapshot,undefined);
 assert.equal(self.ai.__v181RivalSpeedWitness,undefined);
});
