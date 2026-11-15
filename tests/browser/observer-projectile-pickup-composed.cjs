'use strict';
// Composed 49-overlay Game acceptance for observer-visible projectile risk.
// Controlled pickup/projectile fixture, not natural-match incidence.
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
   Game.prototype.update=function(){if(!this.__novaDecorativeWorld)window.__novaProjectileWitnessGame=this;return old.apply(this,arguments);};
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaProjectileWitnessGame?.status==='playing',{timeout:30000});
  const report=await page.evaluate(()=>{
   const g=window.__novaProjectileWitnessGame;
   g.setPaused(true);
   const bot=g.tanks.find(t=>t&&t.ai&&!t.isPlayer);
   const choose=window.__NOVA_BATTLE_SENSE_TEST__?.chooseResource;
   const fair=window.__NOVA_FAIR_ENGAGEMENT__;
   const classes=window.__novaMakeRequire('')('game/classes');
   if(!bot||typeof choose!=='function'||typeof fair?.inGameplayWorldPoint!=='function')
    throw Error('missing composed Game, Battle Sense or Fair Engagement');
   const originals={w:g.w,h:g.h,cam:g.cam,los:g.hasLineOfSight,bullets:g.bullets,
    powerups:g.powerups,tanks:g.tanks,visibleTanks:g.__novaFairVisibleTanks};
   const state={...bot},ai={...bot.ai};
   const results=[];
   try{
    Object.assign(bot,{id:700007,cls:'guard',x:0,y:0,hp:20,maxHp:100,alive:true});
    bot.ai={...ai};g.tanks=[bot];g.__novaFairVisibleTanks=[bot];g.cam={...(g.cam||{}),zoom:1};
    g.hasLineOfSight=()=>true;
    // Public pickup coordinates are allowed outside the observer viewport.
    const near={id:'near',type:'heal',x:600,y:0},far={id:'far',type:'heal',x:620,y:0};
    g.powerups=[near,far];
    const bullet={id:bot.id,ownerId:999,x:600,y:20,vx:0,vy:0,ttl:1};
    for(const [label,w,h,zoom,bullets,occluded,expected] of [
     ['portrait-baseline',320,480,1,[],false,'near'],
     ['portrait-unseen',320,480,1,[bullet],false,'near'],
     ['landscape-unseen',480,320,1,[bullet],false,'near'],
     ['wide-visible',1600,900,1,[bullet],false,'far'],
     ['zoom-out-visible',900,700,.7,[bullet],false,'far'],
     ['zoom-in-unseen',900,700,1.2,[bullet],false,'near'],
     ['wide-terrain-hidden',1600,900,1,[bullet],true,'near']
    ]){
     g.w=w;g.h=h;g.cam.zoom=zoom;g.bullets=bullets;
     g.hasLineOfSight=occluded?(ax,ay,bx,by)=>!(ax===bot.x&&ay===bot.y&&bx===bullet.x&&by===bullet.y):()=>true;
     const observed=fair.inGameplayWorldPoint(g,bot,bullet.x,bullet.y);
     const selected=choose(g,bot,classes)?.id||null;
     results.push({label,w,h,zoom,observed,selected,expected});
     if(selected!==expected)throw Error('wrong composed-game pickup choice: '+JSON.stringify(results.at(-1)));
     if(label.includes('unseen')&&observed)throw Error('fixture bullet unexpectedly visible: '+label);
     if((label==='wide-visible'||label==='zoom-out-visible')&&!observed)throw Error('fixture bullet unexpectedly offscreen');
    }
   }finally{
    Object.assign(bot,state);bot.ai=ai;
    Object.assign(g,{w:originals.w,h:originals.h,cam:originals.cam,
     hasLineOfSight:originals.los,bullets:originals.bullets,powerups:originals.powerups,
     tanks:originals.tanks,__novaFairVisibleTanks:originals.visibleTanks});
   }
   return results;
  });
  if(errors.length)throw Error('browser errors: '+JSON.stringify(errors));
  if(report.length!==7)throw Error('missing composed-game acceptance arms');
  console.log('OBSERVER_PROJECTILE_COMPOSED_GAME '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
