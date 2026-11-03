'use strict';
// #648: the opt-in 60Hz RAF must never coexist with the production owner.
const test=require('node:test');
const assert=require('node:assert/strict');
const {FixedStepRafOwner}=require('../research/fixed-step-raf-owner.cjs');
function scene(inherited=false){
  let now=1000, next=0, cancelled=0, productionStarts=0;
  const proto={start(){productionStarts++;return 'production'}};
  const g=Object.create(inherited?proto:null);
  if(!inherited)g.start=proto.start;
  Object.assign(g,{raf:0,paused:false,input:{},sfx:{startMusic(){}},
    update(){},destroy(){},setPaused(v){this.paused=v},w:800,h:600});
  const timeline={input:g.input,sampled:-Infinity,last:-Infinity,
    reset(){},consumeThrough(at){this.sampled=at}};
  const bridge={timeline,startMs:now};
  const owner=new FixedStepRafOwner(g,timeline,bridge,{
    now:()=>now,request:()=>++next,cancel:()=>{cancelled++},
    render:()=>{}});
  return {g,owner,proto,counts:()=>({productionStarts,cancelled})};
}
for(const inherited of [false,true]){
 test('fixed60 pilot excludes concurrent production start and restores '+(inherited?'inherited':'own')+' owner',()=>{
  const {g,owner,proto,counts}=scene(inherited);
  const hadOwn=Object.hasOwn(g,'start');
  owner.start();
  assert.throws(()=>g.start(),/fixed-step RAF already owns this game/);
  assert.equal(counts().productionStarts,0,'second RAF must not be scheduled');
  assert.throws(()=>owner.start(),/already started/);
  owner.stop();
  assert.equal(Object.hasOwn(g,'start'),hadOwn,'restore property ownership');
  assert.equal(g.start,proto.start);
  assert.equal(g.start(),'production');
  assert.equal(counts().productionStarts,1);
  assert.equal(counts().cancelled,1);
 });
 test('synchronous game destroy releases exclusive RAF ownership '+inherited,()=>{
  const {g,owner,proto,counts}=scene(inherited);
  owner.start();g.destroy();
  assert.equal(owner.started,false);
  assert.equal(g.start,proto.start);
  assert.equal(g.start(),'production');
  assert.equal(counts().productionStarts,1);
  assert.equal(counts().cancelled,1);
 });
}

test('failed RAF scheduling releases production start and destroy wrappers',()=>{
 const {g,proto}=scene(true);
 const timeline={input:g.input,sampled:-Infinity,last:-Infinity,
   reset(){},consumeThrough(at){this.sampled=at}};
 const bridge={timeline,startMs:1000};
 const originalDestroy=g.destroy;
 const owner=new FixedStepRafOwner(g,timeline,bridge,{
   now:()=>1000,request:()=>{throw Error('RAF unavailable')},
   cancel:()=>{},render:()=>{}});
 assert.throws(()=>owner.start(),/RAF unavailable/);
 assert.equal(owner.started,false);
 assert.equal(g.start,proto.start);
 assert.equal(Object.hasOwn(g,'start'),false);
 assert.equal(g.destroy,originalDestroy);
 assert.equal(g.start(),'production');
});

test('restart pilot does not stack start wrappers or leak production ownership',()=>{
 const {g,owner,proto,counts}=scene(false);
 for(let i=0;i<3;i++){
  owner.start();
  assert.throws(()=>g.start(),/already owns this game/);
  owner.stop();
  assert.equal(g.start,proto.start);
 }
 assert.equal(counts().cancelled,3);
 g.start();
 assert.equal(counts().productionStarts,1);
});
