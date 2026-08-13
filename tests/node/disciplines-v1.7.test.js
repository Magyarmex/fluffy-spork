const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadDisciplines() {
  const CLASSES = {
    twin:{id:'twin',fireMode:'single',bullet:{splash:0},size:14},
    cannon:{id:'cannon',fireMode:'single',bullet:{splash:70,splashDmg:.4},size:16},
    guard:{id:'guard',fireMode:'single',bullet:{splash:0},size:16,ability:'bulwark'},
    juggernaut:{id:'juggernaut',fireMode:'single',bullet:{splash:0},size:17,ability:'stampede'}
  };
  function lineageForClass(id){ return id==='twin'?'gunner':id==='cannon'?'cannon':(id==='guard'||id==='juggernaut')?'guardian':'scout'; }

  function Game() {
    this.bullets=[]; this.tanks=[]; this.time=10; this.player=null;
    this.input={aim:{active:true,dx:62,dy:0},mouseActive:false};
    this.cam={x:0,y:0,zoom:1}; this.w=400; this.h=800;
    this.sfx={novaCadence(){},novaOverheat(){},novaFuseBurst(){},novaPerfectGuard(){},novaCountershot(){},novaChargeBreak(){}};
  }
  Game.prototype.tryFire=function(t){
    if(t.fireCd>0)return;
    this.bullets.push({ownerId:t.id,x:t.x||0,y:t.y||0,vx:400,vy:0,dmg:10,pen:1,splash:70,splashDmg:.4,color:'#fff',dead:false});
    t.fireCd=.2;
  };
  Game.prototype.damageTank=function(t,dmg){ t.hp-=dmg; return dmg; };
  Game.prototype.useAbility=function(t){
    const ab=CLASSES[t.cls].ability;
    if(ab==='bulwark'){t.bulwarkT=4;t.abilityCd=14;}
    if(ab==='stampede'){t.stampedeT=4;t.abilityCd=12;}
  };
  Game.prototype.bodyDamage=function(){return 100;};
  Game.prototype.updateBullets=function(){};
  Game.prototype.update=function(){};
  Game.prototype.tankSpeed=function(){return 100;};
  Game.prototype.weaponRange=function(){return 500;};
  Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
  Game.prototype.addText=function(){};
  Game.prototype.addRing=function(){};
  Game.prototype.splashAt=function(){};
  Game.prototype.clusterBurst=function(){};

  function Sfx(){}
  Sfx.prototype.resume=function(){};

  const modules={
    'game/classes':function(module){module.exports={CLASSES,lineageForClass};},
    'game/audio':function(module){module.exports={Sfx};},
    'game/engine':function(module){module.exports={Game};},
    'game/render':function(module){module.exports={render(){}};}
  };
  const context={window:{__novaModules:modules},console,Math,performance:{now:()=>0}};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/disciplines-v1.7.0.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'disciplines-v1.7.0.js'});
  const cache={};
  function load(id){
    if(cache[id])return cache[id].exports;
    const m={exports:{}};cache[id]=m;
    modules[id](m,m.exports,(spec)=>{
      if(spec==='./classes')return load('game/classes');
      throw new Error('unexpected require '+spec);
    });
    return m.exports;
  }
  const classes=load('game/classes');
  const engine=load('game/engine');
  load('game/audio');
  load('game/render');
  return {context,Game:engine.Game,CLASSES:classes.CLASSES};
}

test('Three Disciplines publishes v1.7.0',()=>{
  const {context}=loadDisciplines();
  assert.equal(context.window.__NOVA_DISCIPLINES_RELEASE__.version,'1.7.0');
  assert.equal(context.window.__NOVA_DISCIPLINES_RELEASE__.codename,'Three Disciplines');
});
test('Gunner cadence has a deterministic sweet spot',()=>{
  const {context}=loadDisciplines(), q=context.window.__NOVA_DISCIPLINES_TEST__;
  assert.ok(q.gunSweet(.56)>.99);
  assert.ok(q.gunSweet(.95)<.01);
});
test('Guardian frontal arc is directional',()=>{
  const {context}=loadDisciplines(), q=context.window.__NOVA_DISCIPLINES_TEST__;
  assert.equal(q.guardFront(0,0,Math.PI/2),true);
  assert.equal(q.guardFront(0,Math.PI,Math.PI/2),false);
});
test('Cannon fire is annotated with a programmable fuse',()=>{
  const {Game}=loadDisciplines(),g=new Game();
  const t={id:1,cls:'cannon',x:0,y:0,angle:0,fireCd:0,vx:0,vy:0,isPlayer:true};
  g.player=t;g.tanks=[t];g.tryFire(t);
  assert.equal(g.bullets.length,1);
  assert.equal(g.bullets[0].__v17Cannon,true);
  assert.ok(g.bullets[0].__v17FuseDist>400);
  assert.ok(g.bullets[0].__novaStructureMult>1);
});
test('Guardian ability blocks front but not rear',()=>{
  const {Game}=loadDisciplines(),g=new Game();
  const t={id:1,cls:'guard',x:0,y:0,angle:0,hp:1000,bulwarkT:0,tauntT:0,abilityCd:0,alive:true};
  const front={id:2,cls:'twin',x:100,y:0,alive:true};
  const rear={id:3,cls:'twin',x:-100,y:0,alive:true};
  g.tanks=[t,front,rear];g.player=t;
  g.useAbility(t);t.__v17PerfectGuardUntil=-1;
  const before=t.hp;g.damageTank(t,100,front.id,0,0);const frontLoss=before-t.hp;
  const before2=t.hp;g.damageTank(t,100,rear.id,0,0);const rearLoss=before2-t.hp;
  assert.ok(frontLoss<rearLoss*.5,`front ${frontLoss}, rear ${rearLoss}`);
});
test('Perfect Guard stores a countershot and takes no damage',()=>{
  const {Game}=loadDisciplines(),g=new Game();
  const t={id:1,cls:'guard',x:0,y:0,angle:0,hp:1000,bulwarkT:0,tauntT:0,abilityCd:0,alive:true};
  const src={id:2,cls:'twin',x:100,y:0,alive:true};
  g.tanks=[t,src];g.player=t;g.useAbility(t);
  const hp=t.hp;g.damageTank(t,100,src.id,0,0);
  assert.equal(t.hp,hp);
  assert.equal(t.__v17CounterCharge,1);
});
test('Gunner fire builds heat and marks projectiles',()=>{
  const {Game}=loadDisciplines(),g=new Game();
  const t={id:1,cls:'twin',x:0,y:0,angle:0,fireCd:0,vx:0,vy:0,isPlayer:true};
  g.player=t;g.tanks=[t];g.tryFire(t);
  assert.ok(t.__v17Heat>0);
  assert.equal(g.bullets[0].__v17Gunner,true);
});
