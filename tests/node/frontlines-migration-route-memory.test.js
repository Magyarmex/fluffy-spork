'use strict';
// A public migration's physical route should remain usable briefly after its
// four-second announcement, without becoming a live shape tracker or AI radar.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 function Game(){}
 Game.prototype.drawMinimap=function(){return 'base';};
 const window={__novaModules:{'game/engine':function(m){m.exports={Game};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const m={exports:{}};
 window.__novaModules['game/engine'](m,m.exports,()=>({SHAPE_DEFS:{}}));
 return {LF:window.__NOVA_LIVING_FRONT_INTERNAL__,T:window.__NOVA_LIVING_FRONT_TEST__,Game:m.exports.Game};
}
function scene(){
 const {LF,T,Game}=boot(),calls=[],ctx={
  save(){calls.push(['save']);},restore(){calls.push(['restore']);},
  setLineDash(v){calls.push(['dash',Array.from(v)]);},
  beginPath(){calls.push(['begin']);},moveTo(x,y){calls.push(['move',x,y]);},
  lineTo(x,y){calls.push(['line',x,y]);},stroke(){calls.push(['stroke']);},
  arc(){calls.push(['arc']);},fill(){calls.push(['fill']);}
 };
 const g=new Game();g.mmCtx=ctx;g.time=105;g.status='playing';
 g.player={id:1,x:0,y:0,hp:100,alive:true};
 g.tanks=[g.player];g.shapes=[];
 g.__lfState={signal:null,bloomMemory:null,directorEnabled:true,
  migrationMemory:{from:5,to:6,announcedAt:100,until:116}};
 return {LF,T,g,calls};
}
function dashed(calls){return calls.some(c=>c[0]==='dash'&&c[1].join(',')==='7,5');}
test('the real Director stores only frozen, witnessed sector endpoints for 16 seconds',()=>{
 const {LF,g}=scene(),st=g.__lfState;
 st.migrationMemory=null;st.lastSignalAt=-99;st.lastMeaningfulAt=100;
 st.migrationHeat=6;st.cooldowns={bloom:100,migration:0,star:100};
 st.sectors=Array.from({length:16},(_,i)=>({value:0,maturity:.1,pressure:0,
  outbound:i===5?12:0,flowX:i===5?1:0,flowY:0,flowTo:Array(16).fill(0)}));
 st.sectors[5].flowTo[6]=12;st.stats={migrations:0};
 g.time=100;g.toast=function(){};
 LF.directorTick(g,st);
 assert.equal(st.signal?.type,'MIGRATION');
 assert.deepEqual(JSON.parse(JSON.stringify(st.migrationMemory)),{
  from:5,to:6,announcedAt:100,until:116});
 assert.equal(st.stats.migrations,1);
});
test('the shipping minimap shows a dashed, fading last-known route after the live signal',()=>{
 const {g,calls}=scene();
 assert.equal(g.drawMinimap(),'base');
 assert.ok(dashed(calls),'stale route must be drawn by the actual composed minimap');
 const moves=calls.filter(c=>c[0]==='move'),lines=calls.filter(c=>c[0]==='line');
 assert.ok(moves.length&&lines.length);
 assert.ok(lines[0][1]>moves[0][1]&&Math.abs(lines[0][2]-moves[0][2])<1e-6,
  'eastbound witnessed route must point east');
 assert.ok(calls.some(c=>c[0]==='dash'&&c[1].length===0),
  'dash must be reset before drawing the arrowhead');
});
test('memory expires and cannot compete with live announcements or disabled Director',()=>{
 const {g,calls}=scene();
 for(const [time,signal,enabled,expected] of [
  [100,{type:'MIGRATION',from:5,to:6,started:100,until:104.4},true,false],
  [105,null,true,true],[115.99,null,true,true],[116,null,true,false],[120,null,true,false],
  [110,{type:'BLOOM',sector:2,started:108,until:113},true,false],
  [110,{type:'MIGRATION',from:5,to:6,started:108,until:113},true,false],
  [110,null,false,false],[110,null,true,true]
 ]){
  calls.length=0;g.time=time;g.__lfState.signal=signal;g.__lfState.directorEnabled=enabled;
  g.drawMinimap();
  assert.equal(dashed(calls),expected,JSON.stringify({time,signal,enabled}));
 }
});
test('stale route is independent of hidden shapes and grants no AI movement authority',()=>{
 const {g,T,calls}=scene(),t={id:3,x:-900,y:-900,hp:100,maxHp:100,
  ai:{__v1112TargetId:-1}};
 g.tanks.push(t);g.shapes=[];g.bullets=[];g.w=800;g.h=600;g.cam={zoom:1};
 g.__lfState.queryScratch=[];g.__lfState.queryScratch2=[];
 g.__lfState.sectors=Array.from({length:16},()=>({value:0,maturity:0}));
 const before=T.publicEcoBias(g,t,{},{});assert.equal(before.mode,'none');
 g.drawMinimap();const first=JSON.stringify(calls);
 calls.length=0;g.shapes=[{id:40,x:1800,y:1800,hp:100,type:'hexagon'}];
 g.__lfState.sectors[6].value=9999;g.__lfState.sectors[6].maturity=1;
 g.drawMinimap();
 assert.equal(JSON.stringify(calls),first,'last-known arrow must not track hidden shapes');
 assert.equal(T.publicEcoBias(g,t,{},{}).mode,'none','AI cannot read UI-only migration memory');
 assert.ok(fs.readFileSync(path.join(root,'index.html'),'utf8')
  .includes('nova-updates/living-front-director-v1.12.0.js'));
});

test('a newer public opportunity retires the older migration afterimage',()=>{
 const {LF,g}=scene(),st=g.__lfState;
 g.time=109;g.toast=function(){};
 st.lastSignalAt=100;st.lastBloomSector=-1;st.lastMeaningfulAt=100;
 st.ceiling=1;st.migrationHeat=0;
 st.cooldowns={bloom:0,migration:100,star:100};
 st.sectors=Array.from({length:16},(_,i)=>({value:i===9?900:10,
  maturity:i===9?.95:.1,pressure:0,outbound:0}));
 st.stats={blooms:0,migrations:0};
 LF.directorTick(g,st);
 assert.equal(st.signal?.type,'BLOOM');
 assert.equal(st.migrationMemory,null,'do not resurrect an obsolete route after BLOOM');
});
