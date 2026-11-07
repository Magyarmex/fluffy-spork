'use strict';
// Real shipping Chromium/Canvas acceptance for Tempest's existing heat cue.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const results=[];
 try{
  for(const viewport of [{width:320,height:568},{width:568,height:320}]){
   const page=await browser.newPage({viewport,deviceScaleFactor:2});
   const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   try{
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
    const deploy=page.getByRole('button',{name:/DEPLOY/i}).first();
    await deploy.waitFor({state:'visible',timeout:45000});
    await page.evaluate(()=>{
     const Game=window.__novaMakeRequire('')('game/engine').Game;
     const old=Game.prototype.update;
     Game.prototype.update=function(){
      if(!this.__novaDecorativeWorld)window.__novaTempestCueGame=this;
      return old.apply(this,arguments);
     };
    });
    await deploy.click();
    await page.waitForFunction(()=>window.__novaTempestCueGame?.status==='playing',null,{timeout:30000});
    const dir=path.join('artifacts','browser');fs.mkdirSync(dir,{recursive:true});
    for(const state of [
      {name:'cool',heat:.30,stability:.8,expected:0},
      {name:'apex',heat:.56,stability:.8,expected:1},
      {name:'hot',heat:.80,stability:.8,expected:0},
      {name:'unstable',heat:.56,stability:.50,expected:0}]){
     const data=await page.evaluate(state=>{
      const g=window.__novaTempestCueGame;
      const render=window.__novaMakeRequire('')('game/render').render;
      if(!g?.player||!render||!g.ctx)throw Error('composed renderer unavailable');
      g.setPaused(true);g.setClass(g.player,'tempest');
      g.player.__v17Heat=state.heat;g.player.__v17Stability=state.stability;
      const orig=CanvasRenderingContext2D.prototype.arc;let cues=0;
      CanvasRenderingContext2D.prototype.arc=function(x,y,r,a,b){
       if(this===g.ctx&&Math.abs(x-g.player.x)<.001&&Math.abs(y-g.player.y)<.001&&
          Math.abs(a+Math.PI*.15)<1e-5&&Math.abs(b-Math.PI*.15)<1e-5){
        if(this.lineWidth<3.4||this.globalAlpha<.9)
         throw Error('Tempest Apex arc lost phone-scale width or contrast');
        cues++;
       }
       return orig.apply(this,arguments);
      };
      try{render(g,g.w,g.h);}finally{CanvasRenderingContext2D.prototype.arc=orig;}
      return {cues,canvas:g.ctx.canvas.toDataURL('image/png'),classId:g.player.cls};
     },state);
     assert.equal(data.classId,'tempest');
     assert.equal(data.cues,state.expected,'real canvas cue gate '+state.name);
     assert.ok(data.canvas.startsWith('data:image/png;base64,'),'canvas PNG capture');
     fs.writeFileSync(path.join(dir,'tempest-cue-'+viewport.width+'x'+viewport.height+'-'+state.name+'.png'),
      Buffer.from(data.canvas.split(',')[1],'base64'));
     results.push({viewport,state:state.name,cues:data.cues});
    }
    assert.deepEqual(errors,[],'no Chromium runtime errors');
   }finally{await page.close();}
  }
  console.log('NOVA_TEMPEST_APEX_CUE '+JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
