'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/fair-engagement-v1.11.2.js'),'utf8');
function boot(){
 const window={__novaModules:{}};
 vm.runInNewContext(source,{window,console});
 return window.__NOVA_FAIR_ENGAGEMENT_TEST__;
}
const C={CLASSES:{basic:{size:14}},lineageForClass:()=> 'gunner'};
const observer={id:1,x:0,y:-150,hp:100,maxHp:100,alive:true,cls:'basic',tier:1,ai:{state:'hunt',targetId:-1}};
const target=()=>({id:2,x:0,y:50,hp:100,maxHp:100,alive:true,spawnShieldT:0,cls:'basic',tier:1});
const wall=(x,w=24)=>({shape:'rect',x,y:32,w,h:20,solid:true,destructible:false});
function world(walls,t){
 return {w:1000,h:700,cam:{zoom:1},time:1,tanks:[observer,t],__novaTerrain:walls};
}
test('two joined opaque wall interiors conceal the complete HP strip without hiding the hull contact',()=>{
 const F=boot(),t=target(),g=world([wall(-12),wall(12)],t);
 assert.equal(F.inGameplayViewport(g,observer,t),true);
 assert.equal(F.healthBarCovered(g,C,t),true);
 const full=F.scoreTarget(g,C,observer,observer.ai,t,g.time);
 t.hp=20;
 assert.equal(F.scoreTarget(g,C,observer,observer.ai,t,g.time),full);
 assert.ok(Number.isFinite(full));
});
test('a real gap, destroyed half, or non-solid half leaves health readable',()=>{
 const F=boot(),t=target(),a=wall(-13),b=wall(13),g=world([a,b],t);
 assert.equal(F.healthBarCovered(g,C,t),false,'two wall interiors have a visible gap');
 b.x=12;a.x=-12;
 assert.equal(F.healthBarCovered(g,C,t),true);
 b.destructible=true;b.hp=0;
 assert.equal(F.healthBarCovered(g,C,t),false,'destroyed wall does not hide health');
 b.hp=10;b.solid=false;
 assert.equal(F.healthBarCovered(g,C,t),false,'non-solid wall does not hide health');
});
test('rounded-corner edge overlap is not falsely certified as fully opaque',()=>{
 const F=boot(),t=target(),g=world([wall(-12,24),wall(12,24)],t);
 // Shift strips to the upper rounded corner: each rectangle's outer
 // horizontal span is no longer guaranteed opaque across strip height.
 t.y=43.5;
 assert.equal(F.healthBarCovered(g,C,t),false);
});

test('joined-wall HP never reverses target choice; uncovered wounds still do',()=>{
 const F=boot(),a=target(),b=target();
 b.id=3;
 const g=world([wall(-12),wall(12)],a);g.tanks=[observer,a,b];
 a.hp=20;b.hp=100;
 const concealedA=F.chooseTarget(g,C,observer,observer.ai,g.time).id;
 a.hp=100;b.hp=20;
 const concealedB=F.chooseTarget(g,C,observer,observer.ai,g.time).id;
 assert.equal(concealedA,concealedB,'private wounds cannot reverse covered contact selection');
 g.__novaTerrain=[];
 a.hp=20;b.hp=100;
 const publicA=F.chooseTarget(g,C,observer,observer.ai,g.time).id;
 a.hp=100;b.hp=20;
 const publicB=F.chooseTarget(g,C,observer,observer.ai,g.time).id;
 assert.notEqual(publicA,publicB,'legible HP remains a valid tactical signal');
});
test('public-health contract used by Phase agrees with the joined-wall scorer',()=>{
 const modules={};
 const window={__novaModules:modules};
 vm.runInNewContext(source,{window,console});
 const t=target(),g=world([wall(-12),wall(12)],t);
 const publicHealth=window.__NOVA_FAIR_ENGAGEMENT__.healthPublicTo;
 assert.equal(publicHealth(g,C,observer,t),false);
 g.__novaTerrain[1].solid=false;
 assert.equal(publicHealth(g,C,observer,t),true);
});

test('unrelated distant wall cannot reuse the prior opaque interval',()=>{
 const F=boot(),t=target();
 const a=wall(-12),b=wall(12);b.y=1000;
 const g=world([a,b],t);
 assert.equal(F.healthBarCovered(g,C,t),false);
 b.y=32;
 assert.equal(F.healthBarCovered(g,C,t),true);
});

test('viewport-clipped strip concealed by one wall does not reveal private HP',()=>{
 const F=boot(),t=target();
 t.x=-495;
 const g=world([{shape:'rect',x:-480,y:30,w:60,h:70,solid:true}],t);
 const publicHealth=(()=>{
  const window={__novaModules:{}};
  vm.runInNewContext(source,{window,console});
  return window.__NOVA_FAIR_ENGAGEMENT__.healthPublicTo;
 })();
 assert.equal(F.inGameplayViewport(g,observer,t),true);
 assert.equal(F.healthBarCovered(g,C,t),false,'full world strip extends beyond wall');
 assert.equal(F.healthBarCovered(g,C,t,observer),true,'visible intersection is covered');
 assert.equal(publicHealth(g,C,observer,t),false);
 const healthy=F.scoreTarget(g,C,observer,observer.ai,t,g.time);
 t.hp=20;
 assert.equal(F.scoreTarget(g,C,observer,observer.ai,t,g.time),healthy);
 g.__novaTerrain[0].solid=false;
 const exposed=F.scoreTarget(g,C,observer,observer.ai,t,g.time);
 t.hp=100;
 const exposedHealthy=F.scoreTarget(g,C,observer,observer.ai,t,g.time);
 assert.ok(Math.abs(exposed-exposedHealthy-.384)<1e-8,'visible clipped HP remains actionable');
});

test('portrait zoom uses CSS viewport world extents for clipped HP evidence',()=>{
 const F=boot(),t=target();
 t.x=-315;
 const g=world([{shape:'rect',x:-300,y:30,w:60,h:70,solid:true}],t);
 g.w=320;g.h=640;g.cam.zoom=.5;
 assert.equal(F.inGameplayViewport(g,observer,t),true);
 assert.equal(F.healthBarCovered(g,C,t),false);
 assert.equal(F.healthBarCovered(g,C,t,observer),true);
 const healthy=F.scoreTarget(g,C,observer,observer.ai,t,g.time);
 t.hp=20;
 assert.equal(F.scoreTarget(g,C,observer,observer.ai,t,g.time),healthy);
 g.cam.zoom=1;
 assert.equal(F.inGameplayViewport(g,observer,t),false,
  'the same target is offscreen at portrait zoom 1');
});
