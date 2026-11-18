'use strict';
// #1029 RESEARCH ONLY. This is a deliberately small falsifiable public
// occupancy alternative, NOT a gameplay patch or a natural-match balance proof.
// The candidate reads only physical bodies inside the observer's viewport.
// In particular it must never consult another tank's private ecology intent.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
function boot(){
 const window={__novaModules:{}};
 const context={window,Math,Number,Object,Array,Date,JSON,Map,Set,
  console:{info(){},warn(){},error(){}},performance:{now:()=>0},
  setTimeout(){},clearTimeout(){}};
 for(const name of ['living-front-core-v1.12.0.js',
  'living-front-instincts-v1.12.0.js','living-front-director-v1.12.0.js'])
  vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',name),'utf8'),
   context,{filename:name});
 return window.__NOVA_LIVING_FRONT_TEST__;
}
// No LOS query, hidden assignment, secret maturity or pathfinding call.
// The radius is an explicit research parameter, not an approved tuning value.
function publicOccupancy(g,observer,x,y,radius=140){
 let count=0;
 const hx=(g.w||800)/(2*((g.cam&&g.cam.zoom)||1));
 const hy=(g.h||600)/(2*((g.cam&&g.cam.zoom)||1));
 for(const q of g.tanks||[]){
  if(!q||q===observer||q.id===observer.id||q.alive===false||
   !(q.hp>0)||!Number.isFinite(q.x)||!Number.isFinite(q.y))continue;
  if(Math.abs(q.x-observer.x)>hx||Math.abs(q.y-observer.y)>hy)continue;
  if(Math.hypot(q.x-x,q.y-y)>radius)continue;
  // Viewport alone does not establish physical sight through cover.
  if(typeof g.hasLineOfSight==='function'&&
   !g.hasLineOfSight(observer.x,observer.y,q.x,q.y,2))continue;
  count++;
  if(count===4)break;
 }
 return count;
}
function publicBloomScore(g,observer,signal){
 const distance=Math.hypot(signal.x-observer.x,signal.y-observer.y);
 const crowd=publicOccupancy(g,observer,signal.x,signal.y);
 return {crowd,score:.68-distance/2300-crowd*.13,
  accepted:.68-distance/2300-crowd*.13>.20};
}
function world(T){
 const center=T.sectorCenter(6);
 const observer={id:1,x:center.x-410,y:center.y,cls:'twin',
  hp:100,maxHp:100,alive:true,ai:{__v1112TargetId:-1,isElite:false}};
 const signal={type:'BLOOM',sector:6,x:center.x,y:center.y,started:9,until:20};
 const hidden=Array.from({length:4},(_,i)=>({id:20+i,
  x:2000+i*30,y:2000,hp:100,maxHp:100,alive:true,
  ai:{__lfEcoKey:'none',__lfEcoWeight:.25}}));
 const g={time:10,w:800,h:600,cam:{zoom:1},tanks:[observer,...hidden],
  shapes:[],__lfState:{directorEnabled:true,signal,
   queryScratch:[],queryScratch2:[],stats:{}},
  hasLineOfSight(){return true;}};
 assert.notEqual(T.sectorIndex(observer.x,observer.y),signal.sector,
  'observer must be outside the actual BLOOM sector');
 return {g,observer,signal,hidden};
}
test('public occupancy is invariant to hidden private ecology assignments',()=>{
 const T=boot(),w=world(T);
 const baseline=publicBloomScore(w.g,w.observer,w.signal);
 assert.equal(baseline.crowd,0);
 assert.equal(baseline.accepted,true);
 assert.equal(T.publicEcoBias(w.g,w.observer,{},{}).mode,'signal');
 for(const q of w.hidden)q.ai.__lfEcoKey='BLOOM:6';
 assert.deepEqual(publicBloomScore(w.g,w.observer,w.signal),baseline);
 assert.equal(T.publicEcoBias(w.g,w.observer,{},{}).mode,'none',
  'shipping private-intent veto must remain a demonstrated control');
});
test('visible physical crowd can suppress a public BLOOM without private slots',()=>{
 const T=boot(),w=world(T);
 for(let i=0;i<3;i++){
  const q=w.hidden[i];
  q.x=w.signal.x-65+i*10;q.y=w.signal.y+i*8;
  q.ai=new Proxy({}, {get(){throw Error('private AI state read');}});
 }
 const crowded=publicBloomScore(w.g,w.observer,w.signal);
 assert.equal(crowded.crowd,3);
 assert.equal(crowded.accepted,false);
 w.hidden[2].alive=false;
 assert.equal(publicBloomScore(w.g,w.observer,w.signal).crowd,2);
});
test('viewport boundary and goal radius both limit physical crowd evidence',()=>{
 const T=boot(),w=world(T);
 const q=w.hidden[0];q.x=w.signal.x-65;q.y=w.signal.y;
 assert.equal(publicBloomScore(w.g,w.observer,w.signal).crowd,1);
 q.x=w.observer.x+401;
 assert.equal(publicBloomScore(w.g,w.observer,w.signal).crowd,0);
 q.x=w.observer.x+100;q.y=w.signal.y;
 assert.equal(publicBloomScore(w.g,w.observer,w.signal).crowd,0,
  'visible passerby far from the objective is not objective crowd');
});
test('opaque cover rejects viewport-only crowd and bounds LOS calls',()=>{
 const T=boot(),w=world(T);
 for(let i=0;i<3;i++){
  w.hidden[i].x=w.signal.x-65+i*10;
  w.hidden[i].y=w.signal.y;
 }
 let calls=0;
 w.g.hasLineOfSight=()=>{calls++;return false;};
 assert.equal(publicBloomScore(w.g,w.observer,w.signal).crowd,0);
 assert.equal(calls,3,'only viewport-and-goal candidates need terrain checks');
 w.g.hasLineOfSight=()=>{calls++;return true;};
 assert.equal(publicBloomScore(w.g,w.observer,w.signal).crowd,3);
 assert.equal(calls,6);
});
test('public occupancy misses distant converging rivals before arrival',()=>{
 const T=boot(),w=world(T);
 for(let i=0;i<3;i++){
  const q=w.hidden[i];
  q.x=w.signal.x-300+i*8;q.y=w.signal.y;
  q.ai={__lfEcoKey:'BLOOM:6',__lfEcoWeight:.25};
 }
 const candidate=publicBloomScore(w.g,w.observer,w.signal);
 assert.equal(candidate.crowd,0,
  'nearby approach assignments are not physically at the objective yet');
 assert.equal(candidate.accepted,true);
 const shipping=T.publicEcoBias(w.g,w.observer,{},{});
 assert.equal(shipping.mode,'none',
  'private-intent coordination suppresses convergence earlier');
 // This is a NEGATIVE CONTROL: the public occupancy proposal cannot
 // preserve early anti-dogpile coordination on its own.
});
test('public occupancy is an imperfect proxy: a visible passerby can veto',()=>{
 const T=boot(),w=world(T);
 for(let i=0;i<3;i++){
  const q=w.hidden[i];q.x=w.signal.x-65+i*10;q.y=w.signal.y;
  q.vx=-100;q.vy=0;q.ai={__lfEcoKey:'none',__lfEcoWeight:0};
 }
 const result=publicBloomScore(w.g,w.observer,w.signal);
 assert.equal(result.crowd,3);
 assert.equal(result.accepted,false,
  'physical proximity alone cannot establish resource intent');
});
test('research-only artifact cannot silently change materialized gameplay',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/living-front-director-v1.12.0.js'));
 const source=fs.readFileSync(path.join(root,
  'nova-updates/living-front-director-v1.12.0.js'),'utf8');
 assert.match(source,/function saturation\(g,key,id\)/,
  'candidate must not be mistaken for an integrated runtime fix');
});
