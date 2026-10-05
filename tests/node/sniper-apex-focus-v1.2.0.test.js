const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function source(name) {
  return fs.readFileSync(path.join(__dirname, '../../nova-updates', name), 'utf8');
}

test('Apex rails expose class-specific focus durations', () => {
  const context = { window: { __novaModules: {} }, console, Math, navigator: {}, performance: { now: () => 0 } };
  vm.runInNewContext(source('sniper-v1.2.0.js'), context, { filename: 'sniper-v1.2.0.js' });
  const focusMs = context.window.__NOVA_RAIL_FOCUS_MS;
  const charge = context.window.__NOVA_RAIL_CHARGE;
  assert.equal(typeof focusMs, 'function');
  assert.equal(typeof charge, 'function');
  assert.equal(focusMs({ cls: 'prism' }), 400);
  assert.equal(focusMs({ cls: 'railgun' }), 520);
  assert.equal(focusMs({ cls: 'singularity' }), 650);
  assert.equal(focusMs({ cls: 'ghost' }), 520);
  assert.equal(200 / focusMs({ cls: 'prism' }), 0.5);
  assert.equal(260 / focusMs({ cls: 'railgun' }), 0.5);
  assert.equal(325 / focusMs({ cls: 'singularity' }), 0.5);
  assert.equal(charge({ cls: 'prism' }, 200), 0.5);
  assert.equal(charge({ cls: 'railgun' }, 260), 0.5);
  assert.equal(charge({ cls: 'singularity' }, 325), 0.5);
  assert.equal(charge({ cls: 'prism' }, 10, 0.05, 0.96), 0.05);
  assert.equal(charge({ cls: 'singularity' }, 650, 0.05, 0.96), 0.96);
});

test('Forward Observer reconstructs normalized focus through the shared class clock', () => {
  const src = source('stability-v1.4.0.js');
  assert.match(src, /var AI_RAIL_CHARGE = 0\.82;/);
  assert.match(src, /var ELITE_RAIL_CHARGE = 0\.70;/);
  assert.match(src, /__novaFocusStart=now-q\*railFocusMs\(t\)/);
  assert.match(src, /__novaFocusStart=performance\.now\(\)-railFocusMs\(t\);t\.__novaFocus=1/);
  assert.match(src, /t\.__novaFocusStart=performance\.now\(\)-railFocusMs\(t\)/);
  assert.doesNotMatch(src, /__novaFocusStart=now-q\*520/);
  assert.doesNotMatch(src, /__novaFocusStart=performance\.now\(\)-(?:520|530)/);
});

test('Silent Horizon uses the class clock for held and released focus', () => {
  const src = source('sniper-v1.2.0.js');
  assert.match(src, /q = railCharge\(t, elapsed, 0, 1\)/);
  assert.match(src, /q = railCharge\(pl, performance\.now\(\) - pl\.__novaFocusStart, 0\.05, 0\.96\)/);
  assert.doesNotMatch(src, /elapsed \/ FULL_CHARGE_MS/);
});


function loadSilentHorizonRuntime() {
  let now=100;
  const CLASSES={
    railgun:{fireMode:'beam',barrels:[{}],bullet:{}},
    prism:{fireMode:'beam',barrels:[{},{}],bullet:{}},
    singularity:{fireMode:'beam',barrels:[{}],bullet:{}}
  };
  function Sfx(){}
  Sfx.prototype.resume=function(){};
  Sfx.prototype.shoot=function(){};
  function Game(){
    this.bullets=[];this.tanks=[];this.time=0;this.w=800;this.h=600;
    this.cam={x:0,y:0,zoom:1};this.input={firing:false,autofire:false};
    this.sfx=new Sfx();
  }
  Game.prototype.tryFire=function(t){
    const def=CLASSES[t.cls];
    for(let i=0;i<def.barrels.length;i++)this.bullets.push({ownerId:t.id,beam:true,dmg:10,vx:100,vy:0,pen:4,r:4});
    t.fireCd=1;
  };
  Game.prototype.initBulletIntegrity=function(){};
  Game.prototype.resolveBulletCollisions=function(){};
  Game.prototype.update=function(){};
  Game.prototype.weakenBullet=function(){};
  const modules={
    'game/classes':m=>{m.exports={CLASSES};},
    'game/audio':m=>{m.exports={Sfx};},
    'game/engine':m=>{m.exports={Game};},
    'game/render':m=>{m.exports={render(){}};}
  };
  const context={window:{__novaModules:modules},console,Math,navigator:{vibrate(){}},performance:{now:()=>now}};
  vm.runInNewContext(source('sniper-v1.2.0.js'),context,{filename:'sniper-v1.2.0.js'});
  const cache={};
  function load(id){
    if(cache[id])return cache[id].exports;
    const m={exports:{}};cache[id]=m;
    modules[id](m,m.exports,spec=>{
      if(spec==='./classes')return load('game/classes');
      throw new Error('unexpected require '+spec);
    });
    return m.exports;
  }
  load('game/audio');const engine=load('game/engine');load('game/render');
  return{Game:engine.Game,setNow:v=>{now=v;}};
}

test('Silent Horizon reaches equal normalized focus at class-specific half-times',()=>{
  for(const [cls,half] of [['prism',200],['railgun',260],['singularity',325]]){
    const {Game,setNow}=loadSilentHorizonRuntime(),g=new Game();
    const t={id:1,cls,isPlayer:true,alive:true,fireCd:0,angle:0,hitFlash:0};
    g.player=t;g.tanks=[t];
    setNow(100);g.tryFire(t);
    setNow(100+half);g.tryFire(t);
    assert.ok(Math.abs(t.__novaFocus-.5)<1e-9,cls+' focus '+t.__novaFocus);
    assert.equal(g.bullets.length,0);
  }
});

test('Silent Horizon fires each Apex rail at its own full commitment',()=>{
  for(const [cls,full,count] of [['prism',400,2],['railgun',520,1],['singularity',650,1]]){
    const {Game,setNow}=loadSilentHorizonRuntime(),g=new Game();
    const t={id:1,cls,isPlayer:true,alive:true,fireCd:0,angle:0,hitFlash:0};
    g.player=t;g.tanks=[t];
    setNow(100);g.tryFire(t);
    setNow(100+full);g.tryFire(t);
    assert.equal(g.bullets.length,count,cls);
    assert.ok(g.bullets.every(b=>b.__novaFullRail===true),cls);
  }
});


test('Released quick-shots preserve equal normalized charge across Apex rails',()=>{
  for(const [cls,half,count] of [['prism',200,2],['railgun',260,1],['singularity',325,1]]){
    const {Game,setNow}=loadSilentHorizonRuntime(),g=new Game();
    const t={id:1,cls,isPlayer:true,alive:true,fireCd:0,angle:0,hitFlash:0};
    g.player=t;g.tanks=[t];
    setNow(100);g.tryFire(t);
    g.__novaPlayerHeldFire=true;
    g.input.firing=false;g.input.autofire=false;
    setNow(100+half);g.update(.016);
    assert.equal(g.bullets.length,count,cls);
    assert.ok(g.bullets.every(b=>b.__novaFullRail===false),cls);
    assert.ok(g.bullets.every(b=>Math.abs(b.__novaCharge-.5)<1e-9),cls);
    assert.ok(g.bullets.every(b=>Math.abs(b.dmg-6)<1e-9),cls);
  }
});
