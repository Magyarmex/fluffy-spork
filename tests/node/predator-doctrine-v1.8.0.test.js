const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadPredator(){
  const CLASSES={
    twin:{id:'twin',size:14,ability:null,bullet:{speed:470}},
    marksman:{id:'marksman',size:14,ability:null,bullet:{speed:1050}},
    cannon:{id:'cannon',size:15,ability:'ragnarok',bullet:{speed:380}},
    carrier:{id:'carrier',size:14,ability:'swarm',bullet:{speed:430}},
    guard:{id:'guard',size:16,ability:'bulwark',bullet:{speed:420}},
    juggernaut:{id:'juggernaut',size:16,ability:'stampede',bullet:{speed:450}},
    ghost:{id:'ghost',size:13,ability:'phase',bullet:{speed:1200}},
    shotgun:{id:'shotgun',size:15,ability:'pointblank',bullet:{speed:540}},
  };
  function lineageForClass(id){
    if(id==='marksman'||id==='ghost')return 'sniper';
    if(id==='cannon')return 'cannon';
    if(id==='carrier')return 'controller';
    if(id==='guard'||id==='juggernaut')return 'guardian';
    if(id==='twin'||id==='shotgun')return 'gunner';
    return null;
  }
  function Game(){
    this.time=10;this.tanks=[];this.bullets=[];this.shapes=[];this.player=null;this.moves=[];this.fires=0;this.abilities=0;
    this.blockAll=false;this.coverMode=false;
  }
  Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
  Game.prototype.getShape=function(id){return this.shapes.find(s=>s.id===id)||null;};
  Game.prototype.nearestShape=function(){return null;};
  Game.prototype.tankSpeed=function(){return 120;};
  Game.prototype.weaponRange=function(t){return t.cls==='marksman'?1000:650;};
  Game.prototype.bulletSpeed=function(t){return CLASSES[t.cls].bullet.speed;};
  Game.prototype.hasLineOfSight=function(ax,ay,bx,by){
    if(this.coverMode && ax>0 && bx<1)return false;
    return !this.blockAll;
  };
  Game.prototype.isTerrainSafe=function(){return true;};
  Game.prototype.firstTerrainHit=function(){return null;};
  Game.prototype.moveTank=function(t,vx,vy,dt){this.moves.push([vx,vy]);t.x+=vx*dt;t.y+=vy*dt;t.vx=vx;t.vy=vy;};
  Game.prototype.tryFire=function(){this.fires++;};
  Game.prototype.useAbility=function(t){this.abilities++;t.abilityCd=5;};
  Game.prototype.damageTank=function(t,dmg){t.hp-=dmg;return dmg;};
  Game.prototype.spawnAITank=function(){};

  const modules={
    'game/classes':function(module){module.exports={CLASSES,lineageForClass};},
    'game/engine':function(module){module.exports={Game};},
    'game/ai':function(module){module.exports={updateAI(t,g,dt){
      if(t.ai.state==='hunt'){
        g.moveTank(t,0,0,dt);
        g.tryFire(t);
        if(t.abilityCd<=0)g.useAbility(t);
      }
    }};},
  };
  const context={window:{__novaModules:modules},console,Math,performance:{now:()=>0}};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/predator-doctrine-v1.8.0.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'predator-doctrine-v1.8.0.js'});
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
  const engine=load('game/engine'),ai=load('game/ai');
  return {context,Game:engine.Game,ai,CLASSES,lineageForClass,src};
}
function tank(id,cls,extra={}){
  return Object.assign({id,cls,x:0,y:0,vx:0,vy:0,angle:0,hp:100,maxHp:100,level:20,tier:2,alive:true,isPlayer:false,abilityCd:99,ai:null},extra);
}
function brain(extra={}){return Object.assign({state:'wander',thinkT:0,targetId:-1,strafe:1,dodgeX:0,dodgeY:0,dodgeT:0,preferredRange:0,archetype:'brawler',aggression:.6,isElite:false,fireHold:0},extra);}

test('Predator Doctrine publishes v1.8.0 and explicit fair-play constraints',()=>{
  const {context,src}=loadPredator();
  assert.equal(context.window.__NOVA_PREDATOR_RELEASE__.version,'1.8.0');
  assert.equal(context.window.__NOVA_AI_DIRECTOR__.fairPlay.wallVision,false);
  assert.equal(context.window.__NOVA_AI_DIRECTOR__.fairPlay.hiddenTracking,false);
  assert.equal(context.window.__NOVA_AI_DIRECTOR__.fairPlay.statBuffs,false);
  assert.equal(/dmgMult\s*=/.test(src),false,'AI doctrine must not add damage multipliers');
});

test('analytical interception leads a crossing target',()=>{
  const {context}=loadPredator(),o={};
  context.window.__NOVA_PREDATOR_TEST__.solveIntercept(0,0,400,0,0,120,500,1.2,o);
  assert.ok(o.t>0.7&&o.t<1.0,`unexpected intercept time ${o.t}`);
  assert.ok(o.y>80,'crossing target should be led ahead');
});

test('projectile risk produces a deterministic evasive vector',()=>{
  const {context,Game,CLASSES}=loadPredator(),g=new Game(),t=tank(1,'twin');
  g.bullets=[{ownerId:9,x:160,y:5,vx:-500,vy:0,dead:false}];
  const r=context.window.__NOVA_PREDATOR_TEST__.threatVector(g,CLASSES,t,{});
  assert.ok(r.risk>.1,'incoming shot should be recognized as a threat');
  assert.ok(Math.abs(r.y)>.5,'head-on threat should choose a lateral dodge');
});

test('target saturation lowers dogpile priority',()=>{
  const {context,Game}=loadPredator(),g=new Game(),hunter=tank(1,'twin',{ai:brain()}),player=tank(7,'guard',{isPlayer:true,x:300});
  g.tanks=[hunter,player];
  const helper=context.window.__NOVA_PREDATOR_TEST__;
  const base=helper.scoreTarget(g,{lineageForClass:(id)=>id==='guard'?'guardian':'gunner'},hunter,hunter.ai,player,1000,g.time);
  for(let i=0;i<5;i++)g.tanks.push(tank(20+i,'twin',{ai:brain({state:'hunt',targetId:7})}));
  const crowded=helper.scoreTarget(g,{lineageForClass:(id)=>id==='guard'?'guardian':'gunner'},hunter,hunter.ai,player,1000,g.time);
  assert.ok(crowded<base-.6,`expected saturation penalty: ${base} -> ${crowded}`);
});

test('recent damage never authorizes hidden live-coordinate targeting',()=>{
  const {context,Game}=loadPredator(),g=new Game(),hunter=tank(1,'twin',{ai:brain({__v180LastAttacker:7,__v180HitAt:10})}),enemy=tank(7,'guard',{x:200});
  g.tanks=[hunter,enemy];g.blockAll=true;
  const score=context.window.__NOVA_PREDATOR_TEST__.scoreTarget(g,{lineageForClass:()=> 'guardian'},hunter,hunter.ai,enemy,1000,g.time);
  assert.equal(score,-Infinity);
});

test('ranged roles prefer materially longer engagement distance than guardians',()=>{
  const {context,Game,CLASSES,lineageForClass}=loadPredator(),g=new Game();
  const classes={lineageForClass};
  const sniper=tank(1,'marksman',{ai:brain({archetype:'ranged'})}),guard=tank(2,'guard',{ai:brain({archetype:'guard'})});
  const sr=context.window.__NOVA_PREDATOR_TEST__.preferredRange(g,classes,CLASSES,sniper,sniper.ai);
  const gr=context.window.__NOVA_PREDATOR_TEST__.preferredRange(g,classes,CLASSES,guard,guard.ai);
  assert.ok(sr>gr*1.8,`sniper ${sr}, guardian ${gr}`);
});

test('hidden target movement never updates the frozen pursuit coordinate',()=>{
  const {Game,ai}=loadPredator(),g=new Game();
  const hunter=tank(1,'twin',{ai:brain({__v180PlanT:0})}),player=tank(7,'guard',{isPlayer:true,x:260,y:40,vx:20});
  g.tanks=[hunter,player];g.player=player;
  ai.updateAI(hunter,g,.16);
  const sx=hunter.ai.__v180LastSeenX,sy=hunter.ai.__v180LastSeenY;
  assert.equal(sx,260);assert.equal(sy,40);
  player.x=900;player.y=700;g.blockAll=true;g.time+=.2;hunter.ai.__v180PlanT=0;
  ai.updateAI(hunter,g,.16);
  assert.equal(hunter.ai.__v180LastSeenX,sx);
  assert.equal(hunter.ai.__v180LastSeenY,sy);
  assert.equal(hunter.ai.__v180Posture,'investigate');
  assert.ok(Math.abs(hunter.angle-Math.atan2(sy-hunter.y,sx-hunter.x))<1e-9);
});

test('wounded ranged AI seeks occluded cover when a safe candidate exists',()=>{
  const {context,Game,CLASSES}=loadPredator(),g=new Game(),t=tank(1,'marksman',{x:20}),target=tank(7,'guard',{x:-300});
  g.hasLineOfSight=(ax,ay,bx,by)=> ax===target.x ? false : true;
  const c=context.window.__NOVA_PREDATOR_TEST__.seekCover(g,CLASSES,t,target,{});
  assert.ok(c,'expected a cover direction');
});

test('defensive ability timing reacts to credible projectile pressure',()=>{
  const {Game,ai}=loadPredator(),g=new Game();
  const hunter=tank(1,'guard',{ai:brain({archetype:'guard',__v180PlanT:0}),abilityCd:0}),player=tank(7,'twin',{isPlayer:true,x:260});
  g.tanks=[hunter,player];g.player=player;g.bullets=[{ownerId:7,x:120,y:0,vx:-480,vy:0,dead:false}];
  ai.updateAI(hunter,g,.16);
  assert.equal(g.abilities,1,'Bulwark should be intentionally committed under incoming fire');
});

test('AI movement remains live while planning is reaction-limited',()=>{
  const {Game,ai}=loadPredator(),g=new Game();
  const hunter=tank(1,'twin',{ai:brain({__v180PlanT:0})}),player=tank(7,'guard',{isPlayer:true,x:420});
  g.tanks=[hunter,player];g.player=player;
  ai.updateAI(hunter,g,.016);
  const firstPlan=hunter.ai.__v180PlanT;
  assert.ok(firstPlan>.07,'plan should be cached for a human-scale reaction interval');
  const moves=g.moves.length;
  ai.updateAI(hunter,g,.016);
  assert.equal(g.moves.length,moves+1,'cached tactical steering should still execute every simulation update');
});
