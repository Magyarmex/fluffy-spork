'use strict';
/* Real React + production overlay chain: between-life insertion is an actual
 * player choice, not a unit-only helper. No hidden world manipulation. */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
async function run(browser,width,height){
 const context=await browser.newContext({viewport:{width,height}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const old=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld&&this.player&&this.status==='playing')window.__novaFrontSmokeGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaFrontSmokeGame?.status==='playing',null,{timeout:30000});
  const death=await page.evaluate(()=>{
   const g=window.__novaFrontSmokeGame;
   const p=g.player;
   const pos={x:p.x,y:p.y};
   g.killTank(p,null);
   return pos;
  });
  const returnButton=page.locator('[data-nova-insertion="return"]');
  await returnButton.waitFor({state:'visible',timeout:15000});
  assert.equal(await page.locator('[data-nova-insertion="fresh"]').getAttribute('aria-pressed'),'true');
  await returnButton.click();
  assert.equal(await returnButton.getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:/REDEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaFrontSmokeGame?.status==='playing',null,{timeout:15000});
  const after=await page.evaluate(()=>{
   const g=window.__novaFrontSmokeGame;
   return {x:g.player.x,y:g.player.y,choice:g.__novaRedeployChoice,terrain:g.isTerrainSafe(g.player.x,g.player.y,75)};
  });
  const dist=Math.hypot(after.x-death.x,after.y-death.y);
  assert.ok(dist>=420-1e-6&&dist<=850+1e-6,'return inserts near the witnessed front');
  assert.equal(after.terrain,true,'return position is terrain safe');
  assert.equal(after.choice,'fresh','choice resets after redeploy');
  await page.locator('[data-nova-front-choice]').waitFor({state:'hidden',timeout:5000});
  assert.deepEqual(errors,[],'no page errors');
  console.log('NOVA_REDEPLOY_FRONT_SMOKE '+JSON.stringify({width,height,dist,terrain:after.terrain,reset:after.choice}));
 }finally{await context.close();}
}
async function main(){const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 for(const [width,height] of [[320,568],[640,320],[900,700]])await run(browser,width,height);
}finally{await browser.close();}}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
