'use strict';
// Real Chromium acceptance for the public BLOOM compass in the shipping
// 48-overlay game. Test the longest message, not just a one-letter bearing.
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
  const output=path.join('artifacts','browser');fs.mkdirSync(output,{recursive:true});
  const results=[];
  const cases=[
   {bearing:'E',x:-1750,y:-562.5,width:320},
   {bearing:'NW',x:937.5,y:937.5,width:320},
   {bearing:'SAME SECTOR',x:-562.5,y:-562.5,width:320},
   // Stress the existing responsive toast below the normal 320px phone floor.
   {bearing:'SAME SECTOR',x:-562.5,y:-562.5,width:280}
  ];
  for(const c of cases){
   await page.setViewportSize({width:c.width,height:568});
   const signal=await page.evaluate(({x,y})=>{
    const g=window.__novaBloomCompassGame,LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
    if(!LF||!g?.player||!g.toast)throw Error('canonical Front Director/player/toast missing');
    g.setPaused(true);
    const p=g.player,st=g.__lfState;
    p.alive=true;p.hp=Math.max(100,p.hp);p.x=x;p.y=y;
    g.cam.x=x;g.cam.y=y;
    st.age=100;st.ceiling=1;st.signal=null;st.bloomMemory=null;
    st.lastSignalAt=-99;st.lastBloomSector=-1;st.directorEnabled=true;
    st.migrationHeat=0;
    st.cooldowns.bloom=0;st.cooldowns.migration=100;st.cooldowns.star=100;
    st.sectors.forEach(s=>{s.value=0;s.maturity=.1;s.pressure=0;});
    st.sectors[5].value=900;st.sectors[5].maturity=.95;
    let emitted=null;
    const old=g.toast;
    g.toast=function(message){emitted=message;return old.apply(this,arguments);};
    try{LF.directorTick(g,st);}finally{g.toast=old;}
    return {emitted,sector:st.signal&&st.signal.sector,type:st.signal&&st.signal.type,
     realGame:!!window.__novaMakeRequire,viewport:window.innerWidth};
   },{x:c.x,y:c.y});
   assert.equal(signal.type,'BLOOM','real Director must announce a BLOOM');
   assert.equal(signal.sector,5,'announcement must not change public destination');
   assert.equal(signal.viewport,c.width);
   assert.match(signal.emitted,new RegExp('SHAPE BLOOM · '+c.bearing+' · quiet ground is rich'));
   await page.waitForFunction(message=>[...document.querySelectorAll('.panel.anim-pop')].
    some(n=>n.textContent===message),signal.emitted,{timeout:10000});
   // The pop-in animation scales the bounding box; inspect settled geometry.
   await page.waitForTimeout(400);
   const ui=await page.evaluate(message=>{
    const n=[...document.querySelectorAll('.panel.anim-pop')].
     find(n=>n.textContent===message);
    if(!n)return null;
    const r=n.getBoundingClientRect(),range=document.createRange();
    range.selectNodeContents(n);
    const glyph=range.getBoundingClientRect();
    return {text:n.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,
     height:r.height,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,
     scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,
     glyphLeft:glyph.left,glyphRight:glyph.right,
     viewport:window.innerWidth,viewportHeight:window.innerHeight};
   },signal.emitted);
   assert.ok(ui,'public compass must reach the actual React toast');
   assert.ok(ui.left>=-1&&ui.right<=ui.viewport+1,
    'toast panel clips at '+c.width+'px: '+JSON.stringify(ui));
   assert.ok(ui.glyphLeft>=-1&&ui.glyphRight<=ui.viewport+1,
    'toast glyphs clip at '+c.width+'px: '+JSON.stringify(ui));
   assert.ok(ui.scrollWidth<=ui.clientWidth+1&&ui.scrollHeight<=ui.clientHeight+1,
    'toast text overflows its panel at '+c.width+'px: '+JSON.stringify(ui));
   assert.ok(ui.height<110,'toast obscures too much combat at '+c.width+'px: '+JSON.stringify(ui));
   assert.ok(ui.top>=0&&ui.bottom<=ui.viewportHeight,'toast outside portrait viewport: '+JSON.stringify(ui));
   await page.screenshot({path:path.join(output,
    'frontlines-bloom-compass-'+c.bearing.replace(/ /g,'-').toLowerCase()+'-'+c.width+'.png')});
   results.push({bearing:c.bearing,signal,ui});
  }
  assert.deepEqual(errors,[],'no runtime page errors');
  console.log('NOVA_BLOOM_COMPASS '+JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
