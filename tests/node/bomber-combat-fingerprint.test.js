'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const witness=require('../browser/bomber-combat-fingerprint.js');
function world(){
 const player={id:1,x:0,y:0,hp:100,score:10,kills:0,level:1,
  xp:2,alive:true,cls:'bomber'};
 return {time:1.2,player,
  tanks:[player,{id:2,x:25,y:3,hp:80,score:20,kills:0,alive:true,cls:'scout'}],
  shapes:[{id:3,x:50,y:0,hp:15,type:'circle'}],
  drones:[{id:4,x:20,y:12,hp:12,ownerId:2}],
  __novaTerrain:[{id:-1,hp:50,solid:true,destructible:true}],
  powerups:[{id:5,x:70,y:0,type:'shield'}],
  orbs:[{id:6,x:80,y:0,value:15}],
  bullets:[{id:7,x:5,y:1,ttl:.2,dead:false,ownerId:1}],
  __novaTrialRng:1234};
}
function freeze(x){
 if(x&&typeof x==='object'&&!Object.isFrozen(x)){
  Object.values(x).forEach(freeze);Object.freeze(x);
 }
 return x;
}
test('fingerprint is deterministic and does not mutate frozen actual-state shapes',()=>{
 const g=freeze(world());
 assert.deepEqual(witness.sample(g),witness.sample(g));
 assert.equal(witness.sample(g).time,1.2);
});
test('projectile-only movement, lifetime, ordering and RNG never change either fingerprint',()=>{
 const g=world(),before=witness.sample(g);
 g.bullets[0].x+=200;g.bullets[0].ttl=0;g.bullets[0].dead=true;
 g.bullets.push({id:8,x:500,y:0,ttl:2});g.bullets.reverse();
 g.__novaTrialRng=9999;
 assert.deepEqual(witness.sample(g),before);
});
test('tank movement changes body but not health or category hashes',()=>{
 const g=world(),before=witness.sample(g);
 g.tanks[1].x+=12;
 const after=witness.sample(g);
 assert.notEqual(after.bodyHash,before.bodyHash);
 assert.equal(after.healthHash,before.healthHash);
 assert.deepEqual(after.categories,before.categories);
});
test('real health change affects body, health and correct category',()=>{
 const g=world(),before=witness.sample(g);
 g.tanks[1].hp-=7;
 const after=witness.sample(g);
 assert.notEqual(after.bodyHash,before.bodyHash);
 assert.notEqual(after.healthHash,before.healthHash);
 assert.notEqual(after.categories.tanks,before.categories.tanks);
 for(const key of ['pilot','shapes','drones','cover'])
  assert.equal(after.categories[key],before.categories[key]);
});
test('drone damage and removal are visible without projectile attribution',()=>{
 const g=world(),before=witness.sample(g);
 g.drones[0].hp=0;g.drones.splice(0,1);
 const after=witness.sample(g);
 assert.notEqual(after.categories.drones,before.categories.drones);
 assert.notEqual(after.healthHash,before.healthHash);
});
test('destructible cover health changes are visible',()=>{
 const g=world(),before=witness.sample(g);
 g.__novaTerrain[0].hp=0;g.__novaTerrain[0].solid=false;
 const after=witness.sample(g);
 assert.notEqual(after.categories.cover,before.categories.cover);
 assert.notEqual(after.healthHash,before.healthHash);
});
test('pilot progression is distinguished from movement',()=>{
 const g=world(),before=witness.sample(g);
 g.player.level++;g.player.score+=50;
 const after=witness.sample(g);
 assert.notEqual(after.categories.pilot,before.categories.pilot);
 assert.notEqual(after.healthHash,before.healthHash);
});
test('shape death/repopulation changes health membership',()=>{
 const g=world(),before=witness.sample(g);
 g.shapes.splice(0,1);g.shapes.push({id:9,x:60,y:0,hp:20,type:'triangle'});
 const after=witness.sample(g);
 assert.notEqual(after.categories.shapes,before.categories.shapes);
});
test('invalid world fails closed',()=>{
 assert.throws(()=>witness.sample({time:1,tanks:[],shapes:[]}),
  /real combat state unavailable/);
});
test('research-only browser injection is wired, never added to production HTML',()=>{
 const root=path.resolve(__dirname,'../..');
 const browser=fs.readFileSync(path.join(root,'tests/browser/frontlines-natural-match-ab.cjs'),'utf8');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(browser,/if\(AB_MODE==='bomber-physics'\)await page\.addScriptTag\(\{url:'\/tests\/browser\/bomber-combat-fingerprint\.js'\}\)/);
 assert.doesNotMatch(html,/bomber-combat-fingerprint/);
});
