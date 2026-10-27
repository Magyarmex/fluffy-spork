'use strict';
// The real Front Director must turn a witnessed public migration into a
// readable crossing bearing + movement direction, not hidden shape radar.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const window={__novaModules:{'game/engine':function(m){m.exports={Game:class{}};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 return window.__NOVA_LIVING_FRONT_INTERNAL__;
}
function announce(mx,my,player={x:-1750,y:-562.5,hp:100,alive:true},sectorValue=0){
 const LF=boot(),toasts=[];
 const st={age:100,ceiling:1,signal:null,bloomMemory:null,directorEnabled:true,
  lastSignalAt:-99,lastBloomSector:-1,lastMeaningfulAt:100,
  migrationHeat:6,migrationX:mx,migrationY:my,
  cooldowns:{bloom:100,migration:0,star:100},
  sectors:Array.from({length:16},(_,i)=>({
   value:sectorValue,maturity:.1,pressure:0,harvest:0,combat:0,outbound:i===5?12:0
  })),
  stats:{blooms:0,migrations:0,starsSpawned:0,aiRotations:0}
 };
 const g={time:100,status:'playing',w:800,h:600,cam:{zoom:1},
  player:player?{id:1,...player}:null,tanks:player?[{id:1,...player}]:[],
  shapes:[],__lfState:st,toast(s){toasts.push(s);}};
 LF.directorTick(g,st);
 assert.equal(st.signal?.type,'MIGRATION','must use the actual public Director path');
 assert.equal(st.signal.from,5,'migration origin must be witnessed, not guessed from the pilot');
 assert.equal(st.stats.migrations,1);
 assert.equal(toasts.length,1);
 return {message:toasts[0],signal:st.signal};
}
test('public MIGRATION reports all eight real flow directions',()=>{
 const cases=[
  ['E',1,0,6],['SE',1,1,10],['S',0,1,9],['SW',-1,1,8],
  ['W',-1,0,4],['NW',-1,-1,0],['N',0,-1,1],['NE',1,-1,2]
 ];
 for(const [name,dx,dy,to] of cases){
  const out=announce(dx,dy);
  assert.equal(out.signal.to,to,name+' must preserve the public destination');
  assert.match(out.message,new RegExp('MIGRATION · .+ · FLOW '+name+'$'),
   name+' must describe actual movement, not a guessed target');
  assert.ok(out.message.length<=58,'mobile toast must stay compact: '+out.message);
 }
});
test('player bearing identifies the public crossing, not its movement direction',()=>{
 assert.match(announce(1,0,{x:-1750,y:-562.5,hp:100,alive:true}).message,
  /MIGRATION · E OF YOU · FLOW E$/);
 assert.match(announce(1,0,{x:1500,y:937.5,hp:100,alive:true}).message,
  /MIGRATION · NW OF YOU · FLOW E$/);
 assert.match(announce(1,0,{x:0,y:-562.5,hp:100,alive:true}).message,
  /MIGRATION · NEAR YOU · FLOW E$/);
});
test('missing or invalid pilot position never leaks a target or a false location',()=>{
 const missing=announce(1,0,null).message;
 const invalid=announce(1,0,{x:NaN,y:0,hp:100,alive:true}).message;
 for(const msg of [missing,invalid]){
  assert.match(msg,/MIGRATION · FLOW E · neutral shapes moving/);
  assert.doesNotMatch(msg,/OF YOU|NEAR YOU/);
 }
});
test('migration copy is independent of hidden sector value and remains in shipping chain',()=>{
 const p={x:-1750,y:-562.5,hp:100,alive:true};
 assert.equal(announce(1,0,p,0).message,announce(1,0,p,900).message);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'));
});
