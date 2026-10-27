'use strict';
// Real shipping React/Chromium integration: Tactical Frontlines' short public
// commitment must be reachable through the actual composed game/ai module.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:900,height:700}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game,old=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaFrontlineTurnGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaFrontlineTurnGame?.status==='playing'&&
   !!window.__novaFrontlineTurnGame.__lfState,{timeout:30000});
  const result=await page.evaluate(()=>{
   const g=window.__novaFrontlineTurnGame,T=window.__NOVA_LIVING_FRONT_TEST__;
   const ai=window.__novaMakeRequire('')('game/ai');
   if(!T||!ai||typeof ai.updateAI!=='function')throw Error('shipping AI / Frontlines owner missing');
   g.setPaused(true);
   /* Test a genuinely NEW rotating cohort (phase 2), not the old fixed id%3===1 group. */
   const e=g.tanks.find(t=>t&&t.ai&&t!==g.player&&Math.abs(Number(t.id)||0)%3===2&&Math.abs(Number(t.id)||0)%4!==0);
   if(!e)throw Error('no eligible actual rival in the canonical arena');
   /* Battlefield layouts and seeds differ between runs. Search the real
    * terrain for a legal public opportunity rather than assuming sector 5
    * has an unobstructed approach in every random map. */
   let c=null,spot=null,sector=-1;
   for(let i=0;i<16&&!spot;i++){
    const center=T.sectorCenter(i);
    for(let dx=-650;dx<=650&&!spot;dx+=50)for(let dy=-650;dy<=650&&!spot;dy+=50){
     const x=center.x+dx,y=center.y+dy,d=Math.hypot(dx,dy);
     /* An earlier fixture began INSIDE the announced sector. Require a
      * genuine outside-to-inside rotation, not center-seeking after arrival. */
     if(d<575||d>625||T.sectorIndex(x,y)===i||
        Math.abs(x)>T.ARENA-40||Math.abs(y)>T.ARENA-40)continue;
     if(g.isTerrainSafe&&!g.isTerrainSafe(x,y,28))continue;
     if(g.hasLineOfSight&&!g.hasLineOfSight(x,y,center.x,center.y,8))continue;
     spot={x,y,d};c=center;sector=i;
    }
   }
   if(!spot)throw Error('no real terrain-safe approach to any public sector');
   const original={x:e.x,y:e.y,hp:e.hp,maxHp:e.maxHp,spawnShieldT:e.spawnShieldT};
   const originalShapes=g.shapes,originalBullets=g.bullets,originalHash=g.hash;
   const p=g.player,oldPX=p.x,oldPY=p.y;
   const other=g.tanks.filter(t=>t!==e&&t!==p).map(t=>({t,alive:t.alive,hp:t.hp}));
   try{
    e.x=spot.x;e.y=spot.y;e.hp=e.maxHp||100;e.spawnShieldT=0;
    p.x=2000;p.y=2000;
    for(const o of other){o.t.alive=false;o.t.hp=0;}
    g.shapes=[];g.bullets=[];g.hash=null;
    g.time=146;
    const st=g.__lfState;st.directorEnabled=true;st.signal=null;
    st.bloomMemory={sector:sector,announcedAt:140,until:164};
    const a=e.ai;a.__lfEcoT=0;a.__lfFrontTurn=null;a.__lfFrontTurnSpentKey=null;
    a.__v1112TargetId=-1;a.__v180HitAt=-99;a.__v180Threat={risk:0};a.__v180Posture='investigate';
    const before=st.stats.aiFrontlineCommitments||0,startX=e.x,startY=e.y;
    ai.updateAI(e,g,.3);
    const dx=e.x-startX,dy=e.y-startY,moved=Math.hypot(dx,dy);
    const toward=moved>0?(dx*(c.x-startX)+dy*(c.y-startY))/(moved*spot.d):null;
    const after=st.stats.aiFrontlineCommitments||0;
    if(after!==before+1)throw Error('real composed AI did not start public BLOOM commitment: '+JSON.stringify({
     mode:a.__lfEcoMode,weight:a.__lfEcoWeight,before,after,spot}));
    if(a.__lfEcoMode!=='memory'||!a.__lfFrontTurnSpentKey)
     throw Error('real AI commitment did not use public memory');
    const rememberedWeight=+a.__lfEcoWeight.toFixed(3);
    /* The same real Battlefield/AI/movement composition must also respond
     * during the live public five-second announcement. Reuse the verified
     * terrain-safe outside approach, not a synthetic movement substitute. */
    e.x=spot.x;e.y=spot.y;
    st.signal={type:'BLOOM',sector:sector,x:c.x,y:c.y,started:142,until:147};
    st.bloomMemory={sector:sector,announcedAt:142,until:166};
    a.__lfEcoT=0;a.__lfFrontTurn=null;a.__lfFrontTurnSpentKey=null;
    a.__v1112TargetId=-1;a.__v180HitAt=-99;a.__v180Threat={risk:0};a.__v180Posture='investigate';
    const liveBefore=st.stats.aiFrontlineCommitments||0;
    ai.updateAI(e,g,.3);
    const liveDX=e.x-spot.x,liveDY=e.y-spot.y,liveMoved=Math.hypot(liveDX,liveDY);
    const liveToward=liveMoved>0?(liveDX*(c.x-spot.x)+liveDY*(c.y-spot.y))/(liveMoved*spot.d):null;
    const liveAfter=st.stats.aiFrontlineCommitments||0;
    if(liveAfter!==liveBefore+1||a.__lfEcoMode!=='signal'||!(liveToward>.7))
     throw Error('live public BLOOM failed real composed tactical turn: '+JSON.stringify({
      mode:a.__lfEcoMode,weight:a.__lfEcoWeight,before:liveBefore,after:liveAfter,liveToward,spot}));
    return{realComposedAI:true,commitmentsAdded:after-before,mode:'memory',
     weight:rememberedWeight,approachDistance:Math.round(spot.d),
     sector:sector,actualMovement:+moved.toFixed(3),towardPublicCenter:toward==null?null:+toward.toFixed(3),
     livePublic:{commitmentsAdded:liveAfter-liveBefore,actualMovement:+liveMoved.toFixed(3),
      towardPublicCenter:+liveToward.toFixed(3),mode:a.__lfEcoMode}};
   }finally{
    e.x=original.x;e.y=original.y;e.hp=original.hp;e.maxHp=original.maxHp;e.spawnShieldT=original.spawnShieldT;
    p.x=oldPX;p.y=oldPY;g.shapes=originalShapes;g.bullets=originalBullets;g.hash=originalHash;
    for(const o of other){o.t.alive=o.alive;o.t.hp=o.hp;}
   }
  });
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('NOVA_FRONTLINES_COMPOSED_TACTICAL_TURN '+JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
