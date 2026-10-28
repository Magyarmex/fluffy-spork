'use strict';
/* Full React + Chromium + shipping overlays, with deliberately poisoned
 * localStorage in a disposable browser context. The browser-smoke workflow
 * applies the exact decoded-base patches before serving the shell. */
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

async function main() {
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  const context = await browser.newContext({viewport:{width:900,height:700}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror',e=>errors.push(String(e.stack||e)));
  try {
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
      localStorage.setItem('novatanks_best','Infinity');
      localStorage.setItem('novatanks_bestlevel','Infinity');
    });
    await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
    const menu = await page.evaluate(()=>document.body.innerText);
    assert.ok(!menu.includes('BEST SCORE'), 'invalid zero-equivalent record is not displayed in React menu');
    assert.ok(!menu.includes('Infinity') && !menu.includes('NaN'), 'menu cannot display corrupt record');

    await page.evaluate(()=>{
      const Game=window.__novaMakeRequire('')('game/engine').Game;
      const old=Game.prototype.update;
      Game.prototype.update=function(dt){
        if(!this.__novaDecorativeWorld&&this.player&&this.status==='playing'){
          window.__novaCorruptRecordGame=this;
          if(!this.__novaRecordPaused){this.__novaRecordPaused=true;this.setPaused(true);}
        }
        return old.apply(this,arguments);
      };
    });
    await page.getByRole('button',{name:/DEPLOY/i}).first().click();
    await page.waitForFunction(()=>window.__novaCorruptRecordGame?.status==='playing',null,{timeout:30000});
    const result = await page.evaluate(()=>{
      const g=window.__novaCorruptRecordGame;
      const before={best:g.best,level:g.bestRunLevel,pity:g.pityStartLevel(),score:g.player.score};
      g.gainXP(g.player,40);
      return {before,after:g.player.score,alive:g.player.alive};
    });
    assert.deepEqual(result.before,{best:0,level:0,pity:1,score:0});
    assert.ok(result.after>=40 && result.alive, 'XP still awards normally');
    await page.waitForFunction(()=>Number(localStorage.getItem('novatanks_best'))>=40,null,{timeout:7000});
    const savedLevel=await page.evaluate(()=>{
      const g=window.__novaCorruptRecordGame;
      const before={alive:g.player.alive,level:g.player.level,bestRunLevel:g.bestRunLevel};
      g.killTank(g.player,null);
      return {stored:localStorage.getItem('novatanks_bestlevel'),before,
        after:{alive:g.player.alive,level:g.player.level,bestRunLevel:g.bestRunLevel,status:g.status}};
    });
    console.log('NOVA_BESTLEVEL_DIAGNOSTIC '+JSON.stringify(savedLevel));
    assert.ok(savedLevel.before.level>=1 && savedLevel.before.bestRunLevel===0);
    assert.equal(savedLevel.stored,String(savedLevel.before.level),
      'a legitimate death replaces poisoned best-level storage with the actual earned level');
    await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
    const recovered=await page.evaluate(()=>({
      best:localStorage.getItem('novatanks_best'),
      menu:document.body.innerText
    }));
    assert.equal(recovered.best,'40','a real earned score replaces poisoned Infinity storage');
    assert.ok(recovered.menu.includes('BEST SCORE')&&recovered.menu.includes('40'),
      'React menu displays recovered record after reload');
    assert.deepEqual(errors,[],'no browser runtime errors');
    console.log('NOVA_CORRUPT_RECORD_RECOVERY '+JSON.stringify({saved:recovered.best,menu:true,pity:1}));
  } finally {
    await context.close();
    await browser.close();
  }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
