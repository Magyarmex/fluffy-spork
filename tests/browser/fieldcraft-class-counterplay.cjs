'use strict';
// Real React/Chromium regression: class-specific Fieldcraft advice must be
// rendered on the existing death card, without a new control or overflow.
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
    if(!this.__novaDecorativeWorld&&this.player)window.__novaFieldcraftGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaFieldcraftGame?.status==='playing',null,{timeout:30000});
  for(const cls of ['hivemind','bastion']){
   const expected=await page.evaluate(id=>{
    const g=window.__novaFieldcraftGame,p=g.player;
    const killer=g.tanks.find(t=>t.alive&&!t.isPlayer&&t.id!==p.id);
    if(!killer)throw Error('real live AI opponent unavailable');
    g.setClass(killer,id);
    const classes=window.__novaMakeRequire('')('game/classes');
    const note=window.__NOVA_DEATH_INSIGHT_TEST__.choose(p,killer,classes);
    if(!note)throw Error('missing canonical matchup '+id);
    g.killTank(p,killer);
    return note;
   },cls);
   const note=page.locator('[data-nova-death-insight]');
   await note.waitFor({state:'visible',timeout:15000});
   const heading=await note.locator('div').first().textContent();
   const body=await note.locator('div').nth(1).textContent();
   assert.equal(body,expected.lesson,'real React card must use canonical '+cls+' advice');
   assert.ok(heading.includes(expected.name.toUpperCase()),
    'real React card must identify actual killer class: '+heading);
   const fit=await note.evaluate(e=>{
    const r=e.getBoundingClientRect(),root=document.documentElement;
    const body=e.children[1],range=document.createRange();
    range.selectNodeContents(body);
    const text=range.getBoundingClientRect();
    return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,
     textLeft:text.left,textRight:text.right,textBottom:text.bottom,
     width:innerWidth,height:innerHeight,scrollWidth:root.scrollWidth,
     visible:!!e.offsetWidth};
   });
   assert.ok(fit.visible&&fit.left>=-1&&fit.right<=fit.width+1,
    'Fieldcraft note must remain inside the mobile card: '+JSON.stringify(fit));
   assert.ok(fit.textLeft>=fit.left-1&&fit.textRight<=fit.right+1,
    'lesson must wrap rather than overflow horizontally: '+JSON.stringify(fit));
   assert.ok(fit.scrollWidth<=fit.width+1,'death insight must not create page-wide overflow');
   const fresh=page.locator('[data-nova-insertion="fresh"]');
   await fresh.waitFor({state:'visible',timeout:5000});
   await fresh.scrollIntoViewIfNeeded();
   await fresh.click();
   await page.waitForFunction(()=>window.__novaFieldcraftGame?.status==='playing',null,{timeout:15000});
   await note.waitFor({state:'hidden',timeout:5000});
  }
  assert.deepEqual(errors,[],'no real-browser page errors');
  console.log('NOVA_FIELDCRAFT_CLASS_SMOKE '+JSON.stringify({width,height,classes:['hivemind','bastion']}));
 }finally{await context.close();}
}
async function main(){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{for(const [w,h] of [[280,568],[640,320],[900,700]])await run(browser,w,h);}
 finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
