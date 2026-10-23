'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const src=fs.readFileSync(path.join(root,'nova-updates/controller-v1.3.0.js'),'utf8');
function extract(name){
  const i=src.indexOf('function '+name+'(');
  assert.ok(i>=0,'canonical '+name+' function must exist');
  const open=src.indexOf('{',i);let depth=0,end=-1;
  for(let j=open;j<src.length;j++){
    if(src[j]==='{')depth++;
    else if(src[j]==='}'&&--depth===0){end=j+1;break;}
  }
  assert.ok(end>open,'canonical '+name+' function must close');
  return src.slice(i,end);
}
const ctx=vm.createContext({Math,CLASSES:{small:{size:6},medium:{size:15},big:{size:34}}});
const synthetic=fs.existsSync(path.join(root,'SYNTHETIC_FIXTURE_ONLY'));
const functions=['clamp','dist2','pointSegmentDist2','entityRadius','findDashHit','simulateControllerDrone'];
for(const name of functions)vm.runInContext(extract(name),ctx);
const hit=ctx.findDashHit,owner={id:1},self={id:99,kind:'drone',ownerId:1,r:5,hp:20};
const tank=(id,x,y,cls='small')=>({id,kind:'tank',x,y,cls,alive:true,spawnShieldT:0});
const drone=(id,x,y)=>({id,kind:'drone',x,y,ownerId:3,r:5,hp:10});
const strike=(tanks,drones=[],a=[0,0],b=[100,0])=>hit({tanks,drones},owner,self,...a,...b);
test('a larger later-center tank physically intercepts before the small one',()=>{
  assert.equal(strike([tank(2,44,0),tank(3,53,0,'big')])?.id,3);
});
test('enemy drone screens tank and tank screens enemy drone in committed dash',()=>{
  assert.equal(strike([tank(2,80,0,'medium')],[drone(3,25,0)])?.id,3);
  assert.equal(strike([tank(2,25,0,'medium')],[drone(3,80,0)])?.id,2);
});
test('owner and invalid entities do not intercept',()=>{
  const a=tank(1,15,0),b=tank(2,25,0),c=tank(3,35,0),d=drone(4,70,0);
  b.spawnShieldT=1;c.alive=false;
  const allied={...drone(9,15,0),ownerId:1};
  assert.equal(strike([a,b,c],[self,allied,d])?.id,4);
});
test('zero-distance, tangent, misses, start overlap and ordering are stable',()=>{
  assert.equal(strike([tank(2,1,0)],[],[0,0],[0,0])?.id,2);
  assert.equal(strike([tank(2,50,0)],[],[0,0],[0,0]),null);
  assert.equal(strike([tank(2,50,14)])?.id,2);
  assert.equal(strike([tank(2,50,14.001)]),null);
  assert.equal(strike([tank(2,0,0),tank(3,0,0)],[drone(4,0,0)])?.id,2);
  assert.equal(strike([tank(3,75,0),tank(2,25,0)])?.id,2);
});
test('canonical module wiring retains committed dash hit processing',()=>{
  if(fs.existsSync(path.join(root,'SYNTHETIC_FIXTURE_ONLY')))return;
  assert.match(src,/var hit = !d\.__novaHitRun && \(!wall \|\| wallT > 0\) \? findDashHit\(g, owner, d, ax, ay, hitX, hitY, wall, wall \? wallT : 1\) : null/);
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.match(html,/nova-updates\/controller-v1\.3\.0\.js/);
});
test('property sweep: physical first-contact ordering is independent of list order',()=>{
  let seed=286;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  for(let i=0;i<2000;i++){
    const a=tank(2,10+rand()*35,(rand()-.5)*8,'small');
    const b=tank(3,55+rand()*35,(rand()-.5)*8,'small');
    assert.equal(strike([a,b])?.id,2);
    assert.equal(strike([b,a])?.id,2);
  }
});

test('real committed-dash method damages the first physical contact exactly once',()=>{
  const enemyTank=tank(2,80,0,'medium'),enemyDrone=drone(3,25,0);
  const attack={...self,id:101,x:0,y:0,dmg:10,speed:200,__novaPhase:'dash',__novaPhaseT:.3,__novaVX:600,__novaVY:0,__novaHitRun:false};
  const calls=[];
  const game={tanks:[enemyTank],drones:[attack,enemyDrone],
    damageTank(t,damage,killer){calls.push(['tank',t.id,damage,killer]);},
    damageDrone(t,damage,killer){calls.push(['drone',t.id,damage,killer]);}};
  const pilot={id:1,swarmT:0};
  const state={active:true};
  const profile={diveDamage:1.5,recover:.6};
  ctx.simulateControllerDrone(game,pilot,attack,[],null,state,profile,.2,false);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0],['drone',3,15,1]);
  assert.equal(attack.__novaHitRun,true);
  assert.equal(game.__novaDroneDamageOwner,null);
  ctx.simulateControllerDrone(game,pilot,attack,[],null,state,profile,.02,false);
  assert.equal(calls.length,1,'one committed dive cannot hit twice');
});
test('committed dash picks the same screening drone at 30/60/120/240 Hz',()=>{
  function at(fps){
    const pilot={id:1,swarmT:0};
    const attack={...self,id:101,x:0,y:0,dmg:10,speed:1000,__novaPhase:'dash',__novaPhaseT:.3,__novaVX:1000,__novaVY:0,__novaHitRun:false};
    const screen=drone(3,20,0),back=tank(2,54,0,'medium');
    const hits=[];
    const game={tanks:[back],drones:[attack,screen],damageTank(t){hits.push(t.id);},damageDrone(t){hits.push(t.id);}};
    for(let i=0;i<Math.ceil(fps*.25);i++){
      ctx.simulateControllerDrone(game,pilot,attack,[],null,{active:true},{diveDamage:1.5,recover:.6},1/fps,false);
      if(hits.length)break;
    }
    return hits[0]??null;
  }
  assert.deepEqual([30,60,120,240].map(at),[3,3,3,3]);
});
test('near-tangent and endpoint acceptance remains identical to canonical segment-circle predicate',()=>{
  let seed=0x286afe;
  function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  for(let i=0;i<5000;i++){
    const ax=(rand()-.5)*4000,ay=(rand()-.5)*4000;
    const len=1+rand()*1000,angle=rand()*Math.PI*2;
    const ux=Math.cos(angle),uy=Math.sin(angle),px=-uy,py=ux;
    const along=[0,1e-8,len*.5,len-1e-8,len][i%5];
    const delta=[0,-1e-8,1e-8,-1e-4,1e-4][Math.floor(i/5)%5];
    const r=14;
    const t=tank(2,ax+ux*along+px*(r+delta),ay+uy*along+py*(r+delta));
    const bx=ax+ux*len,by=ay+uy*len;
    const expected=ctx.pointSegmentDist2(t.x,t.y,ax,ay,bx,by)<=r*r;
    const got=hit({tanks:[t],drones:[]},owner,self,ax,ay,bx,by);
    assert.equal(!!got,expected,'preserve existing hit acceptance at sample '+i);
  }
});
