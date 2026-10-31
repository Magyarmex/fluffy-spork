'use strict';
/* Real composed 48-overlay NOVA: a locally witnessed pre-entry BLOOM warning
 * must arrive at minimap cadence, without waiting for the 0.72s Director tick.
 * Exercise desktop and portrait mobile with actual Battlefield terrain/LOS. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  for(const viewport of [{width:900,height:700},{width:320,height:568}]){
   const page=await browser.newPage({viewport});
   const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
   try{
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const old=Game.prototype.update;
     Game.prototype.update=function(){
      if(!this.__novaDecorativeWorld)window.__novaEarlyWarningGame=this;
      return old.apply(this,arguments);
     };
    });
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForFunction(()=>window.__novaEarlyWarningGame?.status==='playing'&&
      !!window.__novaEarlyWarningGame.__lfState,{timeout:30000});
    const result=await page.evaluate(()=>{
     const g=window.__novaEarlyWarningGame,T=window.__NOVA_LIVING_FRONT_TEST__;
     if(!T||!g.mmCtx)throw Error('shipping Frontlines/minimap owners missing');
     g.setPaused(true);
     const p=g.player,e=g.tanks.find(t=>t!==p&&!t.isPlayer);
     const shape=g.shapes.find(s=>s&&s.type==='hexagon'&&s.hp>0);
     if(!p||!e||!shape)throw Error('canonical player, enemy or harvestable hexagon missing');
     const original={tanks:g.tanks,shapes:g.shapes,px:p.x,py:p.y,
       ex:e.x,ey:e.y,sx:shape.x,sy:shape.y,camx:g.cam.x,camy:g.cam.y,
       time:g.time,signal:g.__lfState.signal,memory:g.__lfState.bloomMemory,
       contest:g.__lfState.contestSignal,approach:g.__lfState.approachSignal,
       hp:p.hp,shield:p.spawnShieldT,ehp:e.hp,eshield:e.spawnShieldT};
     const st=g.__lfState;
     p.hp=Math.max(100,p.hp);p.alive=true;p.spawnShieldT=0;
     e.hp=Math.max(100,e.hp);e.alive=true;e.spawnShieldT=0;
     g.tanks=[p,e];g.shapes=[shape];
     st.signal=null;st.bloomMemory={sector:5,announcedAt:g.time-7,until:g.time+17,initialValue:500};
     st.contestSignal=null;st.approachSignal=null;st.__lfApproachNextAt=0;
     let found=null;
     for(const v of [-1010,-850,-690,-530,-370,-210,-90]){
      if(found)break;
      const probes=[
       [-1155,v,-1075,v+12,-1035,v+22],
       [35,v,-45,v+12,-85,v+22],
       [v,-1155,v+12,-1075,v+22,-1035],
       [v,35,v+12,-45,v+22,-85]
      ];
      for(const [px,py,ex,ey,sx,sy] of probes){
       if(g.isTerrainSafe&&(!g.isTerrainSafe(px,py,20)||
         !g.isTerrainSafe(ex,ey,20)||!g.isTerrainSafe(sx,sy,25)))continue;
       if(!g.hasLineOfSight(px,py,ex,ey,2)||!g.hasLineOfSight(px,py,sx,sy,2))continue;
       p.x=px;p.y=py;e.x=ex;e.y=ey;shape.x=sx;shape.y=sy;
       g.cam.x=px;g.cam.y=py;
       if(T.preEntryCandidate(g,st)){found={px,py,ex,ey,sx,sy};break;}
      }
     }
     if(!found)throw Error('no real terrain-clear visible pre-entry BLOOM on this viewport');
     const before=st.stats.contests||0;
     const mm=g.mmCtx,oldText=mm.fillText,oldDash=mm.setLineDash;
     let badge=false,dashed=false;
     mm.fillText=function(v){if(v==='!')badge=true;return oldText.apply(this,arguments);};
     mm.setLineDash=function(v){if(v?.[0]===7&&v?.[1]===5)dashed=true;return oldDash.apply(this,arguments);};
     try{g.drawMinimap();}finally{mm.fillText=oldText;mm.setLineDash=oldDash;}
     if(!badge||!dashed||!st.approachSignal)
      throw Error('minimap failed to warn before the next Director sample');
     if(st.stats.contests!==undefined&&(st.stats.contests||0)!==before)
      throw Error('early warning awarded contest credit');
     if(st.contestSignal)throw Error('early warning fabricated a contest');
     e.x=1800;e.y=1800;g.time+=.20;
     badge=false;
     mm.fillText=function(v){if(v==='!')badge=true;return oldText.apply(this,arguments);};
     try{g.drawMinimap();}finally{mm.fillText=oldText;}
     if(badge||st.approachSignal)
      throw Error('stale visual threat survived a fresh empty witness');
     Object.assign(p,{x:original.px,y:original.py,hp:original.hp,spawnShieldT:original.shield});
     Object.assign(e,{x:original.ex,y:original.ey,hp:original.ehp,spawnShieldT:original.eshield});
     Object.assign(shape,{x:original.sx,y:original.sy});
     g.tanks=original.tanks;g.shapes=original.shapes;g.time=original.time;
     g.cam.x=original.camx;g.cam.y=original.camy;
     st.signal=original.signal;st.bloomMemory=original.memory;
     st.contestSignal=original.contest;st.approachSignal=original.approach;
     return{viewport:{width:g.w,height:g.h},terrainClear:true,
      warnedBeforeDirector:true,staleCueCleared:true,contestUnchanged:true};
    });
    assert.equal(errors.length,0,'browser page errors: '+errors.join('; '));
    results.push(result);
   }finally{await page.close();}
  }
  assert.equal(results.length,2);
  console.log('NOVA_FRONTLINES_EARLY_WARNING '+JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
