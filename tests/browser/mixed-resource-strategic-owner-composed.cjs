'use strict';
// Real composed 49-overlay Battle Sense wiring for a critical heal/shield pair.
// Synthetic geometry and read-only strategic route spy: not natural-match CPU.
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:900,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game,old=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaMixedResourceGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaMixedResourceGame?.status==='playing',{timeout:30000});
  const report=await page.evaluate(()=>{
   const g=window.__novaMixedResourceGame;
   g.setPaused(true);
   const bot=g.tanks.find(t=>t&&t.ai&&!t.isPlayer);
   const choose=window.__NOVA_BATTLE_SENSE_TEST__?.chooseResource;
   const classes=window.__novaMakeRequire('')('game/classes');
   if(!bot||typeof choose!=='function')throw Error('missing composed AI and Battle Sense');
   const original={tanks:g.tanks,visible:g.__novaFairVisibleTanks,
    powerups:g.powerups,bullets:g.bullets,los:g.hasLineOfSight,
    strategic:g.novaStrategicRouteCost,waypoint:g.novaBattlefieldWaypoint,
    routes:g.__v1102Routes};
   const saved={...bot},savedAi={...bot.ai},out=[];
   try{
    Object.assign(bot,{id:700007,cls:'guard',x:-340,y:0,
     hp:10,maxHp:100,alive:true,stats:{...bot.stats,speed:0}});
    bot.ai={...savedAi};
    const enemies=[{id:80,cls:'guard',x:-350,y:-100,alive:true,stats:{speed:0}},
     {id:81,cls:'guard',x:-350,y:100,alive:true,stats:{speed:0}}];
    g.tanks=[bot,...enemies];g.__novaFairVisibleTanks=g.tanks;
    g.bullets=[];
    // Force occlusion for pickup paths only; the two local opponents remain visible.
    g.hasLineOfSight=(ax,ay,bx,by)=>bx<0&&bx!==-50;
    const heal={id:'heal',type:'heal',x:340,y:-40};
    const shield={id:'shield',type:'shield',x:-50,y:40};
    for(const order of ['heal-first','shield-first']){
     g.powerups=order==='heal-first'?[heal,shield]:[shield,heal];
     const sentinel={gx:900,gy:900,at:10};
     g.__v1102Routes=Object.create(null);g.__v1102Routes['700007:6']=sentinel;
     const calls=[];let liveCalls=0;
     g.novaStrategicRouteCost=(x,y,gx,gy,pad,id,goal)=>{
      calls.push({goal,gx,gy});return Math.hypot(gx-x,gy-y)+40;
     };
     g.novaBattlefieldWaypoint=()=>{liveCalls++;return null;};
     const selected=choose(g,bot,classes)?.id||null;
     const intact=g.__v1102Routes['700007:6']===sentinel&&
      Object.keys(g.__v1102Routes).length===1;
     out.push({order,selected,calls,liveCalls,intact});
     if(!intact||liveCalls!==0)throw Error('live route polluted: '+JSON.stringify(out.at(-1)));
     if(!selected||calls.length<1||calls.length>2)
      throw Error('invalid bounded mixed strategic evaluation: '+JSON.stringify(out.at(-1)));
    }
   }finally{
    Object.assign(bot,saved);bot.ai=savedAi;
    Object.assign(g,{tanks:original.tanks,__novaFairVisibleTanks:original.visible,
     powerups:original.powerups,bullets:original.bullets,
     hasLineOfSight:original.los,novaStrategicRouteCost:original.strategic,
     novaBattlefieldWaypoint:original.waypoint,__v1102Routes:original.routes});
   }
   return out;
  });
  if(errors.length)throw Error('browser errors: '+JSON.stringify(errors));
  if(report.length!==2)throw Error('missing mixed-resource orders');
  console.log('MIXED_RESOURCE_COMPOSED_OWNER '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
