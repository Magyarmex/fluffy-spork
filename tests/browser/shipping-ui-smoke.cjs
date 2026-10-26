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

    await deploy.click();
    await page.locator('canvas.absolute.inset-0').waitFor({state:'visible',timeout:30000});
    await page.waitForTimeout(1300);
    const live=await page.evaluate(()=>window.NOVALivingFront?.snapshot?.());
    assert.equal(live?.active,true,label+': actual React gameplay must advance ecology');
    assert.ok(live.age>0,label+': ecological match age must advance');
    assert.equal(live.sectors?.length,16,label+': all ecological sectors present');
    await page.screenshot({path:path.join(output,label+'-playing.png')});

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
    await scenario(browser,'mobile',{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
