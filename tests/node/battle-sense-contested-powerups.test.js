const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

function load(){
  const classes={CLASSES:{guard:{bullet:{reload:.5},moveMult:1},slow:{bullet:{reload:.5},moveMult:.65},fast:{bullet:{reload:.5},moveMult:2}},lineageForClass:()=> 'guardian'};
  function Game(){this.time=10;this.tanks=[];this.bullets=[];this.powerups=[];this.status='playing';}
  Game.prototype.tryFire=function(){};
  Game.prototype.updatePowerups=function(){};
  Game.prototype.applyPowerup=function(){};
  Game.prototype.moveTank=function(){};
  Game.prototype.hasLineOfSight=function(){return true;};
  Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
  Game.prototype.tankSpeed=function(t){return t.speed||300;};
  const mods={
    'game/engine':m=>m.exports={Game},
    'game/classes':m=>m.exports=classes,
    'game/ai':m=>m.exports={updateAI(){}}
  };
  const c={window:{__novaModules:mods},console,Math};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates/battle-sense-v1.8.1.js'),'utf8'),c);
  const cache={};
  function req(id){
    if(cache[id])return cache[id].exports;
    const m={exports:{}};cache[id]=m;
    mods[id](m,m.exports,s=>s==='./classes'?req('game/classes'):null);
    return m.exports;
  }
  req('game/engine');req('game/ai');
  return {c,Game,classes};
}

const T=(id,x=0,y=0,speed=300)=>({id,cls:'guard',x,y,speed,hp:100,maxHp:100,alive:true,isPlayer:false,ai:{__v180TargetId:-1}});

test('visible rival with a decisive arrival lead suppresses a routine offensive pickup detour',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),rival=T(2,280,0),pickup={id:7,type:'triple',x:300,y:0};
  g.tanks=[bot,rival];g.powerups=[pickup];
  const h=c.window.__NOVA_BATTLE_SENSE_TEST__;
  assert.ok(h.resourceContest(g,bot,pickup,300)>0.3,'large visible arrival lead should materially discount the race');
  assert.equal(h.chooseResource(g,bot),null,'healthy bot should not abandon play for a pickup a rival is about to win');
});

test('critical healing remains worth contesting despite a rival head start',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),rival=T(2,280,0),pickup={id:7,type:'heal',x:300,y:0};
  bot.hp=20;g.tanks=[bot,rival];g.powerups=[pickup];
  assert.equal(c.window.__NOVA_BATTLE_SENSE_TEST__.chooseResource(g,bot).id,7,'contention is a penalty, not a hard ban on survival plays');
});

test('small equal-speed rival leads do not create false contention',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),rival=T(2,50,0),pickup={id:7,type:'triple',x:300,y:0};
  g.tanks=[bot,rival];
  assert.equal(c.window.__NOVA_BATTLE_SENSE_TEST__.resourceContest(g,bot,pickup,300),0,'a rival only 50 units closer at the same speed should not change the plan');
});

test('closer but publicly slower class need not create a fake winning race',()=>{
  const {c,Game,classes}=load(),g=new Game(),bot=T(1,0,0,360),rival=T(2,140,0,120),pickup={id:7,type:'triple',x:300,y:0};
  rival.cls='slow';g.tanks=[bot,rival];
  const h=c.window.__NOVA_BATTLE_SENSE_TEST__;
  assert.equal(h.resourceContest(g,bot,pickup,300,classes),0,'a publicly slow class need not win against a fast observer');
});

test('publicly faster rival class can create contention without a huge raw distance lead',()=>{
  const {c,Game,classes}=load(),g=new Game(),bot=T(1,0,0,180),rival=T(2,70,0,420),pickup={id:7,type:'triple',x:300,y:0};
  rival.cls='fast';g.tanks=[bot,rival];
  const penalty=c.window.__NOVA_BATTLE_SENSE_TEST__.resourceContest(g,bot,pickup,300,classes);
  assert.ok(penalty>0.15,`public class arrival-time advantage should matter, got ${penalty}`);
});

test('rival behind cover does not poison an otherwise reachable pickup',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),rival=T(2,280,0),pickup={id:7,type:'triple',x:300,y:0};
  g.tanks=[bot,rival];g.powerups=[pickup];
  g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===rival.x&&ay===rival.y&&bx===pickup.x&&by===pickup.y);
  assert.equal(c.window.__NOVA_BATTLE_SENSE_TEST__.resourceContest(g,bot,pickup,300),0);
  assert.equal(c.window.__NOVA_BATTLE_SENSE_TEST__.chooseResource(g,bot).id,7);
});

test('falls back to the original distance model when speed data is unavailable',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),rival=T(2,280,0),pickup={id:7,type:'triple',x:300,y:0};
  g.tanks=[bot,rival];g.tankSpeed=null;
  assert.ok(c.window.__NOVA_BATTLE_SENSE_TEST__.resourceContest(g,bot,pickup,300)>0.3,'missing speed information must preserve the prior safe contention behavior');
});

test('full multi-leg pickup route prevents a false contested shield chase',()=>{
 const {c,Game}=load(),g=new Game(),bot=T(1,0,0),rival=T(2,80,0),
  pickup={id:9,type:'shield',x:300,y:0};
 bot.hp=50;g.tanks=[bot,rival];g.powerups=[pickup];
 g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===bot.x&&ay===bot.y&&bx===pickup.x&&by===pickup.y);
 g.novaBattlefieldWaypoint=()=>({x:150,y:30});
 const h=c.window.__NOVA_BATTLE_SENSE_TEST__;
 assert.equal(h.chooseResource(g,bot).id,pickup.id,
  'first-corner approximation alone would make the shield appear contestable');
 g.novaRouteLength=()=>650;
 assert.equal(h.chooseResource(g,bot),null,
  'the verified longer route should not pull the rival into a lost pickup race');
});

test('an unreachable pickup behind solid terrain is not a strategic target',()=>{
 const {c,Game}=load(),g=new Game(),bot=T(1,0,0),
  rivals=[T(2,100,100),T(3,-100,100)],pickup={id:11,type:'shield',x:300,y:0};
 bot.hp=50;g.tanks=[bot,...rivals];g.powerups=[pickup];
 g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===bot.x&&ay===bot.y&&bx===pickup.x&&by===pickup.y);
 g.novaBattlefieldWaypoint=()=>null;
 const h=c.window.__NOVA_BATTLE_SENSE_TEST__;
 assert.equal(h.routeDistance(g,bot,pickup),Infinity);
 assert.equal(h.chooseResource(g,bot),null,
  'a blocked destination without a route must not lure a bot through a wall');
 g.novaBattlefieldWaypoint=()=>({x:150,y:30});
 assert.equal(h.chooseResource(g,bot).id,pickup.id,
  'the same valuable pickup becomes eligible once a physical approach exists');
});

test('long terrain detour reduces intrinsic pickup value even without rival contention',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),
    pickup={id:21,type:'heal',x:300,y:0};
  bot.hp=40;g.tanks=[bot];g.powerups=[pickup];
  g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===bot.x&&ay===bot.y&&bx===pickup.x&&by===pickup.y);
  g.novaBattlefieldWaypoint=()=>({x:150,y:40});
  const h=c.window.__NOVA_BATTLE_SENSE_TEST__;
  assert.equal(h.chooseResource(g,bot).id,pickup.id,
    'a short reachable detour should still justify a useful heal');
  g.novaRouteLength=()=>1000;
  assert.equal(h.routeDistance(g,bot,pickup),1000);
  assert.equal(h.chooseResource(g,bot),null,
    'a long verified detour must not be scored as a cheap 300-unit heal when no rival exists');
  g.hasLineOfSight=()=>true;
  assert.equal(h.chooseResource(g,bot).id,pickup.id,
    'opening a direct lane restores the original reachable-heal choice');
});

test('critical healing remains attractive despite a long but traversable detour',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),
    pickup={id:22,type:'heal',x:300,y:0};
  bot.hp=20;g.tanks=[bot];g.powerups=[pickup];
  g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===bot.x&&ay===bot.y&&bx===pickup.x&&by===pickup.y);
  g.novaBattlefieldWaypoint=()=>({x:150,y:40});
  g.novaRouteLength=()=>1000;
  assert.equal(c.window.__NOVA_BATTLE_SENSE_TEST__.chooseResource(g,bot).id,pickup.id,
    'survival urgency must still outweigh a long reachable detour when critically injured');
});

test('first corner alone cannot justify a pickup when a second solid wall blocks the remainder',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),
    pickup={id:31,type:'heal',x:300,y:0},corner={x:120,y:65};
  bot.hp=20;g.tanks=[bot];g.powerups=[pickup];
  g.novaBattlefieldWaypoint=()=>corner;
  g.hasLineOfSight=(ax,ay,bx,by)=>{
    if(bx===pickup.x&&by===pickup.y)return false;
    return true;
  };
  const h=c.window.__NOVA_BATTLE_SENSE_TEST__;
  assert.equal(h.routeDistance(g,bot,pickup),Infinity,
    'a cheap first corner does not prove that the remaining walls are traversable');
  assert.equal(h.chooseResource(g,bot),null,
    'even a critical heal cannot attract AI along a route with no verified second leg');
  g.novaRouteLength=()=>540;
  assert.equal(h.routeDistance(g,bot,pickup),540,
    'a verified complete multi-leg route remains eligible even when the first corner cannot see the goal');
  assert.equal(h.chooseResource(g,bot).id,pickup.id,
    'critical healing must remain possible through a verified complete detour');
  g.novaRouteLength=()=>null;
  g.hasLineOfSight=(ax,ay,bx,by)=>ax===corner.x&&ay===corner.y;
  assert.ok(Number.isFinite(h.routeDistance(g,bot,pickup)),
    'a physically clear final leg retains the cheap-corner fallback');
});
