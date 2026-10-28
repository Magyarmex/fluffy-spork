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
   {bearing:'SAME SECTOR',x:-562.5,y:-562.5,width:280},
   // A migration reports two distinct public facts: crossing location and flow.
   {type:'MIGRATION',bearing:'E OF YOU',flow:'E',x:-1750,y:-562.5,width:320},
   {type:'MIGRATION',bearing:'NEAR YOU',flow:'E',x:0,y:-562.5,width:280}
  ];
  for(const c of cases){
   await page.setViewportSize({width:c.width,height:568});
   const signal=await page.evaluate(({x,y,type})=>{
    const g=window.__novaBloomCompassGame,LF=window.__NOVA_LIVING_FRONT_INTERNAL__;
    if(!LF||!g?.player||!g.toast)throw Error('canonical Front Director/player/toast missing');
    g.setPaused(true);
    const p=g.player,st=g.__lfState;
    p.alive=true;p.hp=Math.max(100,p.hp);p.x=x;p.y=y;
    g.cam.x=x;g.cam.y=y;
    st.age=100;st.ceiling=1;st.signal=null;st.bloomMemory=null;
    st.lastSignalAt=-99;st.lastBloomSector=-1;st.directorEnabled=true;
    st.migrationHeat=type==='MIGRATION'?6:0;
    st.migrationX=1;st.migrationY=0;
    st.cooldowns.bloom=type==='MIGRATION'?100:0;
    st.cooldowns.migration=type==='MIGRATION'?0:100;st.cooldowns.star=100;
    st.sectors.forEach(s=>{s.value=0;s.maturity=.1;s.pressure=0;s.outbound=0;});
    st.sectors[5].value=900;st.sectors[5].maturity=.95;
    st.sectors[5].outbound=12;st.sectors[5].flowX=1;st.sectors[5].flowY=0;st.sectors[5].flowTo[6]=12;
    // The test jumps to match-time 100 within the first live second. Prevent
    // a pending Battlefield startup toast from overwriting this test signal.
    if(g.__novaBattlefield)g.__novaBattlefield.announced=true;
    let emitted=null;
    const old=g.toast;
    g.toast=function(message){emitted=message;return old.apply(this,arguments);};
    try{LF.directorTick(g,st);}finally{g.toast=old;g.setPaused(false);}
    return {emitted,sector:st.signal&&st.signal.sector,
     from:st.signal&&st.signal.from,to:st.signal&&st.signal.to,
     type:st.signal&&st.signal.type,
     realGame:!!window.__novaMakeRequire,viewport:window.innerWidth};
   },{x:c.x,y:c.y,type:c.type});
   assert.equal(signal.type,c.type||'BLOOM','real Director must announce the intended public signal');
   if(c.type==='MIGRATION'){
    assert.equal(signal.from,5,'migration must retain witnessed origin');
    assert.equal(signal.to,6,'migration must retain the public destination');
    assert.match(signal.emitted,new RegExp('MIGRATION · '+c.bearing+' · FLOW '+c.flow+'$'));
   }else{
    assert.equal(signal.sector,5,'BLOOM must not change public destination');
    assert.match(signal.emitted,new RegExp('SHAPE BLOOM · '+c.bearing+' · quiet ground is rich'));
   }
   assert.equal(signal.viewport,c.width);
   await page.waitForFunction(message=>[...document.querySelectorAll('.panel.anim-pop')].
    some(n=>n.textContent===message),signal.emitted,{timeout:10000});
   // A paused-game overlay can fully occlude the toast while all geometry
   // assertions still pass. Verify the real playing presentation instead.
   assert.equal(await page.getByText('PAUSED',{exact:true}).count(),0,
    'a pause modal must not conceal the compass under test');
   // The pop-in animation scales the bounding box; inspect settled geometry.
   await page.waitForTimeout(400);
   const ui=await page.evaluate(message=>{
    const n=[...document.querySelectorAll('.panel.anim-pop')].
     find(n=>n.textContent===message);
    if(!n)return null;
    const r=n.getBoundingClientRect(),range=document.createRange();
    const gear=document.getElementById('nova-pilot-gear');
    const gr=gear&&!gear.hidden?gear.getBoundingClientRect():null;
    range.selectNodeContents(n);
    const glyph=range.getBoundingClientRect();
    return {text:n.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,
     height:r.height,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,
     scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,
     glyphLeft:glyph.left,glyphRight:glyph.right,
     gear:gr?{left:gr.left,right:gr.right,top:gr.top,bottom:gr.bottom}:null,
     viewport:window.innerWidth,viewportHeight:window.innerHeight};
   },signal.emitted);
   assert.ok(ui,'public compass must reach the actual React toast: '+
    JSON.stringify({signal,visible:await page.evaluate(()=>
     [...document.querySelectorAll('div')].map(e=>e.textContent||'')
      .filter(t=>t.includes('BLOOM')||t.includes('MIGRATION'))
      .slice(-5))}));
   assert.ok(ui.left>=-1&&ui.right<=ui.viewport+1,
    'toast panel clips at '+c.width+'px: '+JSON.stringify(ui));
   assert.ok(ui.glyphLeft>=-1&&ui.glyphRight<=ui.viewport+1,
    'toast glyphs clip at '+c.width+'px: '+JSON.stringify(ui));
   assert.ok(ui.scrollWidth<=ui.clientWidth+1&&ui.scrollHeight<=ui.clientHeight+1,
    'toast text overflows its panel at '+c.width+'px: '+JSON.stringify(ui));
   assert.ok(ui.gear,'real gameplay settings button must be present');
   assert.ok(ui.bottom<=ui.gear.top||ui.top>=ui.gear.bottom||
    ui.right<=ui.gear.left||ui.left>=ui.gear.right,
    'public announcement must not sit underneath the settings button: '+JSON.stringify(ui));
   assert.ok(ui.height<110,'toast obscures too much combat at '+c.width+'px: '+JSON.stringify(ui));
   assert.ok(ui.top>=0&&ui.bottom<=ui.viewportHeight,'toast outside portrait viewport: '+JSON.stringify(ui));
   await page.screenshot({path:path.join(output,
    'frontlines-'+(c.type||'bloom').toLowerCase()+'-compass-'+c.bearing.replace(/ /g,'-').toLowerCase()+'-'+c.width+'.png')});
   results.push({bearing:c.bearing,signal,ui});
  }
  assert.deepEqual(errors,[],'no runtime page errors');
  console.log('NOVA_BLOOM_COMPASS '+JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
