const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadSurface(){
  const modules={'game/engine':function(module){module.exports={Game:function Game(){}};}};
  const context={window:{__novaModules:modules},console,Math,Map,Set};
  const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/drone-discipline-v1.5.1.js'),'utf8');
  vm.runInNewContext(src,context,{filename:'drone-discipline-v1.5.1.js'});
  return context.window.__NOVA_DRONE_PERF_TEST__;
}
function game(){
  const owner={id:1,cls:'hivemind',alive:true,x:0,y:0};
  return {
    time:1,
    tankById:new Map([[1,owner]]),
    drones:[
      {id:11,ownerId:1,slot:1,hp:10,kind:'drone',x:40,y:0,leash:900},
      {id:10,ownerId:1,slot:0,hp:10,kind:'drone',x:20,y:0,leash:900},
    ],
    owner,
  };
}

test('Swarm Discipline reuses squad buckets, arrays and claim sets',()=>{
  const perf=loadSurface(),g=game();
  const a=perf.buildSquads(g),bucket=a.map.get(1),arr=bucket.drones,claims=bucket.claims;
  assert.equal(arr[0].slot,0);assert.equal(arr[0].__novaSquadIndex,0);assert.equal(arr[1].__novaSquadIndex,1);
  claims.add({});
  const b=perf.buildSquads(g),bucket2=b.map.get(1);
  assert.equal(bucket2,bucket);assert.equal(bucket2.drones,arr);assert.equal(bucket2.claims,claims);assert.equal(claims.size,0);
});

test('home-point scratch object is stable across frames',()=>{
  const perf=loadSurface(),g=game(),st=perf.buildSquads(g),sq=st.map.get(1).drones,d=sq[0];
  const p1=perf.homePoint(g,g.owner,d,sq);g.time+=.016;const p2=perf.homePoint(g,g.owner,d,sq);
  assert.equal(p1,p2,'home point should be reused rather than allocated every frame');
  assert.ok(Number.isFinite(p2.x)&&Number.isFinite(p2.y));
});
