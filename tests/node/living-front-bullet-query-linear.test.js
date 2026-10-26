'use strict';
// Production Living Front bullet-index semantics under dense local fire.
// The optimized spatial hash omits bullets; the fallback may already contain
// them. Both must return each physical projectile once without mutating it.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const files=['nova-updates/living-front-core-v1.12.0.js',
 'nova-updates/living-front-instincts-v1.12.0.js'];

function boot(){
 const window={__novaModules:{}};
 const context={window,Math,Map,Set,WeakMap,Number,Object,Array,Date,JSON,
  performance:{now:()=>0},console:{info(){},warn(){},error(){}}};
 for(const file of files)vm.runInNewContext(
  fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 return window.__NOVA_LIVING_FRONT_INTERNAL__;
}
function world(LF,bullets,prepopulated=[]){
 const shape={kind:'shape',type:'circle',id:7000,x:0,y:0,r:12,hp:20,vx:0,vy:0};
 const g={time:10,shapes:[shape],tanks:[],bullets,
  hash:{query(_x,_y,_r,out){out.push(shape,...prepopulated);}}};
 const st=LF.ensure(g,{circle:{speed:60,xp:10}});
 LF.buildBulletIndex(g,st);
 return {g,st,shape};
}
function shot(id,x,y,dead=false){
 return Object.freeze({id,kind:'bullet',x,y,r:3,vx:500,vy:0,dead});
}

test('dense shipping-index query returns every local shot exactly once, in cell order',()=>{
 const LF=boot(),bullets=[];
 for(let i=0;i<550;i++)bullets.push(shot(i,((i*37)%341)-170,((i*71)%341)-170));
 const {g,st,shape}=world(LF,bullets);
 const first=LF.query(g,st,0,0,220,0).slice();
 const expected=bullets.filter(b=>b.x*b.x+b.y*b.y<=220*220);
 assert.equal(first[0],shape);
 assert.equal(first.length,expected.length+1);
 assert.equal(new Set(first).size,first.length);
 assert.deepEqual(new Set(first.slice(1)),new Set(expected));
 assert.equal(g.__lfBulletIndex.querySeen instanceof WeakMap,true);
 const seen=g.__lfBulletIndex.querySeen;
 for(let i=0;i<100;i++){
  const out=LF.query(g,st,(i%7)-3,(i%11)-5,220,0);
  assert.equal(new Set(out).size,out.length,'no duplicates in query '+i);
 }
 assert.equal(g.__lfBulletIndex.querySeen,seen,'reuses one weak identity map');
});

test('fallback hash bullets and repeated bullet-array references are deduplicated',()=>{
 const LF=boot(),a=shot(1,-10,0),b=shot(2,10,0);
 const {g,st,shape}=world(LF,[a,a,b,b],[b]);
 const out=LF.query(g,st,0,0,50,0);
 assert.deepEqual(Array.from(out),[shape,b,a]);
 assert.equal(g.__lfBulletIndex.queryStamp,1);
 const second=LF.query(g,st,0,0,50,0);
 assert.deepEqual(Array.from(second),[shape,b,a]);
 assert.equal(g.__lfBulletIndex.queryStamp,2);
});

test('rebuilding index tracks moving, dead and newly born bullets',()=>{
 const LF=boot(),a=shot(1,0,0),b=shot(2,400,0),c=shot(3,20,0,true);
 const {g,st}=world(LF,[a,b,c]);
 assert.deepEqual(Array.from(LF.queryBullets(g,0,0,60,[])),[a]);
 g.bullets=[shot(1,500,0),shot(2,5,0),shot(4,-20,0)];
 LF.buildBulletIndex(g,st);
 const near=Array.from(LF.queryBullets(g,0,0,60,[]));
 assert.deepEqual(near.map(b=>b.id).sort((x,y)=>x-y),[2,4]);
 assert.equal(near.some(b=>b.id===1),false);
});

test('query stamp rollover does not retain a stale duplicate identity',()=>{
 const LF=boot(),a=shot(1,0,0),b=shot(2,2,0);
 const {g}=world(LF,[a,b,a]);
 const ix=g.__lfBulletIndex,previous=ix.querySeen;
 ix.queryStamp=1000000000;
 const out=LF.queryBullets(g,0,0,30,[]);
 assert.deepEqual(Array.from(out),[a,b]);
 assert.equal(ix.queryStamp,1);
 assert.notEqual(ix.querySeen,previous);
 assert.deepEqual(Array.from(LF.queryBullets(g,0,0,30,[])),[a,b]);
});

for(const hz of [30,60,120,240]){
 test('materialized Living Front bullet-index path is FPS-neutral at '+hz+' Hz',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(html.includes('nova-updates/living-front-instincts-v1.12.0.js'));
  const LF=boot(),bullet=shot(1,-100,0),{g,st}=world(LF,[bullet]);
  for(let frame=0;frame<hz;frame++){
   g.time+=1/hz;
   LF.buildBulletIndex(g,st);
   const out=LF.query(g,st,0,0,145,0);
   assert.equal(out.filter(e=>e===bullet).length,1);
  }
 });
}

test('seeded 4,000-world oracle preserves prepopulated output and grid order',()=>{
 const LF=boot();let seed=20261026;
 function rand(){return ((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);}
 for(let worldId=0;worldId<4000;worldId++){
  const bullets=[],n=1+Math.floor(rand()*80);
  for(let i=0;i<n;i++){
   const b=shot(i,(rand()-.5)*1200,(rand()-.5)*1200,rand()<.12);
   bullets.push(b);if(rand()<.09)bullets.push(b);
  }
  const {g}=world(LF,bullets);
  const x=(rand()-.5)*1200,y=(rand()-.5)*1200,r=5+rand()*320;
  const initial=[];
  for(let i=0;i<3;i++)if(rand()<.3)initial.push(bullets[Math.floor(rand()*bullets.length)]);
  const expected=initial.slice(),ix=g.__lfBulletIndex,rr=r*r;
  for(let cx=Math.floor((x-r)/ix.cell);cx<=Math.floor((x+r)/ix.cell);cx++)
   for(let cy=Math.floor((y-r)/ix.cell);cy<=Math.floor((y+r)/ix.cell);cy++){
    const bucket=ix.cells.get(cx*10000+cy)||[];
    for(const b of bucket)if(!b.dead&&(b.x-x)**2+(b.y-y)**2<=rr&&!expected.includes(b))
     expected.push(b);
   }
  const actual=Array.from(LF.queryBullets(g,x,y,r,initial.slice()));
  assert.deepEqual(actual,expected,'world '+worldId);
 }
});
