'use strict';
// Real Chromium/React smoke. Runs against the repository's shipping index.html,
// not a mocked module registry. It deliberately does not claim physical-device FPS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

async function scenario(browser, label, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error && error.stack || error)));
  const output = path.join('artifacts','browser');
  fs.mkdirSync(output,{recursive:true});
  try {
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    const deploy = page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:45000});
    await page.locator('.nv-lobby-battlefield').waitFor({state:'attached',timeout:30000});
    const menu = await page.evaluate(() => {
      const Game=window.__novaMakeRequire('')('game/engine').Game;
      return {
        fair:Game.prototype.__novaFairEngagement===true,
        ecology:Game.prototype.__novaLivingFrontCore===true,
        decorative:!!document.querySelector('.nv-lobby-battlefield'),
        active:window.NOVALivingFront?.snapshot?.().active
      };
    });
    assert.equal(menu.fair,true,label+': browser must load Fair Engagement owner');
    assert.equal(menu.ecology,true,label+': browser must load Living Front owner');
    assert.equal(menu.decorative,true,label+': War Room must be visible');
    assert.equal(menu.active,false,label+': War Room must not impersonate active game');
    await page.screenshot({path:path.join(output,label+'-menu.png')});

    // Observe the actual React-owned Game instance without replacing its update logic.
    await page.evaluate(()=>{
      const Game=window.__novaMakeRequire('')('game/engine').Game;
      const original=Game.prototype.update;
      Game.prototype.update=function(dt){
        if(!this.__novaDecorativeWorld)window.__novaBrowserLiveGame=this;
        return original.apply(this,arguments);
      };
    });

    await deploy.click();
    await page.locator('canvas.absolute.inset-0').waitFor({state:'visible',timeout:30000});
    await page.waitForTimeout(1300);
    const live=await page.evaluate(()=>window.NOVALivingFront?.snapshot?.());
    assert.equal(live?.active,true,label+': actual React gameplay must advance ecology');
    assert.ok(live.age>0,label+': ecological match age must advance');
    assert.equal(live.sectors?.length,16,label+': all ecological sectors present');
    await page.screenshot({path:path.join(output,label+'-playing.png')});

    if(label==='desktop'){
      await page.evaluate(()=>{
        const Game=window.__novaMakeRequire('')('game/engine').Game;
        const original=Game.prototype.tryFire;
        window.__novaBrowserPlayerShots=0;
        Game.prototype.tryFire=function(t){
          const n=this.bullets.length;
          const result=original.apply(this,arguments);
          if(t&&t.isPlayer&&this.bullets.length>n)window.__novaBrowserPlayerShots++;
          return result;
        };
      });
      const box=await page.locator('canvas.absolute.inset-0').boundingBox();
      assert.ok(box&&box.width>100&&box.height>100);
      await page.mouse.move(box.x+box.width*.66,box.y+box.height*.5);
      await page.keyboard.down('d');
      await page.mouse.down();
      await page.waitForTimeout(900);
      await page.mouse.up();
      await page.keyboard.up('d');
      const shots=await page.evaluate(()=>window.__novaBrowserPlayerShots);
      assert.ok(shots>0,'actual desktop mouse+WASD gameplay must launch projectiles');
    }

    await page.getByRole('button',{name:'Pause'}).click();
    await page.getByText('PAUSED',{exact:true}).waitFor({state:'visible'});
    const paused=await page.evaluate(()=>window.NOVALivingFront.snapshot().age);
    await page.waitForTimeout(550);
    const still=await page.evaluate(()=>window.NOVALivingFront.snapshot().age);
    assert.equal(still,paused,label+': pause must freeze ecological age');
    await page.screenshot({path:path.join(output,label+'-paused.png')});
    await page.getByRole('button',{name:/RESUME/i}).click();
    await page.waitForTimeout(600);
    const resumed=await page.evaluate(()=>window.NOVALivingFront.snapshot().age);
    assert.ok(resumed>paused,label+': resume must restart ecological simulation');

    // Exercise Controller on the same live React/game path, not a synthetic VM.
    await page.evaluate(()=>{
      const g=window.__novaBrowserLiveGame;
      if(!g||!g.player)throw new Error('React-owned playable Game missing');
      g.setClass(g.player,'warden');
      g.player.spawnShieldT=20;
    });
    await page.waitForTimeout(1000);
    const controller=await page.evaluate(()=>{
      const g=window.__novaBrowserLiveGame;
      return {
        cls:g.player.cls,
        drones:g.drones.filter(d=>d.ownerId===g.player.id&&d.hp>0).length,
        ecology:!!g.__lfState,
        playing:g.status==='playing'
      };
    });
    assert.equal(controller.cls,'warden',label+': live Controller class transition works');
    assert.ok(controller.drones>0,label+': Controller actually deploys allied drones');
    assert.equal(controller.ecology,true,label+': ecology remains active after class change');
    assert.equal(controller.playing,true,label+': Controller transition does not end the run');
    if(label.startsWith('mobile')){
      const toastGeometry=await page.evaluate(()=>{
        const node=document.querySelector('[class~="top-[18%]"] > .panel.anim-pop');
        const rect=node?.getBoundingClientRect();
        return rect?{left:rect.left,right:rect.right,width:rect.width,height:rect.height,
          viewport:window.innerWidth,font:getComputedStyle(node).fontSize}:null;
      });
      assert.ok(toastGeometry,'Controller tutorial toast remains present');
      assert.ok(toastGeometry.left>=0&&toastGeometry.right<=toastGeometry.viewport,
        'portrait toast stays entirely inside viewport: '+JSON.stringify(toastGeometry));
      assert.ok(toastGeometry.height<110,
        'portrait tutorial toast must not obscure a large part of the arena: '+JSON.stringify(toastGeometry));
      console.log('NOVA_PORTRAIT_TOAST '+JSON.stringify(toastGeometry));
    }
    await page.screenshot({path:path.join(output,label+'-warden.png')});
    assert.deepEqual(errors,[],label+': no uncaught browser exceptions');
    console.log('NOVA_BROWSER_SMOKE '+JSON.stringify({label,menu,liveAge:live.age,paused,resumed,errors}));
  } finally {
    await context.close();
  }
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--disable-dev-shm-usage','--no-sandbox']});
  try {
    await scenario(browser,'desktop',{viewport:{width:1280,height:800},deviceScaleFactor:1});
    await scenario(browser,'mobile-320',{viewport:{width:320,height:700},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await scenario(browser,'mobile',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await scenario(browser,'mobile-430',{viewport:{width:430,height:932},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
