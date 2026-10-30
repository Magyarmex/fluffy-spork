'use strict';
/* Real production overlay composition: the drone filter must not give AI
 * Controllers an extra off-screen tank sensor when their native selector
 * returns a tank or when a rejected spotter triggers combat fallback.
 * Human gene-grafted autonomy and ordinary public in-frame tank pursuit stay. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');

function boot(native){
  class Game {
    acquireDroneTarget(){return this.nativeTarget;}
    updateDrones(){}
    getTank(id){return this.tankById.get(id)||null;}
  }
  const modules={
    'game/engine':m=>{m.exports={Game};},
    'game/ai':m=>{m.exports={updateAI(){}};}
  };
  const window={__novaModules:modules};
  const context={window,Math,Map,Set,Number,Object,Date,
    console:{info(){},warn(){},error(){}}};
  for(const file of ['drone-targeting-v1.5.1.js','fair-engagement-v1.11.2.js']){
    vm.runInNewContext(fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),
      context,{filename:file});
  }
  const m={exports:{}};
  modules['game/engine'](m,m.exports,id=>id==='./classes'?
    {CLASSES:{carrier:{size:15}},lineageForClass(){return null;}}:{});
  const g=new m.exports.Game();
  const owner={kind:'tank',id:1,cls:'twin',gene:'controller',x:0,y:0,hp:100,alive:true,
    ai:{state:'farm'},isPlayer:false,team:'blue'};
  const drone={kind:'drone',id:11,ownerId:1,x:180,y:0,hp:20,leash:500};
  g.w=320;g.h=240;g.cam={zoom:1};
  g.tanks=[owner];g.drones=[drone];g.shapes=[];
  g.tankById=new Map([[owner.id,owner]]);
  g.hasLineOfSight=()=>true;
  g.areAllies=(a,b)=>a.team===b.team;
  g.areHostile=(a,b)=>a.team!==b.team;
  g.nativeTarget=native;
  return {g,owner,drone,window,acquire:()=>g.acquireDroneTarget(drone,owner,500)};
}
function enemy(id,x,y=0,isPlayer=false){
  return {kind:'tank',id,x,y,hp:100,alive:true,team:'red',
    spawnShieldT:0,isPlayer};
}
test('AI drone rejects off-screen native tank even when the public minimap knows its position',()=>{
  const off=enemy(2,200),shape={kind:'shape',id:3,x:70,y:0,hp:20};
  const h=boot(off);h.g.tanks.push(off);h.g.shapes.push(shape);
  assert.equal(h.window.__NOVA_FAIR_ENGAGEMENT__.inGameplayViewport(h.g,h.owner,off),false);
  assert.equal(h.acquire(),shape);
});
test('AI drone keeps a native in-frame tank even behind terrain, preserving public-map routing',()=>{
  const near=enemy(2,120),h=boot(near);h.g.tanks.push(near);
  h.g.hasLineOfSight=()=>false;
  assert.equal(h.acquire(),near);
});
test('AI spotter fallback ignores off-screen closer-to-drone tank and chooses visible rival',()=>{
  const spotter={kind:'drone',id:9,ownerId:4,x:10,y:0,hp:10,__novaSpotter:true};
  const h=boot(spotter),hidden=enemy(2,200),visible=enemy(3,100);
  h.g.tanks.push(hidden,visible);
  assert.equal(h.acquire(),visible);
});
test('off-screen human and NPC are treated identically by AI drone perception',()=>{
  for(const human of [false,true]){
    const off=enemy(2,200,0,human),shape={kind:'shape',id:3,x:70,y:0,hp:20};
    const h=boot(off);h.g.tanks.push(off);h.g.shapes.push(shape);
    assert.equal(h.acquire(),shape);
  }
});
test('human gene-grafted retains existing autonomous target behavior outside AI viewport',()=>{
  const off=enemy(2,200),h=boot(off);h.owner.ai=null;h.owner.isPlayer=true;
  h.g.tanks.push(off);
  assert.equal(h.acquire(),off);
});
test('AI viewport changes with zoom and orientation, not a fixed distance threshold',()=>{
  const target=enemy(2,200),h=boot(target);h.g.tanks.push(target);
  assert.equal(h.acquire(),null,'320px width at zoom 1 has 160 world-unit half-width');
  h.g.cam.zoom=.75;
  assert.equal(h.acquire(),target,'zoomed-out view contains the same tank');
  h.g.cam.zoom=1;h.g.w=480;
  assert.equal(h.acquire(),target,'landscape viewport contains the same tank');
});

test('dense AI fallback avoids viewport work for out-of-leash tanks',()=>{
  const spotter={kind:'drone',id:9,ownerId:4,x:10,y:0,hp:10,__novaSpotter:true};
  const h=boot(spotter),visible=enemy(2,100);
  h.g.tanks.push(visible);
  for(let i=0;i<100;i++)h.g.tanks.push(enemy(100+i,900+i*5));
  const original=h.window.__NOVA_FAIR_ENGAGEMENT__.inGameplayViewport;
  let calls=0;
  h.window.__NOVA_FAIR_ENGAGEMENT__.inGameplayViewport=(...args)=>{calls++;return original(...args);};
  assert.equal(h.acquire(),visible);
  assert.equal(calls,1,'100 out-of-leash rivals must not trigger viewport checks');
});
