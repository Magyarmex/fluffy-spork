'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const full=fs.readFileSync(path.join(__dirname,'../../nova-updates/drone-field-service-v1.10.3.js'),'utf8');
const src=full.split('\n').find(l=>l.startsWith('function projectileThreat('));
assert.ok(src,'canonical Field Service projectileThreat exists');
function boot(){
 const ctx={Math,Number,PROJECTILE_CLEARANCE:26,PROJECTILE_HORIZON:.38,
 ownerOf:(g,b)=>g.tanks.find(t=>t.id===b.ownerId)||null,
 projectileHostile:(g,o,t)=>o.team!==t.team,
 rememberedProjectileHostile:()=>false,lineClear:g=>!g.blocked};
 return vm.runInNewContext(src+'\nprojectileThreat',ctx);
}
function world({bx=100,by=0,vx=600,vy=0,r=3,ownerId=2,blocked=false}={}){
 const owner={id:1,team:'blue',x:0,y:0},enemy={id:2,team:'red'},ally={id:3,team:'blue'};
 const drone={id:7,ownerId:1,x:80,y:0,r:8,hp:80,maxHp:100};
 const bullet={ownerId,x:bx,y:by,vx,vy,r};
 return {g:{bullets:[bullet],tanks:[owner,enemy,ally],blocked,time:7},drone,owner};
}
function risk(o){const w=world(o);return boot()(w.g,w.drone,w.owner)}
for(const [name,opts,want] of [
 ['departing near miss is safe',{bx:100,vx:600},false],
 ['departing margin-only shot is safe',{bx:112,vx:600},false],
 ['departing hull overlap is hazardous',{bx:87,vx:600},true],
 ['departing radius-plus-one overlap is hazardous',{bx:91.5,vx:600},true],
 ['approaching close shot is hazardous',{bx:100,vx:-600},true],
 ['approaching distant shot is hazardous',{bx:200,vx:-600},true],
 ['horizon-entry shot is hazardous',{bx:380,vx:-750},true],
 ['shot still outside horizon is safe',{bx:400,vx:-750},false],
 ['distant departing shot is safe',{bx:200,vx:600},false],
 ['stationary close shot is hazardous',{bx:100,vx:0},true],
 ['wide miss is safe',{bx:100,by:70,vx:-600},false],
 ['friendly shot is safe',{bx:100,vx:-600,ownerId:3},false],
 ['cover blocks threat',{bx:100,vx:-600,blocked:true},false]
])test(name,()=>assert.equal(risk(opts),want));
test('repair pipeline heals after departure but blocks incoming shot',()=>{
 const funcs=['visibleThreat','canRepair','heal'].map(n=>full.split('\n').find(l=>l.startsWith('function '+n+'(')));
 assert.ok(funcs.every(Boolean));
 const ctx={Math,Number,PROJECTILE_CLEARANCE:26,PROJECTILE_HORIZON:.38,REPAIR_DELAY:4.6,REPAIR_RATE:.045,THREAT_INTERVAL:.34,PROJECTILE_INTERVAL:.12,THREAT_RADIUS:310,
 ownerOf:(g,b)=>g.tanks.find(t=>t.id===b.ownerId)||null,
 projectileHostile:(g,o,t)=>o.team!==t.team,rememberedProjectileHostile:()=>false,
 lineClear:g=>!g.blocked,hostile:(g,o,t)=>o.team!==t.team,isController:()=>false,committed:()=>false,now:g=>g.time};
 const {canRepair,heal}=vm.runInNewContext(src+'\n'+funcs.join('\n')+'\n({canRepair,heal})',ctx);
 function hp(opts){const w=world(opts),s={maxHp:100,lastDamageAt:0,nextThreatAt:0,threat:false,nextProjectileAt:0,projectileThreat:false,fxAt:0};w.drone.attackCd=0;if(canRepair(w.g,w.drone,w.owner,s))heal(w.g,w.drone,s,.5);return w.drone.hp}
 assert.ok(hp({bx:100,vx:600})>80);assert.equal(hp({bx:380,vx:-750}),80);
});
test('5000 deterministic trajectories agree with finite-horizon geometry',()=>{
 const f=boot();let seed=20261020;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 for(let i=0;i<5000;i++){
 const o={bx:80+(rnd()-.5)*600,by:(rnd()-.5)*600,vx:(rnd()-.5)*1500,vy:(rnd()-.5)*1500,r:1+rnd()*7};
 const w=world(o),b=w.g.bullets[0],dx=b.x-w.drone.x,dy=b.y-w.drone.y,v2=b.vx*b.vx+b.vy*b.vy,overlap=8+b.r+1,clear=34;
 let expected;
 if(v2<1)expected=dx*dx+dy*dy<=clear*clear;
 else if(dx*dx+dy*dy<=overlap*overlap)expected=true;
 else {const dot=dx*b.vx+dy*b.vy,t=Math.max(0,Math.min(.38,-dot/v2)),x=dx+b.vx*t,y=dy+b.vy*t;expected=dot<0&&x*x+y*y<=clear*clear;}
 assert.equal(f(w.g,w.drone,w.owner),expected,'trajectory '+i);
 }
});
