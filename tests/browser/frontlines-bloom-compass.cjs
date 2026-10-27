'use strict';
// Real 320px React/Chromium acceptance for the public BLOOM compass toast.
// Uses the materialized 48-overlay game, actual Front Director and actual UI.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:320,height:568},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(()=>{
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const old=Game.prototype.update;
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaBloomCompassGame=this;
    return old.apply(this,arguments);
   };
  });
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaBloomCompassGame?.status==='playing'&&
   !!window.__novaBloomCompassGame.__lfState,{timeout:30000});
  const signal=await page.evaluate(()=>{
   const g=window.__novaBloomCompassGame,LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
   if(!LF||!g.player||!g.toast)throw Error('canonical Front Director/player/toast missing');
   g.setPaused(true);
   const p=g.player,st=g.__lfState;
   p.alive=true;p.hp=Math.max(100,p.hp);p.x=-1750;p.y=-562.5;
   g.cam.x=p.x;g.cam.y=p.y;
   st.age=100;st.ceiling=1;st.signal=null;st.lastSignalAt=-99;
   st.lastBloomSector=-1;st.directorEnabled=true;st.migrationHeat=0;
   st.cooldowns.bloom=0;st.cooldowns.migration=100;st.cooldowns.star=100;
   st.sectors.forEach(s=>{s.value=0;s.maturity=.1;s.pressure=0;});
   st.sectors[5].value=900;st.sectors[5].maturity=.95;
   let emitted=null;
   const old=g.toast;
   g.toast=function(message){emitted=message;return old.apply(this,arguments);};
   try{LF.directorTick(g,st);}finally{g.toast=old;}
   return {emitted,sector:st.signal&&st.signal.sector,type:st.signal&&st.signal.type,
    realGame:!!window.__novaMakeRequire,visibleViewport:window.innerWidth};
  });
  assert.equal(signal.type,'BLOOM');
  assert.equal(signal.sector,5);
  assert.match(signal.emitted,/SHAPE BLOOM · E · quiet ground is rich/);
  await page.waitForFunction(()=>[...document.querySelectorAll('.panel.anim-pop')].
   some(n=>n.textContent?.includes('SHAPE BLOOM · E')),{timeout:10000});
  const ui=await page.evaluate(()=>{
   const n=[...document.querySelectorAll('.panel.anim-pop')].
    find(n=>n.textContent?.includes('SHAPE BLOOM · E'));
   if(!n)return null;
   const r=n.getBoundingClientRect();
   return {text:n.textContent,left:r.left,right:r.right,height:r.height,viewport:window.innerWidth};
  });
  assert.ok(ui,'public compass must reach the actual React toast');
  assert.ok(ui.left>=-1&&ui.right<=ui.viewport+1,'320px toast must not clip: '+JSON.stringify(ui));
  assert.ok(ui.height<110,'public compass must not obscure combat: '+JSON.stringify(ui));
  assert.deepEqual(errors,[],'no runtime page errors');
  const output=path.join('artifacts','browser');fs.mkdirSync(output,{recursive:true});
  await page.screenshot({path:path.join(output,'frontlines-bloom-compass-320.png')});
  console.log('NOVA_BLOOM_COMPASS '+JSON.stringify({signal,ui}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
