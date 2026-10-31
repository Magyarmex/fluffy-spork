'use strict';
// Exact shipping Chromium composition: real Bomber clusterBurst + Battlefield,
// Apex, Performance and all later overlays must honor the fragment birth time.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const viewport of [{width:900,height:700},{width:320,height:568}]){
   const page=await browser.newPage({viewport,deviceScaleFactor:2});
   const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
   try{
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first()
     .waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game,old=Game.prototype.update;
     Game.prototype.update=function(){
      if(!this.__novaDecorativeWorld)window.__novaTerrainBirthGame=this;
      return old.apply(this,arguments);
     };
    });
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForFunction(()=>window.__novaTerrainBirthGame?.status==='playing',
     null,{timeout:30000});
    const result=await page.evaluate(()=>{
     const g=window.__novaTerrainBirthGame;
     if(!g?.player||!g.__novaBattlefield||!g.clusterBurst)
      throw Error('real shipping game/Battlefield/Bomber unavailable');
     g.setPaused(true);
     g.time=120;g.player.x=1000;g.player.y=1000;
     g.shapes=[];g.drones=[];g.tanks=[g.player];g.bullets=[];
     g.hash={query(_x,_y,_r,out){out.length=0;}};
     g.tmp=[];
     g.__novaTerrain=[{id:-81,shape:'rect',x:20,y:0,w:4,h:80,
      solid:true,destructible:false,hp:0}];
     delete g.__novaBattlefieldIndex;
     const created=[],realBurst=g.clusterBurst;
     g.clusterBurst=function(shell){
      const start=this.bullets.length,out=realBurst.call(this,shell);
      for(let i=start;i<this.bullets.length;i++){
       const c=this.bullets[i];
       created.push({ref:c,vx:c.vx,vy:c.vy,ttl:c.ttl});
      }
      return out;
     };
     const shell={kind:'bullet',id:999001,ownerId:g.player.id,
      x:0,y:0,vx:6000,vy:0,r:3,dmg:26,ttl:2,pen:0,hits:0,
      dead:false,shell:true,beam:false,splash:0,color:'#f80',clusterDmg:8};
     g.bullets=[shell];
     const dt=1/60;
     g.updateBullets(dt);
     const impactT=shell.x/6000,remaining=dt-impactT;
     const survivors=created.filter(c=>g.bullets.includes(c.ref));
     return {created:created.length,survivors:survivors.map(c=>({
      dx:c.ref.x-c.ref.px,dy:c.ref.y-c.ref.py,
      expectedDx:c.vx*remaining,expectedDy:c.vy*remaining,
      ttl:c.ref.ttl,expectedTTL:c.ttl-remaining,
      vx:c.ref.vx,expectedVX:c.vx,vy:c.ref.vy,expectedVY:c.vy
     })),impactT,dt,remaining,parentDead:shell.dead,
      overlays:document.querySelectorAll('script[src*="nova-updates/"]').length};
    });
    assert.equal(result.created,6,'real Bomber must produce six children');
    assert.ok(result.parentDead,'terrain-hit parent consumed');
    assert.ok(result.impactT>0&&result.impactT<result.dt,'midframe wall impact');
    assert.ok(result.survivors.length>=2,'outward fragments must survive');
    for(const s of result.survivors){
     assert.ok(Math.abs(s.dx-s.expectedDx)<1e-6,'fragment traveled before birth '+JSON.stringify(s));
     assert.ok(Math.abs(s.dy-s.expectedDy)<1e-6,'fragment lateral travel before birth '+JSON.stringify(s));
     assert.ok(Math.abs(s.ttl-s.expectedTTL)<1e-6,'fragment lost pre-birth TTL '+JSON.stringify(s));
     assert.equal(s.vx,s.expectedVX,'next-frame velocity restored');
     assert.equal(s.vy,s.expectedVY,'next-frame lateral velocity restored');
    }
    assert.deepEqual(errors,[],'no Chromium page errors');
    console.log('NOVA_TERRAIN_BOMBER_BIRTH '+JSON.stringify({viewport,...result}));
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
