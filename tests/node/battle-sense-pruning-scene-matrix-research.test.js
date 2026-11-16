'use strict';
// Research only: representative geometric spread in the actual composed Game.
// This is not a natural-match distribution or a physical Android frame-time gate.
const test=require('node:test'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];

test('composed rival pruning scene matrix reports costs and preserves contest scores',()=>{
 const results=withSeed(1517800,()=>{
  const g=bootGame();if(!g.player)g.redeploy();
  try{
   const bot=g.tanks.find(t=>t?.ai&&!t.isPlayer);
   const classes=g.__testWindow.__novaMakeRequire('')('game/classes');
   const h=g.__testWindow.__NOVA_BATTLE_SENSE_TEST__;
   const fair=g.__testWindow.__NOVA_FAIR_ENGAGEMENT__;
   assert.ok(bot&&h&&typeof g.hasLineOfSight==='function');
   Object.assign(bot,{id:99000,cls:'guard',x:1000,y:1000,hp:20,maxHp:100,alive:true});
   const realSpeed=g.tankSpeed;
   g.tankSpeed=t=>{if(t!==bot)throw Error('private rival speed read');return realSpeed.call(g,t);};
   const realLos=g.hasLineOfSight.bind(g);
   const scenes=[
    {name:'sparse4',positions:Array.from({length:4},(_,i)=>[700+i*150,920+(i%2)*160])},
    {name:'spread13',positions:Array.from({length:13},(_,i)=>[600+i*55,880+(i%3)*120])},
    {name:'cluster13',positions:Array.from({length:13},(_,i)=>[900+i*14,970+(i%2)*60])}
   ];
   const pickups=[{id:1,x:1300,y:1000},{id:2,x:700,y:1000}],out=[];
   for(const scene of scenes){
    const rivals=scene.positions.map(([x,y],i)=>({
     id:99001+i,cls:'guard',x,y,alive:true,hp:100,maxHp:100,stats:{speed:0}
    }));
    g.tanks=[bot,...rivals];g.time=10;
    g.__novaFairVisibleTanks=[bot,...rivals.filter(q=>
     !fair||typeof fair.inGameplayViewport!=='function'||fair.inGameplayViewport(g,bot,q))];
    const contacts=g.__novaFairVisibleTanks;
    // Only a genuinely visible, in-viewport rival gets a public speed
    // certificate. An occluded rival must take the uncached visibility path.
    const speeds=contacts.map(q=>q===bot||!realLos(bot.x,bot.y,q.x,q.y,3)
     ?null:{target:q,id:q.id,cls:q.cls,x:q.x,y:q.y,speed:124});
    const cam=g.cam,snapshot={at:g.time,owner:bot,tanks:contacts,
     ownerX:bot.x,ownerY:bot.y,viewW:g.w,viewH:g.h,camera:cam,
     camX:cam&&cam.x,camY:cam&&cam.y,camZoom:cam&&cam.zoom,
     rivals:contacts,speeds};
    for(const p of pickups){
     const selfDist=Math.hypot(p.x-bot.x,p.y-bot.y),N=350,rounds=4;
     const arms={control:[],cached:[]};
     let probes=0;
     g.hasLineOfSight=function(){probes++;return realLos(...arguments);};
     function sample(cached){
      bot.ai={};
      if(cached)Object.defineProperty(bot.ai,'__v181RivalSpeedSnapshot',
       {configurable:true,value:snapshot});
      const before=probes,start=performance.now();let sum=0;
      for(let i=0;i<N;i++)sum+=h.resourceContest(g,bot,p,selfDist,classes);
      return {us:(performance.now()-start)/N*1000,score:sum/N,
       probes:(probes-before)/N};
     }
     sample(false);sample(true);
     for(let k=0;k<rounds;k++){
      const first=sample(k%2===1),second=sample(k%2===0);
      const control=k%2===1?second:first,cached=k%2===1?first:second;
      assert.ok(Math.abs(control.score-cached.score)<1e-9,
       scene.name+' pickup '+p.id+' must preserve contest score');
      assert.ok(cached.probes<=control.probes+1e-9,
       scene.name+' pickup '+p.id+' cache/pruning cannot add terrain LOS probes');
      arms.control.push(control);arms.cached.push(cached);
     }
     out.push({scene:scene.name,pickup:p.id,contacts:contacts.length-1,
      controlUs:+median(arms.control.map(x=>x.us)).toFixed(3),
      cachedUs:+median(arms.cached.map(x=>x.us)).toFixed(3),
      controlProbes:+median(arms.control.map(x=>x.probes)).toFixed(2),
      cachedProbes:+median(arms.cached.map(x=>x.probes)).toFixed(2)});
    }
    g.hasLineOfSight=realLos;
   }
   return out;
  }finally{g.destroy();}
 });
 console.log('COMPOSED_RIVAL_PRUNING_SCENE_MATRIX '+JSON.stringify(results));
 assert.equal(results.length,6);
});
