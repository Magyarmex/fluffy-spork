'use strict';
/* Research-only NATURAL full-match A/B on the real 48-overlay shipping game.
 * The pilot is a deterministic, sight-limited scripted Scout, not a human.
 * No fake BLOOM, private sector values, teleport, invulnerability or AI buffs. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const LAYOUT='CROSSFIRE',TERRAIN_SEED=0,GAME_SEED=0x1d4a3f21;
const SECONDS=165,DT=1/30,CHUNK=450;
async function arm(browser,enabled,label){
 const context=await browser.newContext({viewport:{width:900,height:700}});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 try{
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByRole('button',{name:/DEPLOY/i}).first().waitFor({state:'visible',timeout:45000});
  await page.evaluate(({terrainSeed,gameSeed})=>{
   let state=gameSeed>>>0;
   Math.random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
   const Game=window.__novaMakeRequire('')('game/engine').Game;
   const spawn=Game.prototype.spawnPlayer,update=Game.prototype.update;
   Game.prototype.spawnPlayer=function(){
    if(this.__novaTerrain)return spawn.apply(this,arguments);
    const now=Date.now,rand=Math.random;let first=true;
    Date.now=()=>0;Math.random=()=>first?(first=false,terrainSeed/0x7fffffff):rand();
    try{return spawn.apply(this,arguments);}finally{Date.now=now;Math.random=rand;}
   };
   Game.prototype.update=function(){
    if(!this.__novaDecorativeWorld)window.__novaNaturalMatchGame=this;
    return update.apply(this,arguments);
   };
  },{terrainSeed:TERRAIN_SEED,gameSeed:GAME_SEED});
  await page.getByRole('button',{name:/DEPLOY/i}).first().click();
  await page.waitForFunction(()=>window.__novaNaturalMatchGame?.status==='playing'&&!!window.__novaNaturalMatchGame.__lfState,{timeout:30000});
  const initial=await page.evaluate(enabled=>{
   const g=window.__novaNaturalMatchGame;
   g.setPaused(true); // Disable RAF simulation; advance actual Game.update ourselves.
   if(g.__novaBattlefield?.name!=='CROSSFIRE')throw Error('uncontrolled layout '+g.__novaBattlefield?.name);
   const ai=window.__novaMakeRequire('')('game/ai');
   if(!ai||typeof ai.updateAI!=='function')throw Error('missing composed AI');
   if(!enabled){
    const original=ai.updateAI;
    ai.updateAI=function(t,world,dt){
     const st=world.__lfState,memory=st&&st.bloomMemory;
     if(st)st.bloomMemory=null;
     try{return original(t,world,dt);}finally{if(st)st.bloomMemory=memory;}
    };
   }
   const p=g.player;
   if(!p||p.cls!=='scout')throw Error('expected unmodified Scout pilot');
   if(g.tanks.filter(t=>t.ai).length<8)throw Error('expected eight ordinary rivals');
   g.input.mouseActive=false;g.input.autofire=true;g.input.firing=false;
   g.input.moveVec=()=>({x:Math.cos(g.time*.29),y:Math.sin(g.time*.29)});
   g.input.aimVec=()=>{
    const p=g.player,z=g.zoom||1,hx=(g.w||900)/(2*z),hy=(g.h||700)/(2*z);
    let best=null,dist=Infinity;
    for(const s of g.shapes){
     if(!s||s.hp<=0||s.type==='crasher'||Math.abs(s.x-p.x)>hx||Math.abs(s.y-p.y)>hy)continue;
     const d=(s.x-p.x)**2+(s.y-p.y)**2;
     if(d>=dist||g.hasLineOfSight&&!g.hasLineOfSight(p.x,p.y,s.x,s.y,2))continue;
     best=s;dist=d;
    }
    if(!best)return{x:Math.cos(g.time*.37),y:Math.sin(g.time*.37)};
    const dx=best.x-p.x,dy=best.y-p.y,m=Math.hypot(dx,dy)||1;
    return{x:dx/m,y:dy/m};
   };
   const fingerprint=JSON.stringify({layout:g.__novaBattlefield.name,
    pilot:{x:+p.x.toFixed(3),y:+p.y.toFixed(3),cls:p.cls},
    bots:g.tanks.filter(t=>t.ai).map(t=>[t.id,+t.x.toFixed(3),+t.y.toFixed(3),t.cls]),
    shapes:g.shapes.slice(0,32).map(s=>[s.id,s.type,+s.x.toFixed(3),+s.y.toFixed(3)])});
   return{fingerprint,initialBotCount:g.tanks.filter(t=>t.ai).length,initialShapes:g.shapes.length};
  },enabled);
  let last=null;
  for(let i=0;i<Math.ceil(SECONDS/DT/CHUNK);i++){
   last=await page.evaluate(({steps,dt})=>{
    const g=window.__novaNaturalMatchGame;
    for(let j=0;j<steps&&g.status!=='dead';j++)g.update(dt);
    return{time:g.time,status:g.status,blooms:g.__lfState?.stats?.blooms||0};
   },{steps:Math.min(CHUNK,Math.ceil(SECONDS/DT)-i*CHUNK),dt:DT});
   if(last.status==='dead')break;
  }
  const result=await page.evaluate(()=>{
   const g=window.__novaNaturalMatchGame,s=window.NOVALivingFront.snapshot(),p=g.player;
   return{metadata:{layout:g.__novaBattlefield.name,seed:'natural-20261027-0'},
    frontline:s.frontline,stats:s.stats,game:{time:+g.time.toFixed(3),status:g.status,
     pilotAlive:!!p.alive,score:p.score,kills:p.kills,level:p.level,
     botCount:g.tanks.filter(t=>t.ai&&t.alive).length},
    naturalBlooms:s.stats.blooms||0,events:s.frontline?.events||[]};
  });
  assert.equal(errors.length,0,errors.join('\n'));
  return{label,enabled,initial,last,result};
 }finally{await context.close();}
}
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const off=await arm(browser,false,'OFF'),on=await arm(browser,true,'ON'),offReplay=await arm(browser,false,'OFF-REPLAY');
  assert.equal(off.initial.fingerprint,on.initial.fingerprint,'ON/OFF must begin from identical real world');
  assert.equal(off.initial.fingerprint,offReplay.initial.fingerprint,'same seed must reproduce initial world');
  const same=JSON.stringify(off.result)===JSON.stringify(offReplay.result);
  const report={method:'scripted full-match natural Director research; not human fun',
   initialWorldIdentical:true,offReplayIdentical:same,
   off:off.result,on:on.result,offReplay:offReplay.result,
   limits:['No artificial BLOOM or forced survival','One layout and one seed only',
    'A deterministic Scout script is not a human player','Seed replay is checked, not assumed']};
  const dir=path.join('artifacts','browser');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'frontlines-natural-match-ab.json'),JSON.stringify(report,null,2));
  console.log('NOVA_FRONTLINES_NATURAL_MATCH_AB '+JSON.stringify({initialWorldIdentical:true,offReplayIdentical:same,
   off:{time:off.result.game.time,status:off.result.game.status,blooms:off.result.naturalBlooms,frontline:off.result.frontline?.counts},
   on:{time:on.result.game.time,status:on.result.game.status,blooms:on.result.naturalBlooms,frontline:on.result.frontline?.counts}}));
  if(!same)throw Error('same-arm full-match replay diverged; cannot claim controlled A/B');
  if(!off.result.naturalBlooms||!on.result.naturalBlooms)
   throw Error('no natural BLOOM in one or both arms; report is evidence of censoring, not Frontlines effect');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
