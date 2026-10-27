'use strict';
/* Real Chromium + React + all shipping overlays: an earned menu record must
 * survive reloading an ACTIVE run, without requiring the death screen.
 * This deliberately uses Game.gainXP, not a mocked storage writer. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
async function run(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:900,height:700}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   localStorage.removeItem('novatanks_best');
   localStorage.setItem('novatanks_bestlevel','30');
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const old=Game.prototype.update;
   Game.prototype.update=function(dt){
    if(!this.__novaDecorativeWorld&&this.player&&this.status==='playing'){
     window.__novaScoreGame=this;
     if(!this.__novaBestSmokePaused){this.__novaBestSmokePaused=true;this.setPaused(true);}
    }
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaScoreGame?.status==='playing',null,{timeout:30000});
  const earned=await page.evaluate(()=>{
   const g=window.__novaScoreGame;
   g.setPaused(true);
   const before=g.player.score,level=g.player.level;
   g.gainXP(g.player,40);
   return{before,after:g.player.score,level,status:g.status,record:localStorage.getItem('novatanks_best')};
  });
  assert.equal(earned.status,'playing');
  assert.equal(earned.level,1,'Living Front must NOT restore legacy pity-level boosts');
  assert.ok(earned.after>earned.before,'real engine must award score');
  assert.equal(earned.record,null,'record should be coalesced rather than written per XP call');
  await page.reload({waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  const after=await page.evaluate(()=>({
   stored:localStorage.getItem('novatanks_best'),
   menu:document.body.innerText
  }));
  const expected=Math.round(earned.after);
  assert.equal(Number(after.stored),expected,'pagehide must persist earned score before reload');
  assert.ok(after.menu.includes('BEST SCORE')&&after.menu.includes(String(expected)),
   'React menu must show earned personal best without requiring death');
  assert.deepEqual(errors,[],'browser runtime errors');
  console.log('NOVA_LIVE_BEST_SCORE_RELOAD '+JSON.stringify({earned:expected,stored:after.stored,menuVisible:true}));
 }finally{await context.close();await browser.close();}
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
