// Research-only characterization for #1106. This deliberately documents the
// existing hidden-health scoring defect; it is NOT the desired behavior.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const src=fs.readFileSync(path.join(root,'nova-updates/fair-engagement-v1.11.2.js'),'utf8');
const shipping=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(shipping.includes('nova-updates/fair-engagement-v1.11.2.js'));
function boot(){
  const w={__novaModules:{}};
  vm.runInNewContext(src,{window:w,Math,Number,Object,Array,console:{info(){},warn(){},error(){}}});
  return w.__NOVA_FAIR_ENGAGEMENT_TEST__;
}
const C={CLASSES:{},lineageForClass(){return 'gunner';}};
function t(id,x,y,hp=100){return {id,x,y,hp,maxHp:100,alive:true,spawnShieldT:0,cls:'basic',tier:1,isPlayer:false,ai:{state:'hunt',targetId:-1}};}
function world(tanks){return {w:800,h:600,cam:{zoom:1},zoom:1,time:1,tanks,hasLineOfSight(){return false;},getTank(id){return tanks.find(t=>t.id===id)||null;}};}
test('CHARACTERIZATION: an in-viewport covered contact still leaks live HP into score',()=>{
  const F=boot(),observer=t(1,0,0),covered=t(2,100,0),g=world([observer,covered]);
  assert.equal(F.inGameplayViewport(g,observer,covered),true);
  const high=F.scoreTarget(g,C,observer,observer.ai,covered,g.time);
  covered.hp=20;
  const low=F.scoreTarget(g,C,observer,observer.ai,covered,g.time);
  assert.ok(Math.abs((low-high)-.384)<1e-8,'covered health should currently contribute +0.384; replace this assertion when fixing #1106');
});
test('CHARACTERIZATION: swapping only hidden HP can reverse a primary choice',()=>{
  const F=boot(),observer=t(1,0,0),a=t(2,150,0),b=t(3,150,0),g=world([observer,a,b]);
  // Identical public contact geometry and class; all terrain rays are denied.
  a.hp=20;b.hp=100;
  assert.equal(F.chooseTarget(g,C,observer,observer.ai,g.time).id,a.id);
  a.hp=100;b.hp=20;
  assert.equal(F.chooseTarget(g,C,observer,observer.ai,g.time).id,b.id);
});
test('CONTROL: off-viewport contacts do not expose live health',()=>{
  const F=boot(),observer=t(1,0,0),remote=t(2,1000,0),g=world([observer,remote]);
  Object.defineProperty(remote,'hp',{get(){throw Error('private HP read');}});
  assert.equal(F.scoreTarget(g,C,observer,observer.ai,remote,g.time),-Infinity);
});
