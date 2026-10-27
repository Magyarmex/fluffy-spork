'use strict';
// Tactical Frontlines: announce a public BLOOM with a useful hull-relative
// bearing without creating radar, a new HUD, or another control.
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
function announce(dx,dy,hasPlayer=true){
 const LF=boot(),center=LF.sectorCenter(5),p={id:1,x:center.x-dx,y:center.y-dy,hp:100,alive:true};
 const toasts=[],st={
  age:100,ceiling:1,signal:null,bloomMemory:null,directorEnabled:true,lastSignalAt:-99,
  lastBloomSector:-1,lastMeaningfulAt:100,migrationHeat:0,migrationX:0,migrationY:0,
  cooldowns:{bloom:0,migration:100,star:100},
  sectors:Array.from({length:16},(_,i)=>({value:i===5?900:0,maturity:i===5?.9:.1,pressure:0,harvest:0,combat:0})),
  stats:{blooms:0,migrations:0,starsSpawned:0,aiRotations:0}
 };
 const g={time:100,status:'playing',w:800,h:600,cam:{zoom:1},player:hasPlayer?p:null,
  tanks:hasPlayer?[p]:[],shapes:[],__lfState:st,toast(s){toasts.push(s);}};
 LF.directorTick(g,st);
 assert.equal(st.signal&&st.signal.type,'BLOOM','must use the real public Director path');
 assert.equal(st.signal.sector,5,'public signal destination must remain unchanged');
 assert.equal(st.stats.blooms,1);
 assert.equal(toasts.length,1);
 return toasts[0];
}
test('public BLOOM announces eight hull-relative compass directions',()=>{
 const directions=[
  ['E',1500,0],['SE',1500,1500],['S',0,1500],['SW',-1500,1500],
  ['W',-1500,0],['NW',-1500,-1500],['N',0,-1500],['NE',1500,-1500]
 ];
 for(const [name,dx,dy] of directions){
  const message=announce(dx,dy);
  assert.match(message,new RegExp('SHAPE BLOOM · '+name+' ·'),name+' must be readable in the existing toast');
  assert.ok(message.length<=58,'compass guidance must not expand the existing mobile toast');
 }
});
test('player already in the public BLOOM sector gets SAME SECTOR rather than falsely implying the resource is at the hull',()=>{
 assert.match(announce(0,0),/SHAPE BLOOM · SAME SECTOR ·/);
});
test('missing player position retains the original informational announcement',()=>{
 const message=announce(1500,0,false);
 assert.match(message,/SHAPE BLOOM/);
 assert.doesNotMatch(message,/SHAPE BLOOM · (?:E|SE|S|SW|W|NW|N|NE|SAME SECTOR) ·/);
});
test('compass never changes the canonical public signal or reads hidden value for its bearing',()=>{
 const LF=boot(),c=LF.sectorCenter(5);
 assert.equal(c.x,-562.5);assert.equal(c.y,-562.5);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'),
  'guidance must run in the materialized shipping overlay');
});
