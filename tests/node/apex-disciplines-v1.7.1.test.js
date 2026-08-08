const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadApex() {
  const CLASSES = {
    twin:{id:'twin',fireMode:'single',bullet:{splash:0},size:14},
    tempest:{id:'tempest',fireMode:'minigun',bullet:{splash:0},size:15},
    needlestorm:{id:'needlestorm',fireMode:'minigun',bullet:{splash:0},size:14},
    breachlord:{id:'breachlord',fireMode:'shotgun',bullet:{splash:0},size:16},
    flakmaster:{id:'flakmaster',fireMode:'shotgun',bullet:{splash:0},size:15},
    cannon:{id:'cannon',fireMode:'single',bullet:{splash:70,splashDmg:.4},size:16},
    clusterking:{id:'clusterking',fireMode:'shell',bullet:{splash:58,splashDmg:.38},size:16},
    siegebomber:{id:'siegebomber',fireMode:'shell',bullet:{splash:92,splashDmg:.5},size:17},
    annihilator:{id:'annihilator',fireMode:'single',bullet:{splash:155,splashDmg:.68},size:18},
    quakecannon:{id:'quakecannon',fireMode:'single',bullet:{splash:120,splashDmg:.55},size:18},
    guard:{id:'guard',fireMode:'single',bullet:{splash:0},size:16,ability:'bulwark'},
    bastion:{id:'bastion',fireMode:'single',bullet:{splash:0},size:21,ability:'taunt'},
    aegis:{id:'aegis',fireMode:'single',bullet:{splash:0},size:19,ability:'bulwark'},
    juggernaut:{id:'juggernaut',fireMode:'single',bullet:{splash:0},size:17,ability:'stampede'},
    meteor:{id:'meteor',fireMode:'single',bullet:{splash:0},size:18,ability:'stampede'},
    ravager:{id:'ravager',fireMode:'single',bullet:{splash:0},size:18,ability:'stampede'}
  };
  const gunner = new Set(['twin','tempest','needlestorm','breachlord','flakmaster']);
  const cannon = new Set(['cannon','clusterking','siegebomber','annihilator','quakecannon']);
  const guardian = new Set(['guard','bastion','aegis','juggernaut','meteor','ravager']);
  function lineageForClass(id){ return gunner.has(id)?'gunner':cannon.has(id)?'cannon':guardian.has(id)?'guardian':'scout'; }

  function Game() {
    this.bullets=[]; this.tanks=[]; this.time=10; this.player=null; this.__cover=null;
    this.input={aim:{active:true,dx:60,dy:0},mouseActive:false};
    this.cam={x:0,y:0,zoom:1}; this.w=400; this.h=800;
    this.sfx={novaCadence(){},novaOverheat(){},novaFuseBurst(){},novaPerfectGuard(){},novaCountershot(){},novaChargeBreak(){}};
  }
  Game.prototype.tryFire=function(t){
    if(t.fireCd>0)return;
    const def=CLASSES[t.cls]||CLASSES.twin;
    const count=def.fireMode==='shotgun'?6:1;
    for(let i=0;i<count;i++){
      const off=def.fireMode==='shotgun'?(i-(count-1)/2)*.08:0;
      this.bullets.push({ownerId:t.id,x:t.x||0,y:t.y||0,vx:Math.cos(t.angle+off)*400,vy:Math.sin(t.angle+off)*400,dmg:10,pen:1,
        splash:def.bullet.splash||0,splashDmg:def.bullet.splashDmg||0,knock:200,ttl:.8,color:'#fff',dead:false,shell:def.fireMode==='shell'});
    }
    t.fireCd=.2;
  };
  Game.prototype.damageTank=function(t,dmg){ t.hp-=dmg; return dmg; };
  Game.prototype.useAbility=function(t){
    const ab=CLASSES[t.cls].ability;
    if(ab==='bulwark'){t.bulwarkT=4;t.abilityCd=14;}
    if(ab==='taunt'){t.tauntT=3;t.abilityCd=16;}
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
  Game.prototype.clusterBurst=function(parent){
    for(let i=0;i<5;i++){
      const a=i*Math.PI*.5;
      this.bullets.push({ownerId:parent.ownerId,x:parent.x,y:parent.y,vx:Math.cos(a)*180,vy:Math.sin(a)*180,dmg:4,pen:1,ttl:.5,dead:false});
    }
  };
  Game.prototype.firstTerrainHit=function(){
    return this.__cover ? {solid:this.__cover,hit:{t:.5,x:0,y:0}} : null;
  };

  function Sfx(){}
  Sfx.prototype.resume=function(){};

  const modules={
    'game/classes':function(module){module.exports={CLASSES,lineageForClass};},
    'game/audio':function(module){module.exports={Sfx};},
    'game/engine':function(module){module.exports={Game};},
    'game/render':function(module){module.exports={render(){}};}
  };
  const context={window:{__novaModules:modules},console,Math,performance:{now:()=>0}};
  for(const file of ['disciplines-v1.7.0.js','apex-disciplines-v1.7.1.js']){
    const src=fs.readFileSync(path.join(__dirname,'../../nova-updates',file),'utf8');
    vm.runInNewContext(src,context,{filename:file});
  }

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
  load('game/audio'); load('game/render');
  return {context,Game:engine.Game,CLASSES:classes.CLASSES};
}

function tank(id,cls,extra={}) {
  return Object.assign({id,cls,x:0,y:0,angle:0,fireCd:0,vx:0,vy:0,isPlayer:true,alive:true,hp:1000,bulwarkT:0,tauntT:0,stampedeT:0,abilityCd:0},extra);
}

test('Apex Doctrine publishes v1.7.1',()=>{
  const {context}=loadApex();
  assert.equal(context.window.__NOVA_APEX_RELEASE__.version,'1.7.1');
  assert.equal(context.window.__NOVA_APEX_RELEASE__.codename,'Apex Doctrine');
});

test('Tempest rewards the redline band but penalizes overshoot',()=>{
  const {Game}=loadApex(),g=new Game(),t=tank(1,'tempest',{__v17Heat:.50,__v17Stability:1});
  g.player=t;g.tanks=[t];g.tryFire(t);
  assert.ok(t.fireCd<.19,`expected cadence throughput, got ${t.fireCd}`);
  t.fireCd=0;t.__v17Heat=1.0;t.__v17Stability=1;
  g.tryFire(t);
  assert.ok(t.__v171RedlinePenalty>g.time);
});

test('Needle Storm precision gate hardens a correctly disciplined needle',()=>{
  const {Game}=loadApex(),g=new Game(),t=tank(1,'needlestorm',{__v17Heat:.51,__v17Stability:1});
  g.player=t;g.tanks=[t];g.tryFire(t);
  assert.equal(g.bullets[0].__v171NeedleGate,true);
  assert.ok(g.bullets[0].pen>=2);
  assert.ok(Math.hypot(g.bullets[0].vx,g.bullets[0].vy)>400);
});

test('Breachlord settled volley creates a real recovery commitment',()=>{
  const {Game}=loadApex(),g=new Game(),t=tank(1,'breachlord',{__v17Heat:.08,__v17Stability:1});
  g.player=t;g.tanks=[t];g.tryFire(t);
  assert.ok(t.__v171RecoverUntil>g.time);
  assert.ok(g.tankSpeed(t)<100);
  assert.ok(g.bullets.some(b=>b.__v171Braced));
});

test('Cluster King fuse depth controls child-bomb sector width',()=>{
  const {context,Game}=loadApex(),g=new Game(),t=tank(1,'clusterking',{__v17FuseDepth:.9});
  g.tanks=[t];g.player=t;
  const parent={ownerId:1,x:0,y:0,vx:200,vy:0};
  g.clusterBurst(parent);
  const angles=g.bullets.map(b=>Math.atan2(b.vy,b.vx)).sort((a,b)=>a-b);
  const span=angles[angles.length-1]-angles[0];
  assert.ok(span<=context.window.__NOVA_APEX_TEST__.clusterWidth(.9)+.01,`span ${span}`);
  assert.ok(g.bullets.every(b=>b.__v171SectorChild));
});

test('Annihilator deep fuse increases both blast commitment and punish window',()=>{
  const {Game}=loadApex(),g=new Game(),t=tank(1,'annihilator');
  g.player=t;g.tanks=[t];g.input.aim.dx=60;g.tryFire(t);
  assert.ok(t.__v171ApexMeter>.5);
  assert.ok(t.fireCd>.21);
  assert.ok(g.bullets[0].dmg>10);
  assert.ok(g.bullets[0].splash>155);
});

test('Cannon structural specialization primes destructible Battlefield cover',()=>{
  const {Game}=loadApex(),g=new Game(),t=tank(1,'siegebomber');
  g.player=t;g.tanks=[t];g.tryFire(t);
  const b=g.bullets[0]; b.x=0;b.y=0;b.vx=400;b.vy=0;b.__novaStructureMult=2.35;b.shell=true;
  g.__cover={id:-5,destructible:true,hp:300,solid:true};
  g.updateBullets(.1);
  assert.ok(g.__cover.hp<200,`cover hp ${g.__cover.hp}`);
});

test('Bastion anchoring improves only its correctly faced lane',()=>{
  const {Game}=loadApex(),g=new Game();
  const b=tank(1,'bastion',{__v171Anchor:1}),front=tank(2,'tempest',{x:100}),rear=tank(3,'tempest',{x:-100});
  g.tanks=[b,front,rear];g.player=b;
  const hp=b.hp;g.damageTank(b,100,front.id);const frontLoss=hp-b.hp;
  const hp2=b.hp;g.damageTank(b,100,rear.id);const rearLoss=hp2-b.hp;
  assert.ok(frontLoss<rearLoss*.8,`front ${frontLoss}, rear ${rearLoss}`);
});

test('Aegis Perfect Guard converts a good read into mobility flow',()=>{
  const {Game}=loadApex(),g=new Game();
  const a=tank(1,'aegis'),src=tank(2,'tempest',{x:100});
  g.tanks=[a,src];g.player=a;g.useAbility(a);g.damageTank(a,100,src.id);
  assert.ok(a.__v171FlowUntil>g.time);
  assert.ok(g.tankSpeed(a)>100);
});

test('Meteor keeps a higher peak impact ceiling than Ravager at equal charge',()=>{
  const {Game}=loadApex(),g=new Game();
  const m=tank(1,'meteor',{stampedeT:2,__v17Charge:1}),r=tank(2,'ravager',{stampedeT:2,__v17Charge:1});
  assert.ok(g.bodyDamage(m)>g.bodyDamage(r));
});
