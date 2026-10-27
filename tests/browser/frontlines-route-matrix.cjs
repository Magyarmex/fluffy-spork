'use strict';
// Research-only multi-bearing route matrix on the materialized Game, AI and Battlefield.
// NOT a full-match A/B, fun score, or a causal estimate of contest frequency.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const LAYOUTS=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const reports=[];
 try{
  for(let raw=0;raw<3;raw++){
   const page=await browser.newPage({viewport:{width:900,height:700}});
   const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
   try{
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
    await page.evaluate((seed)=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const oldSpawn=Game.prototype.spawnPlayer,oldUpdate=Game.prototype.update;
     // The canonical Battlefield generator samples Date.now and Math.random
     // on its FIRST ensureTerrain. Control exactly that call, not later AI RNG.
     Game.prototype.spawnPlayer=function(){
      if(this.__novaTerrain)return oldSpawn.apply(this,arguments);
      const oldNow=Date.now,oldRand=Math.random;
      let first=true;
      Date.now=()=>0;
      Math.random=()=>first?(first=false,seed/0x7fffffff):oldRand();
      try{return oldSpawn.apply(this,arguments);}
      finally{Date.now=oldNow;Math.random=oldRand;}
     };
     Game.prototype.update=function(){
      if(!this.__novaDecorativeWorld)window.__novaPairedFrontGame=this;
      return oldUpdate.apply(this,arguments);
     };
    },raw);
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForFunction(()=>window.__novaPairedFrontGame?.status==='playing'&&
     !!window.__novaPairedFrontGame.__lfState,{timeout:30000});
    const result=await page.evaluate((seed)=>{
     const g=window.__novaPairedFrontGame,T=window.__NOVA_LIVING_FRONT_TEST__,
      ai=window.__novaMakeRequire('')('game/ai');
     if(!T||!ai||typeof ai.updateAI!=='function')throw Error('canonical Frontlines/AI unavailable');
     g.setPaused(true);
     const layout=g.__novaBattlefield&&g.__novaBattlefield.name;
     const expected=['CROSSFIRE','SPLIT HORIZON','FOUR GATES'][seed];
     if(layout!==expected)throw Error('layout fixture not controlled: expected '+expected+' got '+layout);
     const p=g.player,e=g.tanks.find(t=>t&&t.ai&&t!==p&&Math.abs(Number(t.id)||0)%3===1&&Math.abs(Number(t.id)||0)%4!==0);
     if(!p||!e)throw Error('missing real pilot or eligible rival');
     let spot=null,center=null,sector=-1;
     for(let i=0;i<16&&!spot;i++){
      const c=T.sectorCenter(i);
      /* The sector half-width is 562.5u. The original 240–570u
       * center-distance search accidentally started every rival INSIDE
       * its BLOOM sector. Demand a true outside-to-inside rotation, not
       * merely movement toward the center of an already occupied pocket. */
      for(let dx=-650;dx<=650&&!spot;dx+=50)for(let dy=-650;dy<=650&&!spot;dy+=50){
       const x=c.x+dx,y=c.y+dy,d=Math.hypot(dx,dy);
       if(d<575||d>650||Math.abs(x)>T.ARENA-40||Math.abs(y)>T.ARENA-40)continue;
       if(T.sectorIndex(x,y)===i)continue;
       if(g.isTerrainSafe&&!g.isTerrainSafe(x,y,28))continue;
       if(g.hasLineOfSight&&!g.hasLineOfSight(x,y,c.x,c.y,8))continue;
       spot={x,y,d};center=c;sector=i;
      }
     }
     if(!spot)throw Error('no traversable public approach in '+layout);
     /* Research matrix: retain the proven baseline and sample additional
      * physically outside-sector bearings, plus one terrain-occluded lane.
      * These are diagnostics, not claims of full-match behavior. */
     const approaches=[{spot,center,sector,label:'baseline',blocked:false}];
     const bearings=[
      {label:'east',accept:(dx,dy)=>dx>=575&&Math.abs(dy)<=200},
      {label:'west',accept:(dx,dy)=>dx<=-575&&Math.abs(dy)<=200},
      {label:'north',accept:(dx,dy)=>dy<=-575&&Math.abs(dx)<=200},
      {label:'south',accept:(dx,dy)=>dy>=575&&Math.abs(dx)<=200}
     ];
     for(const bearing of bearings){
      let candidate=null;
      for(let i=0;i<16&&!candidate;i++){
       const c=T.sectorCenter(i);
       for(let dx=-650;dx<=650&&!candidate;dx+=50)
        for(let dy=-650;dy<=650&&!candidate;dy+=50){
         const x=c.x+dx,y=c.y+dy,d=Math.hypot(dx,dy);
         if(d<575||d>680||Math.abs(x)>T.ARENA-40||Math.abs(y)>T.ARENA-40)continue;
         if(!bearing.accept(dx,dy)||T.sectorIndex(x,y)===i)continue;
         if(g.isTerrainSafe&&!g.isTerrainSafe(x,y,28))continue;
         if(g.hasLineOfSight&&!g.hasLineOfSight(x,y,c.x,c.y,8))continue;
         candidate={spot:{x,y,d},center:c,sector:i,label:bearing.label,blocked:false};
        }
      }
      if(candidate)approaches.push(candidate);
     }
     let occluded=null;
     for(let i=0;i<16&&!occluded;i++){
      const c=T.sectorCenter(i);
      for(let dx=-700;dx<=700&&!occluded;dx+=100)
       for(let dy=-700;dy<=700&&!occluded;dy+=100){
        const x=c.x+dx,y=c.y+dy,d=Math.hypot(dx,dy);
        if(d<575||d>740||Math.abs(x)>T.ARENA-40||Math.abs(y)>T.ARENA-40)continue;
        if(T.sectorIndex(x,y)===i||g.isTerrainSafe&&!g.isTerrainSafe(x,y,28))continue;
        if(!g.hasLineOfSight||g.hasLineOfSight(x,y,c.x,c.y,8))continue;
        occluded={spot:{x,y,d},center:c,sector:i,label:'terrain-occluded',blocked:true};
       }
     }
     if(occluded)approaches.push(occluded);
     if(approaches.length<3)throw Error('insufficient legal route-matrix bearings in '+layout);

     const original={x:e.x,y:e.y,hp:e.hp,maxHp:e.maxHp,shield:e.spawnShieldT,
      playerX:p.x,playerY:p.y,shapes:g.shapes,bullets:g.bullets,hash:g.hash,
      tanks:g.tanks,time:g.time,signal:g.__lfState.signal,memory:g.__lfState.bloomMemory,
      routes:g.__v1102Routes,routeContext:g.__v1102RouteContext};
     const other=g.tanks.filter(t=>t!==e&&t!==p).map(t=>({t,hp:t.hp,alive:t.alive}));
     const baseTank={...e},baseAI={...e.ai},st=g.__lfState,a=e.ai;
     let memo={sector,announcedAt:100,until:124,initialValue:500};
     const random=Math.random;
     const run=(enabled,steps=1)=>{
      for(const k of Object.keys(e))if(!(k in baseTank))delete e[k];
      Object.assign(e,baseTank);e.ai=a;
      for(const k of Object.keys(a))if(!(k in baseAI))delete a[k];
      Object.assign(a,baseAI);
      /* Terrain Intelligence caches waypoint plans by tank id. Reusing a
       * physical id across experimental arms without resetting this cache
       * makes ON/OFF order change the route, even with identical RNG. */
      a.__v1102Nav=null;g.__v1102Routes=Object.create(null);g.__v1102RouteContext=null;
      e.x=spot.x;e.y=spot.y;e.hp=e.maxHp||100;e.alive=true;e.spawnShieldT=0;
      a.__lfEcoT=0;a.__lfEcoBias={};a.__lfFrontTurn=null;a.__lfFrontTurnSpentKey=null;
      a.__v1112TargetId=-1;a.__v180HitAt=-99;a.__v180Threat={risk:0};a.__v180Posture='investigate';
      st.directorEnabled=true;st.signal=null;st.bloomMemory=enabled?memo:null;
      g.time=106;
      let state=0x6d2b79f5;
      Math.random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
      let entered=false;
      try{
       for(let step=0;step<steps;step++){
        g.time=106+step*.275;
        ai.updateAI(e,g,.275);
        if(T.sectorIndex(e.x,e.y)===sector)entered=true;
       }
      }finally{Math.random=random;}
      const dx=e.x-spot.x,dy=e.y-spot.y;
      return{mode:a.__lfEcoMode,committed:!!a.__lfFrontTurnSpentKey,
       entered:entered,insideAtEnd:T.sectorIndex(e.x,e.y)===sector,
       distance:+Math.hypot(dx,dy).toFixed(3),
       progress:+(spot.d-Math.hypot(e.x-center.x,e.y-center.y)).toFixed(3),
       x:+dx.toFixed(3),y:+dy.toFixed(3)};
     };
     try{
      p.x=2000;p.y=2000;
      for(const o of other){o.t.alive=false;o.t.hp=0;}
      g.shapes=[];g.bullets=[];g.hash=null;
      /* Counterbalance execution order. A one-step A/B is not controlled if
       * the first arm changes hidden state consumed by the second arm. */
      const trials=[];
      for(const approach of approaches){
       ({spot,center,sector}=approach);
       memo={sector,announcedAt:100,until:124,initialValue:500};
      const off=run(false),on=run(true),onFirst=run(true),offSecond=run(false);
      const equal=(a,b)=>a.mode===b.mode&&a.committed===b.committed&&
       a.entered===b.entered&&a.insideAtEnd===b.insideAtEnd&&
       Math.abs(a.progress-b.progress)<.001&&Math.abs(a.x-b.x)<.001&&Math.abs(a.y-b.y)<.001;
      if(!equal(off,offSecond)||!equal(on,onFirst))
       throw Error('paired microtrial has an execution-order confound: '+JSON.stringify({layout,off,on,onFirst,offSecond}));
      if(approach.label==='baseline'&&(on.mode!=='memory'||!on.committed))throw Error('ON arm failed to reach actual tactical commitment: '+JSON.stringify({layout,spot,on}));
      if(off.mode==='memory'||off.committed)throw Error('OFF arm inherited a public-memory commitment');
      if(approach.label==='baseline'&&!(on.distance>0&&off.distance>0))throw Error('paired actual movement did not occur');
      /* Longer fixed-input movement horizon, still not a live match: combat,
       * harvesting and player controls are deliberately frozen. */
      const offLong=run(false,8),onLong=run(true,8),onLongFirst=run(true,8),offLongSecond=run(false,8);
      if(!equal(offLong,offLongSecond)||!equal(onLong,onLongFirst))
       throw Error('eight-step A/B has an execution-order confound: '+JSON.stringify({layout,offLong,onLong,onLongFirst,offLongSecond}));
      trials.push({label:approach.label,blocked:approach.blocked,sector,
       approachDistance:Math.round(spot.d),off,on,
       deltaProgress:+(on.progress-off.progress).toFixed(3),orderInvariant:true,
       eightStep:{off:offLong,on:onLong,deltaProgress:+(onLong.progress-offLong.progress).toFixed(3),orderInvariant:true}});
      }
      return{layout,seed,trials,
       testedBearings:trials.length,committedBearings:trials.filter(t=>t.on.committed).length,
       method:'multi-bearing one-step/eight-step frozen-input actual Game.moveTank; order counterbalanced; not full match'};
     }finally{
      e.x=original.x;e.y=original.y;e.hp=original.hp;e.maxHp=original.maxHp;
      e.spawnShieldT=original.shield;p.x=original.playerX;p.y=original.playerY;
      g.shapes=original.shapes;g.bullets=original.bullets;g.hash=original.hash;
      g.tanks=original.tanks;g.time=original.time;st.signal=original.signal;st.bloomMemory=original.memory;
      g.__v1102Routes=original.routes;g.__v1102RouteContext=original.routeContext;
      for(const o of other){o.t.hp=o.hp;o.t.alive=o.alive;}
     }
    },raw);
    assert.equal(errors.length,0,errors.join('\n'));
    reports.push(result);
   }finally{await page.close();}
  }
  assert.deepEqual(reports.map(r=>r.layout),LAYOUTS);
  console.log('NOVA_FRONTLINES_ROUTE_MATRIX_MICROTRIAL '+JSON.stringify(reports));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
