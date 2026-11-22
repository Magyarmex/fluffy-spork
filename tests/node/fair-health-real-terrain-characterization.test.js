// Research-only #1106: physical opaque wall + shipping Battlefield/Fair overlays.
// Characterization assertions document current defective target scoring, NOT policy.
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const f of ['battlefield-v1.6.0.js','fair-engagement-v1.11.2.js'])
 assert.ok(html.includes('nova-updates/'+f),'must exercise shipping overlay');
const CLASSES={basic:{size:15}};
function boot(){
 class Game{
  constructor(){
   this.time=1;this.w=800;this.h=600;this.cam={zoom:1};this.zoom=1;
   this.tanks=[];this.shapes=[];this.drones=[];this.bullets=[];
   this.__novaTerrain=[{id:-1000,kind:'terrain',shape:'rect',x:0,y:0,w:240,h:70,
    type:'wall',destructible:false,hp:0,maxHp:0,solid:true}];
  }
  getTank(id){return this.tanks.find(t=>t.id===id)||null;}
 }
 for(const n of ['spawnPlayer','spawnShape','spawnPowerup','tryFire',
  'updateDrones','update','moveTank','addParticles','splashAt',
  'initBulletIntegrity','addRing','addFlash','addImpactDebris',
  'damageShape','damageDrone','weakenBullet','clusterBurst',
  'updatePowerups','randSpawnPos','nearestTank','updateBullets'])
  Game.prototype[n]=function(){};
 class Sfx{resume(){}}
 const modules={
  'game/engine':m=>{m.exports={Game};},
  'game/audio':m=>{m.exports={Sfx};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/render':m=>{m.exports={render(){}};}
 };
 const window={__novaModules:modules};
 const context={window,console:{info(){},warn(){},error(){}},
  Math,Number,Object,Array,Map,Set,Date,WeakMap,performance:{now:()=>0}};
 for(const f of ['battlefield-v1.6.0.js','fair-engagement-v1.11.2.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',f),'utf8'),
   context,{filename:f});
 const module={exports:{}};
 modules['game/engine'](module,module.exports,s=>s==='./classes'
  ?{CLASSES,lineageForClass:()=> 'gunner'}:{ARENA_HALF:2250});
 return {Game:module.exports.Game,F:window.__NOVA_FAIR_ENGAGEMENT_TEST__};
}
function tank(id,x,y,hp=100){return {id,x,y,hp,maxHp:100,alive:true,
 spawnShieldT:0,cls:'basic',tier:1,isPlayer:false,
 ai:{state:'hunt',targetId:-1}};}
const C={CLASSES,lineageForClass:()=> 'gunner'};
test('CHARACTERIZATION: a wall fully overpaints the health bar but not private HP scoring',()=>{
 const {Game,F}=boot(),g=new Game(),observer=tank(1,0,-150),covered=tank(2,0,50);
 g.tanks=[observer,covered];
 assert.equal(F.inGameplayViewport(g,observer,covered),true);
 assert.equal(g.hasLineOfSight(observer.x,observer.y,covered.x,covered.y,4),false);
 // Shipping drawTank: a non-player health bar is 34x3.5 at
 // [x-17,x+17] x [y-size-6,y-size-2.5].
 // Tank hull begins at y=35, exactly outside this permanent wall,
 // but its entire bar lies inside the wall's [-35,+35] vertical span.
 const wall=g.__novaTerrain[0],size=CLASSES.basic.size;
 const bar={left:covered.x-17,right:covered.x+17,
  top:covered.y-size-6,bottom:covered.y-size-2.5};
 assert.ok(covered.y-size>=wall.y+wall.h/2,'tank hull stays outside solid wall');
 assert.ok(bar.left>=wall.x-wall.w/2&&bar.right<=wall.x+wall.w/2);
 assert.ok(bar.top>=wall.y-wall.h/2&&bar.bottom<=wall.y+wall.h/2,
  'the wall overpaints the entire health bar in the shipping render order');
 const full=F.scoreTarget(g,C,observer,observer.ai,covered,g.time);
 covered.hp=20;
 const weak=F.scoreTarget(g,C,observer,observer.ai,covered,g.time);
 assert.ok(Math.abs((weak-full)-.384)<1e-8,
  'shipping scorer uses private covered HP; invert when fixing #1106');
});
test('CONTROL: open sight and opaque sight share contact legality but not health visibility',()=>{
 const {Game,F}=boot(),g=new Game(),observer=tank(1,0,-150),
  covered=tank(2,0,50),clear=tank(3,-150,-150);
 g.tanks=[observer,covered,clear];
 assert.equal(g.hasLineOfSight(observer.x,observer.y,covered.x,covered.y,4),false);
 assert.equal(g.hasLineOfSight(observer.x,observer.y,clear.x,clear.y,4),true);
 assert.equal(F.canPerceive(g,C,observer,covered),true);
 assert.equal(F.canPerceive(g,C,observer,clear),true);
});

test('REACHABILITY: legal straight-wall collision leaves 6/7 of health bar overpainted across hull sizes',()=>{
 const {Game}=boot();
 const originalSize=CLASSES.basic.size;
 try {
  for(const size of [10,12,14,15,20,24]){
   CLASSES.basic.size=size;
   const g=new Game(),wall=g.__novaTerrain[0],face=wall.y+wall.h/2;
   const target=tank(2,0,face+size+1);
   g.tanks=[target];
   // Begin collision-radius-inside but physical-hull-clear.
   assert.ok(target.y>=face+size);
   assert.ok(target.y<face+size+3);
   g.moveTank(target,0,0,1/60);
   assert.equal(target.y,face+size+3,'actual Battlefield resolver must clear radius size+3 for hull '+size);
   const top=target.y-size-6,bottom=target.y-size-2.5;
   assert.equal(top,face-3);
   assert.equal(bottom,face+0.5);
   const coveredHeight=Math.max(0,Math.min(face,bottom)-top);
   assert.equal(coveredHeight,3);
   assert.ok(Math.abs(coveredHeight/(bottom-top)-6/7)<1e-12);
   // This is a reachable geometric counterexample to a full-strip-only
   // visibility policy, not proof that a human cannot read a 0.5px sliver.
  }
 } finally {
  CLASSES.basic.size=originalSize;
 }
});

test('RESEARCH CENSUS: real 49-overlay AI motion samples reachable partially hidden HP strips',()=>{
 process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 withSeed(1517825,()=>{
  const g=bootGame();
  try {
   if(!g.player)g.redeploy();
   assert.equal(g.status,'playing');
   const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
   const counts={ticks:0,botSamples:0,partialOverHalf:0,partialOverThreeQuarters:0,
    fullStripGate:0,viewportPartial:0,maxFraction:0};
   for(let step=0;step<360;step++){
    if(g.status!=='playing')break;
    g.update(1/60);counts.ticks++;
    if(step%6!==0)continue;
    for(const t of g.tanks){
     if(!t||!t.ai||!t.alive)continue;
     const size=classes.CLASSES[t.cls]?.size;
     if(!(size>0))continue;
     counts.botSamples++;
     const bx0=t.x-17,bx1=t.x+17,by0=t.y-size-6,by1=t.y-size-2.5;
     let maxFraction=0;
     for(const solid of g.__novaTerrain||[]){
      if(!solid||solid.solid===false||(solid.destructible&&!(solid.hp>0))||
         solid.shape!=='rect')continue;
      const ix=Math.max(0,Math.min(bx1,solid.x+solid.w/2)-Math.max(bx0,solid.x-solid.w/2));
      const iy=Math.max(0,Math.min(by1,solid.y+solid.h/2)-Math.max(by0,solid.y-solid.h/2));
      maxFraction=Math.max(maxFraction,ix*iy/(34*3.5));
     }
     counts.maxFraction=Math.max(counts.maxFraction,maxFraction);
     if(maxFraction>=.5)counts.partialOverHalf++;
     if(maxFraction>=.75)counts.partialOverThreeQuarters++;
     if(typeof g.__testFair.healthBarCovered==='function'&&g.__testFair.healthBarCovered(g,classes,t))counts.fullStripGate++;
     if(maxFraction>=.5&&g.player&&g.__testFair.inGameplayViewport(g,g.player,t))
      counts.viewportPartial++;
    }
   }
   assert.ok(counts.ticks>0&&counts.botSamples>0,'real composed match must advance');
   console.log('NOVA_REACHABLE_HP_STRIP_CENSUS '+JSON.stringify(counts));
  }finally{g.destroy();}
 });
});

test('RESEARCH: reachable wall-adjacent target HP may change composed Phase ability intent',()=>{
 process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
 const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
 const arm=hp=>withSeed(1517825,()=>{
  const g=bootGame();
  try{
   if(!g.player)g.redeploy();
   const observer=g.tanks.find(t=>t&&t.ai&&!t.isPlayer),target=g.player;
   assert.ok(observer&&target);
   Object.assign(observer,{x:0,y:150,cls:'ghost',tier:3,hp:100,maxHp:100,
    alive:true,spawnShieldT:0,abilityCd:0,angle:-Math.PI/2});
   Object.assign(target,{x:0,y:52,cls:'twin',tier:1,hp,maxHp:100,
    alive:true,spawnShieldT:0});
   observer.ai={...observer.ai,state:'hunt',targetId:-1,
    __v1112TargetId:-1,__v1105TargetId:-1,__v180TargetId:-1,
    __v1112NextThink:0,__v1105PlanT:0,__v180PlanT:0,
    __v180LastAttacker:-1,__v180HitAt:-99,__v180LastAbilityAt:-99};
   g.tanks=[observer,target];g.powerups=[];g.bullets=[];g.shapes=[];
   g.w=1000;g.h=700;g.cam.zoom=1;g.time=10;
   g.__novaTerrain=[{id:-1000,kind:'terrain',shape:'rect',x:0,y:0,
    w:240,h:70,type:'wall',destructible:false,hp:0,maxHp:0,solid:true}];
   g.__novaBattlefieldIndex=null;
   g.moveTank(target,0,0,1/60);
   assert.equal(target.y,52,'legal Twin center must be collision-resolved');
   assert.equal(g.hasLineOfSight(observer.x,observer.y,target.x,target.y,4),true);
   const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
   assert.equal(g.__testFair.canPerceive(g,classes,observer,target),true);
   let abilities=0;g.useAbility=function(t){if(t===observer)abilities++;return true;};
   const ai=g.__testWindow.__novaMakeRequire('')('game/ai');
   ai.updateAI(observer,g,1/60);
   return {hp,abilities,targetId:observer.ai.__v1112TargetId,
    legalY:target.y,barBottom:target.y-14-2.5};
  }finally{g.destroy();}
 });
 const healthy=arm(100),wounded=arm(20);
 console.log('NOVA_PHASE_PARTIAL_BAR_HP_RESEARCH '+JSON.stringify({healthy,wounded}));
 assert.equal(healthy.legalY,wounded.legalY);
 assert.equal(healthy.barBottom,35.5);
 assert.equal(wounded.barBottom,35.5);
 // Characterization only: do not freeze a private-HP-triggered Phase ability
 // as desired behavior. The browser must establish actual bar readability.
});
