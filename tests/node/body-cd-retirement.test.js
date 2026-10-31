'use strict';
/* Exact materialized core bodyCollisions + the shipping Battlefield lifecycle
 * wrapper. No rewritten collision algorithm and no new damage authority. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const battlefield=fs.readFileSync(path.join(root,'nova-updates/battlefield-v1.6.0.js'),'utf8');
const a=html.indexOf('    bodyCollisions(dt) {');
const b=html.indexOf('    updateDrones(dt) {',a);
assert.ok(a>=0&&b>a,'canonical core body-collision owner exists');
const start=battlefield.indexOf('/* Tank body-collision cooldowns are keyed');
const end=battlefield.indexOf('window.__NOVA_BATTLEFIELD_PERF_TEST__=',start);
assert.ok(start>=0&&end>start,'Battlefield retirement owner exists');
function boot(){
 const Game=new Function('classes_1','types_1','return class Game{'+html.slice(a,b)+'}')(
  {CLASSES:{scout:{size:15}}},{dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2,SHAPE_DEFS:{}});
 Game.prototype.unregisterTank=function(t){
  this.tanks=this.tanks.filter(q=>q!==t);
  return 'unregistered';
 };
 const wrap=(id,fn)=>{assert.equal(id,'game/engine');fn({Game});};
 new Function('wrap',battlefield.slice(start,end))(wrap);
 const g=new Game();g.tanks=[];g.bodyCd=new Map();g.tmp=[];
 g.hash={query(){}};g.time=1;g.damageEvents=[];
 g.bodyDamage=()=>10;
 g.damageTank=function(t,damage,ownerId){this.damageEvents.push({target:t.id,damage,ownerId});};
 return g;
}
function tank(id,x){return{id,cls:'scout',x,y:0,alive:true};}
test('real body collisions still respect the 0.4s cooldown for a live pair',()=>{
 const g=boot(),a=tank(1,0),b=tank(2,10);
 g.tanks=[a,b];g.bodyCollisions(1/60);
 assert.equal(g.bodyCd.size,1);
 assert.equal(g.damageEvents.length,2);
 a.x=0;b.x=10;g.time=1.2;g.bodyCollisions(1/60);
 assert.equal(g.damageEvents.length,2,'same pair remains on its canonical cooldown');
 a.x=0;b.x=10;g.time=1.41;g.bodyCollisions(1/60);
 assert.equal(g.damageEvents.length,4,'original cooldown expiry still permits damage');
});
test('unregistering a tank retires only its old collision pairs',()=>{
 const g=boot(),a=tank(1,0),b=tank(2,10),c=tank(3,20);
 g.tanks=[a,b,c];g.bodyCd=new Map([['1-2',1],['1-3',1],['2-3',1]]);
 assert.equal(g.bodyCd.size,3);
 const damageCount=g.damageEvents.length;
 assert.equal(g.unregisterTank(a),'unregistered');
 assert.equal(g.bodyCd.has('1-2'),false);
 assert.equal(g.bodyCd.has('1-3'),false);
 assert.equal(g.bodyCd.has('2-3'),true,'remaining live pair keeps its cooldown');
 assert.equal(g.damageEvents.length,damageCount,'unregister cannot apply damage');
});
test('2,000 retired ID pairs do not accumulate in a two-tank arena',()=>{
 const g=boot();
 for(let i=0;i<2000;i++){
  const a=tank(1000+i*2,0),b=tank(1001+i*2,10);
  g.tanks=[a,b];g.time=1+i*.5;
  g.bodyCollisions(1/60);
  assert.equal(g.bodyCd.size,1);
  g.unregisterTank(a);g.unregisterTank(b);
  assert.equal(g.bodyCd.size,0);
 }
 assert.equal(g.tanks.length,0);
});
test('normalized ID keys are retired by exact component, not substring',()=>{
 const g=boot(),t=tank(1,0);g.tanks=[t];
 g.bodyCd=new Map([['1-11',1],['11-111',1],['21-31',1],['10-1',1]]);
 g.unregisterTank(t);
 assert.equal(g.bodyCd.has('1-11'),false);
 assert.equal(g.bodyCd.has('10-1'),false);
 assert.equal(g.bodyCd.has('11-111'),true);
 assert.equal(g.bodyCd.has('21-31'),true);
});
