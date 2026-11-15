const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function hooks(){
  function Game(){}
  Game.prototype.tryFire=function(){};
  Game.prototype.updatePowerups=function(){};
  Game.prototype.moveTank=function(){};
  const classes={CLASSES:{guard:{bullet:{reload:.5}}},lineageForClass:()=> 'guardian'};
  const mods={
    'game/engine':m=>m.exports={Game},
    'game/classes':m=>m.exports=classes,
    'game/ai':m=>m.exports={updateAI(){}}
  };
  const context={window:{__novaModules:mods},console,Math};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates/battle-sense-v1.8.1.js'),'utf8'),context);
  return context.window.__NOVA_BATTLE_SENSE_TEST__;
}

const bot={id:7,cls:'guard',x:0,y:0,hp:100,maxHp:100,alive:true,ai:{}};

test('safer-side dodge is vetoed when the endpoint is clear but the path crosses solid cover',()=>{
  const h=hooks();
  const g={
    bullets:[{ownerId:9,x:110,y:-40,vx:0,vy:-600}],
    isTerrainSafe:()=>true,
    hasLineOfSight:(ax,ay,bx,by,pad)=>!(ax===0&&ay===0&&bx===110&&by===115&&pad===18)
  };
  assert.equal(h.saferSide(g,bot,1,0),0,'a clear endpoint on the far side of cover must not become a dodge lane');
});

test('path-clearance veto does not alter the same projectile-driven dodge in open terrain',()=>{
  const h=hooks();
  const g={
    bullets:[{ownerId:9,x:110,y:-40,vx:0,vy:-600}],
    isTerrainSafe:()=>true,
    hasLineOfSight:()=>true
  };
  assert.equal(h.saferSide(g,bot,1,0),1);
});

test('contested pickup travel uses the complete cached route without a second planner search',()=>{
 const h=hooks(),t={...bot},p={x:400,y:0},calls=[];
 const g={hasLineOfSight:()=>false,
  novaBattlefieldWaypoint:(x,y,gx,gy,pad,seed)=>{calls.push(['waypoint',pad,seed]);return{x:100,y:100};},
  novaRouteLength:(x,y,gx,gy,pad,seed,wp)=>{calls.push(['length',pad,seed]);return 650;}};
 assert.equal(h.routeDistance(g,t,p,null,{CLASSES:{guard:{size:15}}}),650);
 g.novaRouteLength=()=>50;
 assert.equal(h.routeDistance(g,t,p,null,{CLASSES:{guard:{size:15}}}),Infinity,
  'a corrupt shorter-than-first-corner cost cannot certify a blocked final leg');
 g.novaRouteLength=()=>650;
 assert.deepEqual(calls,[['waypoint',23,t.id],['length',23,t.id],['waypoint',23,t.id]]);
 delete g.novaRouteLength;
 assert.equal(h.routeDistance(g,t,p,null,{CLASSES:{guard:{size:15}}}),Infinity,
  'without a verified full route, the blocked final leg must fail closed');
 g.hasLineOfSight=(ax,ay)=>ax===100&&ay===100;
 const clear=h.routeDistance(g,t,p,null,{CLASSES:{guard:{size:15}}});
 assert.ok(clear>400&&clear<650,
  'a physically clear final leg retains the cheap-corner fallback');
});
