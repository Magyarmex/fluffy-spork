'use strict';
/* NOVA #147/#234 research-only: simultaneous initial contact is a group,
 * not an array-order license to damage through cover. 1D linear geometry;
 * NOT the shipping solver. No real damage callbacks or fragments. */
const EPS=1e-9, SCHEDULES=[30,60,120,240,
  i=>[1/30,1/240,1/90][i%3],i=>[1/45,1/120,1/60,1/200][i%4]];
function check(ok,msg){if(!ok)throw Error(msg);}
function entryLocal(p,v,q,u,r,start,horizon){
 const f=p+v*start-q-u*start,rv=v-u;
 if(Math.abs(f)<=r)return start;
 if(Math.abs(rv)<1e-14)return null;
 const a=(-r-f)/rv,b=(r-f)/rv,enter=Math.min(a,b),leave=Math.max(a,b);
 return leave>=0&&enter<horizon?start+Math.max(0,enter):null;
}
function entryOracle(p,v,q,u,r,ttl){
 const f=p-q,rv=v-u,sq=t=>(f+rv*t)**2;
 if(sq(0)<=r*r)return 0;
 if(Math.abs(rv)<1e-14)return null;
 const closest=Math.max(0,Math.min(ttl,-f/rv));
 if(!(sq(closest)<r*r))return null;
 let lo=0,hi=closest;
 for(let i=0;i<58;i++){const m=(lo+hi)/2;if(sq(m)<=r*r)hi=m;else lo=m;}
 return hi<ttl?hi:null;
}
function coverLocal(w,c,start,horizon){
 const p=w.p+w.v*start,lo=c.lo-w.r*.45,hi=c.hi+w.r*.45;
 if(p>=lo&&p<=hi)return start;
 if(!w.v)return null;
 const t=(w.v>0?lo-p:hi-p)/w.v;
 return t>=0&&t<horizon?start+t:null;
}
function coverOracle(w,c){
 const lo=c.lo-w.r*.45,hi=c.hi+w.r*.45;
 if(w.p>=lo&&w.p<=hi)return 0;
 if(!w.v)return null;
 const t=(w.v>0?lo-w.p:hi-w.p)/w.v;
 return t>=0&&t<w.ttl?t:null;
}
function candidates(w,start,horizon,oracle,used){
 const out=[],add=(id,kind,time)=>{
  if(time!=null&&time>=start-EPS&&time<Math.min(w.ttl,start+horizon)-EPS)
   out.push({id,kind,time});
 };
 for(const b of w.bodies)if(!used.has('b'+b.id))
  add(b.id,'body',oracle?entryOracle(w.p,w.v,b.x,b.v,w.r+b.r,w.ttl):
    entryLocal(w.p,w.v,b.x,b.v,w.r+b.r,start,horizon));
 for(const c of w.covers)if(!used.has('c'+c.id))
  add(c.id,'cover',oracle?coverOracle(w,c):coverLocal(w,c,start,horizon));
 for(const q of w.hostiles)if(!used.has('p'+q.id))
  add(q.id,'projectile',oracle?entryOracle(w.p,w.v,q.x,q.v,w.r+q.r,w.ttl):
    entryLocal(w.p,w.v,q.x,q.v,w.r+q.r,start,horizon));
 return out.sort((a,b)=>a.time-b.time||a.kind.localeCompare(b.kind)||String(a.id).localeCompare(String(b.id)));
}
function state(w){return {events:[],used:new Set(),pen:w.pen,dmg:w.dmg,stop:null};}
function applyGroup(w,s,group){
 const t=group[0].time,covers=group.filter(e=>e.kind==='cover'),
       hostile=group.filter(e=>e.kind==='projectile'),
       bodies=group.filter(e=>e.kind==='body');
 // Multiple simultaneous cover faces need an explicit material owner.
 if(covers.length>1){s.stop='ambiguous-cover';return;}
 if(covers.length){
  const e=covers[0],c=w.covers.find(c=>c.id===e.id);
  s.events.push(e);s.used.add('c'+e.id);
  if(!c.breakable||s.dmg<c.hp||s.pen<2){s.stop='cover';return;}
  s.pen-=2;s.dmg*=.62;
 }
 if(hostile.length){
  s.events.push(...hostile);s.stop='interception';return;
 }
 // One projectile with penetration N can hit N+1 bodies, but if it cannot
 // afford the whole simultaneous group, abstain instead of picking an ID.
 if(bodies.length>s.pen+1){s.stop='ambiguous-body';return;}
 for(const e of bodies){s.events.push(e);s.used.add('b'+e.id);s.pen--;}
 if(s.pen<0)s.stop='spent';
}
function solve(w,schedule,oracle=false){
 const s=state(w);let start=0,frame=0,loops=0;
 while(start<w.ttl-EPS&&!s.stop){
  const dt=oracle?w.ttl-start:(typeof schedule==='number'?1/schedule:schedule(frame++));
  const end=Math.min(w.ttl,start+dt);let now=start;
  while(now<end-EPS&&!s.stop){
   if(++loops>100)throw Error('no progress');
   const a=candidates(w,now,end-now,oracle,s.used);
   if(!a.length)break;
   const group=a.filter(e=>Math.abs(e.time-a[0].time)<=EPS);
   applyGroup(w,s,group);
   now=Math.max(now+EPS,a[0].time+EPS);
  }
  start=end;
 }
 return {events:s.events,stop:s.stop,pen:s.pen};
}
function equal(a,b){
 return a.stop===b.stop&&a.pen===b.pen&&a.events.length===b.events.length&&
  a.events.every((e,i)=>e.id===b.events[i].id&&e.kind===b.events[i].kind&&
    Math.abs(e.time-b.events[i].time)<1e-7);
}
function verify(w,label){
 const ref=solve(w,0,true);
 for(const schedule of SCHEDULES){
  const actual=solve(w,schedule);
  check(equal(ref,actual),'frame disagreement '+label+' '+JSON.stringify({w,ref,actual,schedule:String(schedule)}));
 }
 return ref;
}
const base=()=>({p:0,v:1000,r:3,ttl:.12,pen:3,dmg:30,bodies:[],covers:[],hostiles:[]});
const cases=[];
{
 const w=base();w.pen=0;w.bodies=[{id:'a',x:0,v:0,r:8},{id:'b',x:0,v:0,r:8}];
 check(verify(w,'unaffordable-overlap').stop==='ambiguous-body','must abstain from arbitrary victim');cases.push('unaffordable-body-overlap');
}
{
 const w=base();w.pen=1;w.bodies=[{id:'a',x:0,v:0,r:8},{id:'b',x:0,v:0,r:8}];
 check(verify(w,'affordable-overlap').events.length===2,'both simultaneous bodies must be atomic');cases.push('affordable-body-overlap');
}
{
 const w=base();w.covers=[{id:'wall',lo:-5,hi:5,breakable:false,hp:Infinity}];
 w.bodies=[{id:'inside',x:0,v:0,r:8}];
 check(verify(w,'wall-first').events.map(e=>e.id).join(',')==='wall','wall must precede body');cases.push('embedded-wall-priority');
}
{
 const w=base();w.covers=[{id:'breach',lo:-5,hi:5,breakable:true,hp:10}];
 w.bodies=[{id:'inside',x:0,v:0,r:8}];
 check(verify(w,'breach').events.map(e=>e.id).join(',')==='breach,inside','breach before same-time body');cases.push('breach-before-body');
}
{
 const w=base();w.hostiles=[{id:'enemy',x:0,v:0,r:3}];
 w.bodies=[{id:'inside',x:0,v:0,r:8}];
 check(verify(w,'interception').events[0].id==='enemy','hostile interception first');cases.push('interception-before-body');
}
{
 const w=base();w.bodies=[{id:'moving',x:55,v:-200,r:8},{id:'rear',x:95,v:0,r:8}];
 check(verify(w,'moving').events.length===2,'moving and rear contact');cases.push('moving-then-rear');
}
{
 const w=base();w.pen=0;
 const boundary=1/60;
 // Near-simultaneous contacts straddling a frame boundary must remain
 // one ambiguous first-contact group, never an arbitrary first-array hit.
 w.bodies=[{id:'before',x:1000*(boundary-2e-10)+11,v:0,r:8},
           {id:'after',x:1000*(boundary+2e-10)+11,v:0,r:8}];
 check(verify(w,'frame-boundary-near-tie').stop==='ambiguous-body',
   'near-tie across frame boundary must remain ambiguous');
 cases.push('near-tie-crosses-frame-boundary');
}
{
 const w=base();
 w.covers=[{id:'wallA',lo:-5,hi:5,breakable:true,hp:10},
           {id:'wallB',lo:-5,hi:5,breakable:true,hp:10}];
 w.bodies=[{id:'inside',x:0,v:0,r:8}];
 check(verify(w,'two-overlapping-cover-faces').stop==='ambiguous-cover',
   'two simultaneous cover owners must not depend on array order');
 cases.push('simultaneous-cover-owners-abstain');
}
function rng(seed){return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
const random=rng(20261026),stats={deterministic:cases,worlds:0,comparisons:0,permutationComparisons:0,metamorphicComparisons:0,ambiguous:0,disagreements:0};
for(let n=0;n<6000;n++){
 const w=base();w.v=350+random()*2500;w.ttl=.02+random()*.15;
 w.pen=Math.floor(random()*5);w.dmg=15+random()*50;
 for(let j=0;j<4;j++){
  const x=random()<.25?0:Math.floor(random()*8)*15;
  w.bodies.push({id:'b'+j,x,v:(random()-.5)*200,r:4+random()*12});
 }
 if(random()<.55){
  const x=random()<.25?0:random()*100;
  w.covers.push({id:'wall',lo:x-5,hi:x+5,breakable:random()<.5,hp:10+random()*50});
 }
 if(random()<.25){
  const x=random()<.2?0:random()*100;
  w.covers.push({id:'wall2',lo:x-4,hi:x+4,
    breakable:random()<.5,hp:10+random()*50});
 }
 if(random()<.35)w.hostiles.push({id:'hostile',x:random()<.3?0:random()*100,
   v:(random()-.5)*400,r:3});
 const ref=solve(w,0,true);stats.worlds++;
 if(n<200){
  const permuted={...w,bodies:w.bodies.slice().reverse()};
  for(const sch of SCHEDULES){
   stats.permutationComparisons++;
   check(equal(ref,solve(permuted,sch)),
     'entity-array permutation changed first contact: '+n);
  }
 }
 if(ref.stop&&ref.stop.startsWith('ambiguous'))stats.ambiguous++;
 if(n<150){
  const mirror={...w,p:-w.p,v:-w.v,
    bodies:w.bodies.map(b=>({...b,x:-b.x,v:-b.v})),
    covers:w.covers.map(c=>({...c,lo:-c.hi,hi:-c.lo})),
    hostiles:w.hostiles.map(q=>({...q,x:-q.x,v:-q.v}))};
  const shift=733;
  const translated={...w,p:w.p+shift,
    bodies:w.bodies.map(b=>({...b,x:b.x+shift})),
    covers:w.covers.map(c=>({...c,lo:c.lo+shift,hi:c.hi+shift})),
    hostiles:w.hostiles.map(q=>({...q,x:q.x+shift}))};
  for(const transformed of [mirror,translated])for(const sch of SCHEDULES){
   stats.metamorphicComparisons++;
   check(equal(ref,solve(transformed,sch)),
     'mirror/translation changed physical event order: '+n);
  }
 }
 for(const sch of SCHEDULES){stats.comparisons++;
  const actual=solve(w,sch);if(!equal(ref,actual)){
   stats.disagreements++;if(stats.disagreements<=2)throw Error('world '+n+' '+JSON.stringify({w,ref,actual}));
  }
 }
}
check(stats.disagreements===0,'nonzero disagreements');
console.log(JSON.stringify(stats,null,2));
