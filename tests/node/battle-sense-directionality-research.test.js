'use strict';
// Research witness: a rival's observed speed magnitude does not reveal its
// intended destination. This characterizes the composed-game contest model;
// it deliberately does NOT require any particular pickup choice to stay fixed.
const test=require('node:test');
const assert=require('node:assert/strict');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');

test('composed pickup contest reports toward/away witnessed-speed ambiguity at 30/60 Hz',()=>{
 const reports=[];
 for(const hz of [30,60])for(const direction of [-1,1]){
  reports.push(withSeed(1517800,()=>{
   const g=bootGame();if(!g.player)g.redeploy();
   try{
    const rival=g.player,observer=g.tanks.find(t=>t!==rival&&t.ai);
    assert.ok(observer,'requires composed AI observer');
    const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
    const h=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
    assert.equal(typeof h.resourceContest,'function');
    g.tanks=[observer,rival];g.__novaFairVisibleTanks=g.tanks;
    g.__novaTerrain=[];g.__novaBattlefieldIndex=null;
    if(g.hash?.clear)g.hash.clear();
    Object.assign(observer,{cls:'guard',x:0,y:0,alive:true,hp:20,maxHp:100});
    observer.ai={};
    Object.assign(rival,{cls:'guard',x:direction===1?-80:280,y:120,
     vx:0,vy:0,alive:true,spawnShieldT:0,shieldT:0,stampedeT:0,
     hasteT:0,perk:'speed',stats:{...rival.stats,speed:8}});
    g.hasLineOfSight=()=>true;
    const originalSpeed=g.tankSpeed;
    const realSpeed=originalSpeed.call(g,rival);
    const p={id:'heal',type:'heal',x:400,y:120};
    const contest=()=>{
     g.tankSpeed=t=>{
      if(t===rival)throw Error('private rival speed read');
      return originalSpeed.call(g,t);
     };
     try{return h.resourceContest(g,observer,p,Math.hypot(p.x-observer.x,p.y-observer.y),classes);}
     finally{g.tankSpeed=originalSpeed;}
    };
    g.time=0;contest();
    const dt=1/hz;
    for(let frame=1;frame<=hz;frame++){
     g.time=frame*dt;
     g.moveTank(rival,direction*realSpeed,0,dt);
     if(frame%Math.round(hz/5)===0)contest();
    }
    const witness=observer.ai.__v181RivalSpeedWitness?.[String(rival.id)];
    assert.ok(witness?.confirmed>=3,'composed running should be observed');
    // Normalize the final public snapshot. The two histories differ only in
    // approach direction, while final rival position and class match.
    rival.x=100;rival.y=120;
    const witnessed=contest();
    const memory=observer.ai;observer.ai={};
    const classOnly=contest();observer.ai=memory;
    assert.ok(Number.isFinite(witnessed)&&Number.isFinite(classOnly));
    return {hz,direction,observedSpeed:+witness.fast.toFixed(3),
     witnessed:+witnessed.toFixed(6),classOnly:+classOnly.toFixed(6)};
   }finally{g.destroy();}
  }));
 }
 console.log('COMPOSED_RIVAL_DIRECTIONALITY_RESEARCH '+JSON.stringify(reports));
 // Direction is intentionally not asserted as a behavior contract: future
 // movement-intent modeling may legitimately distinguish these histories.
});
