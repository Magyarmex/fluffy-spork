'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/controller-v1.3.0.js'),'utf8');
function extract(name){
 const i=source.indexOf('function '+name+'(');assert.ok(i>=0,'missing '+name);
 const start=source.indexOf('{',i);let depth=0;
 for(let j=start;j<source.length;j++){
  if(source[j]==='{')depth++;
  else if(source[j]==='}'&&--depth===0)return source.slice(i,j+1);
 }
 throw new Error('unclosed '+name);
}
const ctx=vm.createContext({Math,Number,Object,CLASSES:{small:{size:6},medium:{size:15},big:{size:34}}});
for(const name of ['clamp','dist2','pointSegmentDist2','entityRadius','findDashHit','simulateControllerDrone'])vm.runInContext(extract(name),ctx);
const owner={id:1,swarmT:0},d={id:99,kind:'drone',ownerId:1,r:5,hp:20};
function tank(id,x,y,px=x,py=y,stamp=7){return {id,kind:'tank',cls:'small',x,y,__novaSweepPrevX:px,__novaSweepPrevY:py,__novaSweepMoveTime:stamp,alive:true,spawnShieldT:0};}
function strike(tanks,options={}){
 const a=options.a||[0,0],b=options.b||[100,0];
 return ctx.findDashHit({time:options.time??7,tanks,drones:options.drones||[]},owner,d,...a,...b,!!options.strict,options.fraction??1)?.id??null;
}
test('moving tank crossing dash path is hit although endpoint is outside',()=>assert.equal(strike([tank(2,50,-40,50,40)]),2));
test('tank that vacates dash path before contact is not hit',()=>assert.equal(strike([tank(2,50,0,-100,0)]),null));
test('same-velocity separation cannot create a phantom hit',()=>assert.equal(strike([tank(2,160,0,60,0)]),null));
test('stale/invalid snapshots fall back to existing static collision',()=>{
 assert.equal(strike([tank(2,50,0,-100,0,6)]),2);
 assert.equal(strike([tank(2,50,0,NaN,0)]),2);
});
test('missing or nonfinite game clock never validates a movement snapshot',()=>{
 const t=tank(2,50,0,-100,0,7);
 delete t.__novaSweepMoveTime;
 const g={tanks:[t],drones:[]};
 assert.equal(ctx.findDashHit(g,owner,d,0,0,100,0)?.id,2);
 g.time=Infinity;assert.equal(ctx.findDashHit(g,owner,d,0,0,100,0)?.id,2);
});
test('wall boundary truncates both tank and dash motion to same time fraction',()=>{
 assert.equal(strike([tank(2,35,0,95,0)],{b:[50,0],strict:true,fraction:.5}),null);
 assert.equal(strike([tank(2,42,-25,42,25)],{b:[50,0],strict:true,fraction:.5}),2);
 assert.equal(strike([tank(2,64,0)],{b:[50,0],strict:true,fraction:.5}),null);
});
test('spawn shields, owner immunity and screening drones remain authoritative',()=>{
 const shield=tank(2,20,0);shield.spawnShieldT=1;assert.equal(strike([shield]),null);
 assert.equal(strike([tank(1,10,0)]),null);
 const screen={id:3,kind:'drone',ownerId:3,r:5,x:30,y:0,hp:20};
 assert.equal(strike([tank(2,80,0,140,0)],{drones:[screen]}),3);
});
test('subpixel relative crossing is not discarded by a motion cutoff',()=>{
 for(const step of [1e-2,1e-3,1e-4,1e-5,1e-6,1e-7]){
  const t=tank(2,14-step*.2,0,14+step*.2,0);
  assert.equal(strike([t],{a:[0,0],b:[0,0]}),2,'step='+step);
 }
});
test('real committed dash calls moving-target selection once',()=>{
 const moving=tank(2,50,-40,50,40);
 const attack={...d,x:0,y:0,dmg:10,speed:200,__novaPhase:'dash',__novaPhaseT:.3,__novaVX:500,__novaVY:0,__novaHitRun:false,color:'#fff'};
 const calls=[];
 const g={time:7,tanks:[moving],drones:[attack],__novaTerrain:[],sfx:{},damageTank:(t,amt,id)=>calls.push([t.id,amt,id]),damageDrone:()=>{throw Error('unexpected drone hit')}};
 ctx.simulateControllerDrone(g,owner,attack,[],null,{active:true},{diveDamage:1.5,recover:.6},.2,false);
 assert.deepEqual(calls,[[2,15,1]]);
 ctx.simulateControllerDrone(g,owner,attack,[],null,{active:true},{diveDamage:1.5,recover:.6},.01,false);
 assert.equal(calls.length,1);
});
