'use strict';
// A Star's public report should remain a *stale* navigational clue after its
// seven-second announcement, never a live minimap radar or a new objective.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 class Game {drawMinimap(){return 'base';}}
 const window={__novaModules:{'game/engine':function(m){m.exports={Game};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 const m={exports:{}};
 window.__novaModules['game/engine'](m,m.exports,()=>({SHAPE_DEFS:{}}));
 return{Game:m.exports.Game,LF:window.__NOVA_LIVING_FRONT_INTERNAL__};
}
function scene(){
 const {Game,LF}=boot(),g=new Game(),star={id:42,type:'star',kind:'shape',hp:100,
  x:1250,y:-750,__lfStarBorn:98},draws=[];
 const st={age:100,ceiling:1,signal:null,directorEnabled:true,
  lastSignalAt:-99,lastMeaningfulAt:0,lastBloomSector:-1,
  migrationHeat:0,migrationX:0,migrationY:0,
  cooldowns:{bloom:100,migration:100,star:0},
  sectors:Array.from({length:16},()=>({value:0,maturity:.1,pressure:0,outbound:0})),
  stats:{blooms:0,migrations:0,starsSpawned:0,aiRotations:0}};
 const ctx={save(){},restore(){},beginPath(){},stroke(){},fill(){},setLineDash(){},
  arc(x,y,r){draws.push({kind:'arc',x,y,r});},
  fillText(text,x,y){draws.push({kind:'text',text,x,y});}};
 Object.assign(g,{time:100,status:'playing',player:{id:1,x:0,y:0,hp:100,alive:true},
  tanks:[],shapes:[star],__lfState:st,mmCtx:ctx,getShape(id){return id===42?star:null;},
  toast(){}});
 LF.directorTick(g,st);
 assert.equal(st.signal?.type,'ROGUE STAR','canonical Director must announce existing Star');
 const original={x:st.signal.x,y:st.signal.y};
 const draw=()=>{draws.length=0;assert.equal(g.drawMinimap(),'base');return draws.slice();};
 return{g,st,star,draw,original};
}
function marker(draws){return draws.find(d=>d.kind==='arc'&&Math.abs(d.r-14)<1e-6);}
test('public Star report creates a bounded frozen memory without moving the Star',()=>{
 const {st,star,original}=scene();
 assert.deepEqual([star.x,star.y],[1250,-750]);
 assert.deepEqual([st.starMemory?.x,st.starMemory?.y],[original.x,original.y]);
 assert.equal(st.starMemory?.announcedAt,100);
 assert.equal(st.starMemory?.until,117);
 assert.equal(st.starMemory?.starId,42);
});
test('stale Star marker appears only after the seven-second live announcement',()=>{
 const {g,st,draw}=scene();
 g.time=106.9;assert.equal(marker(draw()),undefined,'live report already has its own marker');
 g.time=107.1;st.signal=null;
 const draws=draw(),m=marker(draws);
 assert.ok(m,'stale report should remain as a distinct minimap marker');
 assert.ok(draws.some(d=>d.kind==='text'&&d.text==='?'),'stale marker must be visibly uncertain');
 assert.ok(Math.abs(m.x-(1250+2250)*216/4500)<1e-8);
 assert.ok(Math.abs(m.y-(-750+2250)*216/4500)<1e-8);
});
test('memory never follows a hidden Star and never queries hidden live positions',()=>{
 const {g,st,star,draw}=scene();
 g.time=109;st.signal=null;
 star.x=-2100;star.y=2100;
 g.getShape=()=>{throw Error('hidden live Star must not be queried for a stale report');};
 const m=marker(draw());assert.ok(m);
 assert.ok(Math.abs(m.x-(1250+2250)*216/4500)<1e-8);
 assert.ok(Math.abs(m.y-(-750+2250)*216/4500)<1e-8);
});
test('Star afterimage expires, never persists into a later match clock',()=>{
 const {g,st,draw}=scene();
 st.signal=null;g.time=116.999;assert.ok(marker(draw()));
 g.time=117;assert.equal(marker(draw()),undefined);
 g.time=1;assert.equal(marker(draw()),undefined,'clock reset cannot revive old public report');
});
test('new live signal takes priority and disabled Director suppresses memory',()=>{
 const {g,st,draw}=scene();
 g.time=109;st.signal={type:'BLOOM',started:108,until:113,sector:4};
 assert.equal(marker(draw()),undefined);
 st.signal=null;st.directorEnabled=false;assert.equal(marker(draw()),undefined);
 st.directorEnabled=true;g.status='dead';assert.equal(marker(draw()),undefined);
});
test('malformed or out-of-arena public memory cannot paint a phantom marker',()=>{
 const {g,st,draw}=scene();
 g.time=109;st.signal=null;
 for(const v of [NaN,Infinity,2300,-2300]){
  st.starMemory.x=v;assert.equal(marker(draw()),undefined);
 }
});
test('the actual shipping game loads the Director overlay after the core',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.indexOf('nova-updates/living-front-director-v1.12.0.js')>
  html.indexOf('nova-updates/living-front-core-v1.12.0.js'));
});
