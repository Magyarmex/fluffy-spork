'use strict';
// Research-only #1106: the actual 49-overlay browser Game, not an isolated
// copied scorer. Characterizes a possible screen-space occluded HP case.
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
   const old=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaCoveredHpResearchGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaCoveredHpResearchGame?.status==='playing',{timeout:30000});
  const report=await page.evaluate(()=>{
   const g=window.__novaCoveredHpResearchGame;g.setPaused(true);
   const F=window.__NOVA_FAIR_ENGAGEMENT_TEST__;
   const C=window.__novaMakeRequire('')('game/classes');
   const bots=g.tanks.filter(t=>t&&t.ai&&!t.isPlayer);
   if(bots.length<3||!F?.scoreTarget)throw Error('composed owners unavailable');
   const [observer,covered,clear]=bots;
   const originals={tanks:g.tanks,terrain:g.__novaTerrain,
    terrainIndex:g.__novaBattlefieldIndex,w:g.w,h:g.h,time:g.time,player:g.player};
   const saved=[observer,covered,clear].map(t=>({t,state:{...t},ai:t.ai}));
   try{
    Object.assign(observer,{x:0,y:-150,hp:100,maxHp:100,alive:true,
     spawnShieldT:0,cls:'twin',tier:1});
    Object.assign(covered,{x:0,y:50,hp:100,maxHp:100,alive:true,
     spawnShieldT:0,cls:'twin',tier:1});
    Object.assign(clear,{x:-200,y:-150,hp:100,maxHp:100,alive:true,
     spawnShieldT:0,cls:'twin',tier:1});
    observer.ai={...saved[0].ai,state:'hunt',targetId:-1,__v1112TargetId:-1,
     __v180LastAttacker:-1,__v180HitAt:-99,__v1112NextThink:0};
    covered.ai={...saved[1].ai,state:'wander',targetId:-1,__v1112TargetId:-1};
    clear.ai={...saved[2].ai,state:'wander',targetId:-1,__v1112TargetId:-1};
    g.tanks=[observer,covered,clear];g.w=1000;g.h=700;g.time=10;
    g.__novaTerrain=[{id:-1000,kind:'terrain',shape:'rect',x:0,y:0,
     w:240,h:70,type:'wall',destructible:false,hp:0,maxHp:0,solid:true}];
    g.__novaBattlefieldIndex=null;
    if(g.areAllies?.(observer,covered)||g.areAllies?.(observer,clear))
     throw Error('not hostile');
    const hullSize=C.CLASSES[covered.cls]?.size;
    if(!Number.isFinite(hullSize))throw Error('missing class hull');
    const bar={x0:covered.x-17,x1:covered.x+17,
     y0:covered.y-hullSize-6,y1:covered.y-hullSize-2.5};
    const wall=g.__novaTerrain[0];
    const barFullyOverpainted=bar.x0>=wall.x-wall.w/2&&bar.x1<=wall.x+wall.w/2&&
     bar.y0>=wall.y-wall.h/2&&bar.y1<=wall.y+wall.h/2;
    if(!barFullyOverpainted)throw Error('not an occluded HP bar: '+JSON.stringify({bar,hullSize}));
    if(g.hasLineOfSight(observer.x,observer.y,covered.x,covered.y,4))
     throw Error('covered target unexpectedly has physical LOS');
    if(!F.canPerceive(g,C,observer,covered))throw Error('public viewport contact missing');
    const high=F.scoreTarget(g,C,observer,observer.ai,covered,g.time);
    covered.hp=20;
    const low=F.scoreTarget(g,C,observer,observer.ai,covered,g.time);
    const delta=low-high;
    if(Math.abs(delta-.384)>1e-7)throw Error('expected current HP leak '+delta);
    // Pixel A/B: same actual composed renderer, identical tank/HP/camera,
    // toggling only the wall's solidity. This is the player's canvas,
    // not a recreated bar painter or a geometric-only proxy.
    const renderer=window.__novaMakeRequire('')('game/render');
    const drawSaved={shapes:g.shapes,drones:g.drones,bullets:g.bullets,
     powerups:g.powerups,parts:g.parts,texts:g.texts,
     cam:{...g.cam},dpr:g.dpr};
    let pixelEvidence;
    try{
     g.shapes=[];g.drones=[];g.bullets=[];g.powerups=[];
     g.parts=[];g.texts=[];
     Object.assign(g.cam,{x:0,y:0,zoom:1,shake:0});
     g.dpr=1;
     const sample=()=>Array.from(g.ctx.getImageData(485,381,1,1).data);
     wall.solid=false;
     renderer.render(g,1000,700);
     const open=sample();
     wall.solid=true;
     renderer.render(g,1000,700);
     const coveredPixel=sample();
     pixelEvidence={open,covered:coveredPixel,redDelta:open[0]-coveredPixel[0]};
     if(pixelEvidence.redDelta<70)
      throw Error('actual canvas bar not demonstrably overpainted: '+JSON.stringify(pixelEvidence));
     // Adversarial reachable-boundary probe: normal Battlefield movement
     // resolves a size14 Twin against a wall with radius size+3. The prior
     // y=50 pixel witness may be inside that collision exclusion.
     covered.y=50;
     g.moveTank(covered,0,0,1/60);
     const resolvedY=covered.y;
     const rows=()=>Array.from({length:9},(_,i)=>({
       y:380+i,rgba:Array.from(g.ctx.getImageData(485,380+i,1,1).data)
     }));
     wall.solid=false;renderer.render(g,1000,700);
     const reachableOpen=rows();
     wall.solid=true;renderer.render(g,1000,700);
     const reachableCovered=rows();
     const barBottom=resolvedY-hullSize-2.5;
     // Ordinary movement must place the hull outside the solid collision
     // radius. This is the crucial negative control for the earlier y=50
     // manually injected, potentially unreachable full-bar witness.
     const nearFace=wall.y+wall.h/2;
     if(!(resolvedY>=nearFace+hullSize+3-0.01))
       throw Error('reachable wall separation violated: '+JSON.stringify({resolvedY,nearFace,hullSize}));
     if(!(barBottom>nearFace))
       throw Error('full bar unexpectedly inside wall at legal collision boundary: '+JSON.stringify({barBottom,nearFace}));
     const visibleRows=reachableOpen.map((entry,i)=>({
       y:entry.y,
       openRed:entry.rgba[0],
       coveredRed:reachableCovered[i].rgba[0],
       redDelta:entry.rgba[0]-reachableCovered[i].rgba[0]
     }));
     pixelEvidence.reachableBoundary={resolvedY,barBottom,nearFace,
       fullStripGeometricallyCovered:barBottom<=nearFace,
       visibleRows,open:reachableOpen,covered:reachableCovered};
     // Same-color wounded-health contrast: measure the entire health-bar
     // raster, not just one cherry-picked red pixel. This is observational
     // evidence, NOT a claim that a human can/cannot read the remaining strip.
     // At zoom 1 the legal y=52 Twin bar spans world x=-17..17 and y=32..35.5.
     // Canvas center is (500,350), so sample a generous 40x9 pixel rectangle.
     const healthPixels=(hp,solid)=>{
       covered.hp=hp;wall.solid=solid;
       renderer.render(g,1000,700);
       return Array.from(g.ctx.getImageData(480,378,40,10).data);
     };
     const compare=(a,b)=>{
       let changed=0,maxChannelDelta=0,sumDelta=0,rows=[];
       for(let y=0;y<10;y++){
         let rowChanged=0;
         for(let x=0;x<40;x++){
           const k=(y*40+x)*4;
           const delta=Math.max(...[0,1,2].map(c=>Math.abs(a[k+c]-b[k+c])));
           if(delta>5){changed++;rowChanged++;}
           maxChannelDelta=Math.max(maxChannelDelta,delta);sumDelta+=delta;
         }
         rows.push(rowChanged);
       }
       return {changed,maxChannelDelta,meanMaxChannelDelta:sumDelta/400,rows};
     };
     const oldHp=covered.hp;
     try{
       const open55=healthPixels(55,false),open30=healthPixels(30,false);
       const wall55=healthPixels(55,true),wall30=healthPixels(30,true);
       pixelEvidence.reachableSameTierContrast={
         sample:{x:480,y:378,width:40,height:10},
         openHp55vs30:compare(open55,open30),
         wallHp55vs30:compare(wall55,wall30),
         wallSuppressionAt55:compare(open55,wall55),
         wallSuppressionAt30:compare(open30,wall30)
       };
       if(pixelEvidence.reachableSameTierContrast.openHp55vs30.changed===0)
         throw Error('open health-bar A/B control has no readable raster difference');
     }finally{covered.hp=oldHp;}

    }finally{
     Object.assign(g, {shapes:drawSaved.shapes,drones:drawSaved.drones,
      bullets:drawSaved.bullets,powerups:drawSaved.powerups,
      parts:drawSaved.parts,texts:drawSaved.texts,dpr:drawSaved.dpr});
     Object.assign(g.cam,drawSaved.cam);
     wall.solid=true;
    }
    return {hullSize,bar,wall,barFullyOverpainted,scoreDelta:delta,
     pixelEvidence,physicalLOS:false,viewportContact:true,
     originalTankCount:originals.tanks.length};
   }finally{
    for(const {t,state,ai} of saved){Object.assign(t,state);t.ai=ai;}
    g.tanks=originals.tanks;g.__novaTerrain=originals.terrain;
    g.__novaBattlefieldIndex=originals.terrainIndex;
    g.w=originals.w;g.h=originals.h;g.time=originals.time;g.player=originals.player;
   }
  });
  if(errors.length)throw Error('page errors '+JSON.stringify(errors));
  console.log('NOVA_COVERED_HP_COMPOSED_RESEARCH '+JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
