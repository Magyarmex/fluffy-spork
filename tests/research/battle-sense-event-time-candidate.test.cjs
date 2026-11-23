'use strict';
// RESEARCH ONLY: observer-owned event-time geometry model, NOT production code.
// Run: node --test tests/research/battle-sense-event-time-candidate.test.cjs
const {test}=require('node:test'),assert=require('node:assert/strict');
function record(observer,shooter,actors,time,visible){
 if(!observer||!shooter||!Number.isFinite(time)||![shooter.x,shooter.y,shooter.angle].every(Number.isFinite)||!visible(observer,shooter))return null;
 const eligible=[];
 for(const victim of actors){
  if(!victim||victim===observer||victim===shooter||victim.alive===false||!visible(observer,victim)||!victim.hostileTo(shooter))continue;
  const dx=victim.x-shooter.x,dy=victim.y-shooter.y,dist=Math.hypot(dx,dy);
  if(!Number.isFinite(dist)||dist<1e-6)continue;
  if((dx*Math.cos(shooter.angle)+dy*Math.sin(shooter.angle))/dist>.75)eligible.push(victim);
 }
 return {shooter,at:time,eligible};
}
function witnessed(snapshot,shooter,victim,now,visible,observer){
 return !!(snapshot&&snapshot.shooter===shooter&&Number.isFinite(now)&&now>=snapshot.at&&now-snapshot.at<=1.25&&victim.alive!==false&&snapshot.eligible.includes(victim)&&visible(observer,shooter)&&visible(observer,victim));
}
function actor(id,x,y){return {id,x,y,alive:true,hostileTo(other){return this!==other}};}
function scene(){const observer=actor(1,-100,0),shooter=actor(2,0,0),victim=actor(3,100,0);shooter.angle=0;return {observer,shooter,victim,actors:[observer,shooter,victim]};}
test('victim moving out of firing-time lane does not erase historical witness',()=>{
 const {observer,shooter,victim,actors}=scene(),shot=record(observer,shooter,actors,10,()=>true);
 victim.x=0;victim.y=100;assert.equal(witnessed(shot,shooter,victim,10.5,()=>true,observer),true);
});
test('victim entering firing-time lane later does not invent a witness',()=>{
 const {observer,shooter,victim,actors}=scene();victim.x=0;victim.y=100;
 const shot=record(observer,shooter,actors,10,()=>true);
 victim.x=100;victim.y=0;assert.equal(witnessed(shot,shooter,victim,10.5,()=>true,observer),false);
});
test('observer cannot witness victim hidden at event time',()=>{
 const {observer,shooter,victim,actors}=scene();
 const shot=record(observer,shooter,actors,10,(_a,b)=>b!==victim);
 assert.equal(witnessed(shot,shooter,victim,10.5,()=>true,observer),false);
});
test('two observers have separate firing-time witness sets',()=>{
 const {observer,shooter,victim,actors}=scene(),other=actor(4,-200,0);
 const see=(a,b)=>a!==other||b!==victim;
 const a=record(observer,shooter,actors,10,see),b=record(other,shooter,[...actors,other],10,see);
 assert.equal(witnessed(a,shooter,victim,10.5,()=>true,observer),true);
 assert.equal(witnessed(b,shooter,victim,10.5,()=>true,other),false);
});
test('expiry, future time, death, cover, and object identity reuse fail closed',()=>{
 const {observer,shooter,victim,actors}=scene(),shot=record(observer,shooter,actors,10,()=>true);
 assert.equal(witnessed(shot,shooter,victim,9.99,()=>true,observer),false);
 assert.equal(witnessed(shot,shooter,victim,11.251,()=>true,observer),false);
 assert.equal(witnessed(shot,shooter,victim,10.5,(_a,b)=>b!==victim,observer),false);
 assert.equal(witnessed(shot,shooter,actor(victim.id,100,0),10.5,()=>true,observer),false);
 victim.alive=false;assert.equal(witnessed(shot,shooter,victim,10.5,()=>true,observer),false);
});
test('invalid shot geometry and victim coordinates cannot produce witnesses',()=>{
 const {observer,shooter,victim,actors}=scene();victim.x=Infinity;
 assert.equal(record(observer,shooter,actors,10,()=>true).eligible.length,0);
 shooter.angle=NaN;assert.equal(record(observer,shooter,actors,10,()=>true),null);
});
