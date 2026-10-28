'use strict';
// A Rogue Star is publicly announced and already drawn on the minimap.
// Its one-shot spawn bearing helps mobile interception without live radar.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const window={__novaModules:{'game/engine':function(m){m.exports={Game:class{}};}}};
 const ctx={window,console:{info(){},warn(){},error(){}},Math,Number,Object,Array,Date,JSON,Map,Set,
  performance:{now:()=>0},setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js','living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),ctx,{filename:name});
 return{LF:window.__NOVA_LIVING_FRONT_INTERNAL__,T:window.__NOVA_LIVING_FRONT_TEST__};
}
test('Rogue Star initial public bearing covers eight hull-relative directions',()=>{
 const {T}=boot(),p={x:0,y:0,hp:100,alive:true};
 const directions=[['E',1000,0],['SE',1000,1000],['S',0,1000],
  ['SW',-1000,1000],['W',-1000,0],['NW',-1000,-1000],
  ['N',0,-1000],['NE',1000,-1000]];
 for(const [name,x,y] of directions){
  const message=T.rogueStarToast({player:p},{x,y});
  assert.match(message,new RegExp('ROGUE STAR · SPAWN '+name+' · cut its route$'));
  assert.ok(message.length<=58,'portrait announcement must remain compact: '+message);
 }
});
test('nearby Star and missing/invalid player remain truthful',()=>{
 const {T}=boot();
 const player={x:100,y:100,hp:100,alive:true};
 assert.match(T.rogueStarToast({player},{x:110,y:115}),/SPAWN NEAR YOU/);
 for(const g of [{player:null},{player:{...player,x:NaN}},{player:{...player,hp:0}}]){
  const msg=T.rogueStarToast(g,{x:1000,y:0});
  assert.equal(msg,'★ ROGUE STAR · intercept the roaming prize');
 }
 assert.equal(T.rogueStarToast({player},{x:NaN,y:100}),
  '★ ROGUE STAR · intercept the roaming prize');
});
test('real Front Director announces the initial spawn only, not a live Star tracker',()=>{
 const {LF}=boot(),toasts=[];
 const st={age:100,ceiling:1,signal:null,bloomMemory:null,directorEnabled:true,
  lastSignalAt:-99,lastMeaningfulAt:0,lastBloomSector:-1,
  migrationHeat:0,migrationX:0,migrationY:0,
  cooldowns:{bloom:100,migration:100,star:0},
  sectors:Array.from({length:16},()=>({value:0,maturity:.1,pressure:0,outbound:0})),
  stats:{blooms:0,migrations:0,starsSpawned:0,aiRotations:0}};
 const player={id:1,x:0,y:0,hp:100,alive:true};
 const g={time:100,status:'playing',w:800,h:600,cam:{zoom:1},
  player,tanks:[player],shapes:[],__lfState:st,
  spawnShape(type){this.shapes.push({id:42,type,kind:'shape',x:0,y:0,r:24,hp:100});},
  toast(message){toasts.push(message);}};
 LF.directorTick(g,st);
 assert.equal(st.signal?.type,'ROGUE STAR','use real Director public announcement');
 assert.equal(st.stats.starsSpawned,1,'exactly one real Star must spawn');
 assert.equal(g.shapes.length,1);
 assert.equal(toasts.length,1);
 const expected=LF.sectorIndex(st.signal.x,st.signal.y);
 assert.equal(LF.sectorIndex(g.shapes[0].x,g.shapes[0].y),expected);
 assert.equal(toasts[0],windowlessToast(g,st.signal));
 const initial=toasts[0],x=st.signal.x,y=st.signal.y;
 g.shapes[0].x+=400;g.shapes[0].y+=400;
 assert.equal(st.signal.x,x,'frozen public signal must not track Star motion');
 assert.equal(st.signal.y,y);
 assert.equal(toasts[0],initial);
});
function windowlessToast(g,sig){return boot().T.rogueStarToast(g,sig);}
test('shipping composition includes the real Director overlay',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'));
});

test('public Star bearing is independent of hidden ecology and unrelated shapes',()=>{
 const {T}=boot(),player={x:0,y:0,hp:100,alive:true},sig={x:1200,y:0};
 const rich={player,shapes:[{x:10,y:20}],__lfState:{sectors:[{value:9999,maturity:1}]}};
 const poor={player,shapes:[{x:-2000,y:-2000}],__lfState:{sectors:[{value:0,maturity:0}]}};
 assert.equal(T.rogueStarToast(rich,sig),T.rogueStarToast(poor,sig));
 assert.match(T.rogueStarToast(rich,sig),/SPAWN E/);
});

test('fresh canonical baseline Star becomes public without duplicate spawn or teleport',()=>{
 const {LF}=boot(),messages=[],star={id:42,kind:'shape',type:'star',
  x:1200,y:-900,hp:100,__lfStarBorn:98},p={id:1,x:0,y:0,hp:100,alive:true};
 const st={age:100,ceiling:1,signal:null,bloomMemory:null,directorEnabled:true,
  lastSignalAt:-99,lastMeaningfulAt:0,lastBloomSector:-1,
  migrationHeat:0,migrationX:0,migrationY:0,
  cooldowns:{bloom:100,migration:100,star:0},
  sectors:Array.from({length:16},()=>({value:0,maturity:.1,pressure:0,outbound:0})),
  stats:{blooms:0,migrations:0,starsSpawned:0,aiRotations:0}};
 const g={time:100,status:'playing',player:p,tanks:[p],shapes:[star],__lfState:st,
  spawnShape(){throw Error('baseline adoption must never duplicate a Star');},
  getShape(id){return id===star.id?star:null;},
  toast(msg){messages.push(msg);}};
 LF.directorTick(g,st);
 assert.equal(st.signal?.type,'ROGUE STAR');
 assert.equal(st.signal.starId,42);
 assert.deepEqual([star.x,star.y],[1200,-900],'adoption cannot teleport');
 assert.equal(g.shapes.length,1);
 assert.equal(st.stats.starsSpawned,0,'adoption must not masquerade as new spawn');
 assert.equal(st.stats.starAnnouncements,1);
 assert.equal(star.__lfPublicAnnounced,true);
 assert.match(messages[0],/SPAWN NE/);
 // Force a second quiet public opportunity; the same Star is not eligible.
 st.signal=null;st.lastSignalAt=-99;st.lastMeaningfulAt=0;
 st.cooldowns.star=0;
 LF.directorTick(g,st);
 assert.equal(st.signal,null,'already-announced Star cannot be re-announced');
 assert.equal(messages.length,1);
});
test('stale canonical Star does not get a misleading near-expiry announcement',()=>{
 const {LF}=boot(),star={id:7,type:'star',kind:'shape',x:200,y:100,
  hp:100,__lfStarBorn:40};
 const st={age:100,ceiling:1,signal:null,directorEnabled:true,
  lastSignalAt:-99,lastMeaningfulAt:0,lastBloomSector:-1,
  migrationHeat:0,migrationX:0,migrationY:0,
  cooldowns:{bloom:100,migration:100,star:0},
  sectors:Array.from({length:16},()=>({value:0,maturity:.1,pressure:0,outbound:0})),
  stats:{blooms:0,migrations:0,starsSpawned:0}};
 const g={time:100,status:'playing',player:{x:0,y:0,hp:100,alive:true},
  tanks:[],shapes:[star],__lfState:st,toast(){throw Error('no public signal expected');}};
 LF.directorTick(g,st);
 assert.equal(st.signal,null);
 assert.equal(st.stats.starAnnouncements,undefined);
});
