'use strict';
// #1106: actual composed canvas and AI scorer must agree for joined opaque walls.
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1000,height:700}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const original=Game.prototype.update;
   Game.prototype.update=function(){if(!this.__novaDecorativeWorld)window.__novaJoinedWallGame=this;return original.apply(this,arguments);};
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaJoinedWallGame?.status==='playing',{timeout:30000});
  const result=await page.evaluate(()=>{
   const g=window.__novaJoinedWallGame;g.setPaused(true);
   const F=window.__NOVA_FAIR_ENGAGEMENT_TEST__;
   const C=window.__novaMakeRequire('')('game/classes');
   const renderer=window.__novaMakeRequire('')('game/render');
   const bots=g.tanks.filter(t=>t?.ai&&!t.isPlayer);
   if(bots.length<2)throw Error('missing real AI tanks');
   const [observer,target]=bots;
   const original={tanks:g.tanks,terrain:g.__novaTerrain,index:g.__novaBattlefieldIndex,
    w:g.w,h:g.h,time:g.time,shapes:g.shapes,drones:g.drones,bullets:g.bullets,
    powerups:g.powerups,parts:g.parts,texts:g.texts,cam:{...g.cam},dpr:g.dpr};
   const snapshots=[observer,target].map(t=>({t,state:{...t},ai:t.ai}));
   try{
    Object.assign(observer,{x:0,y:-150,hp:100,maxHp:100,alive:true,spawnShieldT:0,cls:'twin'});
    Object.assign(target,{x:0,y:50,hp:20,maxHp:100,alive:true,spawnShieldT:0,cls:'twin'});
    observer.ai={...observer.ai,state:'hunt',targetId:-1,__v1112TargetId:-1};
    g.tanks=[observer,target];g.w=1000;g.h=700;g.time=10;
    const size=C.CLASSES.twin.size;
    const barY=target.y-size-4.25;
    const walls=[-12,12].map((x,i)=>({id:-900-i,kind:'terrain',shape:'rect',
     x,y:barY,w:24,h:20,type:'wall',destructible:false,solid:true,hp:0,maxHp:0}));
    g.__novaTerrain=walls;g.__novaBattlefieldIndex=null;
    if(!F.healthBarCovered(g,C,target))throw Error('joined bars not concealed');
    const wounded=F.scoreTarget(g,C,observer,observer.ai,target,g.time);
    target.hp=100;
    const healthy=F.scoreTarget(g,C,observer,observer.ai,target,g.time);
    if(Math.abs(wounded-healthy)>1e-7)throw Error('concealed HP leaked into scoring');
    target.hp=20;
    g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];g.parts=[];g.texts=[];
    Object.assign(g.cam,{x:0,y:0,zoom:1,shake:0});g.dpr=1;
    const sx=485,sy=Math.round(350+barY);
    const sample=()=>Array.from(g.ctx.getImageData(sx,sy,1,1).data);
    walls.forEach(w=>w.solid=false);renderer.render(g,1000,700);const open=sample();
    walls.forEach(w=>w.solid=true);renderer.render(g,1000,700);const closed=sample();
    const delta=Math.max(...open.slice(0,3).map((v,i)=>Math.abs(v-closed[i])));
    if(delta<45)throw Error('real canvas not demonstrably occluded '+JSON.stringify({open,closed,delta}));
    walls[1].x=14;
    if(F.healthBarCovered(g,C,target))throw Error('visible wall seam was falsely concealed');
    return {scoreDelta:wounded-healthy,pixels:{open,closed,delta},gapVisible:true};
   }finally{
    snapshots.forEach(({t,state,ai})=>{Object.assign(t,state);t.ai=ai;});
    Object.assign(g,{tanks:original.tanks,__novaTerrain:original.terrain,
     __novaBattlefieldIndex:original.index,w:original.w,h:original.h,time:original.time,
     shapes:original.shapes,drones:original.drones,bullets:original.bullets,
     powerups:original.powerups,parts:original.parts,texts:original.texts,dpr:original.dpr});
    Object.assign(g.cam,original.cam);
   }
  });
  if(errors.length)throw Error('page errors '+JSON.stringify(errors));
  console.log('NOVA_JOINED_WALL_HP_COMPOSED '+JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
