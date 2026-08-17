const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

function load(){
  const classes={CLASSES:{guard:{bullet:{reload:.5}}},lineageForClass:()=> 'guardian'};
  function Game(){this.time=10;this.tanks=[];this.bullets=[];this.powerups=[];this.status='playing';}
  Game.prototype.tryFire=function(){};
  Game.prototype.updatePowerups=function(){};
  Game.prototype.applyPowerup=function(){};
  Game.prototype.moveTank=function(){};
  Game.prototype.hasLineOfSight=function(){return true;};
  Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
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
  return {c,Game};
}

const T=(id,x=0,y=0)=>({id,cls:'guard',x,y,hp:100,maxHp:100,alive:true,isPlayer:false,ai:{__v180TargetId:-1}});

test('visible rival with a decisive lead suppresses a routine offensive pickup detour',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),rival=T(2,280,0),pickup={id:7,type:'triple',x:300,y:0};
  g.tanks=[bot,rival];g.powerups=[pickup];
  const h=c.window.__NOVA_BATTLE_SENSE_TEST__;
  assert.ok(h.resourceContest(g,bot,pickup,300)>0.3,'large visible lead should materially discount the race');
  assert.equal(h.chooseResource(g,bot),null,'healthy bot should not abandon play for a pickup a rival is about to win');
});

test('critical healing remains worth contesting despite a rival head start',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),rival=T(2,280,0),pickup={id:7,type:'heal',x:300,y:0};
  bot.hp=20;g.tanks=[bot,rival];g.powerups=[pickup];
  assert.equal(c.window.__NOVA_BATTLE_SENSE_TEST__.chooseResource(g,bot).id,7,'contention is a penalty, not a hard ban on survival plays');
});

test('small rival leads do not create false contention',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),rival=T(2,50,0),pickup={id:7,type:'triple',x:300,y:0};
  g.tanks=[bot,rival];
  assert.equal(c.window.__NOVA_BATTLE_SENSE_TEST__.resourceContest(g,bot,pickup,300),0,'a rival only 50 units closer should not change the plan');
});

test('rival behind cover does not poison an otherwise reachable pickup',()=>{
  const {c,Game}=load(),g=new Game(),bot=T(1,0,0),rival=T(2,280,0),pickup={id:7,type:'triple',x:300,y:0};
  g.tanks=[bot,rival];g.powerups=[pickup];
  g.hasLineOfSight=(ax,ay,bx,by)=>!(ax===rival.x&&ay===rival.y&&bx===pickup.x&&by===pickup.y);
  assert.equal(c.window.__NOVA_BATTLE_SENSE_TEST__.resourceContest(g,bot,pickup,300),0);
  assert.equal(c.window.__NOVA_BATTLE_SENSE_TEST__.chooseResource(g,bot).id,7);
});
