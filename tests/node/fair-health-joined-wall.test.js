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
