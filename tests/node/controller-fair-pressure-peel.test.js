'use strict';
// Canonical Live Vector + Fair Engagement composition: the fair target gate
// must preserve the Controller's existing probe/breach rhythm and local peel.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const classes=['carrier','overlord','warden','hivemind','broodmother','citadel','valkyrie'];
const scripts=['nova-updates/second-body-live-vector-v1.10.7.js',
 'nova-updates/fair-engagement-v1.11.2.js'];

function boot(cls='carrier'){
  class Game {
    updateDrones(){this.seenPower=this.tanks[0].__novaLiveVectorAI.commandPower;}
    getTank(id){return this.tankById.get(id)||null;}
  }
  const mods={'game/engine':m=>{m.exports.Game=Game;}};
  const window={__novaModules:mods,NOVATips:{registerMany(){}}};
  const context={window,document:{addEventListener(){}},
    console:{info(){},warn(){},error(){}},Math,Number,Map,Set,Date,Object,Array,WeakMap};
  for(const f of scripts)vm.runInNewContext(fs.readFileSync(path.join(root,f),'utf8'),context,{filename:f});
  const m={exports:{}};
  mods['game/engine'](m,m.exports,()=>({
    CLASSES:Object.fromEntries(classes.map(id=>[id,{droneLeash:650,size:15}])),
    lineageForClass:id=>classes.includes(id)?'controller':'gunner'
  }));
  const owner={id:1,cls,kind:'tank',team:'blue',alive:true,isPlayer:false,
    x:0,y:0,angle:0,hp:100,maxHp:100,swarmT:0,
    ai:{state:'hunt',targetId:-1,isElite:false,strafe:1}};
  const rival={id:2,cls:'gunner',kind:'tank',team:'red',alive:true,isPlayer:false,
    x:300,y:0,hp:100,maxHp:100,spawnShieldT:0};
  const g=new m.exports.Game();
  Object.assign(g,{time:1,w:800,h:600,cam:{zoom:1},tanks:[owner,rival],
    drones:[],player:null,tankById:new Map([[1,owner],[2,rival]]),
    areAllies:(a,b)=>a.team===b.team,
    areHostile:(a,b)=>a.team!==b.team,
    hasLineOfSight:()=>true});
  return {g,owner,rival,window};
}
function tick(w,dt=1/60){w.g.updateDrones(dt);return w.owner.__novaLiveVectorAI;}

test('production script order keeps Live Vector under Fair Engagement',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const live=html.indexOf('nova-updates/second-body-live-vector-v1.10.7.js');
  const fair=html.indexOf('nova-updates/fair-engagement-v1.11.2.js');
  assert.ok(live>=0&&fair>live);
});

test('all seven AI Controller classes alternate probe and breach against the same fair target',()=>{
  for(const cls of classes){
    const w=boot(cls),p=tick(w);
    assert.equal(p.targetId,2,cls+' initial fair contact');
    assert.equal(p.pressure,'probe',cls+' opens with readable probe');
    const shallow=p.commandPower;
    w.g.time=2.5;
    tick(w);
    assert.equal(p.targetId,2);
    assert.equal(p.pressure,'breach',cls+' should commit after a bounded probe');
    assert.ok(p.commandPower>shallow+.1,cls+' should deploy deeper on breach');
    w.g.time=4;
    tick(w);
    assert.equal(p.pressure,'probe',cls+' should cycle back to probe');
  }
});

test('a visible nearby hostile drone pulls the fair Controller virtual stick inward',()=>{
  const w=boot(),p=tick(w),unthreatened=p.commandPower;
  w.g.drones=[{id:40,ownerId:2,hp:20,r:8,x:100,y:0}];
  w.g.time+=.05;tick(w);
  assert.equal(p.targetId,2,'the legitimate tank target remains selected');
  assert.ok(p.commandPower<=.25+1e-9,'local hostile drone must constrain command depth');
  assert.ok(p.commandPower<unthreatened,'the swarm must sacrifice pressure for defense');
});

test('allied, blocked and distant drones do not cause a phantom retreat',()=>{
  for(const mode of ['allied','blocked','distant']){
    const w=boot(),p=tick(w),baseline=p.commandPower;
    if(mode==='allied')w.g.tankById.set(3,{id:3,team:'blue',alive:true});
    if(mode==='blocked')w.g.hasLineOfSight=(ax,ay,bx)=>bx>150;
    w.g.drones=[{id:40,ownerId:mode==='allied'?3:2,hp:20,r:8,
      x:mode==='distant'?500:100,y:0}];
    w.g.time+=.05;tick(w);
    assert.equal(p.commandPower,baseline,mode+' cannot alter fair depth');
  }
});

test('shielded or offscreen targets still cannot activate the virtual command',()=>{
  for(const mode of ['shielded','offscreen']){
    const w=boot(),p=tick(w);
    if(mode==='shielded')w.rival.spawnShieldT=2;
    else w.rival.x=500;
    w.g.time+=.05;tick(w);
    assert.equal(p.active,false,mode+' must release');
    assert.equal(p.targetId,-1);
  }
});
