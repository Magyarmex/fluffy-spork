'use strict';
// Real 48-overlay Chromium composition: a Cannon-programmed Bomber shell
// must not leave its six children at the fuse crossing for the rest of a
// demonstrably empty frame. No fake Game/clusterBurst implementations.
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
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const old=Game.prototype.update;
     Game.prototype.update=function(){
      if(!this.__novaDecorativeWorld)window.__novaFuseBirthGame=this;
      return old.apply(this,arguments);
     };
    });
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForFunction(()=>window.__novaFuseBirthGame?.status==='playing',
     null,{timeout:30000});
    const result=await page.evaluate(()=>{
     const g=window.__novaFuseBirthGame;
     if(!g?.player||!g.__novaBattlefield||!g.clusterBurst)
      throw Error('real composed game/Bomber unavailable');
     g.setPaused(true);g.time=120;g.player.x=1000;g.player.y=1000;
     g.tanks=[g.player];g.shapes=[];g.drones=[];g.bullets=[];
     g.__novaTerrain=[];delete g.__novaBattlefieldIndex;
     g.hash={query(_x,_y,_r,out){out.length=0;}};g.tmp=[];
     const dt=1/60,speed=2000,remaining=dt*.65;
     function fire(near){
      const shell={kind:'bullet',id:999121,ownerId:g.player.id,
       x:150-speed*dt*.35,y:0,vx:speed,vy:0,r:3,dmg:26,
       ttl:1,pen:0,hits:0,dead:false,shell:true,beam:false,
       splash:0,color:'#f80',clusterDmg:8,
       __v17Cannon:true,__v17FuseDist:150,
       __v17SpawnX:0,__v17SpawnY:0,__v17FuseArmed:true};
      g.shapes=near?[{id:999122,kind:'shape',type:'circle',
       x:150,y:15,r:3,hp:100,vx:0,vy:0}]:[];
      g.bullets=[shell];g.time+=dt;g.updateBullets(dt);
      return g.bullets.filter(b=>b!==shell&&b.ownerId===g.player.id)
       .map(b=>({dx:b.x-b.px,dy:b.y-b.py,vx:b.vx,vy:b.vy,ttl:b.ttl}));
     }
     const clear=fire(false),contested=fire(true);
     return {clear,contested,remaining,
      overlays:document.querySelectorAll('script[src*="nova-updates/"]').length};
    });
    assert.equal(result.clear.length,6,'real Bomber creates six children');
    for(const c of result.clear){
     assert.ok(Math.abs(c.dx-c.vx*result.remaining)<1e-6,
      'open-field fragment X birth-time travel');
     assert.ok(Math.abs(c.dy-c.vy*result.remaining)<1e-6,
      'open-field fragment Y birth-time travel');
     assert.ok(Math.abs(c.ttl-(.7-result.remaining))<1e-6,
      'open-field fragment physical TTL');
    }
    assert.equal(result.contested.length,6);
    for(const c of result.contested){
     assert.equal(c.dx,0,'uncertain fragment contact must abstain');
     assert.equal(c.dy,0,'uncertain fragment contact must abstain');
     assert.ok(Math.abs(c.ttl-.7)<1e-6,'contested TTL retains legacy owner');
    }
    assert.ok(result.overlays>=48,'shipping overlays must be present');
    assert.deepEqual(errors,[],'no Chromium page errors');
    console.log('NOVA_FUSE_BOMBER_BIRTH '+JSON.stringify({
     viewport,clear:result.clear.length,contested:result.contested.length,
     remaining:result.remaining,overlays:result.overlays}));
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
