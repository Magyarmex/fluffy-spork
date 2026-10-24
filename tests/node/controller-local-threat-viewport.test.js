'use strict';
// Real shipping Live Vector -> Fair Engagement composition: an AI Controller
// must not move defenders or suppress repair in response to unseen drones.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const live=fs.readFileSync(path.join(root,'nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');
const fair=fs.readFileSync(path.join(root,'nova-updates/fair-engagement-v1.11.2.js'),'utf8');

function boot({enemies=[[200,0]],damaged=false,player=false,w=300,h=600,zoom=1,dt=.2,withFair=true,beforeTick=null}={}){
  class Game{updateDrones(){}getTank(id){return this.tankById.get(id)||null;}}
  const modules={'game/engine':m=>{m.exports.Game=Game;}};
  const window={__novaModules:modules,NOVATips:{registerMany(){}}};
  const ctx={window,document:{addEventListener(){}},
    console:{info(){},warn(){},error(){}},Math,Number,Map,Set,Date,Object,Array,WeakMap};
  vm.runInNewContext(live,ctx,{filename:'second-body-live-vector-v1.10.7.js'});
  if(withFair)vm.runInNewContext(fair,ctx,{filename:'fair-engagement-v1.11.2.js'});
  const m={exports:{}};
  modules['game/engine'](m,m.exports,()=>({
    CLASSES:{carrier:{droneLeash:650,size:15},gunner:{size:15}},
    lineageForClass:id=>id==='carrier'?'controller':'gunner'
  }));
  const owner={id:1,cls:'carrier',team:'blue',alive:true,isPlayer:player,
    x:0,y:0,hp:100,maxHp:100,angle:0,swarmT:0,
    ai:player?null:{state:'hunt',targetId:-1,isElite:false,strafe:1},
    __novaSwarm:{active:false,power:0}};
  const rival={id:2,cls:'gunner',team:'red',alive:true,isPlayer:false,
    x:130,y:0,hp:100,maxHp:100,spawnShieldT:0};
  const drone={id:11,ownerId:1,x:0,y:20,r:8,hp:damaged?10:100,
    maxHp:100,speed:200,__novaPhase:'form',attackCd:0,
    __lvRepairWait:0,__lvLastHp:damaged?10:100};
  const enemyDrones=enemies.map(([x,y],i)=>({
    id:40+i,ownerId:2,x,y,r:8,hp:100,maxHp:100
  }));
  const g=new m.exports.Game();
  Object.assign(g,{time:1,w,h,cam:{zoom},tanks:[owner,rival],
    drones:[drone,...enemyDrones],player:player?owner:null,
    tankById:new Map([[1,owner],[2,rival]]),
    areAllies:(a,b)=>a.team===b.team,
    areHostile:(a,b)=>a.team!==b.team,hasLineOfSight:()=>true});
  if(beforeTick)beforeTick({g,owner,window});
  g.updateDrones(dt);
  return {g,owner,rival,drone,window};
}

test('materialized game loads Live Vector before Fair Engagement',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const a=html.indexOf('nova-updates/second-body-live-vector-v1.10.7.js');
  const b=html.indexOf('nova-updates/fair-engagement-v1.11.2.js');
  assert.ok(a>=0&&b>a);
});

test('Fair Engagement publishes the exact viewport contract for local AI defense',()=>{
  const {g,owner,window}=boot();
  const view=window.__NOVA_FAIR_ENGAGEMENT__.inGameplayViewport;
  assert.equal(typeof view,'function');
  assert.equal(view(g,owner,{id:41,x:200,y:0,hp:100}),false);
  assert.equal(view(g,owner,{id:41,x:100,y:0,hp:100}),true);
});

test('portrait AI ignores hidden drone but still intercepts visible local breach',()=>{
  const hidden=boot({enemies:[[200,0]]});
  assert.equal(hidden.drone.x,0,'unseen drone must not redirect a defender');
  assert.equal(hidden.drone.y,20);
  const visible=boot({enemies:[[100,0]]});
  assert.ok(visible.drone.x>0,'visible breach still receives local defense');
});

test('offscreen hostile drone does not secretly suppress Controller repair',()=>{
  const hidden=boot({damaged:true,enemies:[[200,0]]});
  const visible=boot({damaged:true,enemies:[[100,0]]});
  assert.ok(hidden.drone.hp>10,'hidden drone cannot suppress local recovery');
  assert.equal(visible.drone.hp,10,'visible drone still suppresses repair');
});

test('nearer unseen drone cannot mask a farther visible drone in defensive peel',()=>{
  const w=boot({enemies:[[151,0],[140,140]]});
  assert.ok(w.drone.y>20,'defender follows visible threat rather than hidden nearest');
});

test('human Controller keeps legitimate offscreen autonomous local defense',()=>{
  const w=boot({player:true,enemies:[[200,0]]});
  assert.ok(w.drone.x>0,'human Controller behavior remains unchanged');
});

test('viewport zoom, resize and frame rate determine AI sight consistently',()=>{
  for(const hz of [30,60,120,240]){
    assert.equal(boot({enemies:[[100,0]],zoom:2,dt:1/hz}).drone.x,0,
      hz+' Hz: zoomed-out-of-view drone cannot steer defenders');
    assert.ok(boot({enemies:[[100,0]],dt:1/hz}).drone.x>0,
      hz+' Hz: visible drone remains a valid threat');
  }
  assert.ok(boot({enemies:[[200,0]],w:500}).drone.x>0,
    'wider viewport restores legitimate local defense');
});

test('without Fair Engagement, legacy standalone Live Vector remains operational',()=>{
  const w=boot({withFair:false,enemies:[[200,0]]});
  assert.ok(w.drone.x>0,'no new dependency breaks legacy standalone operation');
});

test('out-of-range drones never incur a fair viewport or terrain query',()=>{
  boot({enemies:Array.from({length:30},(_,i)=>[400+i*10,0]),
    beforeTick:({g,owner,window})=>{
      let views=0,rays=0;
      const fair=window.__NOVA_FAIR_ENGAGEMENT__,original=fair.inGameplayViewport;
      fair.inGameplayViewport=(...args)=>{views++;return original(...args);};
      g.hasLineOfSight=()=>{rays++;return true;};
      const found=window.__NOVA_LIVE_VECTOR_TEST__.hostileDroneNear(g,owner,265);
      assert.equal(found,null);
      assert.equal(views,0,'distance gate must precede viewport geometry');
      assert.equal(rays,0,'irrelevant drones cannot request terrain rays');
    }});
});

test('once a visible nearest threat wins, farther drones skip costly visibility',()=>{
  boot({enemies:[[100,0],...Array.from({length:29},(_,i)=>[110+i*4,0])],
    beforeTick:({g,owner,window})=>{
      let views=0,rays=0;
      const fair=window.__NOVA_FAIR_ENGAGEMENT__,original=fair.inGameplayViewport;
      fair.inGameplayViewport=(...args)=>{views++;return original(...args);};
      g.hasLineOfSight=()=>{rays++;return true;};
      const found=window.__NOVA_LIVE_VECTOR_TEST__.hostileDroneNear(g,owner,265);
      assert.equal(found.id,40);
      assert.equal(views,1,'only the winning closest candidate needs a viewport check');
      assert.equal(rays,1,'only the winning closest candidate needs a terrain ray');
    }});
});

test('nonfinite drone positions never become a nearest defensive threat',()=>{
  boot({enemies:[[Number.NaN,0],[100,0]],
    beforeTick:({g,owner,window})=>{
      const found=window.__NOVA_LIVE_VECTOR_TEST__.hostileDroneNear(g,owner,265);
      assert.equal(found.id,41,'NaN cannot defeat a finite distance comparison');
    }});
});
